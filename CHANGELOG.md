# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-06-17

Initial public release.

### Added
- Manifest V3 **side-panel** extension for YouTube videos and Shorts.
- Reliable caption fetching via YouTube's **InnerTube** `player` endpoint with a
  non-web client (ANDROID/IOS), avoiding the PoToken-gated `timedtext` URL.
- **Language picker** and **auto-translate** to any supported language.
- **Click-to-seek** on every line and timestamp; **Follow video** auto-scroll
  with a playback progress bar.
- **Search** with highlight, hit counter, and next/previous navigation.
- **Paragraph mode**, **Hide SFX** (`[Music]`/`[Applause]`), and **saved lines**
  (highlights) persisted per video.
- Per-line **copy line** and **copy `?t=` deep link**.
- **AI summaries** (summary / outline / auto-chapters / takeaways) via your own
  Google Gemini key (3.5 Flash / 3.1 Flash-Lite); download summary or
  summary + transcript together.
- **Exports**: TXT, timestamped TXT, SRT, VTT, Markdown, CSV, JSON — copy or save.
- Light / dark / system themes, adjustable font size, persisted settings.
- Keyboard shortcut to open (`Ctrl/⌘+Shift+Y`) plus in-panel shortcuts.

[1.0.0]: https://github.com/krishnakanthb13/yt-transcript-studio/releases/tag/v1.0.0
