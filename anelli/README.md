# Anelli

Analizzatore visuale dello spazio su disco nello stile di DaisyDisk: app desktop per macOS, Linux e
Windows. Costruita con [Neutralinojs](https://neutralino.js.org): nessun Node e nessun server da
avviare a runtime, solo un eseguibile di pochi MB che usa la webview del sistema.

## Installazione

Scarica il pacchetto per il tuo sistema.

| Sistema | Pacchetto | Note |
| --- | --- | --- |
| macOS 10.15+ (Intel e Apple Silicon) | `Anelli-macos.zip` | Estrai e lancia `bash "Installa Anelli.command"`: firma l'app sul tuo Mac e la mette in Applicazioni |
| Windows 10/11 x64 | `Anelli-windows-x64.zip` | Serve WebView2, già presente su Windows 11. SmartScreen può chiedere conferma |
| Linux x64 / arm64 | `Anelli-linux-*.zip` | Serve WebKitGTK: `sudo apt install libwebkit2gtk-4.1-0` |

Tieni `resources.neu` accanto all'eseguibile.

## Sviluppo

Node serve solo qui, come strumento, mai nell'app finale.

```bash
npm install
npm run setup    # scarica runtime e libreria client
npm run dev      # avvia l'app
npm test         # logica pura, senza runtime
npm run build    # crea i pacchetti in dist/pacchetti per tutti i sistemi, da qualunque sistema
```

## Come si usa

1. Scegli un disco o una cartella e avvia la scansione.
2. Esplora la mappa: ogni anello è un livello, dalle ore 12 con i più pesanti. Clic su una cartella
   per entrare, clic al centro per risalire. L'elenco a fianco ha lo stesso contenuto.
3. Trascina nella Raccolta, o premi +. La raccolta non tocca il disco.
4. "Sposta nel cestino" sposta davvero gli elementi, in modo istantaneo e reversibile.
5. Dal Cestino puoi ripristinare, o eliminare definitivamente dopo un conto alla rovescia di 5 secondi.

Tastiera nell'elenco: frecce, Invio per aprire, Spazio per l'anteprima, Canc per la raccolta,
Backspace per risalire. Il tasto destro apre il menu delle azioni.

## Come funziona

Neutralino non ha `lstat` né thread, e una chiamata per file sarebbe troppo lenta. La scansione usa
quindi strumenti nativi che scrivono un elenco in un file temporaneo; l'app lo legge a blocchi e lo
passa a un Web Worker, che tiene l'albero.

- **Linux e macOS:** `du -akx`, che dà spazio allocato, conta gli hardlink una volta e resta sul volume.
- **Windows:** un piccolo enumeratore C# compilato al volo da PowerShell. Salta junction e link, e conta
  zero i file solo cloud. Le dimensioni sono quelle logiche, non lo spazio allocato.

Ogni percorso destinato alla shell finisce quotato in uno script temporaneo, mai sulla riga di comando.

## Il cestino

Finché un elemento è nel cestino occupa ancora spazio. Non esiste svuotamento automatico. Lo spostamento
è una rinomina sullo stesso volume, mai una copia. Gli elementi vanno nella cartella dati dell'utente se
è sullo stesso volume, altrimenti in `.anelli-trash-<utente>` nella cartella più alta scrivibile.
L'elenco è in `trash.json` e sopravvive ai riavvii.

| Sistema | Cartella dati |
| --- | --- |
| Linux | `~/.local/share/Anelli` |
| macOS | `~/Library/Application Support/Anelli` |
| Windows | `%APPDATA%\Anelli` |

## Sicurezza

- Solo le API native elencate in `nativeAllowList` sono disponibili, con token monouso.
- L'eliminazione accetta solo id del cestino, mai percorsi; i link si rimuovono senza seguirli.
- Rifiuta radici, punti di montaggio, la home e i suoi antenati, le cartelle di sistema di ogni piattaforma.
- Il ripristino non sovrascrive mai: in caso di conflitto propone un nome diverso.

## Accesso completo al disco su macOS

macOS lega il permesso alla firma dell'app. Senza un certificato Developer ID la firma è locale e cambia
a ogni versione: dopo un aggiornamento rilancia l'installer e riattiva il permesso. Se in Impostazioni c'è
una vecchia voce di Anelli, toglila con il tasto meno prima di aggiungerla di nuovo.

Anche con il permesso attivo, macOS tiene fuori alcune aree protette da SIP e i dati delle app in
contenitore: la scansione le conta come escluse e non si possono spostare.

## Limiti

- Per le cartelle protette serve avviare l'app come amministratore.
- Su Linux e macOS una cartella vuota appare come file, perché `du` non distingue i due casi.
- Una riscansione parziale può ricontare un file con hardlink esterni alla cartella.
- Ogni cartella conserva i 200 file più grandi; gli altri restano nel totale come gruppo.
- Anteprima multimediale fino a 256 MB.
