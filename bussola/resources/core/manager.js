// Stato della suite su questo computer e operazioni, una alla volta.
import { OS, runScript } from './platform.js';
import { APPS, CATALOG_URL, TRUSTED_PREFIX, parseCatalog, platformKey, statusOf, compareVersions } from './catalog.js';
import { installScript, uninstallScript, openScript, detectScript, parseDetected, catalogCommandScript, ERRORS, STEPS } from './scripts.js';

const N = () => globalThis.Neutralino;
const SETTINGS_FDA = "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles";

export class Manager {
  constructor(onChange) {
    this.onChange = onChange;
    this.key = platformKey(OS, globalThis.NL_ARCH);
    this.catalog = null;
    this.catalogError = '';
    this.installed = {};
    this.busy = null;
    this.progress = {};
    this.log = [];
  }

  note(text) { this.log.push(`${new Date().toLocaleTimeString(globalThis.LINGUA || 'it-IT')} ${globalThis.tx ? globalThis.tx(text) : text}`); if (this.log.length > 200) this.log.shift(); }

  async detect() {
    const res = await runScript(detectScript(OS, APPS));
    this.installed = parseDetected(res.out);
  }

  async refresh() {
    await this.detect().catch((err) => this.note(`Rilevamento: ${err.message}`));
    try {
      const res = await runScript(catalogCommandScript(OS, CATALOG_URL));
      if (res.code !== 0) throw new Error(`curl ${res.code}: ${res.err.trim().slice(0, 200)}`);
      this.catalog = parseCatalog(res.out, TRUSTED_PREFIX);
      this.catalogError = '';
      this.note(`Catalogo letto: ${this.catalog.tag || 'senza etichetta'}`);
    } catch (err) {
      this.catalogError = err.message;
      this.note(`Catalogo: ${err.message}`);
    }
    this.onChange();
  }

  status(id) { return statusOf(this.catalog?.apps[id], this.installed[id], this.key); }

  bussolaUpdate() {
    const b = this.catalog?.bussola;
    return b && compareVersions(globalThis.NL_APPVERSION, b.version) < 0 ? b : null;
  }

  async install(app) {
    if (this.busy) throw new Error('Un\'altra operazione è in corso');
    const entry = this.catalog?.apps[app.id];
    const pkg = entry?.packages[this.key];
    if (!pkg) throw new Error('Pacchetto non disponibile per questo sistema');
    const temp = (await N().os.getPath('temp')).replace(/[\\/]$/, '');
    const sep = OS === 'Windows' ? '\\' : '/';
    const work = `${temp}${sep}bussola-${app.id}-${Date.now()}`;
    this.busy = app.id;
    this.progress[app.id] = { step: STEPS.download, part: 0 };
    this.onChange();
    const zip = `${work}${sep}p.zip`;
    const timer = setInterval(async () => {
      try {
        const { size } = await N().filesystem.getStats(zip);
        const p = this.progress[app.id];
        if (p?.step === STEPS.download) { p.part = Math.min(1, size / pkg.size); this.onChange(); }
      } catch { /* non ancora creato */ }
    }, 250);
    let error = null;
    try {
      const res = await runScript(installScript(OS, app, { ...pkg, version: entry.version }, work, this.key), (d) => {
        for (const m of d.matchAll(/STEP (\w+)/g)) { this.progress[app.id] = { step: STEPS[m[1]], part: m[1] === 'download' ? 0 : 1 }; this.onChange(); }
      });
      const code = /ERR (\w+)/.exec(res.out)?.[1];
      if (code || res.code !== 0 || !/DONE/.test(res.out)) throw new Error(ERRORS[code] || (res.err.trim().slice(0, 200) || 'Installazione non riuscita'));
      if (OS === 'Linux') await this.saveIcon(app);
    } catch (err) {
      error = err;
      this.note(`${app.name}: ${err.message}`);
    } finally {
      clearInterval(timer);
      delete this.progress[app.id];
      this.busy = null;
    }
    await this.detect().catch(() => {});
    this.onChange();
    if (error) throw error;
    this.note(`${app.name} ${entry.version} installata`);
  }

  async saveIcon(app) {
    const home = await N().os.getPath('home');
    const data = await (await fetch(`/apps/${app.id}.png`)).arrayBuffer();
    await N().filesystem.writeBinaryFile(`${home.replace(/\/$/, '')}/.local/share/bussola/apps/${app.id}/icona.png`, data).catch(() => {});
  }

  async uninstall(app, removeData) {
    if (this.busy) throw new Error('Un\'altra operazione è in corso');
    this.busy = app.id;
    this.onChange();
    try {
      const res = await runScript(uninstallScript(OS, app));
      if (res.code !== 0) throw new Error('Non è stato possibile rimuovere l\'app: controlla che non serva l\'amministratore');
      if (removeData && !app.keepData) {
        const base = (await N().os.getPath('data')).replace(/[\\/]$/, '');
        await N().filesystem.remove(`${base}${OS === 'Windows' ? '\\' : '/'}${app.name}`).catch(() => {});
      }
      this.note(`${app.name} disinstallata`);
    } finally {
      this.busy = null;
      await this.detect().catch(() => {});
      this.onChange();
    }
  }

  async open(app) {
    const res = await runScript(openScript(OS, app));
    if (res.code !== 0) throw new Error(`${app.name} non si può aprire`);
  }

  openPrivacy() { return runScript(`/usr/bin/open '${SETTINGS_FDA}'\n`); }
}
