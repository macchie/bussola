// State of the suite on this computer and operations, one at a time.
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
    await this.recognizeManual();
  }

  // Apps installed by hand register their presence in the shared suite folder.
  // The native probe only checks the standard locations, so read the registry
  // here to recognize a hand-installed app wherever it lives.
  async recognizeManual() {
    let base;
    try { base = (await N().os.getPath('data')).replace(/[\\/]$/, ''); } catch { return; }
    const sep = OS === 'Windows' ? '\\' : '/';
    for (const app of APPS) {
      if (this.installed[app.id] !== undefined) continue;
      try {
        const info = JSON.parse(await N().filesystem.readFile(`${base}${sep}Bussola Suite${sep}apps${sep}${app.id}.json`));
        if (info && typeof info.version === 'string') this.installed[app.id] = info.version;
      } catch { /* not registered */ }
    }
  }

  async refresh() {
    await this.detect().catch((err) => this.note(`Detection: ${err.message}`));
    try {
      const res = await runScript(catalogCommandScript(OS, CATALOG_URL));
      if (res.code !== 0) throw new Error(`curl ${res.code}: ${res.err.trim().slice(0, 200)}`);
      this.catalog = parseCatalog(res.out, TRUSTED_PREFIX);
      this.catalogError = '';
      this.note(`Catalog read: ${this.catalog.tag || 'untagged'}`);
    } catch (err) {
      this.catalogError = err.message;
      this.note(`Catalog: ${err.message}`);
    }
    this.onChange();
  }

  status(id) { return statusOf(this.catalog?.apps[id], this.installed[id], this.key); }

  bussolaUpdate() {
    const b = this.catalog?.bussola;
    return b && compareVersions(globalThis.NL_APPVERSION, b.version) < 0 ? b : null;
  }

  async install(app) {
    if (this.busy) throw new Error('Another operation is in progress');
    const entry = this.catalog?.apps[app.id];
    const pkg = entry?.packages[this.key];
    if (!pkg) throw new Error('Package not available for this system');
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
      } catch { /* not created yet */ }
    }, 250);
    let error = null;
    try {
      const res = await runScript(installScript(OS, app, { ...pkg, version: entry.version }, work, this.key), (d) => {
        for (const m of d.matchAll(/STEP (\w+)/g)) { this.progress[app.id] = { step: STEPS[m[1]], part: m[1] === 'download' ? 0 : 1 }; this.onChange(); }
      });
      const code = /ERR (\w+)/.exec(res.out)?.[1];
      if (code || res.code !== 0 || !/DONE/.test(res.out)) throw new Error(ERRORS[code] || (res.err.trim().slice(0, 200) || 'Installation failed'));
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
    this.note(`${app.name} ${entry.version} installed`);
  }

  async saveIcon(app) {
    const home = await N().os.getPath('home');
    const data = await (await fetch(`/apps/${app.id}.png`)).arrayBuffer();
    await N().filesystem.writeBinaryFile(`${home.replace(/\/$/, '')}/.local/share/bussola/apps/${app.id}/icona.png`, data).catch(() => {});
  }

  async uninstall(app, removeData) {
    if (this.busy) throw new Error('Another operation is in progress');
    this.busy = app.id;
    this.onChange();
    try {
      const res = await runScript(uninstallScript(OS, app));
      if (res.code !== 0) throw new Error('The app couldn\'t be removed: check whether it needs an administrator');
      if (removeData && !app.keepData) {
        const base = (await N().os.getPath('data')).replace(/[\\/]$/, '');
        await N().filesystem.remove(`${base}${OS === 'Windows' ? '\\' : '/'}${app.name}`).catch(() => {});
      }
      this.note(`${app.name} uninstalled`);
    } finally {
      this.busy = null;
      await this.detect().catch(() => {});
      this.onChange();
    }
  }

  async open(app) {
    const res = await runScript(openScript(OS, app));
    if (res.code !== 0) throw new Error(`${app.name} can't be opened`);
  }

  openPrivacy() { return runScript(`/usr/bin/open '${SETTINGS_FDA}'\n`); }
}
