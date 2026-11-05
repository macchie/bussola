# Scorte

Mostra quanta batteria resta, in che stato è e quali app consumano di più, con la mappa ad anelli della
suite (Anelli, Correnti, Battiti). App desktop per macOS, Windows e Linux costruita con Neutralinojs.

## Installazione

| Sistema | Pacchetto | Note |
| --- | --- | --- |
| macOS 10.15+ | `Scorte-macos.zip` | Estrai in Download, poi `bash ~/Downloads/Scorte-macos/Installa\ Scorte.command` |
| Windows 10/11 x64 | `Scorte-windows-x64.zip` | Serve WebView2, già presente su Windows 11 |
| Linux x64 / arm64 | `Scorte-linux-*.zip` | Serve WebKitGTK: `sudo apt install libwebkit2gtk-4.1-0` |

Tieni `resources.neu` accanto all'eseguibile.

## Come si usa

- **Impatto:** la quota di ogni app sul lavoro della CPU. Funziona anche senza batteria.
- **Potenza:** i watt attribuiti a ogni app. Si misura solo quando il computer va a batteria.
- **Batteria:** stato, autonomia, salute, cicli, capacità e temperatura.

Il grafico mostra il livello della batteria sopra e il carico della CPU sotto, entrambi da 0 a 100 %.

## Come funziona

Ogni 5 secondi l'app legge batteria e processi: `/sys` e `/proc` su Linux, `pmset`, `ioreg` e `ps` su macOS,
PowerShell con le classi WMI su Windows. La stima divide la potenza misurata in proporzione al tempo di CPU.

## Limiti

- I watt per app sono una stima: non contano schermo, rete o GPU, che pesano sul totale ma non sul tempo di
  CPU di un'app. La potenza misurata include anche il consumo a riposo del computer.
- In carica la potenza misurata riguarda la batteria, non il computer, quindi non viene attribuita.
- Su Windows capacità e cicli possono richiedere l'avvio come amministratore; molti portatili non li espongono.
- La temperatura dipende dal sistema e dall'hardware, e può mancare.
- I dati si registrano solo mentre l'app è aperta. Lo storico resta sul computer per sette giorni.

## Sviluppo

```bash
npm install
npm run setup
npm test
npm run build    # crea i pacchetti in dist/pacchetti
```
