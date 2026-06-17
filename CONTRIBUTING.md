# Contributing

Thanks for your interest in **Transcript Studio for YouTube**! Issues and pull
requests are welcome.

## Development

It's a vanilla Manifest V3 extension — no build step.

1. Clone the repo.
2. `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
   select the repo folder (the one with `manifest.json`).
3. Edit files, then click the **↻ reload** icon on the extension card and reopen
   the side panel.

### Tests

The caption core (`lib/captions.js`) is pure (no DOM, no `chrome.*`) and is
unit-tested under Node:

```bash
node test/captions.test.js     # must stay green
```

Please add a test when you change parsing or formatting logic. CI runs this on
every push and pull request.

## Guidelines

- Match the existing style (plain ES2020, 2-space indent, no framework).
- Keep the extension **local-only and private** — no analytics, no remote code,
  no new network calls beyond YouTube and (opt-in) the user's Gemini key.
- Keep permissions minimal; justify any new one in `PUBLISH.md`.
- For user-facing changes, update `README.md` and add a `CHANGELOG.md` entry.

## Reporting bugs / security

- Bugs / features: open a GitHub issue with steps to reproduce.
- Security: see [SECURITY.md](SECURITY.md) (please report privately).

By contributing you agree your work is licensed under the [GPLv3 License](LICENSE).
