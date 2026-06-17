/* panel.js — drives the Transcript Studio side panel. */
'use strict';

const SUPPORT_URL = 'https://krishnakanthb13.github.io/S/';
const C = window.CaptionsCore;
const $ = (id) => document.getElementById(id);

const el = {
  langSelect: $('langSelect'), translateSelect: $('translateSelect'),
  fetchBtn: $('fetchBtn'), fetchLabel: $('fetchLabel'), videoMeta: $('videoMeta'),
  toolbar: $('toolbar'), exportBar: $('exportBar'), foot: $('foot'),
  searchInput: $('searchInput'), searchCount: $('searchCount'),
  searchPrev: $('searchPrev'), searchNext: $('searchNext'),
  tgTimestamps: $('tgTimestamps'), tgFollow: $('tgFollow'), tgParagraph: $('tgParagraph'),
  tgClean: $('tgClean'), tgHighlights: $('tgHighlights'), tgSmaller: $('tgSmaller'), tgBigger: $('tgBigger'),
  formatSelect: $('formatSelect'), copyBtn: $('copyBtn'), downloadBtn: $('downloadBtn'),
  scroll: $('scroll'), state: $('state'), stats: $('stats'),
  progress: $('progress'), progressBar: $('progressBar'),
  themeBtn: $('themeBtn'), supportBtn: $('supportBtn'), footSupport: $('footSupport'),
  aiBtn: $('aiBtn'), settingsBtn: $('settingsBtn'), toast: $('toast'),
  aiOverlay: $('aiOverlay'), aiClose: $('aiClose'), aiMode: $('aiMode'), aiRun: $('aiRun'),
  aiBody: $('aiBody'), aiCopy: $('aiCopy'), aiSave: $('aiSave'), aiSaveBoth: $('aiSaveBoth'),
  settingsOverlay: $('settingsOverlay'), settingsClose: $('settingsClose'),
  setAutoFetch: $('setAutoFetch'), setAiKey: $('setAiKey'), setAiModel: $('setAiModel'),
  setAiSave: $('setAiSave'), setAiClear: $('setAiClear')
};

// ---- state -----------------------------------------------------------------
let tracks = [];
let rawSegments = [];     // exactly as fetched
let viewSegments = [];    // after clean / paragraph transforms — what's shown/exported
let cueEls = [];
let meta = {};
let highlights = new Set(); // rounded start-seconds of starred lines (per video)
let hits = [];              // search match indices into viewSegments
let curHit = -1;
let activeCue = -1;
let followTimer = null;
let lastAiText = '';

const settings = {
  theme: 'system', timestamps: true, follow: false,
  paragraph: false, clean: false, highlightsOnly: false,
  fontSize: 14, format: 'txt', autoFetch: true,
  aiModel: 'gemini-3.5-flash'
};
let aiKey = ''; // stored separately in storage.local

// ===========================================================================
// Settings & theme
// ===========================================================================
function loadSettings() {
  return new Promise((res) => {
    chrome.storage.sync.get('tsSettings', (a) => {
      Object.assign(settings, a.tsSettings || {});
      chrome.storage.local.get('tsAiKey', (b) => { aiKey = b.tsAiKey || ''; res(); });
    });
  });
}
function saveSettings() { chrome.storage.sync.set({ tsSettings: settings }); }

function applyTheme() {
  const dark = settings.theme === 'dark' ||
    (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  el.themeBtn.textContent = { system: '🌗', light: '☀️', dark: '🌙' }[settings.theme];
  el.themeBtn.title = `Theme: ${settings.theme}`;
}
function applyFontSize() { document.documentElement.style.setProperty('--cue-size', settings.fontSize + 'px'); }
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (settings.theme === 'system') applyTheme();
});

// ===========================================================================
// Tab plumbing — page work runs in the YouTube tab (MAIN world, youtube.com origin).
// ===========================================================================
async function activeYouTubeTab() {
  let [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return null;
  return /(^https:\/\/(www\.|m\.)?youtube\.com\/)|(^https:\/\/youtu\.be\/)/.test(tab.url) ? tab : null;
}
async function runInTab(func, args = []) {
  const tab = await activeYouTubeTab();
  if (!tab) throw new Error('NOT_YOUTUBE');
  const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func, args });
  if (chrome.runtime.lastError) throw new Error(chrome.runtime.lastError.message);
  return res?.result;
}

// ---- injected page functions (must be self-contained) ----------------------

function pageReadCaptions() {
  const videoId = (() => {
    const u = new URL(location.href);
    return u.searchParams.get('v') || (location.pathname.match(/\/shorts\/([^/?]+)/) || [])[1] || null;
  })();
  if (!videoId) return { error: 'NO_VIDEO' };

  function extractBalancedJson(src, marker) {
    const i = src.indexOf(marker);
    if (i === -1) return null;
    let depth = 0, start = -1;
    for (let j = i + marker.length; j < src.length; j++) {
      const ch = src[j];
      if (ch === '{') { if (depth === 0) start = j; depth++; }
      else if (ch === '}') { depth--; if (depth === 0) { try { return JSON.parse(src.slice(start, j + 1)); } catch (e) { return null; } } }
    }
    return null;
  }
  async function getPlayerResponse() {
    const pr = window.ytInitialPlayerResponse;
    if (pr?.videoDetails?.videoId === videoId && pr.captions) return pr;
    const html = await (await fetch(`https://www.youtube.com/watch?v=${videoId}`, { credentials: 'include' })).text();
    return extractBalancedJson(html, 'ytInitialPlayerResponse = ') ||
           extractBalancedJson(html, 'ytInitialPlayerResponse":') || pr || null;
  }
  return getPlayerResponse().then((pr) => {
    const r = pr?.captions?.playerCaptionsTracklistRenderer;
    const ct = r?.captionTracks || [];
    if (!ct.length) return { error: 'NO_CAPTIONS' };
    const tracks = ct.map((t) => ({
      name: (t.name?.simpleText || t.name?.runs?.[0]?.text || t.languageCode || 'Unknown'),
      lang: t.languageCode || '', baseUrl: t.baseUrl, kind: t.kind || '', translatable: !!t.isTranslatable
    }));
    const translationLanguages = (r.translationLanguages || []).map((l) => ({
      code: l.languageCode, name: l.languageName?.simpleText || l.languageName?.runs?.[0]?.text || l.languageCode
    }));
    return {
      videoId, title: pr?.videoDetails?.title || document.title.replace(/ - YouTube$/, ''),
      author: pr?.videoDetails?.author || '', url: `https://www.youtube.com/watch?v=${videoId}`,
      tracks, translationLanguages
    };
  }).catch((e) => ({ error: 'READ_FAIL', detail: String(e && e.message || e) }));
}

// Since ~June 2025 the WEB caption baseUrl carries &exp=xpe and needs a runtime
// PoToken (empty body otherwise). We ask InnerTube's `player` endpoint with a
// non-web client (ANDROID/IOS), whose caption URLs are not PoToken-gated.
function pageFetchTranscript(opts) {
  const videoId = (() => {
    const u = new URL(location.href);
    return u.searchParams.get('v') || (location.pathname.match(/\/shorts\/([^/?]+)/) || [])[1] || null;
  })();
  function innertubeKey() {
    try { if (window.ytcfg?.get) return window.ytcfg.get('INNERTUBE_API_KEY'); } catch (e) {}
    try { if (window.ytcfg?.data_?.INNERTUBE_API_KEY) return window.ytcfg.data_.INNERTUBE_API_KEY; } catch (e) {}
    const m = document.documentElement.innerHTML.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
    return m ? m[1] : 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
  }
  async function fetchTimed(baseUrl) {
    let url = baseUrl.replace(/([?&])fmt=[^&]*&?/g, '$1').replace(/[?&]$/, '').replace(/\?&/, '?');
    url += (url.includes('?') ? '&' : '?') + 'fmt=json3';
    if (opts.tlang) url += '&tlang=' + encodeURIComponent(opts.tlang);
    const r = await fetch(url, { credentials: 'omit' });
    if (!r.ok) return { err: 'HTTP ' + r.status };
    const text = await r.text();
    if (!text || !text.trim()) return { err: 'empty' };
    return { text, kind: text.trim()[0] === '{' ? 'json3' : 'xml' };
  }
  async function playerCaptionUrl(clientName, clientVersion, extra) {
    const body = { context: { client: Object.assign({ clientName, clientVersion, hl: 'en' }, extra || {}) }, videoId };
    const r = await fetch('https://www.youtube.com/youtubei/v1/player?key=' + innertubeKey() + '&prettyPrint=false', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit'
    });
    if (!r.ok) throw new Error('player HTTP ' + r.status);
    const pr = await r.json();
    const ct = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    if (!ct.length) throw new Error('no tracks');
    const asr = !!opts.asr;
    return (ct.find((t) => t.languageCode === opts.lang && (t.kind === 'asr') === asr)
         || ct.find((t) => t.languageCode === opts.lang) || ct[0]).baseUrl;
  }
  return (async () => {
    const errs = [];
    const clients = [
      ['ANDROID', '20.10.38', { androidSdkVersion: 30 }],
      ['IOS', '20.10.4', {}],
      ['MWEB', '2.20250312.04.00', {}],
      ['WEB', '2.20250312.04.00', {}]
    ];
    for (const [name, ver, extra] of clients) {
      try {
        const url = await playerCaptionUrl(name, ver, extra);
        const got = await fetchTimed(url);
        if (got.text) return { kind: got.kind, text: got.text, via: name };
        errs.push(`${name}: ${got.err}`);
      } catch (e) { errs.push(`${name}: ${e.message || e}`); }
    }
    if (opts.baseUrl) {
      try {
        const got = await fetchTimed(opts.baseUrl);
        if (got.text) return { kind: got.kind, text: got.text, via: 'web-direct' };
        errs.push('web-direct: ' + got.err);
      } catch (e) { errs.push('web-direct: ' + (e.message || e)); }
    }
    return { error: 'FETCH_FAIL', detail: errs.join(' | ') };
  })();
}

function pageSeek(t) {
  const v = document.querySelector('video');
  if (v) { v.currentTime = t; const p = v.play(); if (p && p.catch) p.catch(() => {}); }
}
function pageVideoTime() {
  const v = document.querySelector('video');
  return v ? { time: v.currentTime, duration: v.duration || 0 } : null;
}

// ===========================================================================
// Load caption track list
// ===========================================================================
async function refreshTracks() {
  resetTranscript();
  setState('loading', 'Reading video…', '');
  el.fetchBtn.disabled = true;
  el.langSelect.innerHTML = '<option>Loading…</option>';
  try {
    const data = await runInTab(pageReadCaptions);
    if (!data || data.error) return handleNoTracks(data?.error);
    tracks = data.tracks;
    meta = { videoId: data.videoId, title: data.title, author: data.author, url: data.url };
    loadHighlights();

    el.langSelect.innerHTML = tracks.map((t, i) =>
      `<option value="${i}">${escapeHtml(t.name)}${t.kind === 'asr' ? ' (auto)' : ''}</option>`).join('');
    el.translateSelect.innerHTML = '<option value="">No translation</option>' +
      (data.translationLanguages || []).map((l) =>
        `<option value="${escapeHtml(l.code)}">→ ${escapeHtml(l.name)}</option>`).join('');
    el.translateSelect.disabled = !(data.translationLanguages || []).length;

    el.videoMeta.innerHTML = `<b>${escapeHtml(meta.title)}</b>${meta.author ? ' · ' + escapeHtml(meta.author) : ''}`;
    el.videoMeta.classList.add('show');
    el.fetchBtn.disabled = false;

    if (settings.autoFetch) getTranscript();
    else setState('ready', `${tracks.length} caption track${tracks.length > 1 ? 's' : ''} found`,
      'Choose a language and hit <b>Get transcript</b>.', '✅');
  } catch (e) {
    handleNoTracks(e.message === 'NOT_YOUTUBE' ? 'NOT_YOUTUBE' : 'READ_FAIL', e.message);
  }
}

function handleNoTracks(code, detail) {
  el.fetchBtn.disabled = true;
  el.langSelect.innerHTML = '<option>—</option>';
  el.videoMeta.classList.remove('show');
  const map = {
    NOT_YOUTUBE: ['🎬', 'Open a YouTube video', 'Switch to a YouTube tab — a video, Short, or youtu.be link — then reopen this panel.'],
    NO_VIDEO: ['🔗', 'No video detected', 'Open a specific video or Short (the URL should contain a video id).'],
    NO_CAPTIONS: ['🚫', 'No captions on this video', 'This video has no subtitles or transcript available to fetch.']
  };
  const [icon, title, msg] = map[code] || ['⚠️', 'Could not read this video',
    (detail ? escapeHtml(detail) + '. ' : '') + 'Try reloading the YouTube tab, then reopen the panel.'];
  setState(code === 'NO_CAPTIONS' ? 'error' : 'empty', title, msg, icon);
}

// ===========================================================================
// Fetch & render transcript
// ===========================================================================
async function getTranscript() {
  const track = tracks[+el.langSelect.value];
  if (!track) return;
  const tlang = el.translateSelect.value;
  el.fetchBtn.disabled = true;
  el.fetchLabel.textContent = 'Fetching…';
  setState('loading', 'Fetching transcript…', '');
  try {
    const res = await runInTab(pageFetchTranscript, [{
      lang: track.lang, asr: track.kind === 'asr', tlang, baseUrl: track.baseUrl
    }]);
    if (!res || res.error) throw new Error(res?.detail || 'Empty response from YouTube');
    rawSegments = res.kind === 'json3' ? C.parseJson3(res.text) : C.parseXml(res.text, DOMParser);
    if (!rawSegments.length) throw new Error('Caption track returned no text');
    rebuildView();
    toast(`Loaded ${viewSegments.length} lines${res.via ? ' · ' + res.via : ''}`);
  } catch (e) {
    rawSegments = []; viewSegments = [];
    showWorkspace(false);
    setState('error', 'Could not fetch transcript',
      escapeHtml(e.message) + '. Try reloading the YouTube tab, then retry.', '⚠️');
  } finally {
    el.fetchBtn.disabled = false;
    el.fetchLabel.textContent = 'Get transcript';
  }
}

// Apply clean / paragraph transforms, then render.
function rebuildView() {
  if (!rawSegments.length) return;
  let segs = rawSegments;
  if (settings.clean) segs = C.stripSoundCues(segs);
  if (settings.paragraph) segs = C.paragraphs(segs);
  viewSegments = segs;
  renderTranscript();
}

function renderTranscript() {
  el.state.style.display = 'none';
  el.scroll.querySelectorAll('.cue').forEach((c) => c.remove());
  cueEls = viewSegments.map((s, i) => {
    const starred = highlights.has(Math.round(s.start));
    const cue = document.createElement('div');
    cue.className = 'cue' + (settings.timestamps ? '' : ' no-ts') + (starred ? ' starred' : '');
    cue.dataset.index = i;
    cue.innerHTML =
      `<span class="ts" title="Jump to ${C.clock(s.start)}">${C.clock(s.start)}</span>` +
      `<span class="tx"></span>` +
      `<span class="acts">` +
        `<button class="act act-star" title="Save line">⭐</button>` +
        `<button class="act act-link" title="Copy link at this time">🔗</button>` +
        `<button class="act act-copy" title="Copy line">📋</button>` +
      `</span>`;
    cue.querySelector('.tx').textContent = s.text;
    cue.querySelector('.ts').addEventListener('click', (e) => { e.stopPropagation(); seekTo(s.start); });
    cue.querySelector('.act-star').addEventListener('click', (e) => { e.stopPropagation(); toggleStar(i); });
    cue.querySelector('.act-link').addEventListener('click', (e) => { e.stopPropagation(); copyLink(s.start); });
    cue.querySelector('.act-copy').addEventListener('click', (e) => { e.stopPropagation(); copyText(s.text, 'Line copied'); });
    cue.addEventListener('click', () => seekTo(s.start));
    el.scroll.appendChild(cue);
    return cue;
  });
  showWorkspace(true);
  applyHighlightsOnly();
  renderStats();
  applySearch();
}

function renderStats() {
  const s = C.stats(viewSegments);
  el.stats.innerHTML = [
    `<span><b>${s.words.toLocaleString()}</b> words</span>`,
    `<span><b>${viewSegments.length}</b> lines</span>`,
    `<span><b>${C.clock(s.duration)}</b></span>`,
    `<span>~<b>${s.readingMinutes}</b> min read</span>`
  ].join('');
}

function showWorkspace(on) {
  el.toolbar.classList.toggle('show', on);
  el.exportBar.classList.toggle('show', on);
  el.foot.classList.toggle('show', on);
}

// ===========================================================================
// Highlights (saved lines), persisted per video
// ===========================================================================
function hlKey() { return 'tsHL_' + (meta.videoId || ''); }
function loadHighlights() {
  highlights = new Set();
  if (!meta.videoId) return;
  chrome.storage.local.get(hlKey(), (a) => {
    highlights = new Set(a[hlKey()] || []);
    if (cueEls.length) renderTranscript();
  });
}
function saveHighlights() { chrome.storage.local.set({ [hlKey()]: [...highlights] }); }
function toggleStar(i) {
  const key = Math.round(viewSegments[i].start);
  if (highlights.has(key)) highlights.delete(key); else highlights.add(key);
  cueEls[i].classList.toggle('starred', highlights.has(key));
  saveHighlights();
  if (settings.highlightsOnly) applyHighlightsOnly();
}
function applyHighlightsOnly() {
  if (!settings.highlightsOnly) { cueEls.forEach((c) => { c.style.display = ''; }); return; }
  cueEls.forEach((c, i) => { c.style.display = highlights.has(Math.round(viewSegments[i].start)) ? '' : 'none'; });
}

// ===========================================================================
// Search (with next/prev navigation)
// ===========================================================================
function applySearch() {
  const q = el.searchInput.value.trim();
  if (!q) {
    hits = []; curHit = -1;
    cueEls.forEach((c, i) => { c.classList.remove('dim', 'current-hit'); c.querySelector('.tx').textContent = viewSegments[i].text; });
    el.searchCount.textContent = '';
    return;
  }
  hits = C.search(viewSegments, q);
  const hitSet = new Set(hits);
  const rx = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
  cueEls.forEach((c, i) => {
    const tx = c.querySelector('.tx');
    c.classList.remove('current-hit');
    if (hitSet.has(i)) { c.classList.remove('dim'); tx.innerHTML = escapeHtml(viewSegments[i].text).replace(rx, '<mark>$1</mark>'); }
    else { c.classList.add('dim'); tx.textContent = viewSegments[i].text; }
  });
  el.searchCount.textContent = hits.length ? `0/${hits.length}` : '0';
  curHit = -1;
  if (hits.length) gotoHit(0);
}
function gotoHit(idx) {
  if (!hits.length) return;
  if (curHit >= 0) cueEls[hits[curHit]]?.classList.remove('current-hit');
  curHit = (idx + hits.length) % hits.length;
  const cue = cueEls[hits[curHit]];
  cue.classList.add('current-hit');
  cue.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.searchCount.textContent = `${curHit + 1}/${hits.length}`;
}

// ===========================================================================
// Follow-along, seek, progress
// ===========================================================================
async function seekTo(t) { try { await runInTab(pageSeek, [t]); } catch (_) { toast('Open the video tab to seek'); } }

function setFollow(on) {
  settings.follow = on;
  el.tgFollow.classList.toggle('on', on);
  saveSettings();
  if (followTimer) { clearInterval(followTimer); followTimer = null; }
  if (on) followTimer = setInterval(syncPlayback, 600);
  else { if (activeCue >= 0) cueEls[activeCue]?.classList.remove('active'); activeCue = -1; el.progressBar.style.width = '0'; }
}
async function syncPlayback() {
  if (!viewSegments.length) return;
  let v; try { v = await runInTab(pageVideoTime); } catch (_) { return; }
  if (!v || v.time == null) return;
  if (v.duration) el.progressBar.style.width = Math.min(100, (v.time / v.duration) * 100) + '%';
  let idx = -1;
  for (let i = 0; i < viewSegments.length; i++) { if (viewSegments[i].start <= v.time + 0.25) idx = i; else break; }
  if (idx === activeCue) return;
  if (activeCue >= 0) cueEls[activeCue]?.classList.remove('active');
  activeCue = idx;
  if (idx >= 0) { cueEls[idx].classList.add('active'); cueEls[idx].scrollIntoView({ block: 'center', behavior: 'smooth' }); }
}

// ===========================================================================
// Export / copy
// ===========================================================================
function buildExport(kind) { return C.format(kind, viewSegments, meta); }
function exportFilename(kind) {
  const ext = (C.FORMATS[kind] || C.FORMATS.txt).ext;
  return `${C.sanitizeFilename(meta.title || meta.videoId || 'transcript')}.${ext}`;
}
async function copyText(text, msg) { try { await navigator.clipboard.writeText(text); toast(msg || 'Copied'); } catch (_) { toast('Copy failed'); } }
function copyTranscript() { if (viewSegments.length) copyText(buildExport(el.formatSelect.value), 'Copied transcript'); }
function copyLink(t) { copyText(`${meta.url}&t=${Math.floor(t)}s`, 'Link copied'); }
function saveFile(content, filename, mime) {
  const blob = new Blob([content], { type: (mime || 'text/plain') + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: false }, () => {
    const failed = !!chrome.runtime.lastError;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast(failed ? 'Download failed' : 'Saved to downloads');
  });
}
function downloadTranscript() {
  if (!viewSegments.length) return;
  const kind = el.formatSelect.value;
  saveFile(buildExport(kind), exportFilename(kind), (C.FORMATS[kind] || C.FORMATS.txt).mime);
}
function baseName() { return C.sanitizeFilename(meta.title || meta.videoId || 'transcript'); }
function downloadSummary() {
  if (!lastAiText) return toast('Generate a summary first');
  saveFile(`# ${meta.title || 'YouTube video'} — Summary\n\n${lastAiText}\n`, `${baseName()} - summary.md`, 'text/markdown');
}
function downloadBoth() {
  if (!lastAiText) return toast('Generate a summary first');
  if (!viewSegments.length) return toast('Load a transcript first');
  const body =
    `# ${meta.title || 'YouTube video'}\n` +
    (meta.author ? `*by ${meta.author}*\n` : '') +
    (meta.url ? `\n[Watch on YouTube](${meta.url})\n` : '') +
    `\n## AI Summary\n\n${lastAiText}\n\n## Full transcript\n\n${C.toTimestamped(viewSegments)}\n`;
  saveFile(body, `${baseName()} - summary + transcript.md`, 'text/markdown');
}

// ===========================================================================
// AI summary (bring-your-own Gemini key)
// ===========================================================================
const AI_PROMPTS = {
  summary: 'Write a tight 2-3 sentence overview of this video, then a "Key points" list of 5-8 bullets. Use Markdown.',
  bullets: 'Produce a clean bullet outline of everything covered, grouped under short Markdown headings.',
  chapters: 'Infer logical chapters. Output a Markdown list where each line is "[mm:ss] Chapter title" using the timestamps present in the transcript.',
  takeaways: 'Extract concrete action items, takeaways and any tools/links mentioned, as a Markdown checklist.'
};

async function runAI() {
  if (!aiKey) { toast('Add a Gemini API key in ⚙️ Settings'); openSettings(); return; }
  if (!viewSegments.length) { toast('Load a transcript first'); return; }
  const granted = await new Promise((r) =>
    chrome.permissions.request({ origins: ['https://generativelanguage.googleapis.com/*'] }, r));
  if (!granted) { toast('AI needs permission to reach Google'); return; }

  el.aiRun.disabled = true;
  el.aiBody.innerHTML = '<div class="spinner"></div>';
  const mode = el.aiMode.value;
  const transcript = (settings.timestamps || mode === 'chapters' ? C.toTimestamped(viewSegments) : C.toParagraph(viewSegments)).slice(0, 120000);
  const prompt = `You are summarizing the transcript of the YouTube video "${meta.title || ''}".\n${AI_PROMPTS[mode]}\n\nTranscript:\n${transcript}`;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${settings.aiModel}:generateContent?key=${encodeURIComponent(aiKey)}`;
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || ('HTTP ' + r.status));
    const out = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text).join('').trim();
    if (!out) throw new Error('Empty response');
    lastAiText = out;
    el.aiBody.innerHTML = renderMarkdown(out);
    el.aiBody.querySelectorAll('.ai-ts').forEach((s) =>
      s.addEventListener('click', () => seekTo(parseClock(s.dataset.t))));
  } catch (e) {
    lastAiText = '';
    el.aiBody.innerHTML = `<p class="hint">AI error: ${escapeHtml(e.message)}. Check your key/model in ⚙️ Settings.</p>`;
  } finally {
    el.aiRun.disabled = false;
  }
}

// Tiny, safe Markdown → HTML (headings, bold, bullets, [mm:ss] timestamps).
function renderMarkdown(md) {
  const esc = escapeHtml(md);
  const lines = esc.split('\n');
  let html = '', inList = false;
  const inline = (t) => t
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/g, '<span class="ai-ts" data-t="$1">$1</span>');
  for (let raw of lines) {
    const line = raw.trim();
    if (/^[-*]\s+/.test(line)) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`; continue; }
    if (inList) { html += '</ul>'; inList = false; }
    if (/^#{1,6}\s+/.test(line)) html += `<h4>${inline(line.replace(/^#{1,6}\s+/, ''))}</h4>`;
    else if (line) html += `<p>${inline(line)}</p>`;
  }
  if (inList) html += '</ul>';
  return html || '<p class="hint">No content.</p>';
}
function parseClock(t) {
  const p = String(t).split(':').map(Number);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
}

// ===========================================================================
// Overlays
// ===========================================================================
function openAI() { el.aiOverlay.hidden = false; }
function closeAI() { el.aiOverlay.hidden = true; }
function openSettings() {
  el.setAutoFetch.checked = settings.autoFetch;
  el.setAiKey.value = aiKey;
  el.setAiModel.value = settings.aiModel;
  el.settingsOverlay.hidden = false;
}
function closeSettings() { el.settingsOverlay.hidden = true; }

// ===========================================================================
// UI helpers
// ===========================================================================
function setState(kind, title, msg, icon) {
  el.scroll.querySelectorAll('.cue').forEach((c) => c.remove());
  el.state.style.display = '';
  el.state.className = 'state' + (kind === 'error' ? ' error' : '');
  el.state.innerHTML = kind === 'loading'
    ? `<div class="spinner"></div><h2>${title}</h2>`
    : `<div class="big">${icon || 'ℹ️'}</div><h2>${title}</h2><p>${msg}</p>`;
}
function resetTranscript() {
  rawSegments = []; viewSegments = []; cueEls = []; hits = []; curHit = -1; activeCue = -1;
  el.scroll.querySelectorAll('.cue').forEach((c) => c.remove());
  el.searchInput.value = ''; el.searchCount.textContent = '';
  el.progressBar.style.width = '0';
  showWorkspace(false);
  if (followTimer) { clearInterval(followTimer); followTimer = null; }
}
let toastTimer = null;
function toast(msg) {
  el.toast.textContent = msg; el.toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.toast.classList.remove('show'), 1800);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ===========================================================================
// Wiring
// ===========================================================================
function populateFormats() {
  el.formatSelect.innerHTML = Object.entries(C.FORMATS).map(([k, f]) => `<option value="${k}">${f.label}</option>`).join('');
  el.formatSelect.value = settings.format;
}
function chip(elm, key, after) {
  elm.addEventListener('click', () => { settings[key] = !settings[key]; elm.classList.toggle('on', settings[key]); saveSettings(); if (after) after(); });
}

function wireEvents() {
  el.fetchBtn.addEventListener('click', getTranscript);
  el.langSelect.addEventListener('change', () => { if (settings.autoFetch) getTranscript(); });
  el.translateSelect.addEventListener('change', () => { if (viewSegments.length || settings.autoFetch) getTranscript(); });

  el.themeBtn.addEventListener('click', () => {
    settings.theme = { system: 'light', light: 'dark', dark: 'system' }[settings.theme];
    applyTheme(); saveSettings();
  });
  const openSupport = () => chrome.tabs.create({ url: SUPPORT_URL });
  el.supportBtn.addEventListener('click', openSupport);
  el.footSupport.addEventListener('click', (e) => { e.preventDefault(); openSupport(); });

  chip(el.tgTimestamps, 'timestamps', () => cueEls.forEach((c) => c.classList.toggle('no-ts', !settings.timestamps)));
  el.tgFollow.addEventListener('click', () => setFollow(!settings.follow));
  chip(el.tgParagraph, 'paragraph', rebuildView);
  chip(el.tgClean, 'clean', rebuildView);
  chip(el.tgHighlights, 'highlightsOnly', applyHighlightsOnly);

  const setFont = (d) => { settings.fontSize = Math.max(12, Math.min(22, settings.fontSize + d)); applyFontSize(); saveSettings(); };
  el.tgSmaller.addEventListener('click', () => setFont(-1));
  el.tgBigger.addEventListener('click', () => setFont(1));

  let deb = null;
  el.searchInput.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(applySearch, 130); });
  el.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); gotoHit(curHit + (e.shiftKey ? -1 : 1)); }
  });
  el.searchPrev.addEventListener('click', () => gotoHit(curHit - 1));
  el.searchNext.addEventListener('click', () => gotoHit(curHit + 1));

  el.formatSelect.addEventListener('change', () => { settings.format = el.formatSelect.value; saveSettings(); });
  el.copyBtn.addEventListener('click', copyTranscript);
  el.downloadBtn.addEventListener('click', downloadTranscript);

  // AI overlay
  el.aiBtn.addEventListener('click', openAI);
  el.aiClose.addEventListener('click', closeAI);
  el.aiRun.addEventListener('click', runAI);
  el.aiCopy.addEventListener('click', () => lastAiText ? copyText(lastAiText, 'Summary copied') : toast('Nothing to copy'));
  el.aiSave.addEventListener('click', downloadSummary);
  el.aiSaveBoth.addEventListener('click', downloadBoth);

  // Settings overlay
  el.settingsBtn.addEventListener('click', openSettings);
  el.settingsClose.addEventListener('click', closeSettings);
  el.setAutoFetch.addEventListener('change', () => { settings.autoFetch = el.setAutoFetch.checked; saveSettings(); });
  el.setAiModel.addEventListener('change', () => { settings.aiModel = el.setAiModel.value; saveSettings(); });
  el.setAiSave.addEventListener('click', () => { aiKey = el.setAiKey.value.trim(); chrome.storage.local.set({ tsAiKey: aiKey }); toast(aiKey ? 'API key saved' : 'Key cleared'); });
  el.setAiClear.addEventListener('click', () => { aiKey = ''; el.setAiKey.value = ''; chrome.storage.local.remove('tsAiKey'); toast('Key cleared'); });

  [el.aiOverlay, el.settingsOverlay].forEach((ov) =>
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.hidden = true; }));

  chrome.runtime.onMessage.addListener((msg) => { if (msg?.type === 'yt-navigated') refreshTracks(); });

  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    if (e.key === 'Escape') { if (!el.aiOverlay.hidden) return closeAI(); if (!el.settingsOverlay.hidden) return closeSettings(); if (typing) { el.searchInput.value = ''; applySearch(); el.searchInput.blur(); } return; }
    if (typing) return;
    if (e.key === '/') { e.preventDefault(); el.searchInput.focus(); }
    else if ((e.key === 'j' || e.key === 'k') && viewSegments.length) {
      e.preventDefault();
      activeCue = Math.max(0, Math.min(viewSegments.length - 1, (activeCue < 0 ? 0 : activeCue) + (e.key === 'j' ? 1 : -1)));
      cueEls.forEach((c) => c.classList.remove('active'));
      cueEls[activeCue].classList.add('active');
      cueEls[activeCue].scrollIntoView({ block: 'center', behavior: 'smooth' });
      seekTo(viewSegments[activeCue].start);
    }
  });
}

// ===========================================================================
// Boot
// ===========================================================================
(async function init() {
  await loadSettings();
  if (!/^gemini-3/.test(settings.aiModel)) settings.aiModel = 'gemini-3.5-flash'; // migrate off retired 2.x ids
  applyTheme(); applyFontSize(); populateFormats();
  el.footSupport.href = SUPPORT_URL;
  el.tgTimestamps.classList.toggle('on', settings.timestamps);
  el.tgFollow.classList.toggle('on', settings.follow);
  el.tgParagraph.classList.toggle('on', settings.paragraph);
  el.tgClean.classList.toggle('on', settings.clean);
  el.tgHighlights.classList.toggle('on', settings.highlightsOnly);
  wireEvents();
  refreshTracks();
})();
