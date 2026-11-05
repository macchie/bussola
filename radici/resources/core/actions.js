// The command that changes an item's state. Every value goes through a list
// blank one or is quoted, and no action deletes the original item.
import { SAFE_LABEL } from './parse.js';
const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const qp = (s) => `'${String(s).replace(/'/g, "''")}'`;
const APPROVED = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';

export function commandFor(mech, enable) {
  if (mech.type === 'systemd') {
    if (!/^[\w@.:-]+\.service$/.test(mech.unit)) throw new Error('Invalid name');
    return `systemctl --user ${enable ? 'enable' : 'disable'} -- ${q(mech.unit)}\n`;
  }
  if (mech.type === 'launchd') {
    if (!SAFE_LABEL.test(mech.label)) throw new Error('Invalid name');
    return `/bin/launchctl ${enable ? 'enable' : 'disable'} "gui/$(id -u)/"${q(mech.label)}\n`;
  }
  if (mech.type === 'run') {
    if (enable) {
      if (!mech.approved) return `Remove-ItemProperty -LiteralPath ${qp(APPROVED)} -Name ${qp(mech.name)} -ErrorAction Stop\n`;
      if (!/^([0-9a-f]{2})+$/i.test(mech.approved)) throw new Error('Invalid value');
      const bytes = mech.approved.match(/../g).map((b) => parseInt(b, 16)).join(',');
      return `Set-ItemProperty -LiteralPath ${qp(APPROVED)} -Name ${qp(mech.name)} -Type Binary -Value ([byte[]](${bytes})) -ErrorAction Stop\n`;
    }
    return `if (-not (Test-Path -LiteralPath ${qp(APPROVED)})) { New-Item -Path ${qp(APPROVED)} -Force | Out-Null }\nSet-ItemProperty -LiteralPath ${qp(APPROVED)} -Name ${qp(mech.name)} -Type Binary -Value ([byte[]](3,0,0,0,0,0,0,0,0,0,0,0)) -ErrorAction Stop\n`;
  }
  throw new Error('Action not available');
}

// XDG autostart: a copy in the user's folder with Hidden=true takes precedence over the
// system ones. The previous content is kept to restore it exactly as it was.
export function hiddenDesktop(previous, name) {
  if (previous === null) return `[Desktop Entry]\nType=Application\nName=${name.replace(/\n/g, ' ')}\nHidden=true\n`;
  if (/^Hidden=.*$/m.test(previous)) return previous.replace(/^Hidden=.*$/m, 'Hidden=true');
  return previous.replace(/^\[Desktop Entry\][^\n]*$/m, '$&\nHidden=true');
}
