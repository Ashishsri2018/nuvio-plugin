const BASE_URL = "https://vixsrc.to";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36";
const HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "*/*",
    "Referer": `${BASE_URL}/`,
    "Origin": BASE_URL,
};

async function fetchText(url) {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return await res.text();
}

function absUrl(uri, base) {
    if (!uri) return "";
    if (/^https?:\/\//i.test(uri)) return uri;
    const origin = (base.match(/^https?:\/\/[^\/]+/i) || [""])[0];
    if (uri.charAt(0) === "/") return origin + uri;
    return base.split("?")[0].replace(/[^\/]*$/, "") + uri;
}

function objectAt(source, start) {
    let depth = 0;
    let quote = "";
    for (let i = start; i < source.length; i++) {
        const ch = source[i];
        if (quote) {
            if (ch === "\\") i++;
            else if (ch === quote) quote = "";
        } else if (ch === '"' || ch === "'") {
            quote = ch;
        } else if (ch === "{") {
            depth++;
        } else if (ch === "}" && --depth === 0) {
            return source.slice(start, i + 1);
        }
    }
    return "";
}

function readLiterals(source) {
    const values = {};
    const pattern = /(?:"(\w+)"|'(\w+)'|\b(\w+))\s*:\s*("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\d+)/g;
    let match;
    while ((match = pattern.exec(source)) !== null) {
        const raw = match[4];
        values[match[1] || match[2] || match[3]] = /^['"]/.test(raw) ? raw.slice(1, -1).replace(/\\(.)/g, "$1") : raw;
    }
    return values;
}

function extractMaster(html) {
    const assignment = /\bwindow\.masterPlaylist\s*=\s*\{/.exec(html);
    if (!assignment) return null;
    const master = objectAt(html, assignment.index + assignment[0].length - 1);
    const paramsMatch = /(?:\bparams|"params"|'params')\s*:\s*\{/.exec(master);
    if (!paramsMatch) return null;
    const block = objectAt(master, paramsMatch.index + paramsMatch[0].length - 1);
    const params = readLiterals(block);
    const fields = readLiterals(master.replace(block, "{}"));
    if (!fields.url || !params.token) return null;
    return { params, url: absUrl(fields.url, BASE_URL).split("#")[0] };
}

function parseAttrs(line) {
    const out = {};
    const regex = /(?:^|,)([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
    let match;
    const source = line.slice(line.indexOf(":") + 1);
    while ((match = regex.exec(source)) !== null) {
        let value = match[2] || "";
        if (value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') value = value.slice(1, -1);
        out[match[1]] = value;
    }
    return out;
}

function parseMaster(text, masterUrl) {
    const lines = String(text || "").split(/\r?\n/);
    const variants = [];
    const subtitles = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.indexOf("#EXT-X-MEDIA:") === 0) {
            const attrs = parseAttrs(line);
            if (attrs.TYPE === "SUBTITLES" && attrs.URI) {
                subtitles.push({
                    url: absUrl(attrs.URI, masterUrl),
                    language: String(attrs.LANGUAGE || "und").toLowerCase(),
                    name: attrs.NAME || attrs.LANGUAGE || "Subtitle",
                });
            }
        } else if (line.indexOf("#EXT-X-STREAM-INF:") === 0) {
            const info = parseAttrs(line);
            const resolution = String(info.RESOLUTION || "");
            const height = resolution.indexOf("x") !== -1 ? resolution.split("x")[1] : "0";
            variants.push({ height: parseInt(height, 10) || 0 });
        }
    }
    return { variants, subtitles };
}

function bestQuality(variants) {
    let height = 0;
    variants.forEach((v) => { if (v.height > height) height = v.height; });
    if (height >= 2160) return "2160p";
    if (height >= 1440) return "1440p";
    if (height >= 1080) return "1080p";
    if (height >= 720) return "720p";
    if (height >= 480) return "480p";
    if (height >= 360) return "360p";
    return "1080p";
}

function buildUrl(base, params) {
    const q = base.indexOf("?");
    const path = q === -1 ? base : base.slice(0, q);
    const existing = q === -1 ? [] : base.slice(q + 1).split("&").filter(Boolean);
    const keys = Object.keys(params).filter((k) => params[k] !== "" && params[k] != null);
    const retained = existing.filter((part) => keys.indexOf(part.split("=")[0]) === -1);
    const signed = keys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`);
    return path + "?" + retained.concat(signed).join("&");
}

async function subtitleSegment(url) {
    try {
        const text = await fetchText(url);
        const match = text.match(/(https?:\/\/[^\s#]+\.vtt[^\s#]*)/i);
        return match ? match[1] : "";
    } catch {
        return "";
    }
}

async function resolveSubtitles(subtitles) {
    const preferred = subtitles.filter((s) =>
        /^(eng|en|spa|es|fre|fra|fr|ger|deu|de|ita|it|por|pt|tur|tr|hin|hi|ara|ar|rus|ru|jpn|ja|kor|ko|chi|zho|zh)/i.test(s.language) ||
        /english|spanish|french|german|italian|portuguese|turkish|hindi|arabic|russian|japanese|korean|chinese/i.test(s.name)
    ).slice(0, 12);
    const rows = await Promise.all(preferred.map(async (s) => {
        const url = await subtitleSegment(s.url);
        if (!url) return null;
        return { url, language: s.language, name: s.name, headers: HEADERS };
    }));
    return rows.filter(Boolean);
}

async function fetchDuration(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === "tv") {
            const [showRes, epRes] = await Promise.all([
                fetch(`${TMDB_API}/tv/${tmdbId}?api_key=${TMDB_KEY}&language=en-US`),
                fetch(`${TMDB_API}/tv/${tmdbId}/season/${season}/episode/${episode}?api_key=${TMDB_KEY}&language=en-US`),
            ]);
            const [show, ep] = await Promise.all([
                showRes.ok ? showRes.json() : null,
                epRes.ok ? epRes.json() : null,
            ]);
            if (ep && ep.runtime) return String(ep.runtime);
            if (show && show.episode_run_time && show.episode_run_time.length) return String(show.episode_run_time[0]);
            return "Variable";
        }
        const res = await fetch(`${TMDB_API}/movie/${tmdbId}?api_key=${TMDB_KEY}&language=en-US`);
        const data = res.ok ? await res.json() : null;
        return data && data.runtime ? String(data.runtime) : "Variable";
    } catch {
        return "Variable";
    }
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        const id = String(tmdbId || "").trim().replace(/^tmdb:/i, "");
        if (!id) return [];
        const type = mediaType === "tv" || mediaType === "series" ? "tv" : "movie";
        const sea = parseInt(season, 10) || 1;
        const ep = parseInt(episode, 10) || 1;

        const apiUrl = type === "tv"
            ? `${BASE_URL}/api/tv/${encodeURIComponent(id)}/${sea}/${ep}?lang=it&_=${Date.now()}`
            : `${BASE_URL}/api/movie/${encodeURIComponent(id)}?lang=it&_=${Date.now()}`;

        const [duration, apiBody] = await Promise.all([
            fetchDuration(id, type, sea, ep),
            fetchText(apiUrl),
        ]);

        const data = JSON.parse(apiBody);
        const src = data && data.src;
        if (!src) return [];

        const html = await fetchText(absUrl(String(src), BASE_URL + "/"));

        const extracted = extractMaster(html);
        if (!extracted) return [];

        const params = extracted.params;
        if (/canPlayFHD\s*=\s*true/.test(html)) params.h = "1";

        let masterBase = extracted.url;
        const qi = masterBase.indexOf("?");
        const mp = qi === -1 ? masterBase : masterBase.slice(0, qi);
        if (!/\.m3u8$/i.test(mp)) masterBase = mp.replace(/\/$/, "") + ".m3u8" + (qi === -1 ? "" : masterBase.slice(qi));

        let servers = [];
        const streamsMatch = html.match(/window\.streams\s*=\s*(\[[\s\S]*?\]);/);
        if (streamsMatch) {
            try { servers = JSON.parse(streamsMatch[1]); } catch { }
        }
        if (!Array.isArray(servers)) servers = [];
        servers.unshift({ url: masterBase });

        const seen = {};
        servers = servers.filter((server) => {
            if (!server || !server.url) return false;
            server.url = absUrl(String(server.url), BASE_URL + "/");
            const key = server.url.split("?")[0];
            if (seen[key]) return false;
            seen[key] = true;
            return true;
        });

        let subtitlesPromise = null;
        const jobs = servers.map(async (server) => {
            try {
                const masterUrl = buildUrl(server.url, params);
                const master = await fetchText(masterUrl);
                if (master.trim().indexOf("#EXTM3U") !== 0) return null;
                const parsed = parseMaster(master, masterUrl);
                if (!subtitlesPromise && parsed.subtitles.length) subtitlesPromise = resolveSubtitles(parsed.subtitles);
                return {
                    url: masterUrl,
                    quality: bestQuality(parsed.variants),
                };
            } catch {
                return null;
            }
        });

        let valid = (await Promise.all(jobs)).filter(Boolean);
        if (!valid.length) valid = [{ url: buildUrl(masterBase, params), quality: "1080p" }];

        const subtitles = subtitlesPromise ? await subtitlesPromise : [];

        return valid.map((row) => {
            const isHq = row.quality === "2160p" || row.url.includes("hevc");
            const codec = isHq ? "HEVC" : "H.264";
            const audio = isHq ? "DD5.1" : "Stereo";
            return {
                name: "VixSrc",
                title: "VixSrc",
                url: row.url,
                quality: `${row.quality} \u2022 ${duration} min\n${codec} \u2022 ${audio}`,
                type: "hls",
                headers: HEADERS,
                subtitles,
            };
        });
    } catch {
        return [];
    }
}

module.exports = { getStreams };