#!/bin/bash
# ============================================
# Mustaqbal Mass Deployment Script
# Deploy kiosk to 50-100 AntiX machines
# All credentials: tahar/tahar
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
SERVER_IP="${SERVER_IP:-$(hostname -I | awk '{print $1}')}"
SERVER_PORT="${SERVER_PORT:-4000}"
SSH_USER="tahar"
SSH_PASS="tahar"
DOMAIN="mustaqbal.local"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CLIENT_SCRIPT="$PROJECT_ROOT/../kiosk-client/start-kiosk-antix.sh"

log() {
  echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $*"
}

error() {
  echo -e "${RED}[ERROR]${NC} $*"
}

warn() {
  echo -e "${YELLOW}[WARN]${NC} $*"
}

# Check if sshpass is installed
if ! command -v sshpass &>/dev/null; then
  warn "sshpass not found, installing..."
  sudo apt-get update -qq && sudo apt-get install -y sshpass
fi

# Check if client script exists
if [ ! -f "$CLIENT_SCRIPT" ]; then
  error "Client script not found: $CLIENT_SCRIPT"
  exit 1
fi

echo "============================================"
echo "  MUSTAQBAL MASS DEPLOYMENT"
echo "============================================"
echo "Server IP: $SERVER_IP:$SERVER_PORT"
echo "SSH User: $SSH_USER"
echo "Domain: $DOMAIN"
echo "Client Script: $CLIENT_SCRIPT"
echo "============================================"
echo ""

# Method 1: Deploy to specific IP range
deploy_range() {
  local subnet="$1"
  local start="$2"
  local end="$3"
  
  log "Deploying to range: $subnet.$start-$end"
  
  for i in $(seq $start $end); do
    local ip="$subnet.$i"
    deploy_to_host "$ip"
  done
}

# Method 2: Deploy to specific list of IPs
deploy_list() {
  local ip_file="$1"
  
  if [ ! -f "$ip_file" ]; then
    error "IP list file not found: $ip_file"
    return 1
  fi
  
  log "Deploying to IPs from file: $ip_file"
  
  while IFS= read -r ip; do
    # Skip empty lines and comments
    [[ -z "$ip" || "$ip" =~ ^# ]] && continue
    deploy_to_host "$ip"
  done < "$ip_file"
}

# Method 3: Auto-discover and deploy
deploy_discovered() {
  log "Scanning network for AntiX hosts..."
  
  # Use server's scan API
  local devices=$(curl -s "http://localhost:$SERVER_PORT/api/lan/scan?mode=fast" | jq -r '.devices[].ip' 2>/dev/null)
  
  if [ -z "$devices" ]; then
    error "No devices found. Make sure server is running."
    return 1
  fi
  
  log "Found $(echo "$devices" | wc -l) devices"
  
  for ip in $devices; do
    deploy_to_host "$ip"
  done
}

# Deploy to a single host
deploy_to_host() {
  local ip="$1"
  
  echo ""
  log "Deploying to $ip..."
  
  # Test connection
  if ! ping -c 1 -W 2 "$ip" &>/dev/null; then
    warn "$ip - Not reachable, skipping"
    return 1
  fi
  
  # Test SSH
  if ! sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 \
    "$SSH_USER@$ip" "exit" 2>/dev/null; then
    warn "$ip - SSH failed, skipping"
    return 1
  fi
  
  # Copy client script
  log "$ip - Copying script..."
  sshpass -p "$SSH_PASS" scp -o StrictHostKeyChecking=no \
    "$CLIENT_SCRIPT" "$SSH_USER@$ip:/tmp/start-kiosk.sh" || {
    error "$ip - Failed to copy script"
    return 1
  }
  
  # Run setup
  log "$ip - Running setup..."
  sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$ip" \
    "export SERVER_IP='$SERVER_IP'; export SERVER_PORT='$SERVER_PORT'; sudo bash /tmp/start-kiosk.sh" || {
    error "$ip - Setup failed"
    return 1
  }
  
  log "$ip - ${GREEN}✓ Deployed successfully${NC}"
  
  # Optional: Reboot immediately
  if [ "$AUTO_REBOOT" = "yes" ]; then
    log "$ip - Rebooting..."
    sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$ip" \
      "sudo reboot" 2>/dev/null || true
  fi
  
  return 0
}

# Show menu
show_menu() {
  echo ""
  echo "Deployment Options:"
  echo "1) Deploy to IP range (e.g., 192.168.1.50-150)"
  echo "2) Deploy from IP list file"
  echo "3) Auto-discover and deploy to all devices"
  echo "4) Deploy to single IP"
  echo "5) Exit"
  echo ""
  read -p "Choose option (1-5): " choice
  
  case $choice in
    1)
      read -p "Enter subnet (e.g., 192.168.1): " subnet
      read -p "Start IP (last octet): " start
      read -p "End IP (last octet): " end
      read -p "Auto-reboot after deploy? (yes/no): " AUTO_REBOOT
      deploy_range "$subnet" "$start" "$end"
      ;;
    2)
      read -p "Enter IP list file path: " ip_file
      read -p "Auto-reboot after deploy? (yes/no): " AUTO_REBOOT
      deploy_list "$ip_file"
      ;;
    3)
      read -p "Auto-reboot after deploy? (yes/no): " AUTO_REBOOT
      deploy_discovered
      ;;
    4)
      read -p "Enter IP address: " single_ip
      read -p "Auto-reboot after deploy? (yes/no): " AUTO_REBOOT
      deploy_to_host "$single_ip"
      ;;
    5)
      log "Exiting..."
      exit 0
      ;;
    *)
      error "Invalid option"
      show_menu
      ;;
  esac
}

# Main
if [ $# -eq 0 ]; then
  show_menu
else
  # Command line arguments
  case "$1" in
    range)
      deploy_range "$2" "$3" "$4"
      ;;
    list)
      deploy_list "$2"
      ;;
    discover)
      deploy_discovered
      ;;
    single)
      deploy_to_host "$2"
      ;;
    *)
      echo "Usage:"
      echo "  $0                          # Interactive menu"
      echo "  $0 range 192.168.1 50 150   # Deploy to range"
      echo "  $0 list ips.txt             # Deploy from file"
      echo "  $0 discover                 # Auto-discover and deploy"
      echo "  $0 single 192.168.1.100     # Deploy to single IP"
      exit 1
      ;;
  esac
fi

log "Deployment complete!"
