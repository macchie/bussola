/* Entry point: language and theme first, then the app. */
import { loadSettings, installSettings } from './settings.js';

Neutralino.init();
await loadSettings();
installSettings({ notice: () => globalThis.LANGUAGE_NOTICE?.() });
await import('/app.js');
