# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Turkish (`README.tr.md`) and German (`README.de.md`) READMEs with a language
  switcher on every page.
- Issue templates, pull request template, roadmap, and code of conduct.
- Coverage gate (55% statements) and coverage artifact in CI.
- Tests for slash/prefix option mapping and package version fallback.
- `isAdministrator` exported from the package root for downstream permission checks.

### Security

- Upgraded `vitest` and `@vitest/coverage-v8` to 5.1.0, clearing the dev-only
  dependency advisories.

### Fixed

- Turkish and German READMEs now document the `github:` install path and the
  `prepare` build, keeping the translated library snippet in sync with English.
- Commands with `permissions` no longer reject guild owners and roles that hold
  Discord's `Administrator` flag; the flag now satisfies every required
  permission, matching Discord's own semantics.
- Slash registration sends `default_member_permissions` derived from
  `command.permissions`, so gated commands are hidden from members who cannot
  use them. Unknown permission names now fail payload build and
  `sparkcord validate` instead of registering the command as public.

## [1.0.0] - 2026-09-26

### Added

- File-based command and event loaders.
- Slash and prefix command registration.
- Cooldowns, owner-only commands, guild-only commands, and permission helpers.
- Button, select, modal, and autocomplete routing by `customId`.
- `sparkcord validate` for token-free command-directory linting.
- `sparkcord init` starter bot scaffold.
- Tests that never open a Discord gateway or read a token.
