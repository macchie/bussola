# Registro

Raccoglie errori, arresti e riavvii dai log di sistema e li ordina per app, unendo i messaggi che si ripetono.
Fa parte della suite con Anelli, Correnti, Battiti, Scorte, Sentinelle e Radici. App desktop per macOS, Windows
e Linux costruita con Neutralinojs.

## Installazione

| Sistema | Pacchetto | Note |
| --- | --- | --- |
| macOS 10.15+ | `Registro-macos.zip` | Estrai in Download, poi `bash ~/Downloads/Registro-macos/Installa\ Registro.command` |
| Windows 10/11 x64 | `Registro-windows-x64.zip` | Serve WebView2, già presente su Windows 11 |
| Linux x64 / arm64 | `Registro-linux-*.zip` | Serve WebKitGTK: `sudo apt install libwebkit2gtk-4.1-0` |

Tieni `resources.neu` accanto all'eseguibile.

## Come si usa

- Le schede dividono gli eventi in Errori, Avvisi, Arresti e riavvii.
- Clic su un'app per vedere i suoi messaggi, dal più frequente. Doppio clic su un messaggio per il testo completo.
- Il grafico mostra errori e arresti sopra, avvisi sotto, sulla stessa scala.

I messaggi uguali a meno di numeri, indirizzi e percorsi contano come uno solo: un errore ripetuto 500 volte
occupa una riga, con il suo conteggio.

## Come funziona

Ogni minuto l'app legge ciò che è successo dall'ultima lettura: `journalctl` su Linux, `log show`, i rapporti in
`DiagnosticReports` e `kern.boottime` su macOS, `Get-WinEvent` su Windows. I log li conserva il sistema, quindi
alla riapertura recupera anche quanto accaduto mentre era chiusa. Al primo avvio guarda indietro di 24 ore
(3 ore su macOS, dove la lettura è lenta).

## Limiti

- I log contengono spesso nomi di file e account. Registro ne tiene un esempio per messaggio su questo computer,
  per sette giorni, e non invia nulla. Diagnostica permette di cancellare lo storico.
- macOS distingue solo errori e guasti: la scheda Avvisi resta vuota.
- macOS produce molti errori innocui: tanti errori non significano un problema.
- Su Linux senza il gruppo `systemd-journal` si vede solo parte del registro; l'app lo segnala.
- Su macOS i riavvii compaiono solo da quando l'app è in uso.
- Una lettura è limitata a 20.000 eventi.

## Sviluppo

```bash
npm install
npm run setup
npm test
npm run build    # crea i pacchetti in dist/pacchetti
```
