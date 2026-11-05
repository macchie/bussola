# Battiti

Mostra cosa pesa su CPU e memoria, con la mappa ad anelli di Anelli e Correnti: dal centro app e processi,
i più pesanti per primi. App desktop per macOS, Windows e Linux costruita con Neutralinojs.

## Installazione

| Sistema | Pacchetto | Note |
| --- | --- | --- |
| macOS 10.15+ | `Battiti-macos.zip` | Estrai in Download, poi `bash ~/Downloads/Battiti-macos/Installa\ Battiti.command` |
| Windows 10/11 x64 | `Battiti-windows-x64.zip` | Serve WebView2, già presente su Windows 11. SmartScreen può chiedere conferma |
| Linux x64 / arm64 | `Battiti-linux-*.zip` | Serve WebKitGTK: `sudo apt install libwebkit2gtk-4.1-0` |

Tieni `resources.neu` accanto all'eseguibile.

## Come si usa

- Scegli la misura, CPU o Memoria, e il periodo: Adesso, Ultima ora, Oggi, 7 giorni.
- Clic su un'app con più processi per entrare, clic al centro per risalire.
- Il grafico in basso mostra la CPU sopra e la memoria sotto, entrambe da 0 a 100 %.
- Diagnostica mostra cosa ha restituito il sistema e cancella lo storico.

Il 100 % della CPU è l'intera macchina: un processo che occupa un core su 8 vale il 12,5 %.

## Come funziona

Ogni 2 secondi l'app legge i contatori dei processi e ricava l'uso di CPU dalla differenza col campione
precedente.

- **Linux:** `/proc`.
- **macOS:** `ps`, `vm_stat` e `sysctl`. La memoria in uso segue il calcolo di Monitoraggio Attività
  (attiva, wired e compressa).
- **Windows:** un solo processo PowerShell resta aperto, perché avviarlo a ogni campione costerebbe
  troppo. Si chiude da solo quando Battiti non è più in esecuzione.

Lo storico resta sul computer, sette giorni, nella cartella dati dell'utente.

## Limiti

- I dati si registrano solo mentre l'app è aperta.
- La memoria dei processi è quella residente: la parte condivisa conta più volte, quindi la somma può
  superare la memoria in uso. La memoria non attribuita a un processo appare come "Memoria del sistema".
- Su macOS i valori per processo possono differire da Monitoraggio Attività, che usa la "memory footprint".
- Non si possono terminare processi, e non c'è il dettaglio per singolo core.

## Sviluppo

```bash
npm install
npm run setup
npm test
npm run build    # crea i pacchetti in dist/pacchetti
```
