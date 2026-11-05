# Bussola e la suite

Sette app desktop che rispondono a sette domande sul tuo computer, più **Bussola**, il launcher che le installa
e le tiene aggiornate. Tutte usano la stessa mappa ad anelli, gli stessi periodi e la stessa struttura, e girano
senza account e senza server.

| App | La domanda | Versione | macOS | Windows | Linux |
| --- | --- | --- | --- | --- | --- |
| **Bussola** | Cosa ho installato, e cosa va aggiornato? | 1.1.0 | Sì | Sì | Sì |
| **Anelli** | Dove è finito lo spazio su disco? | 2.1.0 | Sì | Sì | Sì |
| **Correnti** | Quali app usano la rete, e verso dove? | 1.2.0 | Sì | No | Sì |
| **Battiti** | Cosa pesa su CPU e memoria? | 1.1.0 | Sì | Sì | Sì |
| **Scorte** | Quanta batteria resta, e chi la consuma? | 1.1.0 | Sì | Sì | Sì |
| **Sentinelle** | Cosa è in ascolto, e con chi parla il computer? | 1.1.0 | Sì | Sì | Sì |
| **Radici** | Cosa parte da solo all'avvio? | 1.1.0 | Sì | Sì | Sì |
| **Registro** | Quali errori, arresti e riavvii ci sono stati? | 1.1.0 | Sì | Sì | Sì |

Pacchetti per macOS (universale Intel e Apple Silicon), Windows 10/11 x64, Linux x64 e arm64. Ogni pacchetto pesa
da 1,2 a 2,1 MB. Interfaccia in italiano.

> **Stato del progetto: prime versioni.** Tutte le app sono state provate su Linux. Su macOS e Windows il lavoro di
> verifica è ancora da fare: vedi [Stato delle verifiche](#stato-delle-verifiche).

## Indice

- [Installazione](#installazione)
- [Le app](#le-app)
- [Come sono fatte](#come-sono-fatte)
- [Privacy e sicurezza](#privacy-e-sicurezza)
- [Stato delle verifiche](#stato-delle-verifiche)
- [Sviluppo e pubblicazione](#sviluppo-e-pubblicazione)

## Installazione

### Con Bussola (consigliata)

Scarica il pacchetto di Bussola dall'[ultima release](https://github.com/macchie/bussola/releases/latest).

| Sistema | Passaggi |
| --- | --- |
| macOS | Estrai `Bussola-macos.zip` in Download, poi `bash ~/Downloads/Bussola-macos/Installa\ Bussola.command` |
| Windows | Estrai `Bussola-windows-x64.zip` e apri `Bussola.exe`. SmartScreen può chiedere conferma |
| Linux | `sudo apt install libwebkit2gtk-4.1-0`, estrai `Bussola-linux-x64.zip` e avvia `bussola` |

Da Bussola puoi installare, aprire, aggiornare e disinstallare ogni app, anche tutte insieme. Le app finiscono in:

| Sistema | Cartella |
| --- | --- |
| macOS | `/Applications`, oppure `~/Applications` se non è scrivibile |
| Windows | `%LOCALAPPDATA%\Programs\Bussola`, con collegamento nel menu Start |
| Linux | `~/.local/share/bussola/apps`, con voce nel menu delle applicazioni |

Bussola non si aggiorna da sola: quando esce una versione nuova mostra il link alla release.

### Una singola app

Ogni app ha il proprio pacchetto nella stessa release.

- **macOS:** estrai lo zip in Download e lancia `bash ~/Downloads/Nome-macos/Installa\ Nome.command`. L'app viene
  firmata localmente con lo strumento di Apple e copiata in Applicazioni.
- **Windows:** estrai lo zip e apri l'eseguibile. Serve WebView2, già presente su Windows 11.
- **Linux:** estrai lo zip e avvia il programma. Serve `libwebkit2gtk-4.1-0`.

Tieni `resources.neu` accanto all'eseguibile.

### App non firmate

Le app non hanno certificati Apple o Microsoft. Su macOS la firma è locale e cambia a ogni versione: Anelli va
riautorizzata in Accesso completo al disco dopo ogni aggiornamento, e se in Impostazioni resta una vecchia voce
va tolta con il tasto meno. Su Windows SmartScreen può mostrare un avviso.

## Le app

Tutte offrono tema chiaro e scuro, un filtro per nome e, tranne Anelli e Bussola, i periodi Adesso, Ultima ora,
Oggi e 7 giorni, più Diagnostica con l'output grezzo del sistema.

### Anelli

Mappa radiale del disco ispirata a DaisyDisk. Mostra dischi e cartelle con i più pesanti per primi, con la classifica
dei file più grandi e l'anteprima di immagini, video, audio e testo.

Il percorso per liberare spazio ha due passaggi. La **Raccolta** non tocca il disco, il **Cestino** sposta davvero i
file ma resta reversibile, e l'eliminazione definitiva parte dopo un conto alla rovescia di 5 secondi. Radici, home,
punti di montaggio e cartelle di sistema non si possono spostare, e il ripristino non sovrascrive mai.

- **Fonti:** `du` su Linux e macOS, un enumeratore .NET su Windows.
- **Limiti:** ogni cartella conserva i 200 file più grandi, gli altri restano nel totale come gruppo. Su Windows le
  dimensioni sono logiche. Su macOS alcune aree restano escluse anche con l'Accesso completo al disco.

### Correnti

Mappa del traffico per app, processo e destinazione, con ricevuti e inviati, velocità attuale e andamento.

- **Fonti:** `nettop` su macOS. `ss` e `/proc/net/dev` su Linux, senza root.
- **Limiti:** su Linux UDP e QUIC non si attribuiscono alle app senza root e compaiono come Traffico non attribuito.
  Una connessione aperta e chiusa tra due letture può sfuggire. Il traffico si registra solo a app aperta. Non c'è
  una versione per Windows.

### Battiti

CPU e memoria per app e processo, con i processi dello stesso programma raggruppati. Il 100 % della CPU è
l'intera macchina.

- **Fonti:** `/proc` su Linux, `ps`, `vm_stat` e `sysctl` su macOS, .NET via PowerShell su Windows.
- **Limiti:** la memoria condivisa conta più volte, e l'app lo segnala quando la somma supera la memoria in uso. Non
  c'è il dettaglio per singolo core e non si possono terminare i processi.

### Scorte

Livello e autonomia della batteria, salute, cicli, capacità e temperatura, con l'impatto energetico di ogni app.
Senza batteria continua a mostrare quali app lavorano di più.

- **Fonti:** `/sys` e `/proc` su Linux, `pmset`, `ioreg` e `ps` su macOS, WMI su Windows.
- **Limiti:** i watt per app sono **stime** proporzionali al tempo di CPU e non distinguono schermo, rete o GPU. Si
  misurano solo a batteria. Su Windows capacità e cicli possono richiedere l'amministratore.

### Sentinelle

Porte esposte, porte locali e connessioni attive per app. Segna ciò che è comparso nelle ultime 24 ore e l'accesso
remoto esposto, come SSH o Desktop remoto. Guarda solo questo computer: non analizza altri dispositivi e non
tocca il firewall.

- **Fonti:** `/proc/net` su Linux, `nettop` su macOS, `Get-NetTCPConnection` e `Get-NetUDPEndpoint` su Windows.
- **Limiti:** "esposta" non vuol dire raggiungibile da Internet, perché firewall e router possono bloccarla. Senza
  privilegi i processi di altri utenti compaiono come non identificati.

### Radici

Elementi all'accesso, servizi e attività pianificate, con la segnalazione di ciò che è nuovo. Può disattivare gli
elementi a livello utente: non cancella nulla, chiede conferma, ricontrolla lo stato e ripristina il valore
precedente. Servizi di sistema e componenti del sistema operativo restano in sola lettura.

| Sistema | Modificabile | Meccanismo |
| --- | --- | --- |
| macOS | Agenti in `~/Library/LaunchAgents` e `/Library/LaunchAgents` | `launchctl disable` |
| Linux | Autostart e unità systemd utente | `Hidden=true`, `systemctl --user disable` |
| Windows | Valori `Run` dell'utente | `StartupApproved` |

- **Limiti:** l'effetto parte dal prossimo accesso. Alcune app ricreano da sole i propri elementi. Su macOS gli
  Elementi login delle Impostazioni non sono elencati.

### Registro

Errori, avvisi, arresti e riavvii per app, con i messaggi ripetuti uniti in una sola riga. Recupera anche ciò che è
successo mentre era chiusa, perché i log li conserva il sistema.

- **Fonti:** `journalctl` su Linux, `log show`, `DiagnosticReports` e `kern.boottime` su macOS, `Get-WinEvent` su Windows.
- **Limiti:** macOS distingue solo errori e guasti, quindi Avvisi resta vuota. Molti errori di macOS sono innocui. Una
  lettura è limitata a 20.000 eventi.

### Bussola

Launcher della suite. Legge il catalogo dalla release più recente, scarica con `curl` e verifica l'impronta SHA-256
prima di estrarre. Disinstallando puoi cancellare anche i dati, tranne quelli di Anelli e Radici, che contengono il
cestino e le modifiche da ripristinare.

## Lingue e impostazioni

Le app e la landing sono in italiano, inglese, francese, spagnolo e tedesco. Al primo avvio usano la lingua del sistema; se non è tra queste cinque, l'inglese. Il pulsante Impostazioni, in alto in ogni app, permette di scegliere lingua e tema. La scelta vale per tutta la suite ed è salvata in `Bussola Suite/impostazioni.json`, nella cartella dati dell'utente.

I messaggi che arrivano dal sistema operativo, come i log o le descrizioni dei servizi, restano nella lingua del sistema.

## Come sono fatte

Ogni app è un progetto [Neutralinojs](https://neutralino.js.org) indipendente: un eseguibile di pochi MB che usa la
webview del sistema. Non ci sono Node, Electron, server o build dell'interfaccia a runtime.

Tutte seguono le stesse regole:

- **Strumenti di sistema:** i dati arrivano da comandi nativi e file di sistema, per evitare chiamate per singolo file.
- **Differenze tra campioni:** i contatori cumulativi diventano uso reale per differenza.
- **Niente percorsi in riga di comando:** i valori finiscono quotati in script temporanei.
- **Dati locali:** storico di sette giorni nella cartella dati dell'utente, leggibile come JSON a righe.
- **Interfaccia comune:** mappa su canvas, elenco ordinato, grafico con una sola scala, IBM Plex Sans incorporato.

| Sistema | Cartella dati |
| --- | --- |
| macOS | `~/Library/Application Support/<App>` |
| Windows | `%APPDATA%\<App>` |
| Linux | `~/.local/share/<App>` |

## Privacy e sicurezza

- Nessun account, nessuna telemetria, nessun server della suite.
- Le uniche app che usano la rete da sole sono Bussola, per catalogo e pacchetti da GitHub, e Correnti su Linux, che
  chiede al DNS configurato i nomi delle destinazioni.
- Registro conserva un esempio per messaggio: i log possono contenere nomi di file e account. Restano sul computer.
- Ogni app può usare solo le API native elencate nel proprio `nativeAllowList`.
- Bussola installa solo le sette app scritte nel suo codice e accetta solo download HTTPS da `macchie/bussola`.

Catalogo e pacchetti stanno nella stessa release: l'impronta protegge da file corrotti o sostituiti lungo la strada,
non da chi controlla l'account GitHub. Proteggilo con l'autenticazione a due fattori.

## Stato delle verifiche

| App | Linux x64 | macOS | Windows |
| --- | --- | --- | --- |
| Anelli | Provata con scansioni e operazioni reali | Usata su un Mac; firma 2.0.1 da confermare | Mai eseguita |
| Correnti | Provata con traffico reale di dimensione nota | Mai eseguita, formato verificato su fonti pubbliche | Non disponibile |
| Battiti | Provata con carico noto | Mai eseguita | Mai eseguita |
| Scorte | Provata con batteria simulata e senza batteria | Mai eseguita | Mai eseguita |
| Sentinelle | Provata con porte aperte di proposito | Mai eseguita | Mai eseguita |
| Radici | Modifiche su file veri, `systemctl` simulato | Mai eseguita | Mai eseguita |
| Registro | Eventi simulati con conteggi noti | Mai eseguita | Mai eseguita |
| Bussola | Installazioni reali da server locale | Script provato con simulatori | Mai eseguita |

Linux arm64 è compilato ma non è stato avviato. Se qualcosa non torna, in Diagnostica c'è **Copia dati** con l'output
grezzo del sistema. Anelli non ha questa funzione.

## Sviluppo e pubblicazione

Tutte le app stanno in questo repository, una per cartella. Node serve solo come strumento di sviluppo. Servono
`node`, `npm`, `zip`, `make`, e per pubblicare `git` e [`gh`](https://cli.github.com). `make help` elenca i comandi.

```
anelli/ correnti/ battiti/ scorte/ sentinelle/ radici/ registro/ bussola/
  neutralino.config.json   configurazione e API consentite
  resources/               interfaccia e logica
  scripts/package.mjs      pacchetti per ogni sistema
  test/                    test logici
landing/index.html         sito pubblicato su GitHub Pages
scripts/                   controlli della release
.github/workflows/         controlli, release e landing
Makefile
LICENSE  LICENZA.md  TERZE-PARTI.md  CONTRIBUTING.md
```

| Comando | Cosa fa |
| --- | --- |
| `make setup` | Installa gli strumenti e scarica il runtime di ogni app |
| `make test` | Esegue tutti i test logici |
| `make build` | Crea i pacchetti in `<app>/dist/pacchetti` |
| `make build-correnti` | Crea i pacchetti di una sola app |
| `make release` | Test, pacchetti e catalogo in `bussola/dist/release`, senza pubblicare |
| `make versions` | Mostra la versione di ogni app |
| `make landing` | Anteprima locale della landing |

### Traduzioni e impostazioni condivise

Il codice comune sta in `comune/`: `traduzioni.js` ha una voce per ogni testo, con l'italiano come chiave, e `impostazioni.js` il pannello delle preferenze. Dopo una modifica esegui `make sync`, che lo copia in `resources/comune/` di ogni app: `make test` fallisce se le copie non coincidono, se un testo non ha la traduzione o se i segnaposto `{0}` non corrispondono. Una nuova preferenza si aggiunge con `aggiungiSezione()`.

### Prima pubblicazione

Con `gh auth login` già fatto:

```bash
make bootstrap    # crea macchie/bussola pubblico, carica il codice e attiva Pages
make publish      # crea il tag: GitHub compila e pubblica la release
```

Il repository deve essere pubblico, perché Bussola scarica senza autenticazione.

### Nuova versione

1. Cambia `version` in `neutralino.config.json` della app, e in `package.json`.
2. Fai il commit su `main`.
3. Lancia `make publish`, oppure `make publish TAG=suite-2026.11.5.1` per una seconda release nello stesso giorno.

`make publish` rifiuta di partire se ci sono modifiche non salvate, se non sei su `main`, se il tag esiste già o se un
test fallisce. Bussola legge il catalogo della release più recente, quindi gli aggiornamenti arrivano da soli.

### Automazioni GitHub

| Workflow | Quando parte | Cosa fa |
| --- | --- | --- |
| `ci.yml` | Push su `main` e pull request | Test e build di tutte le app |
| `release.yml` | Tag `suite-*` | Test, build, controllo del catalogo e release su GitHub |
| `pages.yml` | Modifiche a `landing/` su `main` | Pubblica la landing su `https://macchie.github.io/bussola/` |

Prima di pubblicare, `scripts/controlla-release.mjs` verifica che catalogo e file coincidano: tag, indirizzi, dimensioni e
impronte. Tutti i pacchetti si compilano su Linux, per ogni sistema. Le firme macOS avvengono sul computer di chi
installa.

## Licenza

Doppia licenza, spiegata in [LICENZA.md](LICENZA.md):

- **[AGPL-3.0](LICENSE):** gratuita. Puoi usare, modificare e ridistribuire il progetto purché resti open source con la
  stessa licenza.
- **Commerciale, a pagamento:** per usarlo in prodotti proprietari o senza rispettare l'AGPL.

Per contribuire vedi [CONTRIBUTING.md](CONTRIBUTING.md).

## Crediti

Costruita con [Neutralinojs](https://neutralino.js.org) (MIT) e IBM Plex Sans (SIL Open Font License), come indicato
in [TERZE-PARTI.md](TERZE-PARTI.md). Anelli si ispira a DaisyDisk, con cui non ha legami.
