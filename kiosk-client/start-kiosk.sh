#!/bin/bash

# ==============================================================================
# Kiosk Client Startup Script for Linux Mint
# ==============================================================================
# This script sets up a kiosk environment and launches a web browser in full-screen
# kiosk mode. It ensures it automatically restarts if it closes and can set up a
# dedicated 'student' user with autologin.

# --- Step 1: CONFIGURE YOUR SERVER ADDRESS ---
# IMPORTANT: Replace "<YOUR_SERVER_IP>" with the actual local IP address
# of the machine running your Node.js server. The port is currently 4000.
# For example: SERVER_BASE="http://192.168.1.101:4000"

SERVER_BASE="http://192.168.0.178:4000"

# Centralized client config (used by session script)
CONFIG_PATH="/etc/kiosk-client.conf"


# Optional: dual server support (priority order). Used when SERVER_BASE is unreachable.
SERVER_CANDIDATES=(
  "http://10.0.0.1:4000"
  "http://192.168.0.1:4000"
)

# Logging
LOG_FILE="/var/log/kiosk-client.log"
fallback_log="$HOME/.local/share/kiosk-client.log"
mkdir -p "$(dirname "$fallback_log")" >/dev/null 2>&1 || true
log() {
  local ts msg
  ts="$(date '+%Y-%m-%d %H:%M:%S')"
  msg="$ts | $*"
  # Try system log file first, fallback to user log file
  if { : >"$LOG_FILE"; } 2>/dev/null; then
    echo "$msg" >> "$LOG_FILE"
  else
    echo "$msg" >> "$fallback_log"
  fi
  echo "$msg"
}

# Ping with retries
ping_with_retries() {
  local host="$1"; local retries="${2:-3}"; local wait="${3:-1}"
  local i=0
  while (( i < retries )); do
    if ping -c1 -W1 "$host" >/dev/null 2>&1; then return 0; fi
    sleep "$wait"; i=$((i+1))
  done
  return 1
}

# Choose reachable server from SERVER_BASE and SERVER_CANDIDATES
choose_server() {
  local candidates=("$SERVER_BASE" "${SERVER_CANDIDATES[@]}")
  local c host
  for c in "${candidates[@]}"; do
    host="${c#http://}"
    host="${host#https://}"
    host="${host%%/*}"
    host="${host%%:*}"
    if ping_with_retries "$host" 5 1; then
      echo "$c"; return 0
    fi
  done
  echo ""; return 1
}

# Network validation: warn on subnet mismatch
validate_network() {
  local ip line
  ip=$(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4" "$2}' | head -n1)
  if [[ -z "$ip" ]]; then
    log "WARN: No global IPv4 assigned. Check cables/DHCP."
    return 1
  fi
  line="${ip%% *}" # CIDR like 192.168.0.23/24
  if [[ "$line" != 10.* && "$line" != 192.168.* ]]; then
    log "WARN: Client IP ($line) not in 10.0.0.0/24 or 192.168.0.0/24. Routing may block access to servers."
  fi
}

# Hardware summary (lightweight, offline safe)
hardware_summary() {
  local mem_gb cpu_model disk_free
  mem_gb=$(awk '/MemTotal/ {printf "%.1f", $2/1024/1024}' /proc/meminfo 2>/dev/null)
  cpu_model=$(awk -F: '/model name/ {print $2; exit}' /proc/cpuinfo 2>/dev/null | sed 's/^ *//')
  disk_free=$(df -h / | awk 'NR==2{print $4" free"}')
  cpu_mhz=$(awk -F: '/cpu MHz/ {print int($2); exit}' /proc/cpuinfo 2>/dev/null)
  disk_total_mb=$(df -m / | awk 'NR==2{print int($2)}')
  log "Hardware: RAM=${mem_gb:-?}GB, CPU=${cpu_model:-?} (${cpu_mhz:-?}MHz), DiskRoot=${disk_free:-?} (total ${disk_total_mb:-?}MB)"
  # Minimum checks
  local mem_mb
  mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null)
  if [[ -n "$mem_mb" && "$mem_mb" -lt 1024 ]]; then
    log "WARN: RAM below 1GB may be insufficient for kiosk."
  fi
  if [[ -n "$disk_total_mb" && "$disk_total_mb" -lt 10240 ]]; then
    log "WARN: Root disk total below 10GB may be insufficient for Linux Mint XFCE."
  fi
  if [[ -n "$cpu_mhz" && "$cpu_mhz" -lt 1000 ]]; then
    log "WARN: CPU below 1GHz may be insufficient for kiosk."
  fi
}

# Extended hardware details and chipset warnings
detect_hardware_details() {
  local vendor model gpu wifi
  vendor=$(cat /sys/class/dmi/id/sys_vendor 2>/dev/null)
  model=$(cat /sys/class/dmi/id/product_name 2>/dev/null)
  log "Device: Vendor='${vendor:-?}' Model='${model:-?}'"
  if command_exists lspci; then
    gpu=$(lspci 2>/dev/null | grep -i 'vga\|3d' | head -n1)
    wifi=$(lspci 2>/dev/null | grep -i 'network controller\|wireless' | head -n1)
    [[ -n "$gpu" ]] && log "GPU: $gpu"
    [[ -n "$wifi" ]] && log "WiFi: $wifi"
    if echo "$gpu" | grep -qi nvidia; then
      log "INFO: NVIDIA GPU detected. Legacy hardware may need 'nvidia-driver-340' or distro-specific legacy driver."
    fi
    if echo "$wifi" | grep -qi broadcom; then
      log "INFO: Broadcom WiFi detected. You may need 'bcmwl-kernel-source' or appropriate firmware."
    fi
  fi
}

# --- Script Execution Logic (No need to edit below this line) ---

# Check if the script is being run as root for setup
if [[ "$(id -u)" -eq 0 ]]; then
   echo "WARNING: Running as root. Setup will be performed first."
   echo "After setup, run this script as a regular user to start the kiosk."
   # --- Setup Steps ---
   # --- 1. Install Browser (offline-friendly) ---
   echo "[+] Checking for browsers (Firefox/Midori preferred)..."
   if command -v firefox >/dev/null 2>&1 || command -v midori >/dev/null 2>&1 || command -v google-chrome >/dev/null 2>&1; then
     echo "[+] A browser is already installed. Skipping install."
   else
     echo "[!] No browser found. Attempting offline-friendly install of firefox or midori via local repo if available..."
     apt-get update || true
     apt-get install -y firefox || apt-get install -y midori || true
     if ! command -v firefox >/dev/null 2>&1 && ! command -v midori >/dev/null 2>&1; then
       echo "[!] Could not install Firefox/Midori automatically. If offline, copy .deb packages via USB and run: dpkg -i <package>.deb; apt-get -f install"
     fi
   fi

   # --- 2. Create Kiosk User ---
   if ! id -u student >/dev/null 2>&1; then
     echo "[+] Creating 'student' user..."
     useradd -m -s /bin/bash student
     # Set no password for student user
     passwd -d student
   else
     echo "[+] 'student' user already exists."
   fi

   # --- 3. Write client config and create the Kiosk Session Script ---
   echo "[+] Writing client config to $CONFIG_PATH ..."
   mkdir -p "$(dirname "$CONFIG_PATH")" 2>/dev/null || true
   cat > "$CONFIG_PATH" << EOCFG
# Kiosk client configuration
# Change SERVER_BASE to point to your kiosk-server (e.g., http://192.168.1.101:4000)
SERVER_BASE="$SERVER_BASE"

# Optional SSH settings (used by setup to enable remote management)
# Set SSH_ENABLE to "true" to install and enable openssh-server.
#SSH_ENABLE="true"

# SSH user to manage (default: "student")
#SSH_USER="student"

# SSH password for the user (leave empty to skip password setup)
#WARNING: Storing passwords in plain text is insecure. Use at your own risk on trusted networks only.
#SSH_PASSWORD=""

# Public key to authorize for the SSH user (recommended). Paste the full key line (e.g., ssh-ed25519 AAAA... user@host)
#SSH_AUTHORIZED_KEY=""

# Whether to allow password authentication: "yes" or "no". Defaults to "no" if not set.
#SSH_PASSWORD_AUTH="no"

# VNC remote support (optional, offline LAN debugging)
#VNC_ENABLE="false"
#VNC_PASSWORD=""  # optional; if empty, no password is set
EOCFG

   echo "[+] Creating kiosk session script..."
   cat > /usr/local/bin/kiosk-session.sh << 'EOL'
#!/bin/bash
# This script is run automatically on login for the kiosk user.

# Clean up previous session state to prevent popups
rm -rf ~/.config/google-chrome/Default/Preferences

# Infinite loop to keep the browser running
while true; do
  # Load client config on each iteration, so remote config changes take effect
  if [[ -f /etc/kiosk-client.conf ]]; then
    . /etc/kiosk-client.conf
  fi
  google-chrome --kiosk --no-first-run --disable-infobars --start-fullscreen --window-position=0,0 "$SERVER_BASE/client"
  sleep 2
done
EOL

   chmod +x /usr/local/bin/kiosk-session.sh

   # --- 3.1 Enable and configure SSH if requested ---
   echo "[+] Checking SSH configuration..."
   if [[ -f "$CONFIG_PATH" ]]; then
     # shellcheck disable=SC1090
     . "$CONFIG_PATH"
   fi
   SSH_USER_TO_USE=${SSH_USER:-student}
   SSH_PASSWORD_AUTH_VAL=${SSH_PASSWORD_AUTH:-no}
   if [[ "${SSH_ENABLE}" == "true" ]]; then
     echo "[+] Installing and enabling OpenSSH server..."
     apt-get update || true
     apt-get install -y openssh-server || true
     systemctl enable ssh || systemctl enable sshd || true
     systemctl start ssh || systemctl start sshd || true

     # Ensure user exists
     if ! id -u "$SSH_USER_TO_USE" >/dev/null 2>&1; then
       echo "[+] Creating SSH user '$SSH_USER_TO_USE'..."
       useradd -m -s /bin/bash "$SSH_USER_TO_USE"
     fi

     # Set password if provided
     if [[ -n "${SSH_PASSWORD}" ]]; then
       echo "[+] Setting password for '$SSH_USER_TO_USE'..."
       echo "$SSH_USER_TO_USE:${SSH_PASSWORD}" | chpasswd || true
     fi

     # Configure authorized_keys if provided
     if [[ -n "${SSH_AUTHORIZED_KEY}" ]]; then
       echo "[+] Installing authorized SSH key for '$SSH_USER_TO_USE'..."
       su - "$SSH_USER_TO_USE" -c "mkdir -p ~/.ssh && chmod 700 ~/.ssh" || true
       su - "$SSH_USER_TO_USE" -c "printf '%s\n' '${SSH_AUTHORIZED_KEY}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys" || true
     fi

     # Harden and set PasswordAuthentication per config
     SSHD_CONF_PATH="/etc/ssh/sshd_config"
     if [[ -f "$SSHD_CONF_PATH" ]]; then
       sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' "$SSHD_CONF_PATH" || true
       sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' "$SSHD_CONF_PATH" || true
       if grep -q '^#\?PasswordAuthentication' "$SSHD_CONF_PATH"; then
         sed -i "s/^#\?PasswordAuthentication.*/PasswordAuthentication ${SSH_PASSWORD_AUTH_VAL}/" "$SSHD_CONF_PATH" || true
       else
         printf "\nPasswordAuthentication %s\n" "$SSH_PASSWORD_AUTH_VAL" >> "$SSHD_CONF_PATH"
       fi
       systemctl restart ssh || systemctl restart sshd || true
     fi
   fi

   # --- 4. Create the X-Session Desktop Entry ---
   echo "[+] Creating X-session entry..."
   cat > /usr/share/xsessions/kiosk.desktop << EOL
[Desktop Entry]
Name=Kiosk Mode
Comment=Starts the kiosk browser session
Exec=/usr/local/bin/kiosk-session.sh
Type=Application
EOL

   # --- 5. Configure LightDM for Autologin ---
   echo "[+] Configuring autologin for 'student' user..."
   cat > /etc/lightdm/lightdm.conf.d/60-kiosk-autologin.conf << EOL
[Seat:*]
autologin-user=student
autologin-session=kiosk
EOL

   # --- 6. Final Touches ---
   echo "[+] Setting permissions..."
   chown student:student /usr/local/bin/kiosk-session.sh

   # Disable power-saving targets to keep kiosk awake
   echo "[+] Disabling power-saving (sleep/suspend/hibernate)..."
   systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target || true

   # Try to add local APT repo served by kiosk-server for offline installs
   echo "[+] Checking for local APT repo at ${SERVER_BASE}/repo ..."
   server_host="${SERVER_BASE#http://}"; server_host="${server_host#https://}"; server_host="${server_host%%/*}"; server_host="${server_host%%:*}"
   if ping -c1 -W1 "$server_host" >/dev/null 2>&1; then
     if curl -fsS --connect-timeout 2 --max-time 4 "$SERVER_BASE/repo/Packages.gz" >/dev/null 2>&1 || \
        curl -fsS --connect-timeout 2 --max-time 4 "$SERVER_BASE/repo/Packages" >/dev/null 2>&1; then
       echo "[+] Adding local repo: $SERVER_BASE/repo"
       echo "deb [trusted=yes] $SERVER_BASE/repo ./" > /etc/apt/sources.list.d/kiosk-local.list
       apt-get update || true
     else
       echo "[i] Local repo index not found at $SERVER_BASE/repo. Prepare it with kiosk-server/scripts/prepare-offline-repo.sh"
     fi
   else
     echo "[i] Server ${server_host} not reachable; skipping local APT repo setup."
   fi

   # Attempt lightweight driver install from local repo (offline-friendly)
   detect_hardware_details || true
   if command_exists lspci; then
     if lspci | grep -qi 'nvidia'; then
       echo "[i] NVIDIA detected: consider installing nvidia-driver-340 or appropriate legacy package if available in local repo."
       apt-get install -y nvidia-driver-340 || true
     fi
     if lspci | grep -qi 'broadcom'; then
       echo "[i] Broadcom detected: attempting bcmwl-kernel-source from local repo."
       apt-get install -y bcmwl-kernel-source || apt-get install -y firmware-b43-installer || true
     fi
   fi

   # Install offline fallback page (system-wide) if not exists
   mkdir -p /usr/local/share/kiosk 2>/dev/null || true
   if [[ ! -f /usr/local/share/kiosk/offline.html ]]; then
     cat > /usr/local/share/kiosk/offline.html << 'EOF_OFFLINE'
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Offline</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#111;color:#eee;text-align:center} .card{max-width:700px;border:1px solid #333;padding:24px;border-radius:8px;background:#1b1b1b}</style>
</head><body><div class="card"><h1>Servers unavailable</h1><p>Please check cables and power.</p><p>If the issue persists, contact your administrator.</p></div></body></html>
EOF_OFFLINE
   fi

   echo "[+] Setup complete!"
   echo "[+] Please reboot the machine now. It will automatically boot into the kiosk."
   exit 0
fi

# Check if the script is being run as root for kiosk start
if [[ "$(id -u)" -eq 0 ]]; then
   echo "ERROR: This script must not be run as root (using 'sudo') for starting the kiosk."
   echo "Please run it as a regular user. It will ask for a password when needed."
   exit 1
fi

# Function to check if a command is available
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# --- Browser Detection and Setup ---
log "Detecting available browsers and system state..."
validate_network || true
hardware_summary || true

# Screen resolution detection (fallback to safe 1024x768)
RESOLUTION="1024,768"
if command_exists xrandr; then
  curr=$(xrandr --current 2>/dev/null | awk '/\*/ {print $1; exit}')
  if [[ -n "$curr" ]]; then RESOLUTION="${curr/x/","}"; fi
fi

# Lightweight browser preference logic
mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null)
prefer_light=0
if [[ -n "$mem_mb" && "$mem_mb" -le 4096 ]]; then prefer_light=1; fi

if command_exists "firefox" && (( prefer_light == 0 )); then
  log "Found Firefox. Using it for kiosk mode."
  BROWSER_EXECUTABLE="firefox"
  BROWSER_ARGS="-kiosk --fullscreen"
elif command_exists "midori"; then
  log "Using Midori (lightweight) for kiosk mode."
  BROWSER_EXECUTABLE="midori"
  BROWSER_ARGS="-e Fullscreen=1"
elif command_exists "firefox"; then
  log "Using Firefox (available) for kiosk mode."
  BROWSER_EXECUTABLE="firefox"
  BROWSER_ARGS="-kiosk --fullscreen"
elif command_exists "google-chrome"; then
  log "Using Google Chrome (heavier) for kiosk mode."
  BROWSER_EXECUTABLE="google-chrome"
  BROWSER_ARGS="--kiosk --no-first-run --disable-infobars --disable-session-crashed-bubble --disable-extensions --disable-component-update --no-default-browser-check --start-fullscreen --window-size=${RESOLUTION} --window-position=0,0"
else
  log "ERROR: No supported browser found (Firefox/Midori/Chrome). Please install Firefox or Midori from local repo or via USB (dpkg -i)."
  echo "Server down, check cables | No browser available"
  exit 1
fi

log "Starting Kiosk Client..."
log "Configured server base: $SERVER_BASE"

# Optional centralized config sourcing (e.g., from a local fileshare mounted at /mnt/kiosk-config)
if [[ -d /etc/kiosk-client.d ]]; then
  for f in /etc/kiosk-client.d/*.conf; do [[ -f "$f" ]] && . "$f"; done
fi
if [[ -d /mnt/kiosk-config ]]; then
  for f in /mnt/kiosk-config/*.conf; do [[ -f "$f" ]] && . "$f"; done
fi

# Offline fallback page path
OFFLINE_PAGE_SYSTEM="/usr/local/share/kiosk/offline.html"
OFFLINE_PAGE_USER="$HOME/.local/share/kiosk/offline.html"
[[ -f "$OFFLINE_PAGE_SYSTEM" ]] && OFFLINE_PAGE="$OFFLINE_PAGE_SYSTEM" || OFFLINE_PAGE="$OFFLINE_PAGE_USER"
if [[ ! -f "$OFFLINE_PAGE" ]]; then
  mkdir -p "$(dirname "$OFFLINE_PAGE_USER")" 2>/dev/null || true
  cat > "$OFFLINE_PAGE_USER" << 'EOF_LOCAL_OFFLINE'
<!DOCTYPE html><html><body style="font-family:sans-serif;background:#111;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center">
<div><h1>Servers unavailable</h1><p>Server down, check cables.</p></div></body></html>
EOF_LOCAL_OFFLINE
  OFFLINE_PAGE="$OFFLINE_PAGE_USER"
fi

# Ensure curl is available to fetch config
if ! command_exists "curl"; then
  log "curl not found. Attempting to install (offline-friendly)..."
  sudo apt-get update && sudo apt-get install -y curl || true
  if ! command_exists curl; then
    log "WARN: curl still not available; network fetches may fail."
  fi
fi

# Helper to fetch the current kioskUrl from the server
fetch_kiosk_url() {
  local cfg url
  if [[ -z "$ACTIVE_SERVER" ]]; then return 1; fi
  cfg=$(curl -fsS --connect-timeout 2 --max-time 4 "$ACTIVE_SERVER/api/config") || return 1
  url=$(echo "$cfg" | sed -n 's/.*"kioskUrl"\s*:\s*"\([^"]*\)".*/\1/p')
  echo "$url"
}

# File to store the last used URL locally
# Use HOME for reliable expansion (avoid quoting ~ which prevents expansion)
LAST_URL_FILE="$HOME/.kiosk_last_url"

# Helper to save the last used URL
save_last_url() {
  if [[ -n "$1" ]]; then
    echo "$1" > "$LAST_URL_FILE"
    echo "Saved last URL: $1"
  fi
}

# Helper to load the last used URL
load_last_url() {
  if [[ -f "$LAST_URL_FILE" ]]; then
    cat "$LAST_URL_FILE"
  else
    echo ""
  fi
}

# Select active server with failover
ACTIVE_SERVER=$(choose_server)
if [[ -z "$ACTIVE_SERVER" ]]; then
  log "ERROR: Unable to reach any configured servers ($SERVER_BASE, ${SERVER_CANDIDATES[*]})."
  log "Showing offline fallback page."
  KIOSK_URL="file://$OFFLINE_PAGE"
else
  log "Active server selected: $ACTIVE_SERVER"
  # Get initial kiosk URL (may be empty)
  KIOSK_URL=$(fetch_kiosk_url)
fi
if [[ -z "$KIOSK_URL" ]]; then
  log "WARNING: kioskUrl is empty/unavailable. Trying to load last used URL."
  KIOSK_URL=$(load_last_url)
  if [[ -n "$KIOSK_URL" ]]; then
    log "Loaded last used URL: $KIOSK_URL"
  else
    log "No last URL found. Falling back to offline page."
    KIOSK_URL="file://$OFFLINE_PAGE"
  fi
else
  # Save the fetched URL as the last used one
  save_last_url "$KIOSK_URL"
fi

# Clean up previous session state to prevent popups
if [[ "$BROWSER_EXECUTABLE" == "google-chrome" ]]; then
  echo "Cleaning up previous Chrome session state..."
  rm -rf ~/.config/google-chrome/Default/Preferences
fi

log "Press Ctrl+C in this terminal to stop the kiosk script."
log "To exit kiosk mode, press Ctrl+Alt+Shift+Q - this will close the browser."

launch_browser() {
  log "Launching browser in kiosk mode for: $KIOSK_URL_RUNNING"
  "$BROWSER_EXECUTABLE" $BROWSER_ARGS "$KIOSK_URL_RUNNING" &
  BROWSER_PID=$!
}

is_running() {
  kill -0 "$BROWSER_PID" >/dev/null 2>&1
}

# Track the currently running URL
KIOSK_URL_RUNNING="$KIOSK_URL"
if [[ -z "$KIOSK_URL_RUNNING" ]]; then
  KIOSK_URL_RUNNING=$(fetch_kiosk_url)
fi

if [[ -z "$KIOSK_URL_RUNNING" ]]; then
  log "Waiting for kioskUrl to be set on server or using offline page..."
fi

launch_browser

# Monitor for changes and process health
while true; do
  sleep 10

  # Re-evaluate server reachability and switch if needed
  local prev_server="$ACTIVE_SERVER"
  ACTIVE_SERVER=$(choose_server) || true
  if [[ -z "$ACTIVE_SERVER" ]]; then
    NEW_URL="file://$OFFLINE_PAGE"
    if [[ "$KIOSK_URL_RUNNING" != "$NEW_URL" ]]; then
      log "Both servers unreachable. Switching to offline page."
    fi
  else
    if [[ "$ACTIVE_SERVER" != "$prev_server" ]]; then
      log "Server switched: $prev_server -> $ACTIVE_SERVER"
    fi
    # Get latest URL from server with active endpoint
    NEW_URL=$(fetch_kiosk_url)
  fi
  if [[ -n "$NEW_URL" && "$NEW_URL" != "$KIOSK_URL_RUNNING" ]]; then
    log "Detected kioskUrl change -> $NEW_URL"
    KIOSK_URL_RUNNING="$NEW_URL"
    save_last_url "$NEW_URL"
    if is_running; then
      log "Restarting browser to apply new URL..."
      kill "$BROWSER_PID" 2>/dev/null || true
      wait "$BROWSER_PID" 2>/dev/null || true
    fi
    launch_browser
    continue
  fi

  # Resource monitoring: if RAM usage >90% and Midori exists, switch to Midori
  if command_exists free && command_exists awk; then
    read -r _ total used freebuf shared buff cache avail < <(free -m | awk 'NR==2{print $1,$2,$3,$4,$5,$6,$7}')
    if [[ -n "$total" && -n "$avail" ]]; then
      used_pct=$(( ( (total - avail) * 100 ) / total ))
      if (( used_pct > 90 )) && command_exists midori && [[ "$BROWSER_EXECUTABLE" != "midori" ]]; then
        log "High memory usage (${used_pct}%). Switching to Midori for lighter footprint."
        BROWSER_EXECUTABLE="midori"
        BROWSER_ARGS="-e Fullscreen=1"
        if is_running; then
          kill "$BROWSER_PID" 2>/dev/null || true
          wait "$BROWSER_PID" 2>/dev/null || true
        fi
        launch_browser
        continue
      fi
    fi
  fi

  # Relaunch if the browser crashed/closed
  if ! is_running; then
    log "Browser not running. Relaunching..."
    launch_browser
  fi
done
