#!/bin/bash

# Kiosk Client Status Checker
# Run this on a kiosk device to diagnose why it's not showing as "Online" in the dashboard

echo "=========================================="
echo "Kiosk Client Status Checker"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# 1. Check if kiosk client script exists
echo "1. Checking kiosk client installation..."
if [[ -f /usr/local/bin/kiosk-client.sh ]]; then
    check_pass "Kiosk client script found"
else
    check_fail "Kiosk client script NOT found at /usr/local/bin/kiosk-client.sh"
    echo "   → Run setup: sudo ./start-kiosk.sh"
    exit 1
fi

# 2. Check if student user exists
echo ""
echo "2. Checking student user..."
if id student >/dev/null 2>&1; then
    check_pass "Student user exists"
else
    check_fail "Student user does NOT exist"
    echo "   → Run setup: sudo ./start-kiosk.sh"
    exit 1
fi

# 3. Check server configuration
echo ""
echo "3. Checking server configuration..."
if [[ -f /etc/kiosk-client.conf ]]; then
    check_pass "Config file found"
    SERVER_BASE=$(grep SERVER_BASE /etc/kiosk-client.conf | cut -d'"' -f2)
    echo "   Server: $SERVER_BASE"
else
    check_warn "Config file not found, checking script..."
    if [[ -f /usr/local/bin/kiosk-client.sh ]]; then
        SERVER_BASE=$(grep "^SERVER_BASE=" /usr/local/bin/kiosk-client.sh | head -1 | cut -d'"' -f2)
        echo "   Server: $SERVER_BASE"
    fi
fi

# 4. Check network connectivity to server
echo ""
echo "4. Checking network connectivity..."
if [[ -n "$SERVER_BASE" ]]; then
    SERVER_HOST=$(echo "$SERVER_BASE" | sed 's|http://||' | sed 's|https://||' | cut -d':' -f1)
    if ping -c 1 -W 2 "$SERVER_HOST" >/dev/null 2>&1; then
        check_pass "Can ping server: $SERVER_HOST"
    else
        check_fail "Cannot ping server: $SERVER_HOST"
        echo "   → Check network connection"
        echo "   → Check if server is running"
    fi
    
    # Try to connect to API
    if curl -sf --connect-timeout 2 "$SERVER_BASE/api/config" >/dev/null 2>&1; then
        check_pass "Can connect to server API"
    else
        check_fail "Cannot connect to server API: $SERVER_BASE/api/config"
        echo "   → Check if kiosk-server is running"
        echo "   → Check firewall settings"
    fi
else
    check_warn "Server address not configured"
fi

# 5. Check if X server is running
echo ""
echo "5. Checking X server..."
if pgrep -x X >/dev/null || pgrep -x Xorg >/dev/null; then
    check_pass "X server is running"
else
    check_fail "X server is NOT running"
    echo "   → Check display manager (SLiM/LightDM)"
    echo "   → Check /var/log/Xorg.0.log for errors"
fi

# 6. Check if browser is running
echo ""
echo "6. Checking browser..."
if pgrep -f firefox >/dev/null; then
    check_pass "Firefox is running"
elif pgrep -f chrome >/dev/null; then
    check_pass "Chrome is running"
else
    check_fail "No browser is running"
    echo "   → Kiosk client may not be started"
fi

# 7. Check if kiosk client is running
echo ""
echo "7. Checking kiosk client process..."
if pgrep -f kiosk-client.sh >/dev/null; then
    check_pass "Kiosk client script is running"
    PID=$(pgrep -f kiosk-client.sh)
    echo "   PID: $PID"
else
    check_fail "Kiosk client script is NOT running"
    echo "   → Check autologin configuration"
    echo "   → Try manual start: su - student -c '/usr/local/bin/kiosk-client.sh'"
fi

# 8. Check autologin configuration
echo ""
echo "8. Checking autologin configuration..."

# Check for LightDM
if [[ -f /etc/lightdm/lightdm.conf.d/60-kiosk-autologin.conf ]]; then
    check_pass "LightDM autologin configured"
    grep -E "autologin-user|autologin-session" /etc/lightdm/lightdm.conf.d/60-kiosk-autologin.conf | sed 's/^/   /'
fi

# Check for SLiM
if [[ -f /etc/slim.conf ]]; then
    if grep -q "^default_user.*student" /etc/slim.conf && grep -q "^auto_login.*yes" /etc/slim.conf; then
        check_pass "SLiM autologin configured"
    else
        check_warn "SLiM found but autologin may not be configured"
        grep -E "default_user|auto_login" /etc/slim.conf | sed 's/^/   /'
    fi
fi

# Check for inittab
if [[ -f /etc/inittab ]]; then
    if grep -q "student" /etc/inittab; then
        check_pass "inittab autologin configured"
    else
        check_warn "inittab found but autologin may not be configured"
    fi
fi

# Check session files
if [[ -f /home/student/.xsession ]]; then
    check_pass ".xsession file exists"
fi
if [[ -f /home/student/.xinitrc ]]; then
    check_pass ".xinitrc file exists"
fi

# 9. Check logs
echo ""
echo "9. Checking logs..."
if [[ -f /var/log/kiosk-client.log ]]; then
    check_pass "Log file found: /var/log/kiosk-client.log"
    echo "   Last 5 lines:"
    tail -5 /var/log/kiosk-client.log | sed 's/^/   /'
elif [[ -f /home/student/.local/share/kiosk-client.log ]]; then
    check_pass "Log file found: /home/student/.local/share/kiosk-client.log"
    echo "   Last 5 lines:"
    tail -5 /home/student/.local/share/kiosk-client.log | sed 's/^/   /'
else
    check_warn "No log file found"
fi

# 10. Summary
echo ""
echo "=========================================="
echo "Summary"
echo "=========================================="

ISSUES=0

if [[ ! -f /usr/local/bin/kiosk-client.sh ]]; then
    ((ISSUES++))
    echo "❌ Kiosk client not installed"
fi

if ! pgrep -f kiosk-client.sh >/dev/null; then
    ((ISSUES++))
    echo "❌ Kiosk client not running"
fi

if [[ -n "$SERVER_BASE" ]] && ! curl -sf --connect-timeout 2 "$SERVER_BASE/api/config" >/dev/null 2>&1; then
    ((ISSUES++))
    echo "❌ Cannot connect to server"
fi

if ! pgrep -x X >/dev/null && ! pgrep -x Xorg >/dev/null; then
    ((ISSUES++))
    echo "❌ X server not running"
fi

if [[ $ISSUES -eq 0 ]]; then
    echo ""
    echo -e "${GREEN}✓ Everything looks good!${NC}"
    echo ""
    echo "If device still shows as blue/offline in dashboard:"
    echo "1. Wait 30 seconds for heartbeat to be sent"
    echo "2. Check server logs for incoming heartbeats"
    echo "3. Refresh the admin dashboard"
else
    echo ""
    echo -e "${RED}Found $ISSUES issue(s)${NC}"
    echo ""
    echo "To fix:"
    echo "1. Run setup if not installed: sudo ./start-kiosk.sh"
    echo "2. Check network connectivity to server"
    echo "3. Reboot device: sudo reboot"
    echo "4. Check logs for detailed errors"
fi

echo ""
