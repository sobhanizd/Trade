# Helpers: find CryptoPilot processes precisely (node/npm processes whose working
# directory is this project), never matching unrelated programs or shells.
cp_worker_pids() {
  local pid comm cwd
  for pid in $(pgrep -f "worker/index\.ts" 2>/dev/null); do
    [[ "$pid" == "$$" ]] && continue
    comm=$(ps -o comm= -p "$pid" 2>/dev/null)
    [[ "$comm" == *node* || "$comm" == *npm* ]] || continue
    cwd=$(lsof -a -d cwd -p "$pid" -Fn 2>/dev/null | sed -n 's/^n//p')
    [[ "$cwd" == "$DIR" ]] && print -r -- "$pid"
  done
}
