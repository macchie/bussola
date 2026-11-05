import test from 'node:test';
import assert from 'node:assert';
import { parseLinux, parseMac, parseWindows, parseDisabled, firstToken } from '../resources/core/parse.js';
import { commandFor, hiddenDesktop } from '../resources/core/actions.js';
import { groupOf } from '../resources/core/attribute.js';
import { digest } from '../resources/core/sampler.js';
import { SEP } from '../resources/core/store.js';

const LINUX = `===AUTOSTART
@@/home/a/.config/autostart/syncthing.desktop
Name=Syncthing
Exec=/usr/bin/syncthing --no-browser
@@/home/a/.config/autostart/spotify.desktop
Name=Spotify
Hidden=true
@@/etc/xdg/autostart/spotify.desktop
Name=Spotify
Exec=spotify
@@/etc/xdg/autostart/gnome-keyring.desktop
Name=Keyring
Exec=/usr/bin/gnome-keyring-daemon
===USERUNITS
dbus.service static -
pipewire.service enabled enabled
syncd.service enabled enabled
old.service disabled enabled
backup.timer enabled enabled
===SYSUNITS
ssh.service enabled enabled
===CRON
# nota
MAILTO=a
0 3 * * * /home/a/bin/backup --all
`;
test('Linux: tutte le origini, con la copia utente che prevale', () => {
  const items = parseLinux(LINUX, '/home/a/.config');
  const by = (id) => items.find((i) => i.id === id);
  assert.equal(items.filter((i) => i.id === 'autostart:spotify.desktop').length, 1);
  assert.equal(by('autostart:spotify.desktop').state, 'off');
  assert.equal(by('autostart:syncthing.desktop').editable, true);
  assert.equal(by('autostart:gnome-keyring.desktop').editable, false, 'servizio di sessione protetto');
  assert.equal(by('user:pipewire.service').editable, false);
  assert.equal(by('user:syncd.service').editable, true);
  assert.equal(by('user:old.service').state, 'off');
  assert.equal(by('user:dbus.service'), undefined, 'static non si può disattivare');
  assert.equal(by('user:backup.timer').kind, 'task');
  assert.equal(by('user:backup.timer').editable, false);
  assert.equal(by('system:ssh.service').editable, false);
  assert.equal(items.find((i) => i.source === 'crontab').program, '/home/a/bin/backup --all');
});

const MAC = `===AGENTS
@@/Users/a/Library/LaunchAgents/com.google.keystone.agent.plist
{"Label":"com.google.keystone.agent","ProgramArguments":["/Users/a/Library/Google/GoogleSoftwareUpdate/agent","-runMode"],"RunAtLoad":true}

@@/Library/LaunchAgents/com.apple.something.plist
{"Label":"com.apple.something","Program":"/usr/libexec/x"}

@@/Library/LaunchDaemons/com.docker.vmnetd.plist
{"Label":"com.docker.vmnetd","Program":"/Library/PrivilegedHelperTools/com.docker.vmnetd"}

@@/Users/a/Library/LaunchAgents/org.rotto.plist

@@/Users/a/Library/LaunchAgents/io.tick.plist
{"Label":"io.tick","Program":"/opt/tick","StartInterval":300}

===DISABLED
disabled services = {
	"com.google.keystone.agent" => disabled
	"com.altro" => enabled
}
`;
test('macOS: etichette, protezioni, plist illeggibili, stato', () => {
  const items = parseMac(MAC);
  assert.equal(items.length, 5);
  const [g, a, d, broken, tick] = items;
  assert.deepEqual([g.state, g.editable, g.kind], ['off', true, 'login']);
  assert.equal(a.editable, false, 'Apple non si tocca');
  assert.deepEqual([d.kind, d.editable], ['service', false]);
  assert.equal(broken.name, 'org.rotto');
  assert.equal(tick.kind, 'task');
  assert.ok(parseDisabled(['"x" => true']).has('x'), 'formato dei macOS più vecchi');
});

test('Windows: stato da StartupApproved, solo HKCU modificabile', () => {
  const items = parseWindows('avviso\n' + JSON.stringify({
    run: [{ hive: 'HKCU', name: 'Discord', value: '"C:\\Users\\a\\Discord\\Update.exe" --start', approved: '030000000000000000000000' },
      { hive: 'HKCU', name: 'Steam', value: 'C:\\Steam\\steam.exe', approved: null }, { hive: 'HKLM', name: 'Security', value: 'C:\\Windows\\sec.exe', approved: '020000000000000000000000' }],
    folder: { name: 'Note', path: 'C:\\x\\Note.lnk' }, services: null, tasks: [{ name: 'Up', path: '\\Vendor\\', exec: 'up.exe' }],
  }));
  assert.equal(items[0].state, 'off');
  assert.equal(items[1].state, 'on');
  assert.equal(items[2].editable, false);
  assert.equal(items[2].mech, null);
  assert.equal(items.length, 5);
  assert.equal(firstToken(items[0].program), 'C:\\Users\\a\\Discord\\Update.exe');
});

test('i comandi non lasciano passare nomi malformati', () => {
  assert.throws(() => commandFor({ type: 'systemd', unit: 'x; rm -rf ~.service' }, false));
  assert.throws(() => commandFor({ type: 'launchd', label: 'a$(id)' }, false));
  assert.throws(() => commandFor({ type: 'nope' }, false));
  assert.equal(commandFor({ type: 'systemd', unit: 'a.service' }, false), "systemctl --user disable -- 'a.service'\n");
  assert.match(commandFor({ type: 'launchd', label: 'com.x.y' }, true), /launchctl enable "gui\/\$\(id -u\)\/"'com\.x\.y'/);
});

test('Windows: il ripristino rimette il valore originale, o lo toglie', () => {
  const off = commandFor({ type: 'run', name: "O'Brien", approved: null }, false);
  assert.match(off, /Name 'O''Brien'/);
  assert.match(off, /\(3,0,0,0,0,0,0,0,0,0,0,0\)/);
  assert.match(commandFor({ type: 'run', name: 'a', approved: null }, true), /Remove-ItemProperty/);
  assert.match(commandFor({ type: 'run', name: 'a', approved: '0200' }, true), /\(2,0\)/);
  assert.throws(() => commandFor({ type: 'run', name: 'a', approved: "02'; x" }, true));
});

test('autostart: copia nuova o contenuto preservato', () => {
  assert.match(hiddenDesktop(null, 'App'), /Hidden=true/);
  assert.equal(hiddenDesktop('[Desktop Entry]\nExec=a\n', 'A'), '[Desktop Entry]\nHidden=true\nExec=a\n');
  assert.equal(hiddenDesktop('[Desktop Entry]\nHidden=false\n', 'A'), '[Desktop Entry]\nHidden=true\n');
});

test('gruppi e riepilogo', () => {
  assert.equal(groupOf('Darwin', { name: 'com.google.keystone.agent' }, '/Users/a/Library/Google/agent'), 'Google');
  assert.equal(groupOf('Darwin', { name: 'x' }, '/Applications/Slack.app/Contents/MacOS/Slack'), 'Slack');
  const r = digest([{ id: '1', kind: 'login', name: 'A', program: '', source: 's', state: 'on' }, { id: '2', kind: 'login', name: 'B', program: '', source: 's', state: 'off' }], 'Linux');
  assert.deepEqual([r.active, r.off], [1, 1]);
  assert.ok([...r.entries.keys()].some((k) => k.startsWith(`off${SEP}`)));
});
