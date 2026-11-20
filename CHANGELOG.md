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

- `sparkcord validate` now rejects three more option specs the Discord API
  refuses with `50035 Invalid Form Body`: duplicate option names within one
  command, a non-boolean `required` flag, and a choice `value` whose type does
  not match the option (a string value on an `integer`/`number` option, a
  number on a `string` option, or a fractional/out-of-range value on an
  `integer` option). Previously `validate` exited `0` and slash registration
  failed at startup, dropping every command from the picker.
- A command whose `run()` throws is now logged once as
  `[sparkcord] command <name> failed (<kind>): …` before the generic
  "Command failed. Check the bot logs." reply. Previously the error was
  swallowed, so the logs the reply points at contained nothing. Options,
  arguments, and message content are never written to the line.
- A command name that matches an earlier command's alias is now rejected with
  `Duplicate command: <name> (already an alias of <owner>)` instead of silently
  taking over the alias. Registration validates the name and every alias before
  mutating the registry, so a rejected module leaves no half-registered command,
  and `sparkcord validate` reports these collisions.
- Channel, user, role and mentionable select menus now reach
  `bot.interactions.onComponent` handlers. Only `isStringSelectMenu()` was
  recognised, so the other four pickers were classified as `unknown`, skipped
  without an acknowledgement and shown as "This interaction failed".
- A command that calls `ctx.raw.deferReply()` and then `ctx.reply()` now
  completes the deferred reply with `editReply()` instead of posting a second
  message. The "Bot is thinking…" placeholder no longer lingers next to the
  real answer. `followUp()` is used only after a reply was already sent.
- Colocated test modules no longer abort startup: the loader skips
  `*.test.js|mjs|cjs|ts` and `*.spec.js|mjs|cjs|ts` alongside `*.d.ts`, so a
  JavaScript bot with tests next to its commands boots again.
- An error thrown by a button, select menu, modal or autocomplete handler no
  longer escapes as an unhandled rejection from the `interactionCreate`
  listener; it is logged with the interaction kind and id and returned as
  `{ ok: false, reason }`. The `interactionCreate` and `messageCreate`
  listeners also catch unexpected failures instead of terminating the process.
- An error thrown or rejected by a file-based event handler no longer escapes
  `client.on`/`client.once` as an unhandled rejection. `SparkBot.attach` logs
  `[sparkcord] event <name> failed: …` and the listener returns normally, so a
  single broken module in `eventsDir` cannot terminate the process.
- Turkish and German READMEs now document the `github:` install path and the
  `prepare` build, keeping the translated library snippet in sync with English.
- Commands with `permissions` no longer reject guild owners and roles that hold
  Discord's `Administrator` flag; the flag now satisfies every required
  permission, matching Discord's own semantics.
- Slash registration sends `default_member_permissions` derived from
  `command.permissions`, so gated commands are hidden from members who cannot
  use them. Unknown permission names now fail payload build and
  `sparkcord validate` instead of registering the command as public.
- Runtime permission checks resolve names case-insensitively and by Discord
  bit, so `banmembers` matches `BanMembers` and aliases such as
  `ManageEmojisAndStickers` match `ManageGuildExpressions` instead of denying
  the member who holds the permission.
- `sparkcord validate` now enforces Discord's command-option limits, so a
  directory it accepts can no longer fail `commands.set()` with
  `50035 Invalid Form Body`: required options after an optional one, more than
  25 options, more than 25 choices, choices on a type that cannot carry them,
  and option descriptions or choice names/values longer than 100 characters
  are all reported.

## [1.0.0] - 2026-09-26

### Added

- File-based command and event loaders.
- Slash and prefix command registration.
- Cooldowns, owner-only commands, guild-only commands, and permission helpers.
- Button, select, modal, and autocomplete routing by `customId`.
- `sparkcord validate` for token-free command-directory linting.
- `sparkcord init` starter bot scaffold.
- Tests that never open a Discord gateway or read a token.
