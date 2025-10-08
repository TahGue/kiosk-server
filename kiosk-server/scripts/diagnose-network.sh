#!/bin/bash
# Network diagnostic script for Mustaqbal kiosk setup

echo "========================================="
echo "  MUSTAQBAL NETWORK DIAGNOSTICS"
echo "========================================="
echo ""

# 1. Check if www.mustaqbal.hb.local resolves
echo "1. DNS Resolution Test:"
echo "   Checking www.mustaqbal.hb.local..."
if command -v host >/dev/null 2>&1; then
  host www.mustaqbal.hb.local
else
  echo "   'host' command not found, trying nslookup..."
  nslookup www.mustaqbal.hb.local 2>/dev/null || echo "   Could not resolve"
fi
echo ""

# 2. Check if we can ping it
echo "2. Ping Test:"
if ping -c2 -W2 www.mustaqbal.hb.local >/dev/null 2>&1; then
  echo "   ✓ www.mustaqbal.hb.local is reachable"
  RESOLVED_IP=$(ping -c1 www.mustaqbal.hb.local 2>/dev/null | grep -oP '\(\K[0-9.]+(?=\))' | head -n1)
  echo "   Resolved to: $RESOLVED_IP"
else
  echo "   ✗ Cannot ping www.mustaqbal.hb.local"
fi
echo ""

# 3. Check gateway
echo "3. Gateway Test:"
echo "   Checking gateway 10.1.1.70..."
if ping -c2 -W2 10.1.1.70 >/dev/null 2>&1; then
  echo "   ✓ Gateway 10.1.1.70 is reachable"
else
  echo "   ✗ Cannot reach gateway 10.1.1.70"
fi
echo ""

# 4. Try HTTP connection
echo "4. HTTP Connection Test:"
for target in "http://www.mustaqbal.hb.local" "http://10.1.1.70"; do
  echo "   Testing $target..."
  if command -v curl >/dev/null 2>&1; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "$target" 2>/dev/null)
    if [[ "$HTTP_CODE" =~ ^[23] ]]; then
      echo "   ✓ $target responds (HTTP $HTTP_CODE)"
    else
      echo "   ✗ $target not responding (HTTP $HTTP_CODE)"
    fi
  else
    echo "   'curl' not found, skipping HTTP test"
  fi
done
echo ""

# 5. Check local network interfaces
echo "5. Network Interfaces:"
ip addr show | grep -E "inet |UP" | head -10
echo ""

# 6. Check DNS configuration
echo "6. DNS Configuration (/etc/resolv.conf):"
cat /etc/resolv.conf 2>/dev/null | grep -v "^#" | grep -v "^$"
echo ""

# 7. Check /etc/hosts
echo "7. /etc/hosts entries for mustaqbal:"
grep -i mustaqbal /etc/hosts 2>/dev/null || echo "   No mustaqbal entries found"
echo ""

echo "========================================="
echo "RECOMMENDATIONS:"
echo "========================================="
echo ""

# Provide recommendations based on findings
if ! ping -c1 -W2 www.mustaqbal.hb.local >/dev/null 2>&1; then
  echo "⚠ www.mustaqbal.hb.local cannot be reached."
  echo ""
  echo "Option 1: Use IP address instead"
  echo "  - If the web server is at 10.1.1.70, update configs to:"
  echo "    kioskUrl: \"http://10.1.1.70\""
  echo ""
  echo "Option 2: Add /etc/hosts entry on all clients"
  echo "  - Run setup script which will add:"
  echo "    10.1.1.70 www.mustaqbal.hb.local"
  echo ""
  echo "Option 3: Fix DNS"
  echo "  - Configure your DNS server to resolve *.mustaqbal.hb.local"
  echo "  - Or check if the domain name is correct"
fi

echo ""
echo "To test from a client machine, run:"
echo "  curl -I http://www.mustaqbal.hb.local"
echo "  ping www.mustaqbal.hb.local"
echo ""
