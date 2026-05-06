#!/usr/bin/env bash
set -Eeuo pipefail

export DISPLAY="${DISPLAY:-:1}"
export HOME="${APP_HOME:-/app/data}"
export XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
export GDK_BACKEND=x11
export GDK_SCALE="${GDK_SCALE:-1}"
export GDK_DPI_SCALE="${GDK_DPI_SCALE:-1}"
export LIBGL_ALWAYS_SOFTWARE=1
export NO_AT_BRIDGE=1
export WEBKIT_DISABLE_COMPOSITING_MODE=1

VNC_PASSWORD="${VNC_PASSWORD:-}"
VNC_RESOLUTION="${VNC_RESOLUTION:-1600x1000}"
VNC_DPI="${VNC_DPI:-96}"
NOVNC_RESIZE="${NOVNC_RESIZE:-remote}"
OLLAMA_MODEL="${OLLAMA_MODEL:-llama3.2:1b}"
OLLAMA_VISION_MODEL="${OLLAMA_VISION_MODEL:-llama3.2-vision}"
OPENAI_MODEL="${OPENAI_MODEL:-${OPENAI_API_MODEL:-gpt-4o-mini}}"
CUSTOM_MODEL="${CUSTOM_MODEL:-${OPENAI_API_MODEL:-}}"
CUSTOM_ENDPOINT="${CUSTOM_ENDPOINT:-${OPENAI_API_BASE_URL:-https://openrouter.ai/api/v1}}"
NUTRILOG_DB_PATH="${NUTRILOG_DB_PATH:-/app/data/nutrition.db}"
AUTO_CREATE_DB="${AUTO_CREATE_DB:-true}"
SEED_DEMO_DATA="${SEED_DEMO_DATA:-false}"
AI_PROVIDER="${AI_PROVIDER:-}"
PULL_OLLAMA_MODEL="${PULL_OLLAMA_MODEL:-}"
PULL_OLLAMA_VISION_MODEL="${PULL_OLLAMA_VISION_MODEL:-false}"
START_OLLAMA="${START_OLLAMA:-}"

if [ -z "$AI_PROVIDER" ]; then
  if [ -n "${OPENAI_API_BASE_URL:-}" ]; then
    AI_PROVIDER=custom
  elif [ -n "${OPENAI_API_KEY:-}" ]; then
    AI_PROVIDER=openai
  else
    AI_PROVIDER=ollama
  fi
fi

case "$AI_PROVIDER" in
  ollama|openai|anthropic|google|custom) ;;
  *)
    echo "Warning: invalid AI_PROVIDER=${AI_PROVIDER}; using ollama."
    AI_PROVIDER=ollama
    ;;
esac

if [ -z "$PULL_OLLAMA_MODEL" ]; then
  if [ "$AI_PROVIDER" = "ollama" ]; then
    PULL_OLLAMA_MODEL=true
  else
    PULL_OLLAMA_MODEL=false
  fi
fi

if [ -z "$START_OLLAMA" ]; then
  if [ "$AI_PROVIDER" = "ollama" ] || [ "$PULL_OLLAMA_MODEL" = "true" ] || [ "$PULL_OLLAMA_VISION_MODEL" = "true" ]; then
    START_OLLAMA=true
  else
    START_OLLAMA=false
  fi
fi

mkdir -p /root/.vnc "$HOME" "$XDG_DATA_HOME" /app/data

case "$NOVNC_RESIZE" in
  off|scale|remote) ;;
  *)
    echo "Warning: invalid NOVNC_RESIZE=${NOVNC_RESIZE}; using remote."
    NOVNC_RESIZE=remote
    ;;
esac

if [ -f /usr/share/novnc/app/ui.js ]; then
  sed -i "s/UI.initSetting('resize', '[^']*')/UI.initSetting('resize', '${NOVNC_RESIZE}')/" \
    /usr/share/novnc/app/ui.js
fi

TIGERVNC_ARGS=(
  "$DISPLAY"
  -geometry "$VNC_RESOLUTION"
  -depth 24
  -dpi "$VNC_DPI"
  -rfbport 5901
  -localhost yes
  -AcceptSetDesktopSize=1
  -AlwaysShared=1
  -DisconnectClients=0
  -desktop nutrition-tracker
)

echo "Starting TigerVNC on ${DISPLAY} at ${VNC_RESOLUTION}, ${VNC_DPI} DPI..."
if [ -n "$VNC_PASSWORD" ]; then
  printf '%s\n' "$VNC_PASSWORD" | vncpasswd -f > /root/.vnc/passwd
  chmod 600 /root/.vnc/passwd
  TIGERVNC_ARGS+=(-SecurityTypes VncAuth -PasswordFile /root/.vnc/passwd)
else
  echo "Warning: VNC_PASSWORD is empty. noVNC will be passwordless."
  TIGERVNC_ARGS+=(-SecurityTypes None)
fi

Xtigervnc "${TIGERVNC_ARGS[@]}" >/tmp/tigervnc.log 2>&1 &

sleep 1

echo "Starting fluxbox..."
fluxbox >/tmp/fluxbox.log 2>&1 &

echo "Starting noVNC/websockify on port 6080..."
websockify --web=/usr/share/novnc/ 6080 localhost:5901 >/tmp/websockify.log 2>&1 &

prepare_app_data_dir() {
  local app_data_dir="$1"
  mkdir -p "$app_data_dir/databases"

  if [ -f "$NUTRILOG_DB_PATH" ]; then
    cat >"$app_data_dir/session.json" <<EOF
{
  "last_database_path": "$NUTRILOG_DB_PATH"
}
EOF
  fi

  cat >"$app_data_dir/ai_config.json" <<EOF
{
  "selectedProvider": "$AI_PROVIDER",
  "selectedModels": {
    "ollama": "$OLLAMA_MODEL",
    "openai": "$OPENAI_MODEL",
    "custom": "$CUSTOM_MODEL"
  },
  "ollamaEndpoint": "http://localhost:11434",
  "customEndpoint": "$CUSTOM_ENDPOINT",
  "verifiedProviders": []
}
EOF
}

if [ "$AUTO_CREATE_DB" = "true" ] && [ ! -f "$NUTRILOG_DB_PATH" ]; then
  echo "Creating SQLite database at ${NUTRILOG_DB_PATH}..."
  mkdir -p "$(dirname "$NUTRILOG_DB_PATH")"
  sqlite3 "$NUTRILOG_DB_PATH" < /app/src-rust-crates/database/sql/init.sql
fi

if [ "$SEED_DEMO_DATA" = "true" ] && [ -f "$NUTRILOG_DB_PATH" ]; then
  echo "Seeding demo food log data into ${NUTRILOG_DB_PATH}..."
  sqlite3 "$NUTRILOG_DB_PATH" < /app/src-rust-crates/database/sql/init.sql
  sqlite3 "$NUTRILOG_DB_PATH" < /app/src-rust-crates/database/sql/seed_demo_30_days.sql
fi

# Tauri's Linux app data directory is identifier-based in normal builds. The app name
# candidate is included as a harmless fallback for dev/future config changes.
prepare_app_data_dir "$XDG_DATA_HOME/com.pierretran.nutrition-tracker"
prepare_app_data_dir "$XDG_DATA_HOME/nutrition-tracker"
prepare_app_data_dir "$HOME/.local/share/com.pierretran.nutrition-tracker"
prepare_app_data_dir "$HOME/.local/share/nutrition-tracker"

if [ "$START_OLLAMA" = "true" ]; then
  echo "Starting Ollama..."
  ollama serve >/tmp/ollama.log 2>&1 &

  for _ in $(seq 1 30); do
    if curl -fsS http://localhost:11434/api/tags >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  if [ "$PULL_OLLAMA_MODEL" = "true" ] && [ -n "$OLLAMA_MODEL" ]; then
    echo "Pulling Ollama model ${OLLAMA_MODEL}..."
    ollama pull "$OLLAMA_MODEL" || echo "Warning: failed to pull ${OLLAMA_MODEL}. Check /tmp/ollama.log."
  fi

  if [ "$PULL_OLLAMA_VISION_MODEL" = "true" ] && [ -n "$OLLAMA_VISION_MODEL" ]; then
    echo "Pulling Ollama vision model ${OLLAMA_VISION_MODEL}..."
    ollama pull "$OLLAMA_VISION_MODEL" || echo "Warning: failed to pull ${OLLAMA_VISION_MODEL}. Check /tmp/ollama.log."
  fi
else
  echo "Skipping Ollama startup because AI_PROVIDER=${AI_PROVIDER}."
fi

if command -v dbus-launch >/dev/null 2>&1; then
  eval "$(dbus-launch --sh-syntax)"
fi

echo "Launching nutrition-tracker..."

if [ -n "${APP_BINARY:-}" ] && [ -x "$APP_BINARY" ]; then
  exec "$APP_BINARY"
fi

for candidate in \
  /app/target/release/nutrition-tracker \
  /app/src-tauri/target/release/nutrition-tracker \
  /app/target/debug/nutrition-tracker \
  /app/src-tauri/target/debug/nutrition-tracker
do
  if [ -x "$candidate" ]; then
    exec "$candidate"
  fi
done

echo "Release binary not found; falling back to Tauri dev mode."
exec npm run tauri -- dev
