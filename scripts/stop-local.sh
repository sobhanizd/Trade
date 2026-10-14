#!/bin/zsh
# Stop the CryptoPilot AI web app and background scanner (the database keeps running).
DIR="${0:A:h:h}"
cd "$DIR" || exit 1
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
mkdir -p logs
source "$DIR/scripts/_procs.sh"
lsof -ti tcp:3000 -sTCP:LISTEN | xargs kill 2>/dev/null
for pid in $(cp_worker_pids); do kill "$pid" 2>/dev/null; done
rm -f .run/*.pid
print -r -- "$(date '+%H:%M:%S') CryptoPilot AI stopped." | tee -a logs/launcher.log
