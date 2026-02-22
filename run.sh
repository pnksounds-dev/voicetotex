#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== VoiceToTex clean start ==="

# 1) Kill any old processes
echo "Stopping any old Electron/backend processes..."
pkill -f '/home/a/Documents/voicetotex/node_modules/electron/dist/electron \.' || true
pkill -f '/home/a/Documents/voicetotex/backend/server.py' || true
pkill -f 'npm exec electron \.' || true
sleep 1

# 2) Ensure venv exists and python is correct
VENV_PY="$SCRIPT_DIR/backend/.venv/bin/python"
if [ ! -f "$VENV_PY" ]; then
    echo "Venv not found. Running setup..."
    bash scripts/setup.sh
fi

if [ ! -f "$VENV_PY" ]; then
    echo "ERROR: venv python not found at $VENV_PY"
    exit 1
fi

echo "Using venv python: $VENV_PY"

# 3) Export the correct python path and start
export VOICETOTEX_PYTHON="$VENV_PY"
export ELECTRON_OZONE_PLATFORM_HINT=auto

echo "Starting VoiceToTex..."
bash scripts/start.sh

# 4) Quick status check after a few seconds
sleep 3
if pgrep -f '/home/a/Documents/voicetotex/backend/server.py' >/dev/null; then
    echo "✓ Backend process is running."
else
    echo "⚠ Backend not found in process list. Check the UI for errors."
fi
