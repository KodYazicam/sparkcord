# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Issue templates, pull request template, roadmap, and code of conduct.
- Coverage gate (55% statements) and coverage artifact in CI.
- Tests for slash/prefix option mapping and package version fallback.

### Security

- Upgraded `vitest` and `@vitest/coverage-v8` to 5.1.0, clearing the dev-only
  dependency advisories.

## [1.0.0] - 2026-09-26

### Added

- File-based command and event loaders.
- Slash and prefix command registration.
- Cooldowns, owner-only commands, guild-only commands, and permission helpers.
- Button, select, modal, and autocomplete routing by `customId`.
- `sparkcord validate` for token-free command-directory linting.
- `sparkcord init` starter bot scaffold.
- Tests that never open a Discord gateway or read a token.
