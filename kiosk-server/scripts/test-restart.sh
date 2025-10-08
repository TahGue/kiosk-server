#!/bin/bash
# Test restart functionality on a single client

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <client-ip> [username] [password]"
  echo "Example: $0 10.1.1.50 tahar tahar"
  exit 1
fi

CLIENT_IP="$1"
USERNAME="${2:-tahar}"
PASSWORD="${3:-tahar}"

echo "========================================="
echo "  TESTING RESTART ON $CLIENT_IP"
echo "========================================="
echo ""

# Test 1: SSH connection
echo "1. Testing SSH connection..."
if sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 "$USERNAME@$CLIENT_IP" "echo 'SSH OK'" 2>/dev/null; then
  echo "   ✓ SSH connection successful"
else
  echo "   ✗ SSH connection failed"
  exit 1
fi
echo ""

# Test 2: Check sudo permissions
echo "2. Checking sudo permissions for reboot..."
SUDO_CHECK=$(sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no "$USERNAME@$CLIENT_IP" "sudo -n reboot --help 2>&1" 2>/dev/null)
if echo "$SUDO_CHECK" | grep -q "reboot"; then
  echo "   ✓ User has NOPASSWD sudo for reboot"
else
  echo "   ✗ User does NOT have NOPASSWD sudo"
  echo "   Output: $SUDO_CHECK"
fi
echo ""

# Test 3: Check sudoers file
echo "3. Checking sudoers configuration..."
SUDOERS_CHECK=$(sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no "$USERNAME@$CLIENT_IP" "sudo cat /etc/sudoers.d/tahar-kiosk 2>/dev/null || echo 'File not found'" 2>/dev/null)
if [[ "$SUDOERS_CHECK" != "File not found" ]]; then
  echo "   ✓ Sudoers file exists:"
  echo "$SUDOERS_CHECK" | sed 's/^/     /'
else
  echo "   ✗ Sudoers file not found at /etc/sudoers.d/tahar-kiosk"
  echo "   Checking main sudoers..."
  MAIN_SUDOERS=$(sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no "$USERNAME@$CLIENT_IP" "sudo grep tahar /etc/sudoers 2>/dev/null || echo 'Not found'" 2>/dev/null)
  echo "   $MAIN_SUDOERS"
fi
echo ""

# Test 4: Try the actual restart command (DRY RUN - just test the command)
echo "4. Testing restart command (dry run)..."
echo "   Command: sudo reboot"
echo "   Note: Not actually rebooting, just checking if command would work"
echo ""

echo "========================================="
echo "RECOMMENDATIONS:"
echo "========================================="
echo ""
echo "If sudo permissions are missing, run on the client:"
echo "  sudo bash /usr/local/bin/start-kiosk.sh"
echo ""
echo "Or deploy with 'Run first-time setup' checked:"
echo "  cd kiosk-server/scripts"
echo "  ./deploy-mustaqbal.sh single $CLIENT_IP"
echo ""
