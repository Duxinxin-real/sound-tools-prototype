#!/bin/zsh
cd "$(dirname "$0")" || exit 1
PORT=8877
URL="http://localhost:${PORT}/index.html"

if lsof -nP -iTCP:${PORT} -sTCP:LISTEN >/dev/null 2>&1; then
  open -a "Google Chrome" "$URL"
  echo "Sound Tools is already running at $URL"
  exit 0
fi

python3 -m http.server "$PORT" --bind 127.0.0.1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null' EXIT INT TERM

for attempt in {1..20}; do
  if curl -fsS "$URL" >/dev/null 2>&1; then
    open -a "Google Chrome" "$URL"
    echo "Sound Tools is running at $URL"
    echo "Keep this window open while using microphone recording."
    wait "$SERVER_PID"
    exit $?
  fi
  sleep 0.1
done

echo "Could not start Sound Tools at $URL"
kill "$SERVER_PID" 2>/dev/null
exit 1
