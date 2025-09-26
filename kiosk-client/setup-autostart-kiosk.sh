#!/bin/bash

# ==============================================================================
# Fully Automatic Kiosk Setup Script for Linux Mint
# ==============================================================================
# This script configures the entire system to boot directly into a full-screen
# browser kiosk. It creates a dedicated user and an auto-starting session.
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

echo "[+] Setup complete!"
echo "[+] Please reboot the machine now. It will automatically boot into the kiosk."
