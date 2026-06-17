# Design Philosophy — Transcript Studio for YouTube

## 1. The problem

YouTube transcripts are locked behind a fiddly menu, dumped as one blob with no
search, no export, and no way to act on a line. Most third-party tools either
break (YouTube changed how captions are served in 2025), demand a sign-up, ship
your data to a server, or paywall the basics. People who learn, research, write,
or create from video deserve their transcript in seconds — readable, searchable,
exportable, and private.

## 2. Why this solution

A **side panel** sits next to the video, so the transcript is a companion, not a
detour. It fetches reliably by using YouTube's own InnerTube API with a non-web
client (the part that still works after the PoToken change), and it does
everything **locally** — no backend to trust. AI is there when you want it, but
it's strictly opt-in and uses *your* key.

## 3. Design principles

- **Reliability first.** If it can't fetch the transcript, nothing else matters;
  the fetch path is layered (ANDROID → IOS → MWEB → WEB) with format auto-detect.
- **Private by default.** No servers, no analytics, no accounts. The only network
  calls are to YouTube and (opt-in) your Gemini key.
- **Local, dependency-free, auditable.** Vanilla JS, no build step, a pure tested
  core. Easy to read, fork and trust.
- **Do the obvious thing.** Click a line → jump there. Search → highlight + next.
  Export → the format you actually need.
- **Quiet, not flashy.** A clean, themable UI that gets out of the way.

## 4. Target audience & use cases

- **Students / researchers** — read, search, quote lectures and talks.
- **Writers / journalists** — pull quotes and clean paragraphs.
- **Creators / editors** — generate `.srt`/`.vtt` subtitle files.
- **Language learners** — translate and read along with the video.
- **Anyone** — grab a quick, searchable copy of what was said.

## 5. Real-world workflow fit

Open the video → open the panel → Get transcript → search/seek to the bit you
care about → copy a quote or export an `.srt` → (optionally) AI-summarize for the
gist. It complements a note-taking flow (Markdown export with clickable
timestamps) and a captioning flow (SRT/VTT) without leaving YouTube.

## 6. Trade-offs & constraints

- **InnerTube dependency.** YouTube's internal API is undocumented; if Google
  changes it, the fetch layer may need updating. The layered clients + the legacy
  fallback hedge against this.
- **AI is bring-your-own-key.** Keeps the tool free and private, at the cost of a
  one-time key setup for those who want summaries.
- **Side panel needs Chrome/Edge 114+.** A deliberate choice for the cleanest UX
  over supporting very old browsers.
- **Auto-caption quality.** Paragraph mode and Hide-SFX improve readability, but
  the source text is only as good as YouTube's captions.
