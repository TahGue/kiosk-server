# Fresh Session on Every Startup

## What was implemented

The kiosk system now ensures a completely fresh browser session on every device startup, with no old tabs, cookies, or cached data.

## How it works

### 1. Boot-time cleanup (systemd service)
- **Service**: `kiosk-cleanup.service`
- **Script**: `/usr/local/bin/kiosk-cleanup-on-boot.sh`
- **When**: Runs automatically on every boot, before the display manager starts
- **What it cleans**:
  - All browser session files
  - Cookies
  - Cache
  - Local storage
  - For all users on the system

### 2. Startup cleanup (in kiosk script)
- **When**: Every time the kiosk script starts
- **What it cleans**:
  - Chrome/Chromium: Sessions, Cookies, Cache, Local Storage, Service Workers
  - Firefox: Session restore files, Cookies, Cache, Storage
  - Both user config and system cache directories

### 3. Browser restart cleanup
- **When**: Every time the browser is restarted (URL change, crash recovery)
- **What it cleans**: Session files to prevent tab restoration

## Files cleaned

### Chrome/Chromium
```
~/.config/google-chrome/Default/Session*
~/.config/google-chrome/Default/Cookies*
~/.config/google-chrome/Default/Cache*
~/.config/google-chrome/Default/Local Storage/*
~/.config/google-chrome/Default/Service Worker/*
~/.config/chromium/Default/Session*
~/.config/chromium/Default/Cookies*
~/.config/chromium/Default/Cache*
~/.cache/google-chrome/*
~/.cache/chromium/*
```

### Firefox
```
~/.mozilla/firefox/*/sessionstore*
~/.mozilla/firefox/*/cookies.sqlite*
~/.mozilla/firefox/*/cache2/*
~/.mozilla/firefox/*/storage/*
~/.cache/mozilla/*
```

## Deploy to clients

### Option 1: Mass deployment
```bash
cd /home/user1/kiosk-server/kiosk-server/scripts
./deploy-mustaqbal.sh discover
# Check "Run first-time setup" in the admin UI
```

### Option 2: Single client
```bash
ssh tahar@10.1.1.50
sudo bash /usr/local/bin/start-kiosk.sh
sudo reboot
```

## Verify it's working

### Check if cleanup service is installed
```bash
ssh tahar@10.1.1.50
systemctl status kiosk-cleanup.service
```

### Check if cleanup script exists
```bash
ls -la /usr/local/bin/kiosk-cleanup-on-boot.sh
```

### View cleanup logs
```bash
journalctl -u kiosk-cleanup.service
```

## Benefits

✅ **No old tabs** - Browser always starts with a single fresh tab
✅ **No cached credentials** - Users must log in every time
✅ **No stale data** - Always loads fresh content from the server
✅ **Consistent experience** - Every device starts identically
✅ **Privacy** - Previous session data is completely removed

## Troubleshooting

### If old tabs still appear
1. Verify the cleanup service is enabled:
   ```bash
   sudo systemctl enable kiosk-cleanup.service
   sudo systemctl start kiosk-cleanup.service
   ```

2. Manually run cleanup:
   ```bash
   sudo /usr/local/bin/kiosk-cleanup-on-boot.sh
   ```

3. Check browser profile location:
   ```bash
   ls -la ~/.config/google-chrome/Default/
   ls -la ~/.mozilla/firefox/
   ```

### If cleanup service fails
Check logs:
```bash
sudo journalctl -u kiosk-cleanup.service -n 50
```

## Notes

- The cleanup runs **before** the display manager starts, ensuring no browser is running during cleanup
- Session files are cleaned on **every boot** and **every browser launch**
- This is safe and will not affect system functionality
- The Laravel app will require login on every device startup (expected behavior)
