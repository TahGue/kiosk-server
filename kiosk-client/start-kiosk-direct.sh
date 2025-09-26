#!/bin/bash

# ==============================================================================
# Kiosk Client (Direct Mode): open the target website directly full-screen
# ==============================================================================
# This script asks the kiosk server for the configured kioskUrl and launches
# the browser straight to that URL (no /client page, no iframe). Use this when
# the target website blocks embedding via X-Frame-Options.
# ==============================================================================

# Base URL of your kiosk server (no trailing slash)
SERVER_BASE="http://192.168.0.178:4000"

# Do not run as root; GUI apps must run as the logged-in user
if [[ "$(id -u)" -eq 0 ]]; then
  echo "ERROR: Do not run this script with sudo. Run it as a regular user."
  exit 1
fi

# Helper: command exists
cmd() { command -v "$1" >/dev/null 2>&1; }

# Detect browser (prefer Firefox, fallback to Chrome; install Chrome if needed)
if cmd firefox; then
  BROWSER_EXEC="firefox"
  BROWSER_ARGS="-kiosk"
elif cmd google-chrome; then
  BROWSER_EXEC="google-chrome"
  BROWSER_ARGS="--kiosk --no-first-run --disable-infobars --disable-session-crashed-bubble"
else
  echo "No suitable browser found. Installing Google Chrome..."
  if ! cmd wget; then sudo apt-get update && sudo apt-get install -y wget; fi
  wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
  echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list >/dev/null
  sudo apt-get update && sudo apt-get install -y google-chrome-stable
  if ! cmd google-chrome; then
    echo "ERROR: Failed to install Google Chrome."
    exit 1
  fi
  BROWSER_EXEC="google-chrome"
  BROWSER_ARGS="--kiosk --no-first-run --disable-infobars --disable-session-crashed-bubble"
fi

# Fetch current kioskUrl from the server
CONFIG_JSON=$(curl -sf "$SERVER_BASE/api/config")
if [[ $? -ne 0 || -z "$CONFIG_JSON" ]]; then
  echo "ERROR: Could not contact kiosk server at $SERVER_BASE"
  exit 1
fi

# Extract kioskUrl from JSON without jq (simple sed/grep approach)
KIOSK_URL=$(echo "$CONFIG_JSON" | sed -n 's/.*"kioskUrl"\s*:\s*"\([^"]*\)".*/\1/p')
if [[ -z "$KIOSK_URL" ]]; then
  echo "ERROR: kioskUrl is empty on the server. Set it in the server UI or .env."
  exit 1
fi

echo "Launching kiosk to: $KIOSK_URL"

# Loop to keep browser up
while true; do
  "$BROWSER_EXEC" $BROWSER_ARGS "$KIOSK_URL"
  echo "Browser closed. Relaunching in 2 seconds..."
  sleep 2
  # Re-fetch URL in case it changed server-side
  CONFIG_JSON=$(curl -sf "$SERVER_BASE/api/config")
  NEW_URL=$(echo "$CONFIG_JSON" | sed -n 's/.*"kioskUrl"\s*:\s*"\([^"]*\)".*/\1/p')
  if [[ -n "$NEW_URL" ]]; then KIOSK_URL="$NEW_URL"; fi
done
