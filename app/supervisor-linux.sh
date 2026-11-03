#!/bin/sh
set -eu
root=$1
lease=$2
gui_pid=$3
gui_started=$4
case "$root" in /tmp/pocketsocket.????????) ;; *) exit 70 ;; esac
core_pid=
cleanup() {
  trap '' TERM INT HUP
  if [ -n "$core_pid" ]; then
    kill -TERM "$core_pid" 2>/dev/null || true
    attempts=0
    while kill -0 "$core_pid" 2>/dev/null && [ "$attempts" -lt 5 ]; do /bin/sleep 1; attempts=$((attempts+1)); done
    kill -KILL "$core_pid" 2>/dev/null || true
    wait "$core_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 0' TERM INT HUP
valid() {
  current=$(/bin/ps -p "$gui_pid" -o lstart= 2>/dev/null || true)
  [ "$current" = "$gui_started" ] && [ -f "$lease" ] || return 1
  stamp=$(/usr/bin/stat -c %Y "$lease" 2>/dev/null || echo 0)
  now=$(/bin/date +%s)
  [ "$((now-stamp))" -le 15 ]
}
valid || exit 0
"$root/mihomo" -d "$root" -f "$root/config.json" > "$root/core.log" 2>&1 &
core_pid=$!
while kill -0 "$core_pid" 2>/dev/null && valid; do /bin/sleep 2; done
