# Bussola

Installa, apre, aggiorna e disinstalla le app della suite: Anelli, Correnti, Battiti, Scorte, Sentinelle,
Radici e Registro. App desktop per macOS, Windows e Linux costruita con Neutralinojs.

## Installazione

| Sistema | Pacchetto | Note |
| --- | --- | --- |
| macOS 10.15+ | `Bussola-macos.zip` | Estrai in Download, poi `bash ~/Downloads/Bussola-macos/Installa\ Bussola.command` |
| Windows 10/11 x64 | `Bussola-windows-x64.zip` | Serve WebView2, già presente su Windows 11 |
| Linux x64 / arm64 | `Bussola-linux-*.zip` | Serve WebKitGTK: `sudo apt install libwebkit2gtk-4.1-0` |

Bussola non si aggiorna da sola: quando esce una versione nuova mostra il link alla release.

## Dove installa

| Sistema | Cartella |
| --- | --- |
| macOS | `/Applications`, oppure `~/Applications` se non è scrivibile |
| Windows | `%LOCALAPPDATA%\Programs\Bussola`, con collegamento nel menu Start |
| Linux | `~/.local/share/bussola/apps`, con voce di menu |

Non servono privilegi di amministratore. Su macOS ogni app viene firmata localmente con `codesign`, quindi
Anelli va riautorizzata in Accesso completo al disco a ogni aggiornamento.

## Pubblicare una versione

Il repository `macchie/bussola` deve essere **pubblico**: Bussola scarica senza autenticazione.

```bash
# la prima volta
gh repo create macchie/bussola --public

# in ogni app modificata
npm run build

# in bussola
npm run build
node scripts/pubblica.mjs suite-2026.11.4
gh release create suite-2026.11.4 dist/release/* --repo macchie/bussola --title "Suite 2026.11.4" --latest
```

Lo script raccoglie i pacchetti dalle cartelle accanto a questa e scrive `catalogo.json` con versioni, indirizzi e
impronte. Bussola legge sempre il catalogo dell'ultima release.

## Sicurezza

- L'elenco delle app è fissato nel codice: il catalogo indica solo versioni e pacchetti.
- Sono accettati solo download HTTPS dalle release di `macchie/bussola`.
- Ogni pacchetto è verificato con SHA-256 prima dell'estrazione, e ne viene copiato solo il contenuto previsto.
- Disinstallare tocca solo percorsi noti. I dati di Anelli e Radici restano sempre: contengono cestino e modifiche.

Catalogo e pacchetti vengono dalla stessa release, quindi l'impronta protegge da file corrotti o sostituiti lungo
la strada, non da chi controlla il tuo account GitHub: proteggilo con l'autenticazione a due fattori.

## Sviluppo

```bash
npm install
npm run setup
npm test
```
