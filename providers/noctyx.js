const BASE_URL = "https://toonix.bond";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";

async function request(url, referer, asJson) {
    const headers = {
        "User-Agent": USER_AGENT,
        Accept: asJson ? "application/json,*/*" : "text/html,*/*;q=0.8",
        "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
    };
    if (referer) headers.Referer = referer;
    const response = await fetch(url, { headers });
    if (response.status !== 200) throw new Error(`http ${response.status}`);
    return asJson ? response.json() : response.text();
}

const slugify = (name) =>
    String(name || "")
        .toLowerCase()
        .replace(/[\u2018\u2019'`]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

const resolutionWeight = (quality) =>
    ({ "4K": 5, "2160P": 5, "1440P": 4, "1080P": 3, "720P": 2, "480P": 1 })[(quality || "").toUpperCase()] || 0;

const buildSortTag = (rank) =>
    rank
        .toString(2)
        .padStart(20, "0")
        .replace(/1/g, "\uFEFF")
        .replace(/0/g, "\u200B");

async function fetchTitles(tmdbId) {
    const url =
        `${TMDB_API}/tv/${encodeURIComponent(tmdbId)}` +
        `?api_key=${encodeURIComponent(TMDB_KEY)}&language=en-US&append_to_response=alternative_titles`;
    const data = await request(url, null, true);
    if (!data) throw new Error("tmdb empty");
    const alternatives = (data.alternative_titles && data.alternative_titles.results) || [];
    return [data.name, data.original_name].concat(alternatives.map((alt) => alt && alt.title));
}

async function resolveWatchPage(slug, season, episode) {
    const watchUrl = `${BASE_URL}/show/${slug}/${season}/${episode}`;
    try {
        const html = await request(watchUrl, `${BASE_URL}/`);
        const episodeId = (html.match(/hydrax\/(\d{4,10})/) || html.match(/["']episode[Ii]d["']\s*[:=]\s*["']?(\d{4,10})/) || [])[1];
        const pair = html.match(/["']ms["']\s*:\s*(\d{13})\s*,\s*["']token["']\s*:\s*["']([A-Za-z0-9\-_]{43})["']/);
        const accessToken =
            (html.match(/(\d{10,20}\.[A-Za-z0-9\-_]{40,50})/) || [])[1] || (pair && `${pair[1]}.${pair[2]}`);
        return episodeId && accessToken ? { watchUrl, episodeId, accessToken } : null;
    } catch (e) {
        return null;
    }
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        season = Number(season);
        episode = Number(episode);
        if (mediaType !== "tv" || !/^\d+$/.test(String(tmdbId)) || !season || !episode) return [];

        const titles = await fetchTitles(tmdbId);
        const slugs = [...new Set(titles.map(slugify).filter(Boolean))].slice(0, 6);
        const pages = await Promise.all(slugs.map((slug) => resolveWatchPage(slug, season, episode)));
        const page = pages.find(Boolean);
        if (!page) return [];

        const apiUrl = `${BASE_URL}/api/hydrax/${page.episodeId}?t=${encodeURIComponent(page.accessToken)}`;
        const payload = await request(apiUrl, page.watchUrl, true);
        if (!payload || payload.error || !payload.qualities) return [];

        const seen = new Set();
        return payload.qualities
            .filter((entry) => entry && entry.src && !seen.has(entry.src) && seen.add(entry.src))
            .map((entry) => ({
                name: "Toonix",
                title: "Toonix",
                url: entry.src,
                quality: entry.label || "Auto",
                headers: { Referer: `${BASE_URL}/`, "User-Agent": USER_AGENT },
            }))
            .sort((a, b) => resolutionWeight(b.quality) - resolutionWeight(a.quality))
            .map((stream, index) => {
                const tag = buildSortTag(index + 1);
                return { ...stream, name: tag + stream.name, title: tag + stream.title };
            });
    } catch (e) {
        return [];
    }
}

module.exports = { getStreams };