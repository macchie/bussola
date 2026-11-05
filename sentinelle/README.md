# Sentinelle

Mostra cosa è in ascolto sul tuo computer e con chi sta parlando, con la mappa ad anelli della suite
(Anelli, Correnti, Battiti, Scorte). App desktop per macOS, Windows e Linux costruita con Neutralinojs.

Sentinelle osserva solo questo computer: non analizza altri dispositivi e non modifica il firewall.

## Installazione

| Sistema | Pacchetto | Note |
| --- | --- | --- |
| macOS 10.15+ | `Sentinelle-macos.zip` | Estrai in Download, poi `bash ~/Downloads/Sentinelle-macos/Installa\ Sentinelle.command` |
| Windows 10/11 x64 | `Sentinelle-windows-x64.zip` | Serve WebView2, già presente su Windows 11 |
| Linux x64 / arm64 | `Sentinelle-linux-*.zip` | Serve WebKitGTK: `sudo apt install libwebkit2gtk-4.1-0` |

Tieni `resources.neu` accanto all'eseguibile.

## Come si usa

- **Esposte:** porte in ascolto su un indirizzo raggiungibile dalla rete.
- **Locali:** porte raggiungibili solo da questo computer.
- **Connessioni:** collegamenti attivi verso altri server.

Il badge **Nuova** segna ciò che è comparso nelle ultime 24 ore. La prima esecuzione vale come punto di
partenza, quindi non segnala nulla. **Accesso remoto** segna SSH, Telnet, Desktop remoto e VNC esposti.

Esposta non vuol dire raggiungibile da Internet: il firewall del computer o il router possono bloccarla.
Serve come elenco di cose da controllare, non come diagnosi di un problema.

## Come funziona

Ogni 5 secondi l'app legge `/proc/net` su Linux, `nettop` su macOS e `Get-NetTCPConnection` con
`Get-NetUDPEndpoint` su Windows. Ciò che ha già visto resta in `visti.json`, per sette giorni.

## Limiti

- Una connessione breve, aperta e chiusa tra due letture, può sfuggire.
- Senza privilegi i processi di altri utenti possono comparire come "Processi non identificati".
- Su Linux e Windows le destinazioni restano indirizzi IP. Su macOS `nettop` fornisce spesso il nome.
- Gli stessi nomi di porta sono convenzioni: un programma può usare la porta di un altro servizio.

## Sviluppo

```bash
npm install
npm run setup
npm test
npm run build    # crea i pacchetti in dist/pacchetti
```
