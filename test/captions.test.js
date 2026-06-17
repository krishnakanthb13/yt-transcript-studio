/* Minimal dependency-free test for the caption core. Run: node test/captions.test.js */
const assert = require('assert');
const C = require('../lib/captions.js');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); }
}

// A tiny DOMParser shim so parseXml can be tested without a browser.
class FakeNode {
  constructor(start, dur, text) { this._a = { start, dur }; this.textContent = text; }
  getAttribute(k) { return this._a[k]; }
}
class FakeDoc {
  constructor(nodes) { this._n = nodes; }
  getElementsByTagName() { return this._n; }
}
class FakeDoc2 {
  constructor(map) { this._map = map; }
  getElementsByTagName(tag) { return this._map[tag] || []; }
}
class PNode {
  constructor(t, d, text) { this._a = { t, d }; this.textContent = text; }
  getAttribute(k) { return this._a[k]; }
}
class FakeDOMParser {
  parseFromString(xml) {
    const text = [];
    let m;
    const tx = /<text start="([\d.]+)"(?: dur="([\d.]+)")?>([\s\S]*?)<\/text>/g;
    while ((m = tx.exec(xml))) text.push(new FakeNode(m[1], m[2] || '0', m[3]));
    const p = [];
    const px = /<p t="(\d+)"(?: d="(\d+)")?>([\s\S]*?)<\/p>/g;
    while ((m = px.exec(xml))) p.push(new PNode(m[1], m[2] || '0', m[3]));
    return new FakeDoc2({ text, p });
  }
}

const json3 = {
  events: [
    { tStartMs: 0, dDurationMs: 1500, segs: [{ utf8: 'Hello' }, { utf8: ' world' }] },
    { tStartMs: 1500, dDurationMs: 2000, segs: [{ utf8: 'second &amp; line' }] },
    { tStartMs: 9000, segs: [{ utf8: '\n' }] }, // whitespace-only -> dropped
    { tStartMs: 3600000, dDurationMs: 1000, segs: [{ utf8: 'an hour in' }] }
  ]
};

t('parseJson3 extracts text, drops empty, decodes entities', () => {
  const segs = C.parseJson3(json3);
  assert.strictEqual(segs.length, 3);
  assert.strictEqual(segs[0].text, 'Hello world');
  assert.strictEqual(segs[1].text, 'second & line');
  assert.strictEqual(segs[0].start, 0);
  assert.strictEqual(segs[1].start, 1.5);
});

t('parseJson3 accepts a JSON string', () => {
  assert.strictEqual(C.parseJson3(JSON.stringify(json3)).length, 3);
});

t('parseXml parses <text> nodes with the shim', () => {
  const xml = '<transcript><text start="0" dur="2">Hi&amp;bye</text><text start="2">next</text></transcript>';
  const segs = C.parseXml(xml, FakeDOMParser);
  assert.strictEqual(segs.length, 2);
  assert.strictEqual(segs[0].text, 'Hi&bye');
  assert.strictEqual(segs[1].start, 2);
});

t('parseXml falls back to srv3 <p t d> in milliseconds', () => {
  const xml = '<timedtext><body><p t="0" d="1500">Hello</p><p t="1500" d="2000">world &amp; more</p></body></timedtext>';
  const segs = C.parseXml(xml, FakeDOMParser);
  assert.strictEqual(segs.length, 2);
  assert.strictEqual(segs[0].start, 0);
  assert.strictEqual(segs[1].start, 1.5);   // 1500ms -> 1.5s
  assert.strictEqual(segs[1].text, 'world & more');
});

t('clock formats compact m:ss and h:mm:ss', () => {
  assert.strictEqual(C.clock(65), '1:05');
  assert.strictEqual(C.clock(3725), '1:02:05');
});

t('stamp formats SRT and VTT timecodes', () => {
  assert.strictEqual(C.stamp(3661.234, ','), '01:01:01,234');
  assert.strictEqual(C.stamp(1.5, '.'), '00:00:01.500');
});

t('toSRT produces sequential numbered cues', () => {
  const srt = C.toSRT(C.parseJson3(json3));
  assert.ok(srt.startsWith('1\n00:00:00,000 --> 00:00:01,500\nHello world'));
  assert.ok(/\n2\n/.test('\n' + srt));
});

t('toVTT starts with WEBVTT header', () => {
  assert.ok(C.toVTT(C.parseJson3(json3)).startsWith('WEBVTT\n\n'));
});

t('endOf falls back to next cue start when dur missing', () => {
  const segs = [{ start: 0, dur: 0, text: 'a' }, { start: 5, dur: 0, text: 'b' }];
  assert.ok(C.endOf(segs, 0) > 0 && C.endOf(segs, 0) <= 5);
});

t('toParagraph joins and collapses whitespace', () => {
  assert.strictEqual(C.toParagraph(C.parseJson3(json3)), 'Hello world second & line an hour in');
});

t('toTimestamped prefixes each line with a clock', () => {
  assert.ok(C.toTimestamped(C.parseJson3(json3)).startsWith('[0:00] Hello world'));
});

t('toMarkdown links timestamps to the video when url present', () => {
  const md = C.toMarkdown(C.parseJson3(json3), { title: 'X', url: 'https://y/watch?v=ID' });
  assert.ok(md.includes('# X'));
  assert.ok(md.includes('&t=0s)'));
});

t('toJSON round-trips to parseable JSON', () => {
  const arr = JSON.parse(C.toJSON(C.parseJson3(json3)));
  assert.strictEqual(arr.length, 3);
  assert.strictEqual(arr[0].text, 'Hello world');
});

t('stats reports words, lines and reading time', () => {
  const s = C.stats(C.parseJson3(json3));
  assert.strictEqual(s.lines, 3);
  assert.strictEqual(s.words, 8); // "Hello world second & line an hour in"
  assert.ok(s.readingMinutes >= 1);
});

t('search returns matching indices, case-insensitive', () => {
  const segs = C.parseJson3(json3);
  assert.deepStrictEqual(C.search(segs, 'SECOND'), [1]);
  assert.strictEqual(C.search(segs, '').length, 3);
});

t('toCSV emits header + quoted text rows', () => {
  const csv = C.toCSV(C.parseJson3(json3));
  assert.ok(csv.startsWith('start_seconds,timecode,text\n'));
  assert.ok(csv.includes('"Hello world"'));
});

t('stripSoundCues removes [Music] and ♪, drops empties', () => {
  const segs = [
    { start: 0, dur: 1, text: '[Music]' },
    { start: 1, dur: 1, text: 'hello [Applause] there' },
    { start: 2, dur: 1, text: '♪♪' }
  ];
  const out = C.stripSoundCues(segs);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].text, 'hello there');
});

t('paragraphs merges small-gap fragments up to a limit', () => {
  const segs = [
    { start: 0, dur: 1, text: 'this is' },
    { start: 1, dur: 1, text: 'one sentence' },
    { start: 30, dur: 1, text: 'much later line' }   // big gap -> new paragraph
  ];
  const out = C.paragraphs(segs, 2.5, 300);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].text, 'this is one sentence');
  assert.strictEqual(out[1].text, 'much later line');
});

t('paragraphs breaks at sentence-ending punctuation', () => {
  const segs = [
    { start: 0, dur: 1, text: 'Done.' },
    { start: 1, dur: 1, text: 'New start' }
  ];
  const out = C.paragraphs(segs, 5, 300);
  assert.strictEqual(out.length, 2);
});

t('sanitizeFilename strips illegal characters', () => {
  assert.strictEqual(C.sanitizeFilename('a/b:c*?"<>|.txt'), 'abc.txt');
  assert.strictEqual(C.sanitizeFilename('   '), 'transcript');
});

t('decodeEntities handles numeric and named entities', () => {
  assert.strictEqual(C.decodeEntities('a&#39;b &amp; c &#x41;'), "a'b & c A");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
