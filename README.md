# Transcript Studio for YouTube — Browser Extension

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-success.svg)
![Chrome](https://img.shields.io/badge/Chrome%2FEdge-114%2B-4285F4.svg)

A Chrome/Edge **Manifest V3** side-panel extension that pulls the transcript or
subtitles from any YouTube video or Short. Pick the language, auto-translate,
search, click a line to jump the video, summarize with AI, and export as TXT,
timestamped TXT, SRT, VTT, Markdown, CSV or JSON.

Everything runs locally in your browser — no servers, no accounts, no tracking.

> Prefer the terminal, or want to batch-process many videos? There's a
> [command-line companion (`yt-transcript-cli`)](https://github.com/krishnakanthb13/yt-transcript-cli).
> Free and open source — if it helps you, [support it 💛](https://krishnakanthb13.github.io/S/).

---

## 🚀 Install (unpacked) — step by step

**1. Get the files (one time)**
- On GitHub, click **Code → Download ZIP**, then **unzip** it
  (or `git clone https://github.com/krishnakanthb13/yt-transcript-studio`).

**2. Add it to your browser (one time)**
1. Go to `chrome://extensions` (or `edge://extensions`).
2. Toggle **Developer mode** (top-right).
3. Click **Load unpacked** and choose the **`yt-transcript-studio`** folder
   (the one containing `manifest.json`).
4. *(Optional)* Pin the 📝 icon via the puzzle-piece 🧩 menu.

**3. Use it (every time)**
1. Open any YouTube video or Short with captions.
2. Click the 📝 toolbar icon — the side panel opens on the right.
3. Pick a language (optional), then click **Get transcript**.

> Needs Chrome/Edge **114+** (for the side-panel API). Clicking the toolbar icon
> opens the panel directly; there is no popup.

### Updating later

Download the new files over the old folder, then go to `chrome://extensions`
and click the **↻ reload** icon on the Transcript Studio card.

---

## ✨ Features

| | |
|---|---|
| **Any video or Short** | Works wherever captions exist, including auto-generated tracks. |
| **Language picker** | Choose any caption track the video offers. |
| **Auto-translate** | Translate to any of YouTube's supported target languages. |
| **Click-to-seek** | Click a line (or its timestamp) and the video jumps to that moment. |
| **Follow video** | Auto-scrolls + highlights the playing line, with a playback progress bar. |
| **Search + navigation** | Live highlighting, hit counter, next/prev (`/` focus, `Enter` / `Shift+Enter`). |
| **Paragraph mode** | Merge choppy auto-caption fragments into readable paragraphs. |
| **Hide SFX** | Strip `[Music]` / `[Applause]` / ♪ noise. |
| **Saved lines** | Star important lines (⭐), persisted per video; show only your highlights. |
| **Per-line actions** | Copy a single line, or copy a `?t=` deep link to that moment. |
| **AI summary** | Summary, outline, auto-chapters or action items via your own Gemini key. |
| **Export** | Plain text, timestamped text, `.srt`, `.vtt`, Markdown, **CSV**, JSON — copy or download. |
| **AI downloads** | Save the summary alone, or **summary + full transcript** together. |
| **Reading stats** | Word count, line count, duration, estimated reading time. |
| **Themes & sizing** | Light / dark / system theme and adjustable font size, all remembered. |
| **Keyboard** | `Ctrl/⌘+Shift+Y` open · `/` search · `Enter` next match · `j`/`k` move lines. |

### AI summaries (optional, bring-your-own key)

The ✨ panel can summarize, outline, generate timestamped **auto-chapters**, or
pull out **action items** from the loaded transcript. It uses **your own Google
Gemini API key** ([free key here](https://aistudio.google.com/apikey)), stored
locally in your browser. Models: **Gemini 3.5 Flash** (default) or **3.1
Flash-Lite**. Nothing is sent anywhere except the direct call from your browser
to Google's Gemini API — and only when you press Generate.

---

## 🔒 Permissions — and why each is needed

| Permission | Why |
|---|---|
| `sidePanel` | The whole UI lives in the side panel. |
| `scripting` | Reads the player data and fetches captions from inside the YouTube tab. |
| `activeTab` | Acts only on the YouTube tab you're viewing. |
| `storage` | Remembers your preferences and (locally) your optional AI key. |
| `downloads` | Saves the exported transcript / summary file. |
| host: `youtube.com`, `youtu.be` | Limits all of the above to YouTube only. |
| **optional** host: `generativelanguage.googleapis.com` | Requested at runtime **only if** you enable AI summaries. |

No analytics, no remote code, no tracking. The only network calls are to
YouTube (for captions) and — if you opt in — directly to Google's Gemini API.

---

## 🛠 How it works (and why it's reliable)

Two problems sink most DIY YouTube-transcript code:

1. **Wrong JS world.** Reading `ytInitialPlayerResponse` from a content script's
   *isolated world* fails — that page variable doesn't live there. We inject into
   the page's **MAIN world** via `chrome.scripting.executeScript` and read the real
   player object (with an HTML-fetch fallback) to list the caption tracks.
2. **PoToken (since ~June 2025).** The WEB player's caption `baseUrl` now carries
   `&exp=xpe` and returns an **empty body** without a runtime proof-of-origin
   token. So we don't use it. Instead we call YouTube's **InnerTube `player`
   endpoint with a non-web client (ANDROID → IOS → MWEB → WEB)**, whose caption
   URLs are *not* PoToken-gated, and fetch `json3` from there. The format is
   auto-detected (`json3` or XML — `srv1`/`srv3`) and parsed accordingly.

Because `host_permissions` cover YouTube, these run fine from the tab without CORS
issues.

```
panel.js ──executeScript(MAIN world)──▶ youtube.com tab
   1. read player response  → caption track list (UI)
   2. POST youtubei/v1/player {client: ANDROID…}  → un-gated caption baseUrl
   3. GET baseUrl&fmt=json3                        → caption data
         ◀── raw json3 / xml ──
lib/captions.js  parse → segments → clean/paragraph → format (TXT/SRT/VTT/MD/CSV/JSON) + stats
panel.js (optional) ──▶ Gemini API (your key)       → AI summary / chapters
```

---

## 📁 Files

```text
yt-transcript-studio/      # ← load this folder as an unpacked extension
├── manifest.json          # MV3 manifest (action opens the side panel)
├── service-worker.js      # sets the side-panel-on-click behavior
├── content.js             # detects in-app navigation → auto-refresh
├── panel.html             # side-panel markup + AI / settings overlays
├── panel.css              # light / dark / system theming
├── panel.js               # the app: fetch, render, search, seek, AI, export
├── lib/captions.js        # pure parse/convert/clean/format/stats core (no DOM/chrome)
├── test/captions.test.js  # Node unit tests for the core
├── icons/                 # 16 / 48 / 128 px
├── README.md · CODE_DOCUMENTATION.md · DESIGN_PHILOSOPHY.md
├── CONTRIBUTING.md · SECURITY.md · CHANGELOG.md · PUBLISH.md
└── LICENSE                # GNU GPL v3
```

See **[CODE_DOCUMENTATION.md](CODE_DOCUMENTATION.md)** for architecture and data
flow, and **[DESIGN_PHILOSOPHY.md](DESIGN_PHILOSOPHY.md)** for the why.

---

## ✅ Develop & test

The caption core is pure (no DOM, no `chrome.*`) so it runs under Node:

```bash
node test/captions.test.js     # 21 tests
```

After editing any file, reload the extension at `chrome://extensions`
(the ↻ icon on the card) and reopen the side panel.

To publish to the Chrome Web Store, see **[PUBLISH.md](PUBLISH.md)**.

---

## 🩹 Troubleshooting

- **"Open a YouTube video"** — the active tab isn't a YouTube page; switch tabs and reopen the panel.
- **"No captions on this video"** — the video genuinely has no subtitles/transcript.
- **"Could not fetch transcript"** — YouTube occasionally rate-limits; reload the video tab and retry.
- **Nothing happens on icon click** — confirm Chrome/Edge is 114+; on older builds the side-panel API is unavailable.

---

## 🤝 Support & license

Free and **open source** under the [GPLv3 License](LICENSE). If it saves you time:
**[krishnakanthb13.github.io/S](https://krishnakanthb13.github.io/S/)** —
GitHub Sponsors · Buy Me a Coffee · PayPal · UPI.

© 2026 Krishna Kanth B
