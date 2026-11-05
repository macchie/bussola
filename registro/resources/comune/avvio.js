/* Punto d'ingresso: prima lingua e tema, poi l'app. */
import { caricaImpostazioni, installaImpostazioni } from './impostazioni.js';

Neutralino.init();
await caricaImpostazioni();
installaImpostazioni({ avviso: () => globalThis.AVVISO_LINGUA?.() });
await import('/app.js');
