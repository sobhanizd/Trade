#!/usr/bin/env bash
# Start the web app and the background worker (real market data), then keep this terminal open.
cd "$(dirname "$0")/.."
mkdir -p logs
url=$(sed -n 's/^APP_URL=//p' .env)
login=$(sed -n 's/^DEMO_LOGIN=//p' .env)

if curl -sf http://localhost:3000/api/health > /dev/null; then
  echo "CryptoPilot is already running."
else
  nohup npm start > logs/web.log 2>&1 &
  nohup npm run worker > logs/worker.log 2>&1 &
  echo "Starting CryptoPilot…"
  for _ in $(seq 1 90); do curl -sf http://localhost:3000/api/health > /dev/null && break; sleep 1; done
fi

cat <<MSG

  ┌──────────────────────────────────────────────────────────────┐
    CryptoPilot AI is running.
    Open: ${url}/login
    (or the "Ports" tab → port 3000 → globe icon)

    Username: ${login%%:*}
    Password: ${login#*:}

    The first market scan takes about a minute — refresh the
    dashboard if coins still show "no data yet".
  └──────────────────────────────────────────────────────────────┘

MSG
tail -n 0 -f logs/web.log logs/worker.log
