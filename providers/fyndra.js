const BASE_URL = "https://fsharetv.co";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_KEY = "307b7b8ef035c6aa336900aef4e203bd";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36";

async function fetchText(url, headers) {
    try {
        const response = await fetch(url, { method: "GET", headers });
        return await response.text();
    } catch {
        return null;
    }
}

async function fetchJson(url, headers) {
    const responseText = await fetchText(url, headers);
    try {
        return JSON.parse(responseText);
    } catch {
        return null;
    }
}

const buildPageHeaders = (referer) => ({
    Referer: referer,
    "User-Agent": USER_AGENT,
});

const buildApiHeaders = (referer) => ({
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
    Referer: referer,
    "User-Agent": USER_AGENT,
});

function parseMovieRequest(id, type) {
    if (!/^\d+$/.test(String(id))) return null;
    if (type !== "movie") return null;
    return { tmdbId: String(id) };
}

function toAbsoluteUrl(path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    return `${BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

const normalizeTitle = (title) =>
    String(title ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

async function fetchMovieMetadata({ tmdbId }) {
    const apiKey = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || TMDB_KEY;
    const details = await fetchJson(`${TMDB_API}/movie/${tmdbId}?api_key=${apiKey}`);
    if (!details) return null;

    const titles = [
        ...new Set(
            [details.title, details.original_title]
                .map((title) => (title ? String(title).trim() : ""))
                .filter(Boolean),
        ),
    ];
    if (titles.length === 0) return null;

    const releaseYear = Number.parseInt(String(details.release_date ?? "").slice(0, 4), 10);
    return {
        titles,
        releaseYear: Number.isNaN(releaseYear) ? null : releaseYear,
        imdbId: details.imdb_id ? String(details.imdb_id) : "",
    };
}

async function searchMoviesByTitle(title) {
    const searchUrl = `${BASE_URL}/api/movie/autocomplete-search?query=${encodeURIComponent(title)}`;
    const response = await fetchJson(searchUrl, buildApiHeaders(`${BASE_URL}/`));
    const movies = response?.data?.movies;
    return Array.isArray(movies) ? movies.filter((movie) => movie?.uri && movie.title) : [];
}

function scoreMovieMatch(candidate, metadata) {
    if (metadata.imdbId && candidate.imdb_id === metadata.imdbId) return 100;

    const normalizedTitles = metadata.titles.map(normalizeTitle);
    if (!normalizedTitles.includes(normalizeTitle(candidate.title))) return 0;

    const candidateYear = Number.parseInt(candidate.year, 10);
    if (metadata.releaseYear == null || Number.isNaN(candidateYear)) return 1;

    const yearDifference = Math.abs(candidateYear - metadata.releaseYear);
    if (yearDifference === 0) return 3;
    return yearDifference === 1 ? 2 : 0;
}

async function findMoviePageUrl(metadata) {
    const searchResults = await Promise.all(
        metadata.titles.map((title) => searchMoviesByTitle(title).catch(() => null)),
    );

    let bestMatch = null;
    let bestScore = 0;
    for (const candidate of searchResults.filter(Boolean).flat()) {
        const score = scoreMovieMatch(candidate, metadata);
        if (score > bestScore) {
            bestScore = score;
            bestMatch = candidate;
        }
    }
    return bestMatch ? toAbsoluteUrl(bestMatch.uri) : null;
}

function extractFileIds(pageHtml) {
    const setSourcePattern = /Movie\.setSource\(\s*'([^']+)'/g;
    const fileIds = new Set(Array.from(pageHtml.matchAll(setSourcePattern), (match) => match[1]));
    return [...fileIds].slice(0, 2);
}

function collectFileSources(file) {
    const primarySources = Array.isArray(file.sources) ? file.sources : [];
    const alternativeSources = (file.alternatives ?? []).filter(Array.isArray).flat();
    return [...primarySources, ...alternativeSources];
}

function resolveQualityLabel(source) {
    const label = String(source.label ?? "").trim();
    if (label && !/^unknown$/i.test(label)) return label;
    return source.quality ? `${source.quality}p` : "Auto";
}

function parseResolution(text) {
    if (/4k|uhd/i.test(String(text))) return 2160;
    return Number.parseInt(text, 10) || 0;
}

function toQualityRank(resolution) {
    if (resolution >= 2160) return 5;
    if (resolution >= 1080) return 4;
    if (resolution >= 720) return 3;
    if (resolution >= 480) return 2;
    if (resolution >= 360) return 1;
    return 0;
}

function buildSortTag(rank) {
    const inverted = Math.max(0, 5 - rank);
    return inverted
        .toString(2)
        .padStart(20, "0")
        .replace(/1/g, "\uFEFF")
        .replace(/0/g, "\u200B");
}

function toStreamEntry(source) {
    const qualityLabel = resolveQualityLabel(source);
    const resolution = parseResolution(source.quality || qualityLabel);
    return {
        title: `FshareTV • ${qualityLabel}`,
        url: toAbsoluteUrl(source.src),
        quality: qualityLabel,
        resolution,
        rank: toQualityRank(resolution),
        isBackup: source.storage === "__backup",
    };
}

const isPlayableSource = (source) =>
    typeof source?.src === "string" &&
    source.src !== "" &&
    !/youtube/i.test(source.type ?? "") &&
    !/youtube\.com/.test(source.src);

async function fetchStreamEntries(fileId, pageUrl) {
    const response = await fetchJson(
        `${BASE_URL}/api/file/${fileId}/source`,
        buildApiHeaders(pageUrl),
    );
    const file = response?.data?.file;
    if (!file) return [];
    return collectFileSources(file).filter(isPlayableSource).map(toStreamEntry);
}

function selectBestEntries(entries) {
    const seenUrls = new Set();
    const uniqueEntries = entries.filter(({ url }) => {
        if (seenUrls.has(url)) return false;
        seenUrls.add(url);
        return true;
    });

    const byQualityDescending = (a, b) => b.rank - a.rank || b.resolution - a.resolution;
    const primaryEntries = uniqueEntries.filter((entry) => !entry.isBackup).sort(byQualityDescending);
    const backupEntries = uniqueEntries.filter((entry) => entry.isBackup).sort(byQualityDescending);

    return primaryEntries.length > 0 ? primaryEntries : backupEntries;
}

function toStream(entry) {
    const sortTag = buildSortTag(entry.rank);
    return {
        name: sortTag + entry.title,
        title: sortTag + entry.title,
        url: entry.url,
        quality: entry.quality,
        headers: buildPageHeaders(`${BASE_URL}/`),
    };
}

async function collectStreams(pageUrl) {
    const pageHtml = await fetchText(pageUrl, buildPageHeaders(`${BASE_URL}/`));
    if (pageHtml === null) return [];

    const entryGroups = await Promise.all(
        extractFileIds(pageHtml).map((fileId) => fetchStreamEntries(fileId, pageUrl).catch(() => null)),
    );
    return selectBestEntries(entryGroups.filter(Boolean).flat()).map(toStream);
}

async function getStreams(tmdbId, mediaType, _season, _episode) {
    try {
        const movieRequest = parseMovieRequest(tmdbId, mediaType);
        if (!movieRequest) return [];

        const metadata = await fetchMovieMetadata(movieRequest);
        if (!metadata) return [];

        const pageUrl = await findMoviePageUrl(metadata);
        if (!pageUrl) return [];

        return await collectStreams(pageUrl);
    } catch {
        return [];
    }
}

module.exports = { getStreams };