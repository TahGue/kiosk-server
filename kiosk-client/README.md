# Kiosk Client Setup

This directory contains scripts to set up Linux machines as kiosk clients that connect to the kiosk server.

## Supported Distributions

The kiosk client scripts automatically detect and configure the following Linux distributions:

- ✅ **Linux Mint** (LightDM, systemd)
- ✅ **antiX 386** (SLiM/no DM, SysVinit) - **Optimized for 2GB RAM**
- ✅ **Debian-based** distributions (auto-detection)

## Quick Start

### 1. Choose Your Setup Method

**Option A: Manual Setup (Any Distribution)**
```bash
# 1. Copy start-kiosk.sh to your client machine
# 2. Edit the SERVER_BASE address
nano start-kiosk.sh

# 3. Run as root to install and configure
sudo ./start-kiosk.sh

# 4. Reboot
sudo reboot
```

**Option B: Custom USB Installer (Linux Mint only)**
- See [README-USB-Creator.md](README-USB-Creator.md) for creating a pre-configured USB installer

**Option C: antiX-Specific Setup (for old hardware)**
- See [README-ANTIX.md](README-ANTIX.md) for detailed antiX 386 setup guide

### 2. Configure Server Address

Before running setup, edit the script to set your kiosk server IP:

```bash
SERVER_BASE="http://192.168.0.178:4000"
```

Replace `192.168.0.178` with your actual server IP address.

## Files Overview

| File | Description |
|------|-------------|
| `start-kiosk.sh` | Main setup and runtime script (auto-detects distribution) |
| `setup-autostart-kiosk.sh` | Simplified setup script (auto-detects distribution) |
| `start-kiosk-direct.sh` | Direct mode (no iframe, for sites that block embedding) |
| `create-kiosk-iso.sh` | Creates custom Linux Mint USB installer |
| `README-USB-Creator.md` | Guide for creating custom USB installers |
| `README-ANTIX.md` | Detailed guide for antiX 386 setup |

## How It Works

### Automatic Detection

The scripts automatically detect your Linux distribution and configure accordingly:

#### Linux Mint / Ubuntu (LightDM + systemd)
1. Installs browser (Firefox/Chrome)
2. Creates 'student' user
3. Configures LightDM autologin
4. Creates X-session entry
5. Uses systemd for services

#### antiX 386 (SLiM + SysVinit)
1. Installs lightweight browser (Midori/Firefox)
2. Creates 'student' user
3. Configures SLiM autologin OR inittab autologin
4. Creates `.xsession` or `.xinitrc`
5. Uses SysVinit for services

### Runtime Behavior

Once configured, the kiosk client:
- Auto-boots to kiosk mode
- Connects to the kiosk server
- Displays the configured URL in fullscreen
- Sends heartbeats to the server
- Responds to remote commands (reboot, URL change)
- Auto-restarts browser if it crashes
- Falls back to offline page if server is unreachable

## Hardware Requirements

### Minimum (antiX 386)
- **CPU:** 1GHz or faster
- **RAM:** 2GB (antiX optimized for this)
- **Disk:** 10GB
- **Display:** Any resolution (auto-detected)

### Recommended (Linux Mint)
- **CPU:** 2GHz dual-core
- **RAM:** 4GB
- **Disk:** 20GB
- **Display:** 1024x768 or higher

## Distribution-Specific Guides

- **antiX 386 Setup:** [README-ANTIX.md](README-ANTIX.md)
- **Custom USB Creator:** [README-USB-Creator.md](README-USB-Creator.md)

## Troubleshooting

### Kiosk doesn't start after reboot

1. **Check logs:**
   ```bash
   cat /var/log/kiosk-client.log
   # or
   cat /home/student/.local/share/kiosk-client.log
   ```

2. **Check display manager:**
   ```bash
   # For LightDM
   systemctl status lightdm
   
   # For SLiM
   ps aux | grep slim
   ```

3. **Test manually:**
   ```bash
   su - student
   /usr/local/bin/kiosk-client.sh
   ```

### Network issues

1. **Check server connectivity:**
   ```bash
   ping 192.168.0.178
   curl http://192.168.0.178:4000/api/config
   ```

2. **Check network interface:**
   ```bash
   ip addr show
   ```

### Browser issues

The script automatically selects the best browser for modern web apps:
- **Primary:** Firefox (required for Tailwind CSS, Next.js, modern frameworks)
- **Fallback:** Chrome (if Firefox unavailable)
- **Not supported:** Midori (cannot handle modern JavaScript frameworks)

**Note:** Firefox works on 2GB RAM but may be slower. 4GB RAM recommended for optimal performance.

To check which browser is being used:
```bash
cat /var/log/kiosk-client.log | grep "Using"
```

## Remote Management

Once set up, kiosk clients can be managed remotely via the admin dashboard:

- **View status:** See all connected clients
- **Change URL:** Update displayed content
- **Reboot:** Restart client machines
- **Deploy updates:** Push configuration changes

## Security Notes

- The 'student' user has no password (kiosk-only access)
- SSH is configured for remote management
- Root login via SSH is disabled
- Password authentication can be disabled (use SSH keys)

## Advanced Configuration

### Custom Browser Arguments

Edit `/usr/local/bin/kiosk-session.sh` to customize browser behavior.

### Multiple Servers (Failover)

Edit `start-kiosk.sh` to add backup servers:
```bash
SERVER_CANDIDATES=(
  "http://10.0.0.1:4000"
  "http://192.168.0.1:4000"
)
```

### Offline Fallback Page

The kiosk displays a custom offline page when servers are unreachable.
Customize it at `/usr/local/share/kiosk/offline.html`

## Support

For distribution-specific issues:
- **antiX:** See [README-ANTIX.md](README-ANTIX.md)
- **Linux Mint USB:** See [README-USB-Creator.md](README-USB-Creator.md)

For general issues, check:
1. Kiosk client logs
2. X server logs (`/var/log/Xorg.0.log`)
3. System logs (`/var/log/syslog` or `/var/log/messages`)
