# Code Documentation — Transcript Studio for YouTube

A technical walkthrough of the extension's structure, architecture and data flow.

## 1. File & folder structure

| Path | Description |
|---|---|
| `manifest.json` | MV3 manifest. Declares the side panel, service worker, content script, permissions, the `_execute_action` keyboard command, and the optional Gemini host permission. |
| `service-worker.js` | Background worker. Sets `openPanelOnActionClick` so the toolbar icon opens the side panel (no popup). |
| `content.js` | Runs on YouTube pages. Watches single-page-app navigation (`yt-navigate-finish`) and messages the panel to refresh when the video changes. |
| `panel.html` | Side-panel markup: header, controls, toolbar, export bar, transcript scroll area, AI + settings overlays, toast. |
| `panel.css` | Design system + light/dark/system theming (CSS variables). |
| `panel.js` | The application. Orchestrates fetching, rendering, search, seek/follow, highlights, exports and AI. |
| `lib/captions.js` | **Pure** core: parsing, format conversion, clean/paragraph transforms, stats, search. No DOM, no `chrome.*` — unit-tested under Node. |
| `test/captions.test.js` | Node unit tests for `lib/captions.js`. |
| `icons/` | 16 / 48 / 128 px action icons. |

## 2. High-level architecture

The panel is the brain; the page is reached through `chrome.scripting`:

- **Panel context** (`panel.js`, a normal extension document) holds all UI/state
  and can call `chrome.tabs`, `chrome.scripting`, `chrome.storage`,
  `chrome.downloads` and `fetch` (to Gemini).
- **Page context** (the YouTube tab) is used via `executeScript({world:'MAIN'})`
  for three self-contained functions: read the player/caption list, fetch the
  transcript (InnerTube), and seek/read the `<video>` element.
- **Pure core** (`lib/captions.js`) does all parsing/formatting and is shared,
  side-effect-free and tested.

## 3. Core modules / functions

### `lib/captions.js` (pure)
| Function | Purpose |
|---|---|
| `parseJson3(json)` | YouTube `json3` events → `{start, dur, text}[]`. |
| `parseXml(xml, DOMParser)` | Legacy `srv1` `<text>` or `srv3` `<p>` → segments. |
| `toParagraph / toTimestamped / toSRT / toVTT / toMarkdown / toCSV / toJSON` | Segment → export string. |
| `FORMATS`, `format(kind, segs, meta)` | Format registry + dispatcher. |
| `stripSoundCues(segs)` | Remove `[Music]`/♪ cues. |
| `paragraphs(segs)` | Merge fragments into readable paragraphs. |
| `stats(segs)` | Words, lines, duration, reading time. |
| `search(segs, q)` | Matching indices. |
| `clock / stamp / sanitizeFilename` | Time + filename helpers. |

### `panel.js` (orchestration)
| Area | Functions |
|---|---|
| Injected (MAIN world) | `pageReadCaptions`, `pageFetchTranscript`, `pageSeek`, `pageVideoTime` |
| Flow | `refreshTracks`, `getTranscript`, `rebuildView`, `renderTranscript` |
| Features | `applySearch`/`gotoHit`, `setFollow`/`syncPlayback`, `toggleStar`, `runAI` |
| Export | `buildExport`, `downloadTranscript`, `saveFile`, `downloadSummary`, `downloadBoth` |
| Settings | `loadSettings`/`saveSettings`, `applyTheme`, `applyFontSize` |

## 4. Data flow

```
                ┌─────────────────────────── panel.js (extension page) ───────────────────────────┐
 user clicks ▶  │  refreshTracks ─executeScript(MAIN)→ pageReadCaptions ─→ track list (dropdowns)   │
 Get transcript │  getTranscript ─executeScript(MAIN)→ pageFetchTranscript:                          │
                │      POST youtubei/v1/player {ANDROID/IOS} → un-gated caption baseUrl              │
                │      GET baseUrl&fmt=json3[&tlang] → raw json3/xml                                 │
                │  CaptionsCore.parseJson3/parseXml → rawSegments                                    │
                │  rebuildView (clean? paragraphs?) → viewSegments → renderTranscript()             │
 click line ────┼─ seekTo ─executeScript(MAIN)→ pageSeek(video.currentTime)                          │
 ✨ AI ─────────┼─ runAI → fetch Gemini (user key) → renderMarkdown                                  │
 💾 export ─────┼─ CaptionsCore.format → Blob → chrome.downloads                                     │
                └────────────────────────────────────────────────────────────────────────────────┘
```

## 5. Dependencies

- **Runtime:** none. Vanilla ES2020 + browser/extension APIs. AI is an optional
  direct `fetch` to Google's Gemini API with the user's own key.
- **Dev:** Node (only to run `test/captions.test.js`). No build step or bundler.

## 6. Execution flow (entry → output)

1. Icon click → service worker opens the side panel (`panel.html`).
2. `panel.js` boots: loads settings, applies theme/font, wires events, calls
   `refreshTracks()`.
3. `refreshTracks` reads caption tracks; if **auto-fetch** is on it calls
   `getTranscript()`, else waits for the button.
4. `getTranscript` fetches via InnerTube, parses to segments, applies view
   transforms, and renders clickable cues + stats.
5. User searches / seeks / follows / stars / summarizes / exports — all operate
   on `viewSegments`.
