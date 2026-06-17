# Security Policy

**Transcript Studio for YouTube** is a Manifest V3 browser extension that runs
entirely in your browser. It has no backend, no accounts, and collects no data.

## Supported Versions

| Version | Supported |
| --- | :---: |
| 1.x (latest) | :white_check_mark: |
| < 1.x | :x: |

## Reporting a Vulnerability

Please report security issues **privately** — do not open a public issue for an
unfixed vulnerability.

- **Preferred:** [GitHub private security advisory](https://github.com/krishnakanthb13/yt-transcript-studio/security/advisories/new)
  (Security → *Report a vulnerability*).
- **Email:** partythoninc@gmail.com — put `SECURITY` in the subject.

Please include the affected version, steps to reproduce or a proof of concept,
and the impact you believe it has.

**What to expect:** acknowledgement within **5 business days**; a status update
(accepted / declined) within **14 days**; accepted issues fixed on `main` as soon
as practical, with credit if you'd like. As a free, single-maintainer project
there is **no bug bounty**, but genuine reports are appreciated. 🙏

## Scope & notes

- The extension runs locally. Any **Google Gemini API key** you add for the
  optional AI features is stored locally (`chrome.storage`) and sent only to
  Google's Gemini API, and only when you trigger a summary.
- The only network calls are to YouTube (to read captions) and — if you opt in —
  to Google's Gemini API with your own key.
- Out of scope: vulnerabilities in YouTube, Google, or the browser itself;
  social engineering; issues requiring a compromised device.
