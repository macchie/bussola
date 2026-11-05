/* Entry point: language and theme first, then the app. */
import { loadSettings, installSettings } from './settings.js';
import { watchForUpdate } from './update.js';

Neutralino.init();
await loadSettings();
installSettings({ notice: () => globalThis.LANGUAGE_NOTICE?.() });
await import('/app.js');
watchForUpdate();
