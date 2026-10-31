'use strict';
function shellQuote(value) { return "'" + String(value).replace(/'/g, "'\\''") + "'"; }
function appleString(value) { return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"'; }
function makeLaunchScript({ core, config, supervisor, lease, parentPid, parentStart, coreHash }) {
  if (!Number.isInteger(parentPid) || parentPid < 1 || !/^[a-f0-9]{64}$/.test(coreHash)) throw new Error('Invalid launch parameters.');
  // Every user-derived value is a single shell argument. No imported profile text is executed.
  const q = shellQuote;
  const script = `set -eu
umask 077
root=$(/usr/bin/mktemp -d /private/tmp/pocketsocket.XXXXXXXX)
cleanup() {
  case "$root" in /private/tmp/pocketsocket.????????) /bin/rm -rf -- "$root" ;; esac
}
trap cleanup EXIT
/usr/bin/install -o root -g wheel -m 700 ${q(core)} "$root/mihomo"
/usr/bin/install -o root -g wheel -m 600 ${q(config)} "$root/config.json"
/usr/bin/install -o root -g wheel -m 700 ${q(supervisor)} "$root/supervisor.sh"
actual=$(/usr/bin/shasum -a 256 "$root/mihomo" | /usr/bin/cut -d ' ' -f 1)
[ "$actual" = ${q(coreHash)} ] || exit 70
/bin/sh "$root/supervisor.sh" "$root" ${q(lease)} ${q(parentPid)} ${q(parentStart)}
`;
  return `do shell script ${appleString(script)} with administrator privileges`;
}
module.exports = { shellQuote, appleString, makeLaunchScript };
