<p align="center">
  <strong>Dosya tabanlı Discord.js v14 çatısı.</strong><br/>
  <code>commands/</code> klasörüne bir dosya bırakın. Slash, prefix, bekleme süreleri, izinler ve seçenek ayrıştırma hazır gelir.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/discord.js-v14-5865F2?style=flat-square&logo=discord&logoColor=white" alt="discord.js">
  <img src="https://img.shields.io/badge/node-%3E%3D20-339933?style=flat-square" alt="Node">
  <img src="https://img.shields.io/badge/license-Apache--2.0-2ea44f?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/author-KodYazicam-0D0D0D?style=flat-square" alt="Author">
</p>

> Bu sayfa İngilizce [README](./README.md) dosyasının çevirisidir. Kurulum, CLI ve API
> ayrıntılarında her zaman İngilizce sürüm geçerlidir; bu çeviri geride kalabilir.

<p align="center">
  <strong>README dosyasını kendi dilinizde okuyun</strong><br/>
  <a href="./README.md">English</a> ·
  <a href="./README.tr.md">Türkçe</a> ·
  <a href="./README.de.md">Deutsch</a>
</p>

---

sparkcord, Discord.js üzerine ince bir katmandır. Siz komut modülleri yazarsınız; çatı bunları yükler, slash komutlarını kaydeder ve hem `/ping` hem `!ping` çağrısını yönlendirir. Testler **Discord token'ı olmadan** çalışır.

## Gereksinimler

| Bileşen | Sürüm |
| --- | --- |
| sparkcord **kitaplığı** | Node **20+**, derlenmiş `.js` komut dosyaları veya TypeScript strip |
| `sparkcord init` ile gelen başlangıç | Node **22.6+** (`--experimental-strip-types` + `--env-file`) |
| discord.js | **v14** (zorunlu peer bağımlılık) |

Bot token'ını [Discord Developer Portal](https://discord.com/developers/applications) üzerinden alın. Prefix komutları kullanacaksanız **Message Content Intent** ayarını açın. `discord.js` **zorunlu** bir peer bağımlılıktır.

## Bot iskeleti oluşturma (önerilen)

Paket npm'de yayınlanmıyor. Bu depoyu klonlayın, sonra:

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

`init`, `--force` vermediğiniz sürece var olan bir `package.json` dosyasının üzerine yazmayı reddeder. Oluşan bot `src/index.ts` içinde `Client` + `createSparkBot` + `attach` + `login` kurar; `.env` dosyasını `src/load-env.ts` yükler, Node 22.6+ üzerinde `dotenv` veya `tsx` gerekmez.

Davet bağlantısı (`CLIENT_ID` yerine uygulama kimliğinizi yazın). **Administrator (`permissions=8`) kullanmayın.**

```text
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot%20applications.commands&permissions=274877975552
```

Bu bit alanı View Channel + Send Messages + Embed Links + Read Message History + Use Application Commands izinleridir. Slash komutları küresel kapsamda bir saate kadar gecikebildiği için **geliştirme sunucusu** (`DEV_GUILD_ID`) ile başlayın.

## Kitaplık olarak kurulum

```bash
# in your bot, after cloning sparkcord next to it:
npm install discord.js
npm install ../sparkcord

# or install straight from git:
npm install github:KodYazicam/sparkcord
```

`dist/` sürüm kontrolünde tutulmaz; bu yüzden bir git ref'inden veya yerel yoldan kurulumlar paketin `prepare` betiğini çalıştırır: npm geliştirme bağımlılıklarını (`typescript`) kurar ve botunuz başlamadan önce `dist/` klasörünü derler. Bu, derleme çıktısını git dışında tutar; karşılığında kurulum başına birkaç saniye derleme süresi ekler. npm'de yayınlanan bir sürüm önceden derlenmiş tarball taşıyacaktır.

Tam `createSparkBot({ client, commandsDir, eventsDir, prefix, owners, devGuildId })` örneği ve `commandsDir` yol kuralları İngilizce [README](./README.md#install-as-a-library) dosyasındadır. `commandsDir` / `eventsDir` **dosya sistemi yolları** olmalıdır, `file://` URL'si değil.

## Komut modülleri

Her dosyada tek bir varsayılan dışa aktarım bulunur. Alt klasörler yüklenir. Yanında duran testler ve tip bildirimleri atlanır: `*.test.js`, `*.test.mjs`, `*.test.cjs`, `*.test.ts`, karşılık gelen `*.spec.*` biçimleri ve `*.d.ts`. `latest.js` veya `contest.js` adlı bir komut yine yüklenir.

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

Seçenek `type` değerleri: `string` (varsayılan), `integer`, `boolean`, `user`, `channel`, `role`, `number`. `string`, `integer` veya `number` seçeneğinde `autocomplete: true` ayarlayarak Discord'un otomatik tamamlama listesini açabilirsiniz; kayıtlı `onAutocomplete` işleyicisi odaklanan seçeneği alır. Discord bu bayrağı `choices` ile birlikte reddeder. `kind: "slash"` komutu `!name` çağrısına **yanıt vermez**; `kind: "prefix"` slash komutu olarak kaydedilmez.

Prefix argümanları `command.options` üzerine **sırayla** eşlenir (`!ban 123 spam` → `{ user: "123", reason: "spam" }`). Tamsayı ve boolean değerler dönüştürülür; artan sözcükler `ctx.args` içinde kalır. Slash tarafında `ctx.options` alanı `interaction.options.data` üzerinden doldurulur.

## İzinler ve bekleme süreleri

Şu sırayla denetlenir:

1. `ownerOnly` ile `options.owners`
2. `guildOnly`
3. `permissions` (yalnızca sunucuda; `BanMembers`, `ManageMessages` gibi adlar)
4. bekleme süresi (`command:userId`)

`Administrator` izni `permissions` listesindeki her girdiyi karşılar; Discord'un kendi kuralı da budur. discord.js sunucu sahibi için tam olarak bu bayrağı bildirdiğinden sahipler ve tam yetkili roller moderasyon komutlarında reddedilmez. `Administrator` `ownerOnly` şartını **karşılamaz** ve yalnızca sunucuda çalışan bir komutu DM'de kullanılabilir yapmaz; aynı denetimi kendi kodunuzda yapmak için `isAdministrator` fonksiyonunu `sparkcord` paketinden içe aktarın.

`permissions` bildiren komutlarda `toSlashPayload` ayrıca `default_member_permissions` alanını bu Discord bayraklarının OR'u olarak gönderir. Discord komutu yetkisi olmayan üyelerden gizler; `Administrator` görür. Bilinmeyen bir izin adı payload oluşturulurken hata verir ve `sparkcord validate` tarafından bildirilir.

Reddedilen çağrılar `run` fonksiyonunu **çalıştırmaz**. `denyReplies: true` (varsayılan) iken sparkcord slash için ephemeral, prefix için kanal yanıtı gönderir. Depo 500 anahtarı geçtiğinde süresi dolmuş bekleme kayıtlarını temizler.

## Intent'ler

| Özellik | Intent |
| --- | --- |
| Slash komutları | `Guilds` |
| Prefix komutları | `Guilds` + `GuildMessages` + **Message Content** (ayrıcalıklı) |
| Üye önbelleği | `GuildMembers` (sparkcord'un kendisi için gerekli değil) |

Prefix komutları sessizce çalışmıyorsa portaldaki Message Content ayarı kapalıdır.

## Sorun giderme

| Belirti | Çözüm |
| --- | --- |
| `Missing DISCORD_TOKEN` | `.env.example` dosyasını `.env` olarak kopyalayın. Node 22.6+ üzerinde `npm start` dosyayı yükler. |
| Slash komutları görünmüyor | `DEV_GUILD_ID` ayarlayın. Küresel komutlar için bekleyin veya `applications.commands` kapsamıyla yeniden davet edin. |
| Diğer komutlar kayboldu | `commands.set` listeyi değiştirdi. `autoRegister: false` kullanın veya ayrı bir bot açın. |
| Prefix yanıt vermiyor | Message Content Intent'i açın; `GatewayIntentBits.MessageContent` ekleyin. |
| `Duplicate command` | İki dosya aynı `name` değerini dışa aktarıyor. |
| Node 20'de başlangıç çalışmıyor | Node 22.6+ kullanın veya `tsx` ekleyin. Kitaplık `.js` dosyalarıyla Node 20'yi desteklemeye devam eder. |
| `Cannot import TypeScript command` | Derleyin veya `--experimental-strip-types` ile çalıştırın. |
| `refusing to overwrite` | Dizinde zaten `package.json` var. `--force` kullanın veya başka bir dizin seçin. |
| Komut başarısız, günlük boş | Başarısız komutlar `[sparkcord] command <name> failed (<kind>):` satırı yazar; bu satır yoksa sparkcord'u güncelleyin. |

## Katkı, güvenlik ve lisans

Katkı kuralları için [CONTRIBUTING.md](./CONTRIBUTING.md), güvenlik açığı bildirimi için [SECURITY.md](./SECURITY.md) dosyasına bakın.

Apache-2.0. Ticari kullanım, değişiklik ve dağıtım [LICENSE](./LICENSE) kapsamında serbesttir; dağıtılan kopyalarda lisans metnini koruyun.

<p align="center"><sub><a href="https://github.com/KodYazicam">KodYazicam</a> tarafından geliştirildi</sub></p>
