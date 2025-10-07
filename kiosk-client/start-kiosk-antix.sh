#!/bin/bash
# ============================================
# Mustaqbal Kiosk Client for AntiX Linux
# Optimized for 50-100 device deployment
# User: tahar / Domain: mustaqbal.local
# ============================================

set -e

# --- CONFIGURATION (Edit these if needed) ---
SERVER_IP="${SERVER_IP:-192.168.1.10}"
SERVER_PORT="${SERVER_PORT:-4000}"
SERVER_BASE="http://${SERVER_IP}:${SERVER_PORT}"
DOMAIN="mustaqbal.local"
KIOSK_USER="tahar"

# Client identification
CLIENT_ID="$(hostname)-$(cat /etc/machine-id 2>/dev/null || echo $(hostname))"
CLIENT_VERSION="mustaqbal-kiosk-1.0"

# --- FUNCTIONS ---
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# Check if running as root for setup
if [ "$EUID" -eq 0 ]; then
  log "=== MUSTAQBAL KIOSK SETUP (AntiX) ==="
  
  # Install required packages for AntiX
  log "Installing required packages..."
  apt-get update -qq
  apt-get install -y \
    chromium \
    firefox-esr \
    curl \
    jq \
    xdotool \
    unclutter \
    x11-xserver-utils \
    dbus-x11 \
    2>/dev/null || {
    log "Warning: Some packages may not be available on AntiX"
    log "Trying lightweight alternatives..."
    apt-get install -y midori curl jq 2>/dev/null || true
  }
  
  # Setup user if doesn't exist
  if ! id -u "$KIOSK_USER" >/dev/null 2>&1; then
    log "Creating user: $KIOSK_USER"
    useradd -m -s /bin/bash "$KIOSK_USER"
    echo "$KIOSK_USER:tahar" | chpasswd
  fi
  
  # Copy this script to user home
  SCRIPT_PATH="/home/$KIOSK_USER/start-kiosk.sh"
  cp "$0" "$SCRIPT_PATH"
  chown "$KIOSK_USER:$KIOSK_USER" "$SCRIPT_PATH"
  chmod +x "$SCRIPT_PATH"
  
  # AntiX uses SysV init, not systemd - use .xinitrc instead
  log "Setting up auto-start for AntiX..."
  
  # Create .xinitrc for kiosk user
  cat > /home/$KIOSK_USER/.xinitrc <<'XINITRC_EOF'
#!/bin/bash
# Mustaqbal Kiosk Auto-start
xset s off
xset -dpms
xset s noblank
/home/tahar/start-kiosk.sh &
exec icewm
XINITRC_EOF
  
  chown "$KIOSK_USER:$KIOSK_USER" "/home/$KIOSK_USER/.xinitrc"
  chmod +x "/home/$KIOSK_USER/.xinitrc"
  
  # Setup auto-login for AntiX (uses slim or lightdm)
  if [ -f /etc/slim.conf ]; then
    log "Configuring slim auto-login..."
    sed -i "s/^#auto_login.*/auto_login yes/" /etc/slim.conf
    sed -i "s/^#default_user.*/default_user $KIOSK_USER/" /etc/slim.conf
  elif [ -d /etc/lightdm ]; then
    log "Configuring lightdm auto-login..."
    mkdir -p /etc/lightdm/lightdm.conf.d
    cat > /etc/lightdm/lightdm.conf.d/60-kiosk-autologin.conf <<EOF
[Seat:*]
autologin-user=$KIOSK_USER
autologin-user-timeout=0
EOF
  else
    log "Warning: No display manager found. Manual login required."
  fi
  
  log "=== SETUP COMPLETE ==="
  log "Hostname: $(hostname)"
  log "Domain: $DOMAIN"
  log "Server: $SERVER_BASE"
  log ""
  log "NEXT STEPS:"
  log "1. Reboot this machine: sudo reboot"
  log "2. It will auto-login as '$KIOSK_USER' and start kiosk"
  log "3. Repeat on all 50-100 machines"
  log ""
  exit 0
fi

# --- KIOSK MODE (Running as regular user) ---
log "=== Starting Mustaqbal Kiosk ==="
log "Client ID: $CLIENT_ID"
log "Server: $SERVER_BASE"

# Disable screensaver and power management
xset s off 2>/dev/null || true
xset -dpms 2>/dev/null || true
xset s noblank 2>/dev/null || true

# Hide mouse cursor after 2 seconds
unclutter -idle 2 -root &

# Function to get current URL from server
get_url() {
  curl -s "$SERVER_BASE/api/config" 2>/dev/null | jq -r '.kioskUrl' 2>/dev/null || echo ""
}

# Function to send heartbeat
send_heartbeat() {
  local current_url="$1"
  curl -s -X POST "$SERVER_BASE/api/heartbeat" \
    -H 'Content-Type: application/json' \
    -d "{
      \"id\": \"$CLIENT_ID\",
      \"hostname\": \"$(hostname)\",
      \"version\": \"$CLIENT_VERSION\",
      \"status\": \"ok\",
      \"currentUrl\": \"$current_url\",
      \"tags\": [\"antix\", \"mustaqbal\"],
      \"metrics\": {
        \"uptime\": $(cat /proc/uptime | cut -d' ' -f1 | cut -d'.' -f1),
        \"memory\": \"$(free -m | awk 'NR==2{printf \"%.0f%%\", $3*100/$2}')\"
      }
    }" 2>/dev/null
}

# Detect best browser (prefer Chromium, fallback to Firefox, then Midori)
if command -v chromium &>/dev/null; then
  BROWSER="chromium"
  BROWSER_ARGS="--kiosk --noerrdialogs --disable-infobars --no-first-run --fast --fast-start --disable-features=TranslateUI --disk-cache-size=1"
elif command -v firefox-esr &>/dev/null; then
  BROWSER="firefox-esr"
  BROWSER_ARGS="-kiosk"
elif command -v firefox &>/dev/null; then
  BROWSER="firefox"
  BROWSER_ARGS="-kiosk"
elif command -v midori &>/dev/null; then
  BROWSER="midori"
  BROWSER_ARGS="-e Fullscreen -a"
else
  log "ERROR: No browser found! Install chromium, firefox, or midori"
  exit 1
fi

log "Using browser: $BROWSER"

# Get initial URL
CURRENT_URL=$(get_url)
if [ -z "$CURRENT_URL" ] || [ "$CURRENT_URL" = "null" ]; then
  log "Warning: Could not get URL from server, using fallback"
  CURRENT_URL="https://www.mustaqbal.hb.local"
fi

log "Initial URL: $CURRENT_URL"

# Start browser in background
$BROWSER $BROWSER_ARGS "$CURRENT_URL" &
BROWSER_PID=$!
log "Browser started (PID: $BROWSER_PID)"

# Send initial heartbeat
send_heartbeat "$CURRENT_URL" &

# Main monitoring loop
HEARTBEAT_COUNTER=0
while true; do
  sleep 5
  
  # Check if browser is still running
  if ! kill -0 $BROWSER_PID 2>/dev/null; then
    log "Browser died, restarting..."
    CURRENT_URL=$(get_url)
    $BROWSER $BROWSER_ARGS "$CURRENT_URL" &
    BROWSER_PID=$!
  fi
  
  # Check for URL changes every 5 seconds
  NEW_URL=$(get_url)
  if [ -n "$NEW_URL" ] && [ "$NEW_URL" != "null" ] && [ "$NEW_URL" != "$CURRENT_URL" ]; then
    log "URL changed: $CURRENT_URL -> $NEW_URL"
    CURRENT_URL="$NEW_URL"
    
    # Kill and restart browser with new URL
    kill $BROWSER_PID 2>/dev/null || true
    sleep 1
    $BROWSER $BROWSER_ARGS "$CURRENT_URL" &
    BROWSER_PID=$!
    log "Browser restarted with new URL (PID: $BROWSER_PID)"
  fi
  
  # Send heartbeat every 30 seconds (6 loops * 5 seconds)
  HEARTBEAT_COUNTER=$((HEARTBEAT_COUNTER + 1))
  if [ $HEARTBEAT_COUNTER -ge 6 ]; then
    send_heartbeat "$CURRENT_URL" &
    HEARTBEAT_COUNTER=0
  fi
done
