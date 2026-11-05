# Correnti

Mostra quali app usano la rete, verso dove e quanto, con la stessa mappa ad anelli di Anelli: dal centro
app, processo e destinazione, le più attive per prime. App desktop per macOS e Linux costruita con Neutralinojs.

## Installazione

### Linux

Estrai `Correnti-linux-x64.zip` (o `arm64`) e avvia `correnti`. Servono WebKitGTK e `ss`, di solito già presente:

```bash
sudo apt install libwebkit2gtk-4.1-0 iproute2
```

Non serve root.

### macOS

Estrai `Correnti-macos.zip` in Download, poi in Terminale:

```bash
bash ~/Downloads/Correnti-macos/Installa\ Correnti.command
```

L'installer firma l'app sul tuo Mac con lo strumento di Apple e la copia in Applicazioni. Non servono
Accesso completo al disco né amministratore.

## Come si usa

- Scegli il periodo: Adesso, Ultima ora, Oggi, 7 giorni.
- Scegli la direzione: Totale, Ricevuti, Inviati.
- Clic su un'app per entrare, clic al centro per risalire. Il grafico in basso mostra l'andamento: ricevuti
  sopra, inviati sotto, sulla stessa scala.
- Pausa ferma il rilevamento. Diagnostica mostra cosa ha restituito macOS e cancella lo storico.

## Come funziona

Ogni 3 secondi l'app lancia una breve esecuzione di `/usr/bin/nettop -L 1`, legge i byte di ogni
connessione e ricava il traffico dalla differenza col campione precedente. `ps` collega ogni processo alla
sua app, così gli Helper di Chrome finiscono sotto Chrome.

Lo storico resta sul computer, sette giorni, in `~/Library/Application Support/Correnti` su macOS e
`~/.local/share/Correnti` su Linux.

## Come funziona su Linux

Ogni 3 secondi `ss -tinp` dà i byte di ogni connessione TCP e `/proc/net/dev` i byte reali delle schede di rete.
La differenza compare come **Traffico non attribuito**, così il totale resta onesto. Gli indirizzi diventano
nomi con `getent hosts`, in sottofondo.

- Il traffico UDP non è attribuibile alle app senza root. Include QUIC, quindi buona parte di YouTube e dei
  siti Google nei browser Chromium finisce in Traffico non attribuito.
- Senza root i processi di altri utenti compaiono come "Altri utenti o sistema".
- Reti VPN e container sono escluse dal totale delle schede per non contare due volte.

## Limiti

- Il traffico viene registrato solo mentre l'app è aperta.
- Una connessione aperta e chiusa tra due campioni può sfuggire.
- Le destinazioni arrivano dalla risoluzione inversa dei nomi: molte risultano come il fornitore
  dell'infrastruttura (Google, Akamai, AWS) o come semplice IP.
- Il contenuto del traffico non è visibile. VPN e proxy possono raggruppare il traffico sotto la propria app.
- Il blocco delle app non è incluso.

## Sviluppo

```bash
npm install
npm run setup
npm test
npm run build    # crea dist/pacchetti/Correnti-macos.zip
```
