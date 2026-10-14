#!/bin/zsh
# Start CryptoPilot AI locally: database → web app → background scanner → open the login page.
# Safe to run many times (it only starts what is not running yet).
DIR="${0:A:h:h}"
cd "$DIR" || exit 1
export PATH="/usr/local/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
mkdir -p .run logs
source "$DIR/scripts/_procs.sh"
log() { print -r -- "$(date '+%H:%M:%S') $*" | tee -a logs/launcher.log; }

log "Starting CryptoPilot AI…"
# 1. Database
if ! pg_isready -q 2>/dev/null; then
  log "Starting PostgreSQL…"
  brew services start postgresql@14 >/dev/null 2>&1
  for i in {1..30}; do pg_isready -q 2>/dev/null && break; sleep 1; done
fi
pg_isready -q 2>/dev/null || { log "ERROR: database did not start"; exit 1; }

# 2. Build once if needed
if [[ ! -f .next/BUILD_ID ]]; then
  log "First start: building the app (about 1 minute)…"
  npm run build > logs/build.log 2>&1 || { log "ERROR: build failed, see logs/build.log"; exit 1; }
fi

# 3. Web app
if curl -s -o /dev/null http://localhost:3000/api/health; then
  log "Web app already running."
else
  log "Starting web app…"
  PORT=3000 nohup npm start > logs/web.log 2>&1 &
  echo $! > .run/web.pid
fi

# 4. Background scanner (prices, signals, alerts)
if [[ -n "$(cp_worker_pids)" ]]; then
  log "Background scanner already running."
else
  log "Starting background scanner…"
  nohup npm run worker > logs/worker.log 2>&1 &
  echo $! > .run/worker.pid
fi

for i in {1..60}; do curl -s -o /dev/null http://localhost:3000/api/health && break; sleep 1; done
if curl -s -o /dev/null http://localhost:3000/api/health; then
  log "Ready: http://localhost:3000"
  [[ "$1" == "--no-open" ]] || open "http://localhost:3000/login"
else
  log "ERROR: web app did not respond, see logs/web.log"
  exit 1
fi
