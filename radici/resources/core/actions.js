// Il comando che cambia lo stato di un elemento. Ogni valore passa da una lista
// bianca o viene quotato, e nessuna azione cancella l'elemento originale.
import { SAFE_LABEL } from './parse.js';
const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const qp = (s) => `'${String(s).replace(/'/g, "''")}'`;
const APPROVED = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';

export function commandFor(mech, enable) {
  if (mech.type === 'systemd') {
    if (!/^[\w@.:-]+\.service$/.test(mech.unit)) throw new Error('Nome non valido');
    return `systemctl --user ${enable ? 'enable' : 'disable'} -- ${q(mech.unit)}\n`;
  }
  if (mech.type === 'launchd') {
    if (!SAFE_LABEL.test(mech.label)) throw new Error('Nome non valido');
    return `/bin/launchctl ${enable ? 'enable' : 'disable'} "gui/$(id -u)/"${q(mech.label)}\n`;
  }
  if (mech.type === 'run') {
    if (enable) {
      if (!mech.approved) return `Remove-ItemProperty -LiteralPath ${qp(APPROVED)} -Name ${qp(mech.name)} -ErrorAction Stop\n`;
      if (!/^([0-9a-f]{2})+$/i.test(mech.approved)) throw new Error('Valore non valido');
      const bytes = mech.approved.match(/../g).map((b) => parseInt(b, 16)).join(',');
      return `Set-ItemProperty -LiteralPath ${qp(APPROVED)} -Name ${qp(mech.name)} -Type Binary -Value ([byte[]](${bytes})) -ErrorAction Stop\n`;
    }
    return `if (-not (Test-Path -LiteralPath ${qp(APPROVED)})) { New-Item -Path ${qp(APPROVED)} -Force | Out-Null }\nSet-ItemProperty -LiteralPath ${qp(APPROVED)} -Name ${qp(mech.name)} -Type Binary -Value ([byte[]](3,0,0,0,0,0,0,0,0,0,0,0)) -ErrorAction Stop\n`;
  }
  throw new Error('Azione non disponibile');
}

// Autostart XDG: una copia nella cartella dell'utente con Hidden=true prevale su quella
// di sistema. Si conserva il contenuto precedente per riportarlo esattamente com'era.
export function hiddenDesktop(previous, name) {
  if (previous === null) return `[Desktop Entry]\nType=Application\nName=${name.replace(/\n/g, ' ')}\nHidden=true\n`;
  if (/^Hidden=.*$/m.test(previous)) return previous.replace(/^Hidden=.*$/m, 'Hidden=true');
  return previous.replace(/^\[Desktop Entry\][^\n]*$/m, '$&\nHidden=true');
}
