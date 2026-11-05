import { OS, windows, run } from './platform.js';

const PSEUDO = new Set(['autofs', 'bpf', 'binfmt_misc', 'cgroup', 'cgroup2', 'configfs', 'debugfs',
  'devpts', 'devtmpfs', 'efivarfs', 'fusectl', 'hugetlbfs', 'mqueue', 'nsfs', 'overlay', 'proc',
  'pstore', 'ramfs', 'rpc_pipefs', 'securityfs', 'selinuxfs', 'squashfs', 'sysfs', 'tmpfs', 'tracefs']);
const decode = (s) => s.replace(/\\(\d{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));

export function parseDf(text) {
  const rows = [];
  for (const line of text.split('\n').slice(1)) {
    const m = /^(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+\d+%\s+(\/.*)$/.exec(line);
    if (m) rows.push({ dev: m[1], total: m[2] * 1024, used: m[3] * 1024, free: m[4] * 1024, mount: m[5] });
  }
  return rows;
}
export function filterLinux(rows, mountsText) {
  const types = new Map();
  for (const line of mountsText.split('\n')) {
    const [, mount, type] = line.split(' ');
    if (mount) types.set(decode(mount), type);
  }
  const best = new Map();
  for (const r of rows) {
    const type = types.get(r.mount);
    if (r.mount !== '/' && (!type || PSEUDO.has(type) || type.startsWith('fuse.gvfs'))) continue;
    if (/^\/(proc|sys|dev)(\/|$)/.test(r.mount)) continue;
    const known = best.get(r.dev);
    if (!known || r.mount.length < known.mount.length) best.set(r.dev, r);
  }
  return [...best.values()].map((r) => ({ ...r, name: r.mount === '/' ? 'System' : r.mount.slice(r.mount.lastIndexOf('/') + 1) }));
}
export function filterMac(rows) {
  const list = rows.filter((r) => r.dev.startsWith('/dev/')
    && !(r.mount.startsWith('/System/Volumes/') && r.mount !== '/System/Volumes/Data'))
    .map((r) => ({ ...r, name: r.mount === '/System/Volumes/Data' ? 'Macintosh HD' : r.mount.slice(r.mount.lastIndexOf('/') + 1) || 'System' }));
  // "/" is the sealed system volume: the real data lives in the Data volume.
  return list.some((r) => r.mount === '/System/Volumes/Data') ? list.filter((r) => r.mount !== '/') : list;
}
export function parseWindows(json) {
  return [].concat(JSON.parse(json)).filter((d) => d && d.Size).map((d) => ({
    mount: `${d.DeviceID}\\`, name: d.VolumeName || `Disk ${d.DeviceID}`,
    total: d.Size, free: d.FreeSpace, used: d.Size - d.FreeSpace,
  }));
}

export async function listVolumes() {
  if (windows) {
    const res = await run("Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Select-Object DeviceID,VolumeName,Size,FreeSpace | ConvertTo-Json -Compress\n");
    if (res.code !== 0) throw new Error('Can\'t read the disks');
    return parseWindows(res.out).sort((a, b) => b.total - a.total);
  }
  const res = await run(OS === 'Linux' ? 'df -kP\necho ===MOUNTS===\ncat /proc/self/mounts\n' : 'df -kP\n');
  const [df, mounts = ''] = res.out.split('===MOUNTS===\n');
  const rows = parseDf(df);
  const list = OS === 'Linux' ? filterLinux(rows, mounts) : filterMac(rows);
  return list.filter((v) => v.total > 0).sort((a, b) => b.total - a.total);
}
