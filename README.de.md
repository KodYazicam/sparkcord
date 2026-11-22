<p align="center">
  <strong>Dateibasiertes Discord.js-v14-Framework.</strong><br/>
  Legen Sie eine Datei in <code>commands/</code> ab. Slash, Prefix, Cooldowns, Berechtigungen und Options-Parsing sind bereits enthalten.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/discord.js-v14-5865F2?style=flat-square&logo=discord&logoColor=white" alt="discord.js">
  <img src="https://img.shields.io/badge/node-%3E%3D20-339933?style=flat-square" alt="Node">
  <img src="https://img.shields.io/badge/license-Apache--2.0-2ea44f?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/author-KodYazicam-0D0D0D?style=flat-square" alt="Author">
</p>

> Diese Seite ist eine Übersetzung der englischen [README](./README.md). Bei
> Abweichungen gilt immer die englische Fassung; diese Übersetzung kann hinterherhinken.

<p align="center">
  <strong>README in Ihrer Sprache lesen</strong><br/>
  <a href="./README.md">English</a> ·
  <a href="./README.tr.md">Türkçe</a> ·
  <a href="./README.de.md">Deutsch</a>
</p>

---

sparkcord ist eine dünne Schicht über Discord.js. Sie schreiben Command-Module; das Framework lädt sie, registriert Slash-Befehle und leitet sowohl `/ping` als auch `!ping` weiter. Tests laufen **ohne Discord-Token**.

## Voraussetzungen

| Bestandteil | Version |
| --- | --- |
| sparkcord **Bibliothek** | Node **20+**, kompilierte `.js`-Command-Dateien oder Node mit TypeScript-Strip |
| Starter aus `sparkcord init` | Node **22.6+** (`--experimental-strip-types`) |
| discord.js | **v14** (erforderliche Peer-Dependency) |

Das Bot-Token erhalten Sie im [Discord Developer Portal](https://discord.com/developers/applications). Aktivieren Sie **Message Content Intent**, wenn Sie Prefix-Befehle nutzen. `discord.js` ist eine **erforderliche** Peer-Dependency.

## Bot-Gerüst erzeugen (empfohlen)

Das Paket ist nicht auf npm verfügbar. Klonen Sie dieses Repo, dann:

```bash
git clone https://github.com/KodYazicam/sparkcord.git
cd sparkcord
npm ci
npm run build
node dist/cli.js init ../my-bot
cd ../my-bot
# point package.json at the clone, then:
cp .env.example .env
# put DISCORD_TOKEN=... in .env
npm install
npm start
```

`init` überschreibt eine vorhandene `package.json` nur mit `--force`. Der erzeugte Bot verbindet in `src/index.ts` `Client` + `createSparkBot` + `attach` + `login`; `.env` lädt `src/load-env.ts`, unter Node 22.6+ sind `dotenv` und `tsx` nicht nötig.

Einladungslink (`CLIENT_ID` durch Ihre Anwendungs-ID ersetzen). **Verwenden Sie nicht Administrator (`permissions=8`).**

```text
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot%20applications.commands&permissions=274877975552
```

Dieses Bitfeld umfasst View Channel + Send Messages + Embed Links + Read Message History + Use Application Commands. Beginnen Sie mit einer **Dev-Guild** (`DEV_GUILD_ID`), damit Slash-Befehle in Sekunden statt global erst nach bis zu einer Stunde aktualisiert werden.

## Als Bibliothek installieren

```bash
# in your bot, after cloning sparkcord next to it:
npm install discord.js
npm install ../sparkcord

# or install straight from git:
npm install github:KodYazicam/sparkcord
```

`dist/` ist in Git ignoriert. Installationen aus einem Git-Ref oder einem lokalen Pfad führen daher das `prepare`-Skript des Pakets aus: npm installiert die Dev-Abhängigkeit (`typescript`) und kompiliert `dist/`, bevor Ihr Bot startet. Das hält Build-Ausgaben aus Git und kostet pro Installation einige Sekunden Build-Zeit. Eine veröffentlichte npm-Version wird stattdessen ein vorgebautes Tarball ausliefern.

Das vollständige `createSparkBot({ client, commandsDir, eventsDir, prefix, owners, devGuildId })`-Beispiel und die Pfadregeln stehen in der englischen [README](./README.md#install-as-a-library). `commandsDir` / `eventsDir` müssen **Dateisystempfade** sein, keine `file://`-URLs.

## Command-Module

Eine Datei exportiert genau einen Default. Unterordner werden geladen. Danebenliegende Tests und Deklarationen werden übersprungen: `*.test.js`, `*.test.mjs`, `*.test.cjs`, `*.test.ts`, die entsprechenden `*.spec.*`-Formen und `*.d.ts`. Ein Befehl namens `latest.js` oder `contest.js` wird weiterhin geladen.

```ts
import type { CommandDefinition } from "sparkcord";

const ping: CommandDefinition = {
  name: "ping",
  description: "Pong with latency.",
  kind: "both",          // "slash" | "prefix" | "both" (default both)
  cooldown: 3,           // seconds per user
  guildOnly: false,
  ownerOnly: false,
  permissions: [],       // Discord permission names, e.g. "BanMembers"
  aliases: ["p"],        // prefix only
  options: [
    { name: "user", description: "Target", type: "user", required: true },
    { name: "reason", description: "Why", type: "string" },
  ],
  async run(ctx) {
    const who = ctx.options.user;
    return ctx.reply(`Pong${who ? ` ${who}` : ""}`);
  },
};

export default ping;
```

Werte für den Options-`type`: `string` (Standard), `integer`, `boolean`, `user`, `channel`, `role`, `number`. Mit `autocomplete: true` auf einem `string`-, `integer`- oder `number`-Feld öffnet Discord die Autovervollständigung; der registrierte `onAutocomplete`-Handler erhält das fokussierte Feld. Zusammen mit `choices` lehnt Discord das Flag ab. `kind: "slash"` antwortet **nicht** auf `!name`; `kind: "prefix"` wird nicht als Slash-Befehl registriert.

Prefix-Argumente werden **der Reihe nach** auf `command.options` abgebildet (`!ban 123 spam` → `{ user: "123", reason: "spam" }`). Integer und Booleans werden umgewandelt; überschüssige Wörter bleiben in `ctx.args`. Bei Slash wird `ctx.options` aus `interaction.options.data` gefüllt.

## Berechtigungen und Cooldowns

Prüfreihenfolge:

1. `ownerOnly` gegen `options.owners`
2. `guildOnly`
3. `permissions` (nur in Guilds; Namen wie `BanMembers`, `ManageMessages`)
4. Cooldown (`command:userId`)

`Administrator` erfüllt jeden Eintrag in `permissions` — das ist Discords eigene Regel. discord.js meldet für den Serverinhaber genau dieses Flag, daher werden Inhaber und vollberechtigte Rollen bei Moderationsbefehlen nicht abgelehnt. `Administrator` erfüllt `ownerOnly` **nicht** und macht einen Guild-only-Befehl nicht in DMs nutzbar; importiere `isAdministrator` aus `sparkcord`, wenn du dieselbe Prüfung in eigenem Code brauchst.

Bei Commands mit `permissions` setzt `toSlashPayload` zusätzlich `default_member_permissions` auf die OR-Verknüpfung dieser Discord-Flags. Discord blendet den Befehl dann für Mitglieder ohne die Berechtigung aus; `Administrator` sieht ihn weiterhin. Ein unbekannter Berechtigungsname löst beim Erzeugen des Payloads einen Fehler aus und wird von `sparkcord validate` gemeldet.

Abgelehnte Aufrufe führen `run` **nicht** aus. Mit `denyReplies: true` (Standard) sendet sparkcord eine ephemere Antwort für Slash und eine Kanalantwort für Prefix. Der Store entfernt abgelaufene Cooldowns, sobald er 500 Schlüssel überschreitet.

## Intents

| Funktion | Intent |
| --- | --- |
| Slash-Befehle | `Guilds` |
| Prefix-Befehle | `Guilds` + `GuildMessages` + **Message Content** (privilegiert) |
| Member-Cache | `GuildMembers` (für sparkcord selbst nicht nötig) |

Wenn Prefix-Befehle stillschweigend nichts tun, ist Message Content im Portal deaktiviert.

## Fehlerbehebung

| Symptom | Lösung |
| --- | --- |
| `Missing DISCORD_TOKEN` | `.env.example` nach `.env` kopieren. Unter Node 22.6+ lädt `npm start` die Datei. |
| Slash-Befehle fehlen | `DEV_GUILD_ID` setzen. Auf globale Registrierung warten oder mit dem Scope `applications.commands` erneut einladen. |
| Andere Befehle verschwunden | `commands.set` hat die Liste ersetzt. `autoRegister: false` nutzen oder einen eigenen Bot verwenden. |
| Prefix wird ignoriert | Message Content Intent aktivieren; `GatewayIntentBits.MessageContent` einbinden. |
| `Duplicate command` | Zwei Dateien exportieren denselben `name`. |
| Starter scheitert unter Node 20 | Node 22.6+ verwenden oder `tsx` ergänzen. Die Bibliothek unterstützt Node 20 weiterhin mit `.js`-Dateien. |
| `Cannot import TypeScript command` | Kompilieren oder mit `--experimental-strip-types` starten. |
| `refusing to overwrite` | Das Verzeichnis enthält bereits eine `package.json`. `--force` nutzen oder ein anderes Verzeichnis wählen. |
| Befehl schlägt fehl, Log leer | Fehlgeschlagene Befehle protokollieren `[sparkcord] command <name> failed (<kind>):`; fehlt die Zeile, sparkcord aktualisieren. |

## Beitragen, Sicherheit und Lizenz

Beitragsregeln stehen in [CONTRIBUTING.md](./CONTRIBUTING.md), Hinweise zu Sicherheitslücken in [SECURITY.md](./SECURITY.md).

Apache-2.0. Kommerzielle Nutzung, Änderung und Weitergabe sind unter der [LICENSE](./LICENSE) erlaubt; der Lizenztext muss bei verteilten Kopien erhalten bleiben.

<p align="center"><sub>Entwickelt von <a href="https://github.com/KodYazicam">KodYazicam</a></sub></p>
