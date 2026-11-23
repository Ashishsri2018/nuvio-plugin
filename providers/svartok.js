const BASE_URL = 'https://vivarium.st';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';
const PROVIDERS = [
  { key: 'hades', label: 'Hades' },
  { key: 'hemera', label: 'Hemera', def: true },
  { key: 'hyperion', label: 'Hyperion', def: true },
  { key: 'nyx', label: 'Nyx' },
  { key: 'orion', label: 'Orion' },
  { key: 'poseidon', label: 'Poseidon' },
  { key: 'tethys', label: 'Tethys' },
  { key: 'theia', label: 'Theia' },
  { key: 'tyche', label: 'Tyche' },
];

const LANGUAGES = [
  { key: 'lang_ar', code: 'ar', label: 'Arabic' },
  { key: 'lang_bn', code: 'bn', label: 'Bengali' },
  { key: 'lang_zh', code: 'zh', label: 'Chinese' },
  { key: 'lang_nl', code: 'nl', label: 'Dutch' },
  { key: 'lang_fr', code: 'fr', label: 'French' },
  { key: 'lang_de', code: 'de', label: 'German' },
  { key: 'lang_hi', code: 'hi', label: 'Hindi', def: true },
  { key: 'lang_it', code: 'it', label: 'Italian' },
  { key: 'lang_ja', code: 'ja', label: 'Japanese' },
  { key: 'lang_kn', code: 'kn', label: 'Kannada' },
  { key: 'lang_ko', code: 'ko', label: 'Korean' },
  { key: 'lang_pl', code: 'pl', label: 'Polish' },
  { key: 'lang_pt', code: 'pt', label: 'Portuguese' },
  { key: 'lang_ru', code: 'ru', label: 'Russian' },
  { key: 'lang_es', code: 'es', label: 'Spanish' },
  { key: 'lang_ta', code: 'ta', label: 'Tamil' },
  { key: 'lang_te', code: 'te', label: 'Telugu' },
  { key: 'lang_tr', code: 'tr', label: 'Turkish' },
];

function enabledProviders() {
  const settings = (typeof SCRAPER_SETTINGS !== 'undefined' && SCRAPER_SETTINGS) || {};
  const enabled = new Set();
  for (let i = 0; i < PROVIDERS.length; i++) {
    const p = PROVIDERS[i];
    if (settings[p.key] === undefined ? !!p.def : settings[p.key] === true) {
      enabled.add(p.label.toLowerCase());
    }
  }
  return enabled;
}

function enabledLanguages() {
  const settings = (typeof SCRAPER_SETTINGS !== 'undefined' && SCRAPER_SETTINGS) || {};
  const enabled = new Set();
  for (let i = 0; i < LANGUAGES.length; i++) {
    const l = LANGUAGES[i];
    if (settings[l.key] === undefined ? !!l.def : settings[l.key] === true) {
      enabled.add(l.code);
    }
  }
  return enabled;
}

const RC256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function encodeUtf8(text) {
  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    let codePoint = text.charCodeAt(i);
    if (codePoint >= 0xd800 && codePoint < 0xdc00 && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low < 0xe000) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (low - 0xdc00);
        i++;
      }
    }
    if (codePoint < 0x80) bytes.push(codePoint);
    else if (codePoint < 0x800) bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 63));
    else if (codePoint < 0x10000) bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 63), 0x80 | (codePoint & 63));
    else bytes.push(0xf0 | (codePoint >> 18), 0x80 | ((codePoint >> 12) & 63), 0x80 | ((codePoint >> 6) & 63), 0x80 | (codePoint & 63));
  }
  return bytes;
}

function sha256Digest(input) {
  const state = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const byteLength = input.length;
  const bitLengthHigh = Math.floor(byteLength / 0x20000000);
  const bitLengthLow = (byteLength << 3) >>> 0;
  const padded = input.slice();
  padded.push(0x80);
  while (padded.length % 64 !== 56) padded.push(0);
  padded.push(
    (bitLengthHigh >>> 24) & 255, (bitLengthHigh >>> 16) & 255, (bitLengthHigh >>> 8) & 255, bitLengthHigh & 255,
    (bitLengthLow >>> 24) & 255, (bitLengthLow >>> 16) & 255, (bitLengthLow >>> 8) & 255, bitLengthLow & 255
  );

  const schedule = new Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    let round;
    for (round = 0; round < 16; round++) {
      const base = offset + round * 4;
      schedule[round] = ((padded[base] << 24) | (padded[base + 1] << 16) | (padded[base + 2] << 8) | padded[base + 3]) | 0;
    }
    for (round = 16; round < 64; round++) {
      const early = schedule[round - 15];
      const late = schedule[round - 2];
      const sigma0 = ((early >>> 7) | (early << 25)) ^ ((early >>> 18) | (early << 14)) ^ (early >>> 3);
      const sigma1 = ((late >>> 17) | (late << 15)) ^ ((late >>> 19) | (late << 13)) ^ (late >>> 10);
      schedule[round] = (schedule[round - 16] + sigma0 + schedule[round - 7] + sigma1) | 0;
    }

    let a = state[0], b = state[1], c = state[2], d = state[3], e = state[4], f = state[5], g = state[6], h = state[7];
    for (round = 0; round < 64; round++) {
      const bigSigma1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + bigSigma1 + choice + RC256[round] + schedule[round]) | 0;
      const bigSigma0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (bigSigma0 + majority) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0; d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    state[0] = (state[0] + a) | 0; state[1] = (state[1] + b) | 0; state[2] = (state[2] + c) | 0; state[3] = (state[3] + d) | 0;
    state[4] = (state[4] + e) | 0; state[5] = (state[5] + f) | 0; state[6] = (state[6] + g) | 0; state[7] = (state[7] + h) | 0;
  }

  const digest = [];
  for (let i = 0; i < 8; i++) {
    digest.push((state[i] >>> 24) & 255, (state[i] >>> 16) & 255, (state[i] >>> 8) & 255, state[i] & 255);
  }
  return digest;
}

const HMAC_KEY_BYTES = encodeUtf8('6af5200a03de9a234734d3ef385c84490dc4164881e408450b6c35973803bded');
const HMAC_INNER_PAD = [];
const HMAC_OUTER_PAD = [];
for (let i = 0; i < 64; i++) {
  const keyByte = i < HMAC_KEY_BYTES.length ? HMAC_KEY_BYTES[i] : 0;
  HMAC_INNER_PAD.push(keyByte ^ 0x36);
  HMAC_OUTER_PAD.push(keyByte ^ 0x5c);
}

function hmacSha256Hex(messageBytes) {
  const mac = sha256Digest(HMAC_OUTER_PAD.concat(sha256Digest(HMAC_INNER_PAD.concat(messageBytes))));
  let hex = '';
  for (let i = 0; i < mac.length; i++) hex += (mac[i] < 16 ? '0' : '') + mac[i].toString(16);
  return hex;
}

function signRequest(method, pathAndQuery, timestamp, nonce) {
  const message = method.toUpperCase() + '\n' + pathAndQuery + '\n' + timestamp + (nonce ? '\n' + nonce : '') + '\n' + '51e87f5e8e951aa213fe48de7478cc0bf0e06b4eaa53cd948f97afd1b5f2b596';
  return hmacSha256Hex(encodeUtf8(message));
}

function defaultHeaders() {
  return { 'User-Agent': USER_AGENT, 'Referer': BASE_URL + '/', 'Accept': '*/*' };
}

let serverClockOffsetMs = 0;

function syncServerClock(response) {
  try {
    const dateHeader = response && response.headers && response.headers.get('date');
    if (dateHeader) {
      const serverTime = Date.parse(dateHeader);
      if (!isNaN(serverTime)) serverClockOffsetMs = serverTime - Date.now();
    }
  } catch (e) { }
}

async function getUnsigned(path) {
  const response = await fetch(BASE_URL + path, { headers: defaultHeaders() });
  syncServerClock(response);
  return response;
}

function getSigned(path, nonce) {
  const timestamp = String(Math.floor((Date.now() + serverClockOffsetMs) / 1000));
  const headers = defaultHeaders();
  headers['x-ts'] = timestamp;
  headers['x-cv'] = '94092f52501e';
  if (nonce) headers['x-nonce'] = nonce;
  headers['x-sig'] = signRequest('GET', path, timestamp, nonce || '');
  return fetch(BASE_URL + path, { headers: headers });
}

async function fetchNonces() {
  try {
    const response = await getUnsigned('/api/n');
    if (!response.ok) return [];
    const nonces = await response.json();
    return Array.isArray(nonces) ? nonces : [];
  } catch (e) {
    return [];
  }
}

function parseServerSentEvents(text) {
  const events = [];
  const blocks = String(text || '').split(/\r?\n\r?\n/);
  for (let i = 0; i < blocks.length; i++) {
    if (!blocks[i]) continue;
    const event = { event: 'message', data: '' };
    const lines = blocks[i].split(/\r?\n/);
    for (let j = 0; j < lines.length; j++) {
      const line = lines[j];
      const separatorIndex = line.indexOf(':');
      if (separatorIndex <= 0) continue;
      const field = line.slice(0, separatorIndex);
      const value = line.slice(separatorIndex + 1).replace(/^ /, '');
      if (field === 'event') event.event = value;
      else if (field === 'data') event.data += (event.data ? '\n' : '') + value;
    }
    events.push(event);
  }
  return events;
}

function toAbsoluteUrl(url) {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.indexOf('//') === 0) return 'https:' + url;
  if (url.charAt(0) === '/') return BASE_URL + url;
  return BASE_URL + '/' + url;
}

const LANG_NAMES = {
  en: 'English', hi: 'Hindi', bn: 'Bengali', ta: 'Tamil', te: 'Telugu',
  kn: 'Kannada', fr: 'French', de: 'German', es: 'Spanish', ja: 'Japanese',
  ko: 'Korean', zh: 'Chinese', ar: 'Arabic', pt: 'Portuguese', ru: 'Russian',
  it: 'Italian', tr: 'Turkish', pl: 'Polish', nl: 'Dutch', sv: 'Swedish',
  fi: 'Finnish', da: 'Danish', nb: 'Norwegian', cs: 'Czech', sk: 'Slovak',
  hu: 'Hungarian', ro: 'Romanian', bg: 'Bulgarian', hr: 'Croatian',
  el: 'Greek', he: 'Hebrew', id: 'Indonesian', ms: 'Malay', th: 'Thai',
  vi: 'Vietnamese', uk: 'Ukrainian', is: 'Icelandic', et: 'Estonian',
  lt: 'Lithuanian', lv: 'Latvian'
};

function langName(code) {
  return LANG_NAMES[code] || code.toUpperCase();
}

function extractCandidates(events) {
  const candidates = [];
  for (let i = 0; i < events.length; i++) {
    if (events[i].event !== 'source') continue;
    let payload;
    try { payload = JSON.parse(events[i].data); } catch (e) { continue; }
    const sources = (payload && payload.streams) || [];
    for (let j = 0; j < sources.length; j++) {
      const source = sources[j];
      if (!source || !source.url) continue;

      const inlineSubs = [];
      if (Array.isArray(source.subs)) {
        for (let k = 0; k < source.subs.length; k++) {
          const sub = source.subs[k];
          if (sub && sub.url && sub.lang) {
            inlineSubs.push({
              url: toAbsoluteUrl(sub.url),
              label: sub.label || langName(sub.lang),
              language: sub.lang,
              lang: sub.lang
            });
          }
        }
      }

      candidates.push({
        url: toAbsoluteUrl(String(source.url)),
        quality: String(source.quality || 'Auto'),
        provider: String(source.provider || (payload && payload.provider) || '?'),
        rank: +source.rank || 0,
        type: String(source.type || 'hls'),
        hevc: !!source.hevc,
        hdr: !!source.hdr,
        optional: !!source.opt,
        pinned: !!source.pin,
        lang: String(source.lang || 'en'),
        dub: !!source.dub,
        inlineSubs: inlineSubs
      });
    }
  }
  return candidates;
}

function scoreCandidate(candidate) {
  let score = candidate.rank || 720;
  if (candidate.optional) score -= 1200;
  if (candidate.hevc) score -= 150;
  if (candidate.hdr) score -= 100;
  if (candidate.pinned) score += 500;
  if (candidate.type !== 'hls') score -= 100;
  return score;
}

function resolutionLabel(candidate) {
  const match = /(\d{3,4})\s*p/i.exec(candidate.quality);
  if (match) return match[1] + 'p';
  return candidate.rank >= 1000 ? candidate.rank + 'p' : 'Auto';
}

function resolutionHeight(candidate) {
  const match = /(\d{3,4})/.exec(resolutionLabel(candidate));
  return match ? +match[1] : (candidate.rank || 0);
}

function resolutionTier(candidate) {
  const height = resolutionHeight(candidate);
  if (height >= 1800) return 5;
  if (height >= 900) return 4;
  if (height >= 600) return 3;
  if (height >= 420) return 2;
  if (height >= 300) return 1;
  return 0;
}

function buildSortTag(tier, maxTier) {
  const inverted = Math.max(0, maxTier - tier);
  let bits = inverted.toString(2);
  while (bits.length < 20) bits = '0' + bits;
  return bits.split('').map(function (bit) { return bit === '1' ? '\uFEFF' : '\u200B'; }).join('');
}

function buildStream(candidate, label, subtitles, langLabel) {
  const sortTag = buildSortTag(resolutionTier(candidate), 6);
  const displayName = 'Vivarium \u2022 ' + (langLabel || label || candidate.provider);
  return {
    name: sortTag + displayName,
    title: sortTag + displayName,
    url: candidate.url,
    quality: resolutionLabel(candidate),
    headers: { 'Referer': BASE_URL + '/', 'User-Agent': USER_AGENT },
    subtitles: subtitles
  };
}

function pushGroup(streams, seenUrls, candidates, subtitles, langLabel) {
  const fresh = [];
  for (let i = 0; i < candidates.length; i++) {
    if (seenUrls[candidates[i].url]) continue;
    seenUrls[candidates[i].url] = true;
    fresh.push(candidates[i]);
  }
  if (!fresh.length) return false;

  let best = fresh[0];
  for (let i = 1; i < fresh.length; i++) {
    if (scoreCandidate(fresh[i]) > scoreCandidate(best)) best = fresh[i];
  }

  fresh.sort(function (a, b) {
    return (resolutionHeight(b) - resolutionHeight(a)) || (scoreCandidate(b) - scoreCandidate(a));
  });
  for (let i = 0; i < fresh.length; i++) {
    streams.push(buildStream(fresh[i], fresh[i] === best ? 'Auto' : null, subtitles, langLabel));
  }
  return true;
}

async function fetchEventStream(queryString, nonce) {
  try {
    const response = await getSigned('/api/es?' + queryString, nonce || '');
    if (!response.ok) return '';
    return await response.text();
  } catch (e) {
    return '';
  }
}

async function resolveStreams(tmdbId, mediaType, season, episode) {
  const isTv = mediaType === 'tv';
  if (isTv && (season == null || episode == null)) return [];

  const allowedProviders = enabledProviders();
  const allowedLangs = enabledLanguages();
  if (allowedProviders.size === 0 && allowedLangs.size === 0) return [];

  const baseQuery = 'id=' + encodeURIComponent(tmdbId) +
    '&type=' + (isTv ? 'tv' : 'movie') +
    (isTv ? '&s=' + season + '&e=' + episode : '');

  const nonces = await fetchNonces();
  let nonceIndex = 0;

  const baseEventText = await fetchEventStream(baseQuery, nonces[nonceIndex++] || '');
  const allBaseCandidates = extractCandidates(parseServerSentEvents(baseEventText));
  if (!allBaseCandidates.length) return [];

  const streams = [];
  const seenUrls = {};

  let englishSubs = [];
  if (allowedProviders.size > 0) {
    const engCandidates = allBaseCandidates.filter(function (c) {
      return !c.dub && allowedProviders.has(c.provider.toLowerCase());
    });
    if (engCandidates.length > 0) {
      engCandidates.sort(function (a, b) { return scoreCandidate(b) - scoreCandidate(a); });
      englishSubs = engCandidates[0].inlineSubs;
      pushGroup(streams, seenUrls, engCandidates, englishSubs, null);
    }
  }

  if (allowedLangs.size === 0) return streams;

  const coveredDubLangs = new Set();
  const dubGroups = {};
  for (let i = 0; i < allBaseCandidates.length; i++) {
    const c = allBaseCandidates[i];
    if (!c.dub || !allowedLangs.has(c.lang)) continue;
    (dubGroups[c.lang] = dubGroups[c.lang] || []).push(c);
  }
  const baseDubLangs = Object.keys(dubGroups);
  for (let i = 0; i < baseDubLangs.length; i++) {
    const lang = baseDubLangs[i];
    if (pushGroup(streams, seenUrls, dubGroups[lang], englishSubs, langName(lang))) {
      coveredDubLangs.add(lang);
    }
  }

  const missingDubLangs = Array.from(allowedLangs).filter(function (lang) {
    return !coveredDubLangs.has(lang);
  });

  if (missingDubLangs.length > 0) {
    const dubEventTexts = await Promise.all(missingDubLangs.map(function (lang) {
      return fetchEventStream(baseQuery + '&dubs=1&al=' + encodeURIComponent(lang), nonces[nonceIndex++] || '');
    }));

    for (let d = 0; d < missingDubLangs.length; d++) {
      const lang = missingDubLangs[d];
      const dubCandidates = extractCandidates(parseServerSentEvents(dubEventTexts[d]))
        .filter(function (c) { return c.dub && c.lang === lang; });
      pushGroup(streams, seenUrls, dubCandidates, englishSubs, langName(lang));
    }
  }

  return streams;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    if (!/^\d+$/.test(String(tmdbId))) return [];
    return await resolveStreams(tmdbId, mediaType, season, episode);
  } catch (e) {
    return [];
  }
}

async function onSettings() {
  const fields = [
    { type: 'header', label: 'Providers' }
  ];
  for (let i = 0; i < PROVIDERS.length; i++) {
    fields.push({
      type: 'toggle',
      key: PROVIDERS[i].key,
      label: PROVIDERS[i].label,
      defaultValue: !!PROVIDERS[i].def
    });
  }
  fields.push({ type: 'header', label: 'Dub Languages' });
  for (let i = 0; i < LANGUAGES.length; i++) {
    fields.push({
      type: 'toggle',
      key: LANGUAGES[i].key,
      label: LANGUAGES[i].label,
      defaultValue: !!LANGUAGES[i].def
    });
  }
  return fields;
}

module.exports = { getStreams, onSettings };