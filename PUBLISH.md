# Publishing Transcript Studio for YouTube

Everything you need to put the extension on the **Chrome Web Store** (and Edge
Add-ons), plus ready-to-paste listing copy, permission justifications, and a
privacy policy. The extension **is this repository** (`manifest.json` is at the
root). The [command-line companion](https://github.com/krishnakanthb13/yt-transcript-cli)
is a separate repo and doesn't need a store.

---

## 1. One-time setup

1. Create a **[Chrome Web Store developer account](https://chromewebstore.google.com/devconsole)** — a **one-time US $5** registration fee.
2. (Optional, for Edge) Create a free **[Microsoft Partner Center](https://partner.microsoft.com/dashboard/microsoftedge)** account.

## 2. Build the upload package

The store wants a **ZIP whose root is `manifest.json`** (do not zip the parent
folder). From the repo root:

```bash
zip -r ../transcript-studio.zip . \
  -x ".git/*" "test/*" "*.md" ".gitignore" ".github/*"
```

> Exclude `.git/`, `test/`, the docs and CI — they aren't needed at runtime.
> Everything else (`manifest.json`, `*.js`, `*.html`, `*.css`, `lib/`, `icons/`) ships.

## 3. Create the listing

In the Developer Dashboard → **Add new item** → upload the ZIP, then fill in:

- **Listing** — name, summary, description (copy below), category **Productivity**, language English.
- **Graphics** — a 128×128 icon (already in `icons/`), at least one **1280×800** or **640×400** screenshot, and optionally a 440×280 small promo tile.
- **Privacy** — paste the practices and the privacy-policy URL (below). Declare a **single purpose** and justify each permission (below).
- **Distribution** — Public, all regions (or your choice).

Submit for review. First review typically takes a few hours to a few days.

## 4. After publishing

- Update the repo `README` with the store link.
- Bump `manifest.json` `version` on every store update (the store rejects re-uploads with the same version).
- Tag a release on GitHub so the open-source build matches what's on the store.

---

## 📋 Store listing copy (paste-ready)

**Name**
```
Transcript Studio for YouTube
```

**Short summary** (≤ 132 chars)
```
Get any YouTube transcript: pick the language, translate, search, click-to-seek, AI-summarize, and export TXT/SRT/VTT/MD/CSV/JSON.
```

**Description**
```
Transcript Studio turns any YouTube video or Short into a clean, searchable
transcript — right in a side panel next to the video.

✦ Works on any video or Short with captions (including auto-generated)
✦ Pick the caption language, or auto-translate to dozens of languages
✦ Click any line (or its timestamp) to jump the video to that exact moment
✦ "Follow video" highlights and auto-scrolls the line that's playing
✦ Search the transcript with next/previous navigation and highlighting
✦ Paragraph mode merges choppy auto-captions into readable text
✦ Hide [Music]/[Applause] noise with one click
✦ Save important lines and export just your highlights
✦ Export or copy as Plain text, Timestamped text, SRT, VTT, Markdown, CSV, JSON
✦ Optional AI summary, outline, auto-chapters and action items
  (bring your own free Google Gemini API key — stays in your browser)
✦ Light / dark / system themes, adjustable font size
✦ Keyboard shortcut to open (Ctrl/Cmd+Shift+Y)

100% free and open source. Private by design: the extension runs entirely in
your browser. It talks only to YouTube to read captions, and — only if you turn
on AI and add your own key — directly to Google's Gemini API. No analytics, no
accounts, no servers, no tracking.

If it saves you time, you can support the project at
https://krishnakanthb13.github.io/S/
```

**Single purpose** (store requires one sentence)
```
Fetch, read, translate, search and export the transcript/subtitles of the
YouTube video in the current tab.
```

---

## 🔐 Permission justifications (paste-ready)

| Permission | Justification |
|---|---|
| `sidePanel` | The entire user interface is presented in the browser side panel. |
| `scripting` | To read the current video's caption metadata and fetch its transcript from within the YouTube tab. |
| `activeTab` | To act only on the YouTube tab the user is currently viewing. |
| `storage` | To remember user preferences (theme, font size, format, toggles) and the user's optional AI key locally. |
| `downloads` | To save the exported transcript file the user requests. |
| Host: `*.youtube.com`, `youtu.be` | The extension only operates on YouTube; it reads captions there. |
| Optional host: `generativelanguage.googleapis.com` | Requested at runtime **only if** the user enables AI summaries, to call Google's Gemini API with the user's own key. |

---

## 🛡️ Privacy policy (paste-ready — host this text at a public URL)

> **Transcript Studio for YouTube — Privacy Policy**
>
> Transcript Studio does not collect, store, transmit or sell any personal data.
>
> - **Local only.** All preferences and any AI API key you choose to add are
>   stored locally in your browser (`chrome.storage`) and never sent to us.
> - **No servers, no analytics, no tracking.** The developer operates no backend
>   and receives no data from the extension.
> - **YouTube.** To build a transcript, the extension reads caption data from the
>   YouTube page/endpoints in your current tab.
> - **Optional AI.** If — and only if — you enable AI features and provide your
>   own Google Gemini API key, the transcript text and your key are sent directly
>   from your browser to Google's Gemini API to generate the summary. This is
>   governed by Google's privacy policy. If you don't use AI, no such call is made.
>
> Contact: via the project's GitHub repository.

> You can host this policy as a GitHub Pages page or a Gist and link it in the
> store listing's "Privacy policy URL" field.

---

## ✅ Pre-submit checklist

- [ ] `manifest.json` version bumped
- [ ] ZIP has `manifest.json` at the root, `test/` excluded
- [ ] 128×128 icon + at least one screenshot uploaded
- [ ] Description, single purpose, and permission justifications filled in
- [ ] Privacy policy URL set
- [ ] Loaded the exact ZIP via "Load unpacked" once more and smoke-tested it

---

Part of [Transcript Studio for YouTube](README.md) · [GPLv3 licensed](LICENSE).
