# Radici

Mostra cosa parte da solo sul tuo computer: elementi all'accesso, servizi e attività pianificate, con la mappa
ad anelli della suite (Anelli, Correnti, Battiti, Scorte, Sentinelle). App desktop per macOS, Windows e Linux
costruita con Neutralinojs.

## Installazione

| Sistema | Pacchetto | Note |
| --- | --- | --- |
| macOS 10.15+ | `Radici-macos.zip` | Estrai in Download, poi `bash ~/Downloads/Radici-macos/Installa\ Radici.command` |
| Windows 10/11 x64 | `Radici-windows-x64.zip` | Serve WebView2, già presente su Windows 11 |
| Linux x64 / arm64 | `Radici-linux-*.zip` | Serve WebKitGTK: `sudo apt install libwebkit2gtk-4.1-0` |

Tieni `resources.neu` accanto all'eseguibile.

## Come si usa

- Le schede dividono gli elementi in Accesso, Servizi, Pianificati e Disattivati.
- Il badge **Nuovo** segna ciò che è comparso nelle ultime 24 ore. La prima lettura vale come punto di partenza.
- **Disattiva all'avvio** impedisce a un elemento di partire dal prossimo accesso. Se è già aperto resta aperto.
- **Riattiva**, dalla scheda Disattivati, riporta tutto com'era.

## Cosa può modificare

Radici non cancella nulla e chiede sempre conferma. Dopo ogni modifica rilegge lo stato dal sistema e segnala
se non è cambiato.

| Sistema | Modificabile | Come | Sola lettura |
| --- | --- | --- | --- |
| macOS | Agenti in `~/Library/LaunchAgents` e `/Library/LaunchAgents` | `launchctl disable` | Daemon, componenti Apple, cron |
| Linux | Autostart e unità systemd utente | `Hidden=true`, `systemctl --user disable` | Servizi di sistema, timer, cron, sessione grafica |
| Windows | Valori `Run` dell'utente | `StartupApproved`, come Gestione attività | Elementi per tutti gli utenti, servizi, attività, cartella Esecuzione automatica |

## Limiti

- Alcune app ricreano da sole i propri elementi di avvio: disattivare non lo impedisce.
- Su macOS gli elementi di Impostazioni > Generali > Elementi login non sono elencati, e i componenti in
  `/System/Library` sono esclusi.
- Lo storico resta sul computer per sette giorni e si aggiorna solo mentre l'app è aperta.

## Sviluppo

```bash
npm install
npm run setup
npm test
npm run build    # crea i pacchetti in dist/pacchetti
```
