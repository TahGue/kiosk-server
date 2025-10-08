# Mustaqbal Kiosk System - Complete Setup Guide

## Your Environment
- **Devices**: 50-100 AntiX Linux machines
- **Domain**: mustaqbal.local
- **User/Password**: tahar/tahar (all machines)
- **Network**: Internal LAN
- **Server**: Central kiosk server

## 🚀 Quick Start (5 Minutes)

### Step 1: Setup Server

```bash
cd kiosk-server

# Use the pre-configured template
cp env.mustaqbal.template .env

# Edit with YOUR server IP
nano .env
# Change: SERVER_BASE=http://192.168.1.10:4000
# To your actual server IP

# Install and start
npm install
npm start
```

✅ **Server is now running!** Open http://YOUR-SERVER-IP:4000

### Step 2: Deploy to All 100 Clients

**Method A: Automatic (Recommended)**
```bash
cd kiosk-server/scripts
chmod +x deploy-mustaqbal.sh

# Auto-discover and deploy
./deploy-mustaqbal.sh discover
```

**Method B: IP Range**
```bash
# Deploy to 192.168.1.50 through 192.168.1.150
./deploy-mustaqbal.sh range 192.168.1 50 150
```

**Method C: IP List File**
```bash
# Create a file with IPs
cat > ips.txt <<EOF
192.168.1.50
192.168.1.51
192.168.1.52
# ... add all your IPs
EOF

./deploy-mustaqbal.sh list ips.txt
```

### Step 3: Verify

1. All 100 machines will auto-reboot
2. They auto-login as user 'tahar'
3. Browser opens in fullscreen showing your URL
4. Check admin panel → Devices to see all connected

## 📋 Detailed Configuration

### Server Settings (.env)

Your optimized settings:
```bash
PORT=4000
NODE_ENV=production
SERVER_BASE=http://YOUR-SERVER-IP:4000
KIOSK_URL=https://www.mustaqbal.hb.local

# No authentication for internal LAN
ADMIN_TOKEN=
CORS_ORIGIN=*

# Optimized for 100 devices
MAX_SSE_CLIENTS=120
MAX_HB_CLIENTS=120
MAX_HEARTBEAT_RATE=60
MAX_COMMAND_QUEUE_SIZE=50

# Your credentials (for mass deployment)
DEFAULT_SSH_USERNAME=tahar
DEFAULT_SSH_PASSWORD=tahar

# Your customization
KIOSK_TITLE=Mustaqbal Display
TIMEZONE=Asia/Baghdad
```

### Client Script Features

The `start-kiosk.sh` script automatically:
- ✅ Installs required packages (chromium/firefox/midori)
- ✅ Configures user 'tahar' if needed
- ✅ Sets up auto-login for AntiX (SysV init compatible)
- ✅ Disables screensaver and power management
- ✅ Checks for URL changes every 5 seconds
- ✅ Sends heartbeat every 30 seconds
- ✅ Auto-restarts browser if it crashes
- ✅ Reports metrics (uptime, memory usage)

## 🔧 Managing Your 100 Devices

### From Admin Dashboard

1. **Change URL for ALL devices:**
   - Enter new URL in Control panel
   - Click "Switch URL"
   - All 100 screens update in ~5 seconds

2. **Change URL for SPECIFIC devices:**
   - Go to Devices panel
   - Find the device by IP
   - Click "Set URL" → enter custom URL
   - Only that device changes

3. **Monitor Status:**
   - Devices panel shows online/offline
   - Green = connected and working
   - Grey = offline or not responding

4. **Send Commands:**
   - Heartbeat panel shows all devices
   - Send reboot command to specific device
   - Or update URL for one device

### Network Management

**Scan your network:**
```bash
# From admin panel: Network → Scan Network
# Or via API:
curl http://localhost:4000/api/lan/scan?mode=fast
```

**Find offline devices:**
- Check Devices panel
- Devices not seen for >30 minutes removed
- Check if machine is powered on
- Check network cable

### Bulk Operations

**Restart all 100 machines:**
```bash
cd kiosk-server/scripts

# Create IP list
echo "192.168.1.50
192.168.1.51
# ... all IPs
" > all-clients.txt

# Reboot all
while read ip; do
  sshpass -p tahar ssh -o StrictHostKeyChecking=no tahar@$ip "sudo reboot"
done < all-clients.txt
```

**Update client script on all machines:**
```bash
# Re-run deployment (won't reinstall, just updates script)
./deploy-mustaqbal.sh list all-clients.txt
```

## 📊 Performance & Monitoring

### Expected Performance
- **100 SSE connections**: ~100MB RAM usage
- **100 heartbeats/30sec**: Minimal CPU (<5%)
- **Response time**: <100ms for URL changes
- **Network scan**: 3-10 seconds (fast mode)

### Monitor Server
```bash
# Check server status
npm run pm2:start
pm2 monit

# View logs
pm2 logs kiosk-server

# Check connections
curl http://localhost:4000/api/devices | jq '.devices | length'
```

### Monitor Clients

Each client reports:
- **Status**: ok/error
- **Current URL**: What they're displaying
- **Uptime**: How long running
- **Memory**: RAM usage percentage

View in admin panel → Heartbeat tab

## 🛠️ Common Tasks

### Change Default URL
```bash
# In admin panel, or:
curl -X POST http://localhost:4000/api/config \
  -H 'Content-Type: application/json' \
  -d '{"kioskUrl":"https://new-url.com"}'
```

### Blackout All Screens
```bash
# In admin panel click "Enable Blackout", or:
curl -X POST http://localhost:4000/api/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"blackout"}'
```

### Reload All Browsers
```bash
# In admin panel click "Reload All", or:
curl -X POST http://localhost:4000/api/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"reload"}'
```

### Add New Client
```bash
# Get client script from server (prefilled with SERVER_BASE)
wget http://YOUR-SERVER-IP:4000/client/start-kiosk.sh

# Or run from repo checkout
cd kiosk-client
sudo bash start-kiosk.sh
```

## 🔒 Security Notes

For internal LAN:
- ✅ No ADMIN_TOKEN needed (trusted network)
- ✅ CORS set to * (internal only)
- ✅ HTTP is fine (no internet exposure)
- ✅ Same credentials OK (controlled environment)

If exposing to internet:
- ⚠️ Set strong ADMIN_TOKEN
- ⚠️ Configure specific CORS_ORIGIN
- ⚠️ Use HTTPS with SSL certificate
- ⚠️ Change default passwords
- ⚠️ Use SSH keys instead of passwords

## 📱 Mobile Admin Access

Access from phone/tablet on same LAN:
```
http://YOUR-SERVER-IP:4000
```

No admin token needed, full control:
- Change URLs
- Monitor devices
- Send commands
- Scan network

## 🐛 Troubleshooting

### Device not showing up
```bash
# On the client:
ps aux | grep start-kiosk
# Should see the script running

# Check heartbeat
tail -f /var/log/syslog | grep kiosk
```

### URL not updating on client
```bash
# Check client can reach server
curl http://YOUR-SERVER-IP:4000/api/config

# Restart kiosk script
pkill -f start-kiosk
sudo -u tahar /home/tahar/start-kiosk.sh &
```

### Mass deployment fails
```bash
# Test single machine first
./deploy-mustaqbal.sh single 192.168.1.50

# Check SSH works manually
sshpass -p tahar ssh tahar@192.168.1.50 "hostname"

# Verify client script exists
ls -la ../kiosk-client/start-kiosk.sh
```

### Server slow with 100 clients
```bash
# Use PM2 cluster mode
npm run pm2:start

# Check resource usage
pm2 monit

# Increase limits if needed (in .env)
MAX_SSE_CLIENTS=150
MAX_HB_CLIENTS=150
```

## 📦 Backup & Recovery

### Backup Configuration
```bash
# Backup server config
tar -czf mustaqbal-backup-$(date +%Y%m%d).tar.gz \
  kiosk-server/config/ \
  kiosk-server/.env

# Store safely
```

### Restore
```bash
# Restore config
tar -xzf mustaqbal-backup-20250107.tar.gz

# Restart server
npm start
```

### Clone to New Client
```bash
# On working client
sudo dd if=/dev/sda of=/path/to/mustaqbal-client.img bs=4M

# Write to new machine
sudo dd if=/path/to/mustaqbal-client.img of=/dev/sda bs=4M

# Or use Clonezilla for easier GUI
```

## 📞 Support Checklist

Before asking for help, collect:
```bash
# 1. Server status
npm start 2>&1 | head -20

# 2. Connected devices
curl http://localhost:4000/api/devices | jq

# 3. Configuration
cat .env | grep -v PASSWORD

# 4. Client test (from one machine)
curl http://YOUR-SERVER-IP:4000/api/config

# 5. Logs
pm2 logs kiosk-server --lines 50
```

## 🎯 Your Specific Setup Checklist

- [ ] Server running with mustaqbal template
- [ ] SERVER_BASE set to actual IP
- [ ] All 100 clients deployed
- [ ] Default URL set to mustaqbal.hb.local
- [ ] All devices showing in admin panel
- [ ] Test URL change on all screens
- [ ] Test URL change on single device
- [ ] Backup configuration saved
- [ ] Document any custom IPs/settings

---

**You're managing 100 devices with just a web browser!** 🎉
