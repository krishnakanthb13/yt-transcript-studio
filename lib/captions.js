/*
 * captions.js — pure caption/transcript core for Transcript Studio for YouTube.
 *
 * No DOM, no chrome.* APIs — just parsing, formatting and stats so it can be
 * unit-tested in Node and reused by the panel. A "segment" is the canonical
 * shape everything converts to/from:
 *
 *   { start: <seconds:number>, dur: <seconds:number>, text: <string> }
 *
 * Works both as a browser global (window.CaptionsCore) and a CommonJS module.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CaptionsCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- text helpers --------------------------------------------------------

  const ENTITIES = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
    '&#39;': "'", '&apos;': "'", '&nbsp;': ' '
  };

  function decodeEntities(s) {
    if (!s) return '';
    return String(s)
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
      .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
      .replace(/<br\s*\/?>/gi, '\n');
  }

  function collapse(s) {
    return String(s).replace(/\s+/g, ' ').trim();
  }

  // ---- parsers (network response -> segments) ------------------------------

  // YouTube json3 — the richest, most reliable timedtext format.
  function parseJson3(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    const out = [];
    for (const ev of data.events || []) {
      if (!ev.segs) continue; // window/positioning events carry no text
      const text = collapse(ev.segs.map((s) => s.utf8 || '').join(''));
      if (!text) continue;
      out.push({
        start: (ev.tStartMs || 0) / 1000,
        dur: (ev.dDurationMs || 0) / 1000,
        text: decodeEntities(text)
      });
    }
    return out;
  }

  // Legacy/srv3/srv1 XML — <text start="" dur="">…</text>. DOMParser is passed
  // in by the caller (panel) since it is not available in Node.
  function parseXml(xmlText, DOMParserImpl) {
    const Parser = DOMParserImpl || (typeof DOMParser !== 'undefined' ? DOMParser : null);
    if (!Parser) throw new Error('No DOMParser available to parse XML captions');
    const doc = new Parser().parseFromString(xmlText, 'text/xml');
    const out = [];

    // Legacy / srv1: <text start="0.0" dur="1.5"> (seconds).
    const textNodes = doc.getElementsByTagName('text');
    for (let i = 0; i < textNodes.length; i++) {
      const n = textNodes[i];
      const text = collapse(decodeEntities(n.textContent || ''));
      if (!text) continue;
      out.push({
        start: parseFloat(n.getAttribute('start') || '0') || 0,
        dur: parseFloat(n.getAttribute('dur') || '0') || 0,
        text
      });
    }
    if (out.length) return out;

    // srv3: <p t="0" d="1500"><s>word</s>…> (milliseconds).
    const pNodes = doc.getElementsByTagName('p');
    for (let i = 0; i < pNodes.length; i++) {
      const n = pNodes[i];
      const text = collapse(decodeEntities(n.textContent || ''));
      if (!text) continue;
      out.push({
        start: (parseFloat(n.getAttribute('t') || '0') || 0) / 1000,
        dur: (parseFloat(n.getAttribute('d') || '0') || 0) / 1000,
        text
      });
    }
    return out;
  }

  // ---- time formatting -----------------------------------------------------

  function pad(n, w = 2) { return String(Math.floor(n)).padStart(w, '0'); }

  // 1:05 / 1:02:05 — compact, for the UI and timestamped text.
  function clock(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
  }

  // 00:00:01,234 (SRT) or 00:00:01.234 (VTT)
  function stamp(seconds, sep) {
    const s = Math.max(0, seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.round((s - Math.floor(s)) * 1000);
    return `${pad(h)}:${pad(m)}:${pad(sec)}${sep}${pad(ms, 3)}`;
  }

  // Some captions omit dur; estimate end from the next cue's start.
  function endOf(segs, i, fallback = 2) {
    const cur = segs[i];
    if (cur.dur && cur.dur > 0.05) return cur.start + cur.dur;
    const next = segs[i + 1];
    if (next) return Math.max(cur.start + 0.5, next.start - 0.05);
    return cur.start + fallback;
  }

  // ---- formatters (segments -> export string) ------------------------------

  function toParagraph(segs) {
    return collapse(segs.map((s) => s.text).join(' '));
  }

  function toTimestamped(segs) {
    return segs.map((s) => `[${clock(s.start)}] ${s.text}`).join('\n');
  }

  function toSRT(segs) {
    return segs.map((s, i) =>
      `${i + 1}\n${stamp(s.start, ',')} --> ${stamp(endOf(segs, i), ',')}\n${s.text}\n`
    ).join('\n');
  }

  function toVTT(segs) {
    const body = segs.map((s, i) =>
      `${stamp(s.start, '.')} --> ${stamp(endOf(segs, i), '.')}\n${s.text}`
    ).join('\n\n');
    return `WEBVTT\n\n${body}\n`;
  }

  function toJSON(segs) {
    return JSON.stringify(
      segs.map((s) => ({ start: +s.start.toFixed(3), dur: +s.dur.toFixed(3), text: s.text })),
      null, 2
    );
  }

  function toMarkdown(segs, meta = {}) {
    const head = [];
    if (meta.title) head.push(`# ${meta.title}`);
    if (meta.author) head.push(`*by ${meta.author}*`);
    if (meta.url) head.push(`\n[Watch on YouTube](${meta.url})`);
    const body = segs.map((s) => {
      const t = meta.url
        ? `[\`${clock(s.start)}\`](${meta.url}&t=${Math.floor(s.start)}s)`
        : `\`${clock(s.start)}\``;
      return `- ${t} ${s.text}`;
    }).join('\n');
    return (head.length ? head.join('\n') + '\n\n' : '') + body + '\n';
  }

  function toCSV(segs) {
    const esc = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    const rows = ['start_seconds,timecode,text'];
    for (const s of segs) rows.push(`${s.start.toFixed(2)},${clock(s.start)},${esc(s.text)}`);
    return rows.join('\n') + '\n';
  }

  const FORMATS = {
    txt:   { ext: 'txt', label: 'Plain text',       mime: 'text/plain',       fn: toParagraph },
    time:  { ext: 'txt', label: 'Timestamped text', mime: 'text/plain',       fn: toTimestamped },
    srt:   { ext: 'srt', label: 'SubRip (.srt)',    mime: 'text/plain',       fn: toSRT },
    vtt:   { ext: 'vtt', label: 'WebVTT (.vtt)',    mime: 'text/vtt',         fn: toVTT },
    md:    { ext: 'md',  label: 'Markdown (.md)',   mime: 'text/markdown',    fn: toMarkdown },
    csv:   { ext: 'csv', label: 'CSV (.csv)',       mime: 'text/csv',         fn: toCSV },
    json:  { ext: 'json',label: 'JSON (.json)',     mime: 'application/json', fn: toJSON }
  };

  function format(kind, segs, meta) {
    const f = FORMATS[kind] || FORMATS.txt;
    return f.fn(segs, meta);
  }

  // ---- stats & search ------------------------------------------------------

  function stats(segs) {
    const text = toParagraph(segs);
    const words = text ? text.split(/\s+/).length : 0;
    const last = segs[segs.length - 1];
    const duration = last ? endOf(segs, segs.length - 1) : 0;
    return {
      lines: segs.length,
      words,
      chars: text.length,
      duration,
      readingMinutes: Math.max(1, Math.round(words / 200)) // ~200 wpm
    };
  }

  function search(segs, query) {
    const q = collapse(query).toLowerCase();
    if (!q) return segs.map((_, i) => i);
    return segs.reduce((hits, s, i) => {
      if (s.text.toLowerCase().includes(q)) hits.push(i);
      return hits;
    }, []);
  }

  function sanitizeFilename(name) {
    return collapse(String(name)).replace(/[\\/:*?"<>|]+/g, '').slice(0, 120) || 'transcript';
  }

  // ---- view transforms -----------------------------------------------------

  // Drop standalone non-speech cues ([Music], (Applause), ♪♪) and scrub inline ones.
  function stripSoundCues(segs) {
    return segs
      .map((s) => ({ ...s, text: collapse(s.text.replace(/\[[^\]]*\]/g, ' ').replace(/[♪🎵]+/g, ' ')) }))
      .filter((s) => s.text.length > 0);
  }

  // Merge choppy cues (esp. auto-captions) into readable paragraphs: join while
  // the gap is small, the running length is under maxChars, and we haven't hit
  // sentence-ending punctuation.
  function paragraphs(segs, maxGap = 2.5, maxChars = 300) {
    const out = [];
    let cur = null;
    for (const s of segs) {
      if (!cur) { cur = { start: s.start, dur: s.dur, text: s.text }; continue; }
      const gap = s.start - (cur.start + cur.dur);
      const fits = (cur.text.length + s.text.length + 1) <= maxChars;
      const sentenceEnd = /[.!?]["')\]]?$/.test(cur.text);
      if (gap <= maxGap && fits && !sentenceEnd) {
        cur.text = collapse(cur.text + ' ' + s.text);
        cur.dur = (s.start + s.dur) - cur.start;
      } else {
        out.push(cur);
        cur = { start: s.start, dur: s.dur, text: s.text };
      }
    }
    if (cur) out.push(cur);
    return out;
  }

  return {
    decodeEntities, collapse,
    parseJson3, parseXml,
    clock, stamp, endOf,
    toParagraph, toTimestamped, toSRT, toVTT, toJSON, toMarkdown, toCSV,
    FORMATS, format,
    stats, search, sanitizeFilename,
    stripSoundCues, paragraphs
  };
});
