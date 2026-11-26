const BASE_URL = "https://streamingcommunityz.mov";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:158.0) Gecko/20100101 Firefox/158.0";

async function http(url, headers) {
    try {
        const res = await fetch(url, { headers: headers || {} });
        return { ok: res.ok, status: res.status, url: res.url || url, text: await res.text() };
    } catch (e) {
        return null;
    }
}

function decodeEntities(s) {
    return String(s)
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}
function extractPageProps(html) {
    if (!html) return null;
    const m = /id=["']app["'][^>]*data-page=(["'])([\s\S]*?)\1/.exec(html) ||
        /data-page=(["'])([\s\S]*?)\1[^>]*id=["']app["']/.exec(html);
    if (!m) {
        try { const j = JSON.parse(html); return j.props || j; } catch (e) { return null; }
    }
    try {
        const j = JSON.parse(decodeEntities(m[2]));
        return j.props || j;
    } catch (e) {
        return null;
    }
}

function parseVixScript(script) {
    const re = /window\.(\w+)\s*=/g;
    const keys = [];
    const starts = [];
    const ends = [];
    let m;
    while ((m = re.exec(script)) !== null) {
        keys.push(m[1]);
        starts.push(m.index);
        ends.push(m.index + m[0].length);
    }
    const objects = [];
    for (let i = 0; i < keys.length; i++) {
        const raw = script.slice(ends[i], i + 1 < keys.length ? starts[i + 1] : script.length);
        const cleaned = raw
            .replace(/;/g, "")
            .replace(/(\{|\[|,)\s*(\w+)\s*:/g, '$1 "$2":')
            .replace(/,(\s*[}\]])/g, "$1")
            .trim();
        objects.push('"' + keys[i] + '": ' + cleaned);
    }
    return JSON.parse(("{\n" + objects.join(",\n") + "\n}").replace(/'/g, '"'));
}
function parseVixLoose(text) {
    const i = text.indexOf("masterPlaylist");
    if (i === -1) return null;
    const tail = text.slice(i);
    const token = /['"]?token['"]?\s*:\s*['"]([^'"]+)['"]/.exec(tail);
    const expires = /['"]?expires['"]?\s*:\s*['"]?(\d+)['"]?/.exec(tail);
    const url = /['"]?url['"]?\s*:\s*['"]([^'"]+)['"]/.exec(tail);
    if (!token || !expires || !url) return null;
    const fhd = /canPlayFHD['"]?\s*[:=]\s*(true|false)/.exec(text);
    return {
        masterPlaylist: { url: url[1].replace(/\\\//g, "/"), params: { token: token[1], expires: expires[1] } },
        canPlayFHD: !!(fhd && fhd[1] === "true")
    };
}

function parseVixAny(text) {
    try { return parseVixScript(text); } catch (e) { }
    return parseVixLoose(text);
}

function vixPlaylistUrl(data) {
    const master = data.masterPlaylist;
    const query = "token=" + master.params.token + "&expires=" + master.params.expires;
    const url = String(master.url);
    const base = url.indexOf("?b") !== -1
        ? url.replace("?b:1", "?b=1") + "&" + query
        : url + "?" + query;
    return data.canPlayFHD ? base + "&h=1" : base;
}

function findMasterScript(html) {
    const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        if (m[1].indexOf("masterPlaylist") !== -1) return m[1].replace(/\n/g, "\t");
    }
    return html.indexOf("masterPlaylist") !== -1 ? html.replace(/\n/g, "\t") : null;
}

function absolutize(src, origin) {
    if (/^https?:\/\//i.test(src)) return src;
    if (src.indexOf("//") === 0) return "https:" + src;
    return origin + (src.charAt(0) === "/" ? "" : "/") + src;
}

async function tmdbInfo(tmdbId, mediaType) {
    if (!TMDB_KEY) return null;
    const kind = mediaType === "tv" ? "tv" : "movie";
    const res = await http(TMDB_API + "/" + kind + "/" + tmdbId + "?api_key=" + TMDB_KEY + "&language=it-IT");
    if (!res || !res.ok) return null;
    try {
        const d = JSON.parse(res.text);
        return {
            title: kind === "tv" ? d.name : d.title,
            originalTitle: kind === "tv" ? d.original_name : d.original_title,
            year: Number(String(d.release_date || d.first_air_date || "").slice(0, 4)) || null
        };
    } catch (e) {
        return null;
    }
}

function normTitle(t) {
    return String(t || "").toLowerCase().replace(/\(\d{4}\)/g, "")
        .replace(/[^a-z0-9]+/g, " ").trim();
}

async function scSearch(sc, query) {
    const res = await http(sc + "/search?q=" + encodeURIComponent(query), {
        "User-Agent": USER_AGENT,
        "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.5,en;q=0.3"
    });
    if (!res || !res.ok) return [];
    const props = extractPageProps(res.text);
    if (props && Array.isArray(props.titles)) return props.titles;
    try { const j = JSON.parse(res.text); if (Array.isArray(j.data)) return j.data; } catch (e) { }
    return [];
}

async function scTitleDetail(sc, t) {
    const res = await http(sc + "/titles/" + t.id + "-" + t.slug, { "User-Agent": USER_AGENT });
    if (!res || !res.ok) return null;
    const props = extractPageProps(res.text);
    return props && props.title ? props.title : null;
}

async function scFindTitle(sc, info, mediaType, tmdbId) {
    const expectedType = mediaType === "tv" ? "tv" : "movie";
    const queries = [];
    [info.title, info.originalTitle].forEach(function (q) {
        q = String(q || "").replace(/\(\d{4}\)/g, "").trim();
        if (q && queries.map(function (x) { return x.toLowerCase(); }).indexOf(q.toLowerCase()) === -1) queries.push(q);
    });
    const results = await Promise.all(queries.map(function (q) { return scSearch(sc, q); }));

    const seen = {};
    const candidates = [];
    results.forEach(function (list) {
        list.forEach(function (t) {
            if (t && t.type === expectedType && t.id && t.slug && !seen[t.id]) {
                seen[t.id] = true;
                candidates.push(t);
            }
        });
    });

    const wanted = Number(tmdbId);
    const direct = candidates.filter(function (c) { return Number(c.tmdb_id) === wanted; })[0];
    if (direct) return direct;

    const details = await Promise.all(candidates.slice(0, 8).map(function (c) { return scTitleDetail(sc, c); }));
    let fallback = null;
    for (let i = 0; i < details.length; i++) {
        const d = details[i];
        if (!d) continue;
        if (Number(d.tmdb_id) === wanted) return candidates[i];
        const nameOk = normTitle(d.name) === normTitle(info.title) || normTitle(d.name) === normTitle(info.originalTitle);
        const y = Number(String(d.release_date || "").slice(0, 4)) || null;
        const yearOk = !info.year || !y || info.year === y;
        if (!fallback && nameOk && yearOk && !d.tmdb_id) fallback = candidates[i];
    }
    return fallback;
}

async function scEpisodeId(sc, title, season, episode) {
    const res = await http(sc + "/titles/" + title.id + "-" + title.slug + "/season-" + season, { "User-Agent": USER_AGENT });
    if (!res || !res.ok) return null;
    const props = extractPageProps(res.text);
    const eps = props && props.loadedSeason && props.loadedSeason.episodes;
    if (!Array.isArray(eps)) return null;
    for (let i = 0; i < eps.length; i++) {
        if (Number(eps[i].number) === Number(episode)) return eps[i].id;
    }
    return null;
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (!/^\d+$/.test(String(tmdbId))) return [];
        if (mediaType !== "movie" && mediaType !== "tv") return [];
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const root = BASE_URL.replace(/\/+$/, "").replace(/\/it$/, "");
        const sc = root + "/it";

        const info = await tmdbInfo(String(tmdbId), mediaType);
        if (!info || !info.title) return [];

        const title = await scFindTitle(sc, info, mediaType, tmdbId);
        if (!title) return [];

        let iframeUrls;
        if (mediaType === "tv") {
            const epId = await scEpisodeId(sc, title, season, episode);
            if (!epId) return [];
            iframeUrls = [sc + "/iframe/" + title.id + "?episode_id=" + epId + "&canPlayFHD=1"];
        } else {
            iframeUrls = [sc + "/iframe/" + title.id + "?canPlayFHD=1", sc + "/iframe/" + title.id + "&canPlayFHD=1"];
        }

        let iframeSrc = null;
        for (let i = 0; i < iframeUrls.length && !iframeSrc; i++) {
            const res = await http(iframeUrls[i], { "User-Agent": USER_AGENT, "Referer": root + "/" });
            if (!res || !res.ok) continue;
            const m = /<iframe\b[^>]*\ssrc=["']([^"']+)["']/i.exec(res.text);
            if (m) iframeSrc = absolutize(decodeEntities(m[1]), root);
        }
        if (!iframeSrc) return [];

        const page = await http(iframeSrc, {
            "Accept": "*/*",
            "Cache-Control": "no-cache",
            "User-Agent": USER_AGENT,
            "Referer": root + "/"
        });
        if (!page || !page.ok) return [];
        const script = findMasterScript(page.text);
        if (!script) return [];
        const data = parseVixAny(script);
        if (!data) return [];

        return [{
            name: "VixCloud \u2022 Italian",
            title: "VixCloud \u2022 Italian",
            url: vixPlaylistUrl(data),
            quality: data.canPlayFHD ? "1080p" : "Auto",
            type: "hls",
            headers: { "Accept": "*/*", "Cache-Control": "no-cache", "User-Agent": USER_AGENT }
        }];
    } catch (e) {
        return [];
    }
}

module.exports = { getStreams };