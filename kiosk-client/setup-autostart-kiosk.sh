#!/bin/bash

# ==============================================================================
# Fully Automatic Kiosk Setup Script for Linux (Mint, antiX, Debian-based)
# ==============================================================================
# This script configures the entire system to boot directly into a full-screen
# browser kiosk. It creates a dedicated user and an auto-starting session.
# Supports: Linux Mint (LightDM), antiX (SLiM/no DM), and other Debian-based distros.
#
# WARNING: This script will modify system files. Run it only on a machine
#          that you intend to use as a dedicated kiosk.
# ==============================================================================

# --- Step 1: CONFIGURE YOUR SERVER ADDRESS ---
# The IP address of the machine running your Node.js server.
SERVER_URL="http://192.168.0.178:4000/client"


# --- Script Execution (No need to edit below this line) ---

# Must be run as root
if [[ "$(id -u)" -ne 0 ]]; then
   echo "ERROR: This script must be run as root. Please use 'sudo ./setup-autostart-kiosk.sh'"
   exit 1
fi

# --- 1. Install Browser ---
echo "[+] Installing browser..."
# Add Google's official repository to avoid snapd issues on Mint
if ! command -v google-chrome >/dev/null; then
  if ! command -v wget >/dev/null; then apt-get update && apt-get install -y wget; fi
  wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add -
  sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list'
  apt-get update
  apt-get install -y google-chrome-stable
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

# --- 3. Create the Kiosk Session Script ---
echo "[+] Creating kiosk session script..."
cat > /usr/local/bin/kiosk-session.sh << EOL
#!/bin/bash
# This script is run automatically on login for the kiosk user.

# Clean up previous session state to prevent popups
rm -rf ~/.config/google-chrome/Default/Preferences

# Infinite loop to keep the browser running
while true; do
  google-chrome --kiosk --no-first-run --disable-infobars $SERVER_URL
  sleep 2
done
EOL

chmod +x /usr/local/bin/kiosk-session.sh

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

# --- 6. Final Touches ---
echo "[+] Setting permissions..."
chown student:student /usr/local/bin/kiosk-session.sh

echo "[+] Setup complete!"
echo "[+] Please reboot the machine now. It will automatically boot into the kiosk."
