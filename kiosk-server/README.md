# Kiosk Server 🖥️

A powerful, production-ready kiosk management system for controlling and monitoring multiple display screens from a central admin dashboard. Perfect for digital signage, information displays, and public terminals.

## ✨ Key Features

- **🎛️ Central Control** - Manage all kiosks from one web interface
- **🔄 Real-time Updates** - Instant URL changes via Server-Sent Events (SSE)
- **📊 Device Monitoring** - Track online/offline status of all kiosks
- **🌐 Network Discovery** - Auto-detect devices on your network
- **🚀 Easy Deployment** - One-click setup scripts for clients
- **🔒 Secure** - Admin token protection, rate limiting, input validation
- **📱 Responsive UI** - Works on desktop, tablet, and mobile

## 🚀 Quick Start

### 1. Install & Run the Server (5 minutes)

```bash
# Clone the repository
git clone https://github.com/yourusername/kiosk-server.git
cd kiosk-server

# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Start the server
npm start
```

✅ **Server is now running at http://localhost:4000**

### 2. Open Admin Dashboard

1. Open your browser and go to **http://localhost:4000**
2. You'll see the admin dashboard with these sections:
   - **Control** - Change the URL displayed on all kiosks
   - **Devices** - See connected kiosks and their status
   - **Network** - Scan for devices on your network
   - **Client** - Preview what kiosks will display

### 3. Connect Your First Kiosk (2 minutes)

**Option A: Quick Test (Same Computer)**
1. In the admin panel, set a URL (e.g., `https://google.com`)
2. Open a new browser tab to **http://localhost:4000/client**
3. You'll see the URL you set - this is what kiosks display!

**Option B: Real Kiosk Setup (Another Computer)**
1. On the kiosk computer, open browser to `http://YOUR-SERVER-IP:4000/client`
2. Press F11 for fullscreen (kiosk mode)
3. The kiosk will now follow URL changes from admin panel

**Option C: Linux Kiosk with Auto-start**
```bash
# On the Linux kiosk machine
wget http://YOUR-SERVER-IP:4000/client/start-kiosk.sh
chmod +x start-kiosk.sh
./start-kiosk.sh
```

## 📋 Prerequisites

- **Node.js 16+** and npm (check with `node -v`)
- **Linux** for kiosk clients (Ubuntu/Debian recommended)
- **Chrome/Firefox** for display

## 🎯 Common Use Cases

### Digital Signage
```bash
# Set a rotating display of websites
1. Set URL to your slideshow/dashboard
2. Connect TVs/monitors as kiosk clients
3. Control all screens from your phone/computer
```

### School Computer Lab
```bash
# Deploy educational content to 30+ computers
1. Run server on teacher's computer
2. Deploy client script to all student PCs
3. Change displayed content instantly for all
```

### Information Kiosk
```bash
# Public information terminals
1. Set URL to your information portal
2. Enable blackout during closed hours
3. Monitor device status remotely
```

## 🔧 Detailed Setup Guide

### Step 1: Configure the Server

Edit `.env` file with your settings:

```bash
# Basic Settings
PORT=4000                    # Server port
ADMIN_TOKEN=mysecrettoken   # Protect admin functions (optional)

# Default Display
KIOSK_URL=https://example.com  # Default URL for kiosks
KIOSK_TITLE=My Kiosk System    # Browser title

# Security (optional)
MAX_SSE_CLIENTS=100          # Max simultaneous connections
MAX_HEARTBEAT_RATE=120       # Rate limiting
```

### Step 2: Setup Kiosk Clients

#### **Windows Kiosk**
1. Open Chrome/Edge in kiosk mode:
   ```cmd
   chrome --kiosk http://SERVER-IP:4000/client
   ```

#### **Linux Kiosk (Recommended)**
1. Download the setup script from admin panel or:
   ```bash
   curl -O http://SERVER-IP:4000/client/start-kiosk.sh
   chmod +x start-kiosk.sh
   ./start-kiosk.sh
   ```

2. The script will:
   - Install Chrome if needed
   - Configure auto-start on boot
   - Handle network reconnection
   - Send heartbeat status to server

#### **Raspberry Pi Kiosk**
```bash
# Install Raspberry Pi OS Lite
# Then run:
wget http://SERVER-IP:4000/client/start-kiosk.sh
sudo bash start-kiosk.sh
```

### Step 3: Manage from Admin Panel

1. **Change URL for All Kiosks:**
   - Go to Control panel
   - Enter new URL
   - Click "Switch URL"
   - All kiosks update instantly!

2. **Monitor Devices:**
   - Check Devices panel
   - Green = Online, Red = Offline
   - See IP addresses and last seen time

3. **Per-Device Control:**
   - Click "Set URL" next to a device
   - Enter custom URL for that device only
   - Use for different content on different screens

4. **Network Scan:**
   - Go to Network panel
   - Click "Scan Network"
   - Discover all devices on your LAN
   - Deploy to multiple devices at once

## 📡 Admin Dashboard Features

### Control Panel
- Set URL for all kiosks at once
- Enable/disable blackout mode
- Reload all browsers remotely

### Devices Panel  
- View all connected kiosks
- See real-time online/offline status
- Set custom URL per device
- Copy device IPs
- SSH to devices (Linux)
- Remote reboot/shutdown

### Network Panel
- Scan your network for devices
- Auto-detect device types (PC, printer, router)
- See MAC addresses and manufacturers
- One-click deploy to discovered devices

### Heartbeat Panel
- Monitor bash/PowerShell script clients
- Send remote commands
- Track client versions and status

## 🚨 Troubleshooting

### Kiosk Won't Connect
```bash
# Check server is running
curl http://SERVER-IP:4000/api/time

# Check firewall
sudo ufw allow 4000  # Linux
# Windows: Add firewall rule for port 4000

# Check server logs
npm run dev  # Shows detailed logs
```

### URL Changes Not Applying
- Refresh the kiosk browser (Ctrl+F5)
- Check Devices panel - is the kiosk shown as online?
- Ensure no ADMIN_TOKEN is set (or provide it in settings)

### Linux Client Issues
```bash
# Check if script is running
ps aux | grep chromium

# View client logs
journalctl -f  # System logs

# Restart client
sudo systemctl restart kiosk-client  # If using systemd
```

### Can't Access from Other Computers
- Use your actual IP, not `localhost`
- Check Windows Firewall / Linux iptables
- Ensure server listens on all interfaces (not just 127.0.0.1)

## 🔒 Security Features

- **Admin Token Protection** - Set `ADMIN_TOKEN` in `.env` to password-protect admin functions
- **Rate Limiting** - Automatic protection against abuse (120 requests/minute per IP)
- **Input Validation** - All URLs and IPs are validated
- **CORS Control** - Configure allowed origins for API access  
- **Resource Limits** - Prevents memory exhaustion attacks
- **Auto-cleanup** - Stale connections cleaned every 5 minutes

## 🚀 Production Deployment

### Quick Deploy with PM2
```bash
npm install -g pm2
pm run pm2:start
pm2 save
pm2 startup  # Auto-start on boot
```

### Full Production Guide
See [DEPLOYMENT.md](DEPLOYMENT.md) for:
- Nginx reverse proxy setup
- SSL/HTTPS configuration  
- Systemd service setup
- Monitoring and logging
- Performance tuning

## 💻 Development

```bash
# Run with auto-reload
npm run dev

# Monitor in production
npm run monitor

# View PM2 logs
npm run pm2:logs
```

## 📁 Project Structure

```
kiosk-server/
├── server.js           # Main server application
├── public/            # Web UI files
│   ├── index.html     # Admin dashboard
│   ├── js/main.js     # Client-side logic
│   └── css/styles.css # Styling
├── scripts/           # Deployment & setup scripts
│   ├── setup-pm2.sh   # PM2 production setup
│   ├── monitor.js     # Health monitoring
│   └── nginx-kiosk.conf # Nginx config
├── config/            # Persistent storage
├── logs/              # Application logs
└── .env               # Configuration
```

## 🌟 Tips & Best Practices

1. **Network Setup**
   - Use static IPs for kiosk machines
   - Consider a dedicated VLAN for kiosks
   - Use Ethernet over WiFi when possible

2. **Display Settings**
   - Disable screen savers on kiosk machines
   - Set display to never sleep
   - Configure auto-login for kiosk user

3. **Maintenance**
   - Regular updates: `cd kiosk-server && git pull && npm install`
   - Monitor logs: `pm2 logs` or check `logs/` directory
   - Backup config: `cp -r config/ config-backup/`

4. **Scaling**
   - One server can handle 100+ kiosks
   - Use PM2 cluster mode for load balancing
   - Consider Redis for larger deployments

## 📡 API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/config` | GET | Get current configuration |
| `/api/config` | POST | Update configuration |
| `/api/devices` | GET | List connected devices |
| `/api/stream` | GET | SSE stream for real-time updates |
| `/api/action` | POST | Send control actions |
| `/api/lan/scan` | GET | Scan network for devices |
| `/api/heartbeat` | POST | Client heartbeat check-in |
| `/api/deploy` | POST | Deploy to multiple clients |

## 👥 Support

- **Documentation**: [Wiki](https://github.com/yourusername/kiosk-server/wiki)
- **Issues**: [GitHub Issues](https://github.com/yourusername/kiosk-server/issues)  
- **Community**: [Discord](https://discord.gg/yourinvite)

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

---

**Made with ❤️ for the open source community**
