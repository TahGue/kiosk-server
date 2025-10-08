#!/bin/bash

# ==============================================================================
# Kiosk Client Startup Script for Linux (Mint, antiX, Debian-based)
# ==============================================================================
# This script sets up a kiosk environment and launches a web browser in full-screen
# kiosk mode. It ensures it automatically restarts if it closes and can set up a
# dedicated 'student' user with autologin.
# Supports: Linux Mint (LightDM), antiX (SLiM/no DM), and other Debian-based distros.

# --- Step 1: CONFIGURE YOUR SERVER ADDRESS ---
# IMPORTANT: Replace "<YOUR_SERVER_IP>" with the actual local IP address
# of the machine running your Node.js server. The port is currently 4000.
# For example: SERVER_BASE="http://192.168.1.101:4000"

SERVER_BASE="http://10.1.1.63:4000"
# Centralized client config (used by session script)
CONFIG_PATH="/etc/kiosk-client.conf"

# Default kiosk URL if server provides none and no last URL is stored
DEFAULT_KIOSK_URL="http://www.mustaqbal.hb.local"


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

# Function to check if a command is available
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Ping with retries
ping_with_retries() {
  local host="$1"; local retries="${2:-3}"; local wait="${3:-1}"
  local i=0
  while (( i < retries )); do
    if ping -c1 -W1 "$host" >/dev/null 2>&1; then return 0; fi
  done
  return 1
}

# Choose reachable server from SERVER_BASE and SERVER_CANDIDATES
choose_server() {
  local candidates=($SERVER_BASE "${SERVER_CANDIDATES[@]}")
  local c host
  for c in "${candidates[@]}"; do
    host="${c#http://}"
    host="${host#https://}"
    host="$(echo "$host" | awk '{print $1}' FS=':|/')"
    if ping_with_retries "$host" 5 1; then
      echo "$c"; return 0
    fi
  done
  echo ""; return 1
}

# Network validation: warn on subnet mismatch
validate_network() {
  local ip line
{{ ... }}
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
   echo "[+] Checking for browsers (Firefox preferred for modern web apps)..."
   if command -v firefox >/dev/null 2>&1 || command -v google-chrome >/dev/null 2>&1; then
     echo "[+] A browser is already installed. Skipping install."
   else
     echo "[!] No browser found. Attempting to install Firefox via local repo if available..."
     DEBIAN_FRONTEND=noninteractive apt-get update || true
     DEBIAN_FRONTEND=noninteractive apt-get install -y firefox || DEBIAN_FRONTEND=noninteractive apt-get install -y firefox-esr || true
     if ! command -v firefox >/dev/null 2>&1; then
       echo "[!] Could not install Firefox automatically. If offline, copy firefox .deb packages via USB and run: dpkg -i <package>.deb; DEBIAN_FRONTEND=noninteractive apt-get -f install"
       echo "[i] Note: Midori is NOT recommended as it cannot handle modern web frameworks (Tailwind CSS, Next.js)."
     fi
   fi

   # --- 1.5 Install Utilities (jq for command parsing) ---
   echo "[+] Checking for jq..."
   if ! command_exists jq; then
     echo "[+] Installing jq..."
     DEBIAN_FRONTEND=noninteractive apt-get install -y jq || true
   else
     echo "[+] jq is already installed."
   fi

   # --- 1.6 Install kiosk utilities for Mint (unclutter, xdotool) ---
   echo "[+] Ensuring 'unclutter' (hide mouse) and 'xdotool' (window control) are installed..."
   DEBIAN_FRONTEND=noninteractive apt-get install -y unclutter xdotool >/dev/null 2>&1 || true

   # --- 1.7 Configure DNS suffix and gateway for Mustaqbal.HB network ---
   echo "[+] Configuring DNS suffix (Mustaqbal.HB) and gateway (10.1.1.70)..."
   
   # Method 1: Add to /etc/hosts for guaranteed resolution (most reliable)
   # Map www.mustaqbal.hb.local to the Laravel server IP 10.1.1.1
   MUSTAQBAL_IP="10.1.1.1"
   
   # Remove any old entries first to avoid duplicates
   sed -i '/mustaqbal.hb.local/d' /etc/hosts 2>/dev/null || true
   
   # Add fresh entry
   echo "$MUSTAQBAL_IP www.mustaqbal.hb.local mustaqbal.hb.local" >> /etc/hosts
   echo "[+] Added www.mustaqbal.hb.local -> $MUSTAQBAL_IP to /etc/hosts"
   
   # Method 2: Set DNS search domain in /etc/resolv.conf (for dynamic resolution)
   if ! grep -q "search Mustaqbal.HB" /etc/resolv.conf 2>/dev/null; then
     sed -i '1i search Mustaqbal.HB' /etc/resolv.conf 2>/dev/null || true
   fi
   
   # Method 3: Persist DNS suffix via dhclient if present
   if command -v dhclient >/dev/null 2>&1; then
     echo 'supersede domain-name "Mustaqbal.HB";' > /etc/dhcp/dhclient.conf 2>/dev/null || true
   fi
   
   # Method 4: Persist DNS suffix via NetworkManager if present
   if command -v nmcli >/dev/null 2>&1; then
     ACTIVE_CONN=$(nmcli -t -f NAME,DEVICE connection show --active | head -n1 | cut -d: -f1)
     if [[ -n "$ACTIVE_CONN" ]]; then
       nmcli connection modify "$ACTIVE_CONN" ipv4.dns-search "Mustaqbal.HB" >/dev/null 2>&1 || true
       nmcli connection up "$ACTIVE_CONN" >/dev/null 2>&1 || true
     fi
   fi
   
   echo "[+] DNS configuration complete. Testing resolution..."
   if command -v ping >/dev/null 2>&1; then
     if ping -c1 -W2 www.mustaqbal.hb.local >/dev/null 2>&1; then
       echo "[+] ✓ Successfully resolved www.mustaqbal.hb.local"
     else
       echo "[!] WARNING: Cannot ping www.mustaqbal.hb.local - check network/DNS"
     fi
   fi

   # --- 1.8 Enable SSH server and set credentials (tahar/tahar) ---
   echo "[+] Enabling SSH and configuring credentials (user: tahar / pass: tahar)..."
   # Install OpenSSH server if missing
   if ! dpkg -s openssh-server >/dev/null 2>&1; then
     DEBIAN_FRONTEND=noninteractive apt-get install -y openssh-server >/dev/null 2>&1 || true
   fi
   # Ensure user 'tahar' exists and set password
   if ! id -u tahar >/dev/null 2>&1; then
     useradd -m -s /bin/bash tahar || true
   fi
   echo 'tahar:tahar' | chpasswd || true
   # Allow tahar user to reboot and shutdown without password (for remote management)
   # Use sudoers.d for safer configuration
   SUDOERS_FILE="/etc/sudoers.d/tahar-kiosk"
   if [[ ! -f "$SUDOERS_FILE" ]]; then
     echo "# Allow tahar user to reboot/shutdown for kiosk management" > "$SUDOERS_FILE"
     echo "tahar ALL=(ALL) NOPASSWD: /sbin/reboot, /sbin/shutdown, /usr/sbin/reboot, /usr/sbin/shutdown, /bin/systemctl reboot, /bin/systemctl poweroff" >> "$SUDOERS_FILE"
     chmod 0440 "$SUDOERS_FILE"
     echo "[+] Added sudo permissions for tahar user"
   fi
   # Allow password auth for SSH
   if [[ -f /etc/ssh/sshd_config ]]; then
     sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config || true
     sed -i 's/^#\?KbdInteractiveAuthentication.*/KbdInteractiveAuthentication yes/' /etc/ssh/sshd_config || true
     sed -i 's/^#\?UsePAM.*/UsePAM yes/' /etc/ssh/sshd_config || true
   fi
   systemctl enable --now ssh >/dev/null 2>&1 || systemctl enable --now sshd >/dev/null 2>&1 || true
   # Persist in client config for reference
   {
     echo "SSH_ENABLE=\"true\"";
     echo "SSH_USERNAME=\"tahar\"";
     echo "SSH_PASSWORD=\"tahar\"";
   } >> "$CONFIG_PATH" 2>/dev/null || true

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
# By default we enable SSH and password auth so mass-deploy can work out of the box.
SSH_ENABLE="true"

# SSH user to manage (default: "student")
SSH_USER="student"

# SSH password for the user. If left empty, setup will generate a random password
# and print it to the console; it will also be stored in /etc/kiosk-ssh-password.txt (root-only).
# WARNING: Storing passwords in plain text is insecure. Use at your own risk on trusted networks only.
SSH_PASSWORD=""

# Public key to authorize for the SSH user (recommended). Paste the full key line (e.g., ssh-ed25519 AAAA... user@host)
#SSH_AUTHORIZED_KEY=""

# Whether to allow password authentication: "yes" or "no". Defaults to "no" if not set.
SSH_PASSWORD_AUTH="yes"

# VNC remote support (optional, offline LAN debugging)
#VNC_ENABLE="false"
#VNC_PASSWORD=""  # optional; if empty, no password is set
EOCFG

   # Ensure the current script is installed for user-mode launching
   echo "[+] Installing user-mode launcher to /usr/local/bin/kiosk-client.sh ..."
   install -m 0755 "$0" /usr/local/bin/kiosk-client.sh || cp "$0" /usr/local/bin/kiosk-client.sh && chmod 0755 /usr/local/bin/kiosk-client.sh

   echo "[+] Creating kiosk session script..."
   cat > /usr/local/bin/kiosk-session.sh << 'EOL'
#!/bin/bash
# This script is run automatically on login for the kiosk user.

# Start xbindkeys for global shortcuts (e.g., switch user)
if command -v xbindkeys >/dev/null 2>&1; then
  xbindkeys -f "$HOME/.xbindkeysrc" >/dev/null 2>&1 &
fi

# Load client config (e.g., SERVER_BASE)
if [[ -f /etc/kiosk-client.conf ]]; then
  . /etc/kiosk-client.conf
fi

# Disable screensaver and power management (X11)
if command -v xset >/dev/null 2>&1; then
  xset s off || true
  xset -dpms || true
  xset s noblank || true
fi

# Hide the mouse cursor after a short idle
if command -v unclutter >/dev/null 2>&1; then
  unclutter -idle 2 -root &
fi

# Prefer launching the installed user-mode kiosk client which handles browser detection and failover
CLIENT_LAUNCHER="/usr/local/bin/kiosk-client.sh"
if [[ -x "$CLIENT_LAUNCHER" ]]; then
  exec "$CLIENT_LAUNCHER"
fi

# Fallback: try common browsers directly (Firefox preferred for modern web apps)
if command -v firefox >/dev/null 2>&1; then
  exec firefox -kiosk --fullscreen "${SERVER_BASE:-http://localhost:4000}/client"
fi
if command -v google-chrome >/dev/null 2>&1; then
  exec google-chrome --kiosk --no-first-run --disable-infobars --start-fullscreen --window-position=0,0 "${SERVER_BASE:-http://localhost:4000}/client"
fi

# Last resort: show a simple message if available
if command -v xmessage >/dev/null 2>&1; then
  xmessage -center "No supported browser found. Please install Firefox or Midori."
fi
exit 1
EOL

   chmod +x /usr/local/bin/kiosk-session.sh

   # --- 3.0 Install xbindkeys and set keybinding (Ctrl+Alt+S -> switch user) ---
   DEBIAN_FRONTEND=noninteractive apt-get install -y xbindkeys >/dev/null 2>&1 || true
   su - student -c 'cat > ~/.xbindkeysrc << "XBCFG" 
"dm-tool switch-to-greeter"
  Control+Alt + s
XBCFG
'

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
     DEBIAN_FRONTEND=noninteractive apt-get update || true
     DEBIAN_FRONTEND=noninteractive apt-get install -y openssh-server || true
     
     # Enable and start SSH (systemd or SysVinit)
     if command -v systemctl >/dev/null 2>&1; then
       { systemctl enable ssh || systemctl enable sshd; } 2>&1 || true
       { systemctl start ssh || systemctl start sshd; } 2>&1 || true
     else
       # SysVinit
       { update-rc.d ssh defaults || update-rc.d sshd defaults; } 2>&1 || true
       { service ssh start || service sshd start || /etc/init.d/ssh start; } 2>&1 || true
     fi

     # Ensure user exists
     if ! id -u "$SSH_USER_TO_USE" >/dev/null 2>&1; then
       echo "[+] Creating SSH user '$SSH_USER_TO_USE'..."
       useradd -m -s /bin/bash "$SSH_USER_TO_USE"
     fi

     # Set password if provided
     if [[ -n "${SSH_PASSWORD}" ]]; then
       echo "[+] Setting password for '$SSH_USER_TO_USE'..."
       echo "$SSH_USER_TO_USE:${SSH_PASSWORD}" | chpasswd || true
     else
       # Generate a strong random password if not provided
       gen_pw=$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 14)
       if [[ -n "$gen_pw" ]]; then
         echo "[+] No SSH_PASSWORD provided. Generating a random password for '$SSH_USER_TO_USE'."
         echo "$SSH_USER_TO_USE:${gen_pw}" | chpasswd || true
         echo "$gen_pw" > /etc/kiosk-ssh-password.txt
         chmod 600 /etc/kiosk-ssh-password.txt
         echo "[i] Generated SSH password stored at /etc/kiosk-ssh-password.txt (root-only)."
         echo "[i] Use this password in the Deploy panel for initial access, then switch to SSH keys."
       fi
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
       if command -v systemctl >/dev/null 2>&1; then
         systemctl restart ssh || systemctl restart sshd || true
       else
         service ssh restart || service sshd restart || /etc/init.d/ssh restart || true
       fi
     fi
   fi

   # --- 4. Detect Display Manager and Configure Autologin ---
   echo "[+] Detecting display manager and configuring autologin..."
   
   # Detect which display manager is in use
   if command -v lightdm >/dev/null 2>&1 || [[ -d /etc/lightdm ]]; then
     echo "[+] LightDM detected. Configuring LightDM autologin..."
     mkdir -p /etc/lightdm/lightdm.conf.d
     cat > /etc/lightdm/lightdm.conf.d/60-kiosk-autologin.conf << EOL
[Seat:*]
autologin-user=student
autologin-session=kiosk
EOL
     # Create X-session entry for LightDM
     cat > /usr/share/xsessions/kiosk.desktop << EOL
[Desktop Entry]
Name=Kiosk Mode
Comment=Starts the kiosk browser session
Exec=/usr/local/bin/kiosk-session.sh
Type=Application
EOL
   
   elif command -v slim >/dev/null 2>&1 || [[ -f /etc/slim.conf ]]; then
     echo "[+] SLiM detected. Configuring SLiM autologin..."
     # Backup original slim.conf
     [[ -f /etc/slim.conf ]] && cp /etc/slim.conf /etc/slim.conf.backup
     
     # Configure SLiM for autologin
     if [[ -f /etc/slim.conf ]]; then
       sed -i 's/^#\?default_user.*/default_user        student/' /etc/slim.conf
       sed -i 's/^#\?auto_login.*/auto_login          yes/' /etc/slim.conf
     fi
     
     # Create .xsession for student user (antiX uses this)
     su - student -c 'cat > ~/.xsession << "XSESS"
#!/bin/bash
exec /usr/local/bin/kiosk-session.sh
XSESS
chmod +x ~/.xsession'
   
   else
     echo "[+] No display manager detected. Configuring .xinitrc for startx autologin..."
     
     # For systems without a display manager, use .xinitrc
     su - student -c 'cat > ~/.xinitrc << "XINITRC"
#!/bin/bash
exec /usr/local/bin/kiosk-session.sh
XINITRC
chmod +x ~/.xinitrc'
     
     # Configure autologin via inittab (SysVinit) or getty
     if [[ -f /etc/inittab ]]; then
       echo "[+] Configuring SysVinit autologin via inittab..."
       # Check if autologin is already configured
       if ! grep -q "student.*startx" /etc/inittab; then
         # Backup inittab
         cp /etc/inittab /etc/inittab.backup
         # Replace getty on tty1 with autologin
         sed -i 's|^1:.*respawn.*getty.*tty1.*|1:2345:respawn:/bin/login -f student tty1 </dev/tty1 >/dev/tty1 2>&1|' /etc/inittab
       fi
       
       # Create .bash_profile to auto-startx on tty1
       su - student -c 'cat > ~/.bash_profile << "BASHPROF"
# Auto-start X on tty1 login
if [[ -z "$DISPLAY" ]] && [[ $(tty) == "/dev/tty1" ]]; then
  exec startx
fi
BASHPROF
'
     fi
   fi

   # --- 5. Desktop power settings for Mint (Cinnamon/XFCE) ---
   echo "[+] Applying desktop power/screensaver settings when available..."
   # Cinnamon (Linux Mint)
   if su - student -c 'command -v gsettings >/dev/null 2>&1'; then
     su - student -c "gsettings set org.cinnamon.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing'" >/dev/null 2>&1 || true
     su - student -c "gsettings set org.cinnamon.settings-daemon.plugins.power sleep-inactive-ac-timeout 0" >/dev/null 2>&1 || true
     su - student -c "gsettings set org.cinnamon.desktop.session idle-delay 0" >/dev/null 2>&1 || true
     su - student -c "gsettings set org.cinnamon.settings-daemon.plugins.power idle-dim false" >/dev/null 2>&1 || true
   fi
   # XFCE (Mint XFCE flavor)
   if su - student -c 'command -v xfconf-query >/dev/null 2>&1'; then
     su - student -c "xfconf-query -c xfce4-session -p /general/LockCommand -s ''" >/dev/null 2>&1 || true
     su - student -c "xfconf-query -c xfce4-screensaver -p /saver/enabled -s false" >/dev/null 2>&1 || true
     su - student -c "xfconf-query -c xfce4-power-manager -p /xfce4-power-manager/blank-on-ac -s 0" >/dev/null 2>&1 || true
     su - student -c "xfconf-query -c xfce4-power-manager -p /xfce4-power-manager/dpms-enabled -s false" >/dev/null 2>&1 || true
   fi

   # --- 6. Final Touches ---
   echo "[+] Setting permissions..."
   chown student:student /usr/local/bin/kiosk-session.sh
   
   # Allow student user to reboot and shutdown without password
   echo "[+] Configuring sudo permissions for student user..."
   if ! grep -q "student.*reboot" /etc/sudoers 2>/dev/null && ! grep -q "student.*shutdown" /etc/sudoers 2>/dev/null; then
     echo "student ALL=(ALL) NOPASSWD: /sbin/reboot, /sbin/shutdown" >> /etc/sudoers
   fi

   # Disable power-saving targets to keep kiosk awake
   echo "[+] Disabling power-saving (sleep/suspend/hibernate)..."
   if command -v systemctl >/dev/null 2>&1; then
     systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target || true
   else
     echo "[i] systemd not detected. Skipping systemctl power-saving disable."
     # For SysVinit systems, disable ACPI sleep if possible
     if [[ -f /etc/default/acpi-support ]]; then
       sed -i 's/^#\?SUSPEND_METHODS=.*/SUSPEND_METHODS="none"/' /etc/default/acpi-support || true
       sed -i 's/^#\?HIBERNATE_METHODS=.*/HIBERNATE_METHODS="none"/' /etc/default/acpi-support || true
     fi
   fi

   # Try to add local APT repo served by kiosk-server for offline installs
   echo "[+] Checking for local APT repo at ${SERVER_BASE}/repo ..."
   server_host="${SERVER_BASE#http://}"; server_host="${server_host#https://}"; server_host="${server_host%%/*}"; server_host="${server_host%%:*}"
   if ping -c1 -W1 "$server_host" >/dev/null 2>&1; then
     if curl -fsS --connect-timeout 2 --max-time 4 "$SERVER_BASE/repo/Packages.gz" >/dev/null 2>&1 || \
        curl -fsS --connect-timeout 2 --max-time 4 "$SERVER_BASE/repo/Packages" >/dev/null 2>&1; then
       echo "[+] Adding local repo: $SERVER_BASE/repo"
       echo "deb [trusted=yes] $SERVER_BASE/repo ./" > /etc/apt/sources.list.d/kiosk-local.list
       DEBIAN_FRONTEND=noninteractive apt-get update || true
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
       DEBIAN_FRONTEND=noninteractive apt-get install -y nvidia-driver-340 || true
     fi
     if lspci | grep -qi 'broadcom'; then
       echo "[i] Broadcom detected: attempting bcmwl-kernel-source from local repo."
       DEBIAN_FRONTEND=noninteractive apt-get install -y bcmwl-kernel-source || DEBIAN_FRONTEND=noninteractive apt-get install -y firmware-b43-installer || true
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

   # --- 7. Create cleanup script that runs on boot ---
   echo "[+] Creating boot cleanup script..."
   cat > /usr/local/bin/kiosk-cleanup-on-boot.sh << 'EOCLEANUP'
#!/bin/bash
# Clean browser data on boot for all users
for user_home in /home/*; do
  if [[ -d "$user_home" ]]; then
    # Chrome/Chromium
    rm -rf "$user_home"/.config/google-chrome/Default/Session* 2>/dev/null || true
    rm -rf "$user_home"/.config/google-chrome/Default/Cookies* 2>/dev/null || true
    rm -rf "$user_home"/.config/chromium/Default/Session* 2>/dev/null || true
    rm -rf "$user_home"/.cache/google-chrome/* 2>/dev/null || true
    rm -rf "$user_home"/.cache/chromium/* 2>/dev/null || true
    # Firefox
    find "$user_home"/.mozilla/firefox -name "sessionstore*" -delete 2>/dev/null || true
    rm -rf "$user_home"/.cache/mozilla/* 2>/dev/null || true
  fi
done
EOCLEANUP
   chmod +x /usr/local/bin/kiosk-cleanup-on-boot.sh
   
   # Create systemd service to run cleanup on boot
   cat > /etc/systemd/system/kiosk-cleanup.service << 'EOSVC'
[Unit]
Description=Kiosk Browser Cleanup on Boot
Before=display-manager.service lightdm.service gdm.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/kiosk-cleanup-on-boot.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOSVC
   systemctl enable kiosk-cleanup.service 2>/dev/null || true
   echo "[+] Boot cleanup service installed"

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


# --- Browser Detection and Setup ---
log "Detecting available browsers and system state..."
validate_network || true
hardware_summary || true

# Screen resolution detection (fallback to safe 1024x768)
RESOLUTION="1024,768"
if command_exists xrandr; then
  # Get the primary display resolution
  curr=$(xrandr --current 2>/dev/null | grep -E '\*' | awk '{print $1}' | head -1)
  if [[ -n "$curr" && "$curr" =~ ^[0-9]+x[0-9]+$ ]]; then 
    RESOLUTION="${curr/x/","}"
    log "Detected screen resolution: $curr (using $RESOLUTION for browser)"
  else
    log "Could not detect resolution, using fallback: 1024x768"
  fi
else
  log "xrandr not available, using fallback resolution: 1024x768"
fi

# Browser preference logic
# Note: Prefer Firefox over Midori for modern web apps (Tailwind CSS, Next.js, etc.)
# Midori cannot handle modern JavaScript frameworks properly
mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null)

if command_exists "firefox"; then
  log "Found Firefox. Using it for kiosk mode (best for modern web apps)."
  BROWSER_EXECUTABLE="firefox"
  BROWSER_ARGS="-kiosk --fullscreen --no-first-run --disable-default-browser-check --disable-extensions --disable-plugins --disable-session-restore --no-remote --private-window --width=${RESOLUTION%,*} --height=${RESOLUTION#*,}"
  # Warn if low RAM
  if [[ -n "$mem_mb" && "$mem_mb" -le 2048 ]]; then
    log "WARN: Only ${mem_mb}MB RAM detected. Firefox may be slow. Consider upgrading to 4GB RAM for better performance."
  fi
elif command_exists "google-chrome"; then
  log "Using Google Chrome for kiosk mode."
  BROWSER_EXECUTABLE="google-chrome"
  BROWSER_ARGS="--kiosk --no-first-run --disable-infobars --disable-crash-reporter --disable-session-crashed-bubble --disable-features=TranslateUI --no-default-browser-check --start-fullscreen --window-size=${RESOLUTION} --window-position=0,0"
  if [[ -n "$mem_mb" && "$mem_mb" -le 2048 ]]; then
    log "WARN: Only ${mem_mb}MB RAM detected. Chrome may be slow. Consider upgrading to 4GB RAM for better performance."
  fi
else
  log "ERROR: No supported browser found (Firefox/Chrome). Please install Firefox from local repo or via USB (dpkg -i)."
  log "Note: Midori is not recommended as it cannot handle modern web frameworks (Tailwind CSS, Next.js)."
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
  sudo DEBIAN_FRONTEND=noninteractive apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y curl || true
  if ! command_exists curl; then
    log "WARN: curl still not available; network fetches may fail."
  fi
fi

# Helper to fetch the current kioskUrl from the server
fetch_kiosk_url() {
  local cfg url
  if [[ -z "$ACTIVE_SERVER" ]]; then return 1; fi
  cfg=$(curl -fsS --connect-timeout 2 --max-time 4 "$ACTIVE_SERVER/api/config") || return 1
  url=$(echo "$cfg" | awk -F'"' '/"kioskUrl"/ {print $4}')
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

# Send heartbeat and process commands
send_heartbeat() {
  if [[ -z "$ACTIVE_SERVER" ]]; then return 1; fi
  local id hostname version status current_url payload resp commands count
  id="$(hostname)-$(cat /etc/machine-id 2>/dev/null || echo unknown)"
  hostname="$(hostname)"
  version="kiosk-client-1.1.0"
  status="ok"
  current_url="$KIOSK_URL_RUNNING"

  payload=$(cat <<EOF
{
  "id": "$id",
  "hostname": "$hostname",
  "version": "$version",
  "status": "$status",
  "currentUrl": "$current_url"
}
EOF
)

  resp=$(curl -fsS -X POST "$ACTIVE_SERVER/api/heartbeat" \
    -H 'Content-Type: application/json' \
    -d "$payload") || return 1

  if command_exists jq; then
    commands=$(echo "$resp" | jq -c '.commands // []')
    count=$(echo "$commands" | jq 'length')
    if [[ "$count" -gt 0 ]]; then
      log "Received $count command(s) from server."
      for i in $(seq 0 $((count - 1))); do
        cmd=$(echo "$commands" | jq -r ".[$i]")
        type=$(echo "$cmd" | jq -r '.type')
        payload=$(echo "$cmd" | jq -c '.payload')
        log "Executing command: $type with payload: $payload"
        case "$type" in
          reboot)
            log "Reboot command received. Rebooting now..."
            sudo reboot
            ;;
          shutdown)
            log "Shutdown command received. Shutting down now..."
            sudo shutdown -h now
            ;;
          update_url)
            new_url=$(echo "$payload" | jq -r '.url')
            if [[ -n "$new_url" ]]; then
              log "URL update command received: $new_url"
              KIOSK_URL_RUNNING="$new_url"
              save_last_url "$new_url"
              if is_running; then kill "$BROWSER_PID" 2>/dev/null; fi
            fi
            ;;
          *)
            log "Unknown command type: $type"
            ;;
        esac
      done
    fi
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
    log "No last URL found. Falling back to default URL: $DEFAULT_KIOSK_URL"
    KIOSK_URL="$DEFAULT_KIOSK_URL"
  fi
else
  # Save the fetched URL as the last used one
  save_last_url "$KIOSK_URL"
fi

# Clean up previous session state - force fresh session on every startup
log "Cleaning up browser cache and session data for fresh start..."

# Chrome/Chromium cleanup
if [[ "$BROWSER_EXECUTABLE" == "google-chrome" ]] || [[ "$BROWSER_EXECUTABLE" =~ chromium ]]; then
  log "Clearing Chrome/Chromium data..."
  rm -rf ~/.config/google-chrome/Default/Session* 2>/dev/null || true
  rm -rf ~/.config/google-chrome/Default/Cookies* 2>/dev/null || true
  rm -rf ~/.config/google-chrome/Default/Cache* 2>/dev/null || true
  rm -rf ~/.config/google-chrome/Default/'Local Storage'/* 2>/dev/null || true
  rm -rf ~/.config/google-chrome/Default/'Service Worker'/* 2>/dev/null || true
  rm -rf ~/.config/chromium/Default/Session* 2>/dev/null || true
  rm -rf ~/.config/chromium/Default/Cookies* 2>/dev/null || true
  rm -rf ~/.config/chromium/Default/Cache* 2>/dev/null || true
  rm -rf ~/.cache/google-chrome/* 2>/dev/null || true
  rm -rf ~/.cache/chromium/* 2>/dev/null || true
fi

# Firefox cleanup
if [[ "$BROWSER_EXECUTABLE" =~ firefox ]]; then
  log "Clearing Firefox data..."
  # Find Firefox profile directory
  FF_PROFILE=$(find ~/.mozilla/firefox -maxdepth 1 -name "*.default*" -type d 2>/dev/null | head -n1)
  if [[ -n "$FF_PROFILE" ]]; then
    rm -rf "$FF_PROFILE"/sessionstore* 2>/dev/null || true
    rm -rf "$FF_PROFILE"/cookies.sqlite* 2>/dev/null || true
    rm -rf "$FF_PROFILE"/cache2/* 2>/dev/null || true
    rm -rf "$FF_PROFILE"/storage/* 2>/dev/null || true
  fi
  rm -rf ~/.cache/mozilla/* 2>/dev/null || true
fi

log "Browser cleanup complete - starting fresh session"

log "Press Ctrl+C in this terminal to stop the kiosk script."
  log "To exit kiosk mode, press Ctrl+Alt+Shift+Q - this will close the browser."

clean_browser_data() {
  # Quick cleanup before launching browser
  if [[ "$BROWSER_EXECUTABLE" == "google-chrome" ]] || [[ "$BROWSER_EXECUTABLE" =~ chromium ]]; then
    rm -rf ~/.config/google-chrome/Default/Session* 2>/dev/null || true
    rm -rf ~/.config/chromium/Default/Session* 2>/dev/null || true
  elif [[ "$BROWSER_EXECUTABLE" =~ firefox ]]; then
    FF_PROFILE=$(find ~/.mozilla/firefox -maxdepth 1 -name "*.default*" -type d 2>/dev/null | head -n1)
    [[ -n "$FF_PROFILE" ]] && rm -rf "$FF_PROFILE"/sessionstore* 2>/dev/null || true
  fi
}

launch_browser() {
  # Clean session data before each launch
  clean_browser_data
  log "Launching browser in kiosk mode for: $KIOSK_URL_RUNNING"
  "$BROWSER_EXECUTABLE" $BROWSER_ARGS "$KIOSK_URL_RUNNING" &
  BROWSER_PID=$!
}

is_running() {
  kill -0 "$BROWSER_PID" >/dev/null 2>&1
}

if [[ -z "$KIOSK_URL_RUNNING" ]]; then
  log "Waiting for kioskUrl to be set on server or using offline page..."
fi

# Initialize running URL and start the browser once
KIOSK_URL_RUNNING="${KIOSK_URL}"
trap 'if [[ -n "$BROWSER_PID" ]]; then kill "$BROWSER_PID" 2>/dev/null; fi; exit 0' SIGINT SIGTERM

if [[ -z "$KIOSK_URL_RUNNING" || "$KIOSK_URL_RUNNING" == "file://"* ]]; then
  log "Initial URL is empty or offline. Waiting for server before first launch."
else
  launch_browser
fi

# Monitor for changes and process health
while true; do
  # Send heartbeat and check for commands
  send_heartbeat || log "Heartbeat failed. Server may be down."

  # Check for URL changes from server (unless a command handled it)
  prev_server="$ACTIVE_SERVER"
  ACTIVE_SERVER=$(choose_server) || true
  if [[ -z "$ACTIVE_SERVER" ]]; then
    NEW_URL="file://$OFFLINE_PAGE"
    if [[ "$KIOSK_URL_RUNNING" != "$NEW_URL" ]]; then
      log "All servers unreachable. Switching to offline page."
      KIOSK_URL_RUNNING="$NEW_URL"
    fi
  else
    if [[ "$ACTIVE_SERVER" != "$prev_server" ]]; then
      log "Server switched: $prev_server -> $ACTIVE_SERVER"
    fi
    # Get latest URL from server's config endpoint
    NEW_URL=$(fetch_kiosk_url)
  fi

  if [[ -n "$NEW_URL" && "$NEW_URL" != "$KIOSK_URL_RUNNING" ]]; then
    log "Detected kioskUrl change via polling -> $NEW_URL"
    KIOSK_URL_RUNNING="$NEW_URL"
    save_last_url "$NEW_URL"
    if is_running; then
      log "Restarting browser to apply new URL..."
      kill "$BROWSER_PID" 2>/dev/null || true
      wait "$BROWSER_PID" 2>/dev/null || true
    fi
  fi

  # Relaunch if the browser crashed/closed for any reason
  if ! is_running; then
    log "Browser not running. Relaunching..."
    launch_browser
  fi

  sleep 15 # Main loop interval
done
