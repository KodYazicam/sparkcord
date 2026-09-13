# Contributing to sparkcord

```bash
npm ci
npm test
npm run typecheck
```

- Tests must not open a Discord gateway or read a token.
- `discord.js` stays a required peer, not a runtime import of the library.
- Denied commands should reply unless `denyReplies: false`.
- `init` must not overwrite without `--force`.
- Keep KYAL-1.0 attribution.
