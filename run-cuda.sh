#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== VoiceToTex CUDA start ==="

# 1) Kill any old processes
echo "Stopping any old Electron/backend processes..."
pkill -f '/home/a/Documents/voicetotex/node_modules/electron/dist/electron \.' || true
pkill -f '/home/a/Documents/voicetotex/backend/server.py' || true
pkill -f 'npm exec electron \.' || true
sleep 1

# 2) Ensure venv exists
VENV_PY="$SCRIPT_DIR/backend/.venv/bin/python"
if [ ! -f "$VENV_PY" ]; then
    echo "Venv not found. Running setup..."
    bash scripts/setup.sh
fi

if [ ! -f "$VENV_PY" ]; then
    echo "ERROR: venv python not found at $VENV_PY"
    exit 1
fi

# 3) Force CUDA config
mkdir -p ~/.config/voicetotex
cat > ~/.config/voicetotex/config.json <<'EOF'
{
  "model": "large-v3-turbo",
  "language": "auto",
  "device": "cuda",
  "compute_type": "float16",
  "beam_size": 5,
  "output_mode": "copy",
  "hotkey": "ctrl+shift+space",
  "hotkey_mode": "hold",
  "audio_device": null,
  "vad_threshold": 0.3,
  "noise_reduction": true,
  "websocket_port": 8765,
  "initial_prompt": "",
  "max_history": 100,
  "max_recording_seconds": 300
}
EOF

export VOICETOTEX_PYTHON="$VENV_PY"
export ELECTRON_OZONE_PLATFORM_HINT=auto

echo "Starting VoiceToTex on CUDA..."
bash scripts/start.sh

sleep 3
if pgrep -f '/home/a/Documents/voicetotex/backend/server.py' >/dev/null; then
    echo "✓ Backend running (CUDA mode)."
else
    echo "⚠ Backend not found. Check the UI for errors."
fi
