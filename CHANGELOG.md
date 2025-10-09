# Kiosk System Changelog

## Latest Updates - 2025-10-09

### Enhanced Browser Cache Clearing
- ✅ **Comprehensive cache clearing** for Chrome/Chromium, Firefox, and other browsers
- ✅ **Supports all browser variants**: Native packages, Flatpak, and Snap installations
- ✅ **Clears all profiles**: Default, Profile 1, Profile 2, etc.
- ✅ **Removes all cache types**: Session files, cookies, local storage, IndexedDB, service workers, GPU cache, application cache
- ✅ **Works on boot and every restart**: Systemd, OpenRC, and SysVinit support

### Multi-Distribution Support
- ✅ **Alpine Linux** - Full support with OpenRC init system
- ✅ **Debian/Ubuntu** - Enhanced support with apt package manager
- ✅ **Fedora/RHEL** - Support with dnf/yum package managers
- ✅ **Arch Linux** - Support with pacman package manager
- ✅ **openSUSE** - Support with zypper package manager
- ✅ **Auto-detection** - Automatically detects distribution and init system

### Init System Support
- ✅ **systemd** - Full support for modern Linux distributions
- ✅ **OpenRC** - Full support for Alpine Linux and Gentoo
- ✅ **SysVinit** - Fallback support for legacy systems

### Client UI Enhancements
- ✅ **Home button** - Return to configured home page (non-intrusive, 30% opacity)
- ✅ **Restart button** - Reboot device with confirmation dialog
- ✅ **Shutdown button** - Power off device with confirmation dialog
- ✅ **Toast notifications** - User feedback for actions
- ✅ **Color-coded buttons** - Blue (home), Orange (restart), Red (shutdown)
- ✅ **Responsive design** - Works on desktop and mobile

### Heartbeat API Commands
- ✅ **clear_cache** - New command to remotely clear browser cache
- ✅ **reboot** - Restart client device
- ✅ **shutdown** - Shutdown client device
- ✅ **update_url** - Change displayed URL

### Browser Support
- ✅ **Firefox** - Primary browser with full cache clearing
- ✅ **Google Chrome** - Full support including Flatpak/Snap
- ✅ **Chromium** - Full support including Flatpak/Snap
- ✅ **Brave, Vivaldi, Edge** - Additional browser support

## Installation

### Fresh Installation
```bash
# Download and run as root
sudo bash start-kiosk.sh

# After setup, reboot the system
sudo reboot
```

### Update Existing Installation
```bash
# Copy new version to /usr/local/bin
sudo install -m 0755 start-kiosk.sh /usr/local/bin/kiosk-client.sh

# Recreate cleanup script with new functions
sudo bash /usr/local/bin/kiosk-client.sh
```

## Features

### Cache Clearing Locations
**Chrome/Chromium:**
- `~/.config/google-chrome/`, `~/.config/chromium/`, `~/.config/chrome/`
- `~/.var/app/com.google.Chrome/` (Flatpak)
- `~/snap/chromium/common/chromium/` (Snap)
- `~/.cache/google-chrome/`, `~/.cache/chromium/`

**Firefox:**
- `~/.mozilla/firefox/`
- `~/.var/app/org.mozilla.firefox/.mozilla/firefox/` (Flatpak)
- `~/snap/firefox/common/.mozilla/firefox/` (Snap)
- `~/.cache/mozilla/`

**Other Browsers:**
- Brave: `~/.config/BraveSoftware/`, `~/.cache/BraveSoftware/`
- Vivaldi: `~/.config/vivaldi/`, `~/.cache/vivaldi/`
- Edge: `~/.config/microsoft-edge/`, `~/.cache/microsoft-edge/`

### Client Action Buttons
Located in bottom-right corner (only visible on `/client` view):
- **Home**: Returns to configured `kioskUrl`
- **Restart**: Sends reboot command via heartbeat API
- **Shutdown**: Sends shutdown command via heartbeat API

Buttons are:
- Non-intrusive (30% opacity, becomes 100% on hover)
- Compact (42x42px)
- Mobile responsive (38x38px on mobile)

### Remote Commands
Send commands via admin panel or API:

```bash
# Clear cache remotely
curl -X POST http://server:4000/api/heartbeat/command \
  -H 'Content-Type: application/json' \
  -d '{"target":"client-id","type":"clear_cache","payload":{}}'

# Reboot device
curl -X POST http://server:4000/api/heartbeat/command \
  -H 'Content-Type: application/json' \
  -d '{"target":"client-id","type":"reboot","payload":{}}'
```

## Configuration

### Distribution-Specific Packages
The script automatically installs the correct packages for your distribution:

| Distribution | Browser Package | Init System |
|--------------|----------------|-------------|
| Alpine       | firefox        | OpenRC      |
| Debian/Ubuntu| firefox-esr    | systemd     |
| Fedora/RHEL  | firefox        | systemd     |
| Arch         | firefox        | systemd     |
| openSUSE     | firefox        | systemd     |

### Cache Clearing Schedule
1. **On boot** - Full cache clear for all users
2. **Before browser launch** - Quick cache clear for current user
3. **On browser restart** - Full cache clear
4. **On remote command** - Cache clear via heartbeat API

## Troubleshooting

### Cache not clearing
```bash
# Check cleanup service status (systemd)
sudo systemctl status kiosk-cleanup

# Check cleanup service status (OpenRC)
sudo rc-service kiosk-cleanup status

# Manually run cleanup
sudo /usr/local/bin/kiosk-cleanup-on-boot.sh

# Check logs
tail -f /var/log/kiosk-cleanup.log
```

### Browser not starting
```bash
# Check available browsers
which firefox google-chrome chromium

# Check browser version
firefox --version

# Check client logs
tail -f /var/log/kiosk-client.log
```

### Action buttons not appearing
1. Verify you're accessing `/client` endpoint (not admin panel)
2. Check browser console for JavaScript errors (F12)
3. Verify CSS is loaded properly

## Version History

### v1.2.0 (2025-10-09)
- Added multi-distribution support
- Enhanced browser cache clearing (all variants including Flatpak/Snap)
- Added client action buttons (home, restart, shutdown)
- Added clear_cache heartbeat command
- Improved init system detection
- Added comprehensive documentation

### v1.1.0 (Previous)
- Basic cache clearing on boot
- Heartbeat system with reboot/shutdown commands
- LightDM, GDM, SDDM support

### v1.0.0 (Initial)
- Basic kiosk functionality
- Debian-based distribution support
- Firefox/Chrome browser detection
