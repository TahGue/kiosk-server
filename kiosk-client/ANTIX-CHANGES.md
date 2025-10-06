# antiX 386 Support - Changes Summary

## Problem
The kiosk client scripts were designed for Linux Mint which uses:
- **LightDM** display manager
- **systemd** init system

However, antiX 386 (used for old hardware with 2GB RAM) uses:
- **SLiM** display manager (or no display manager)
- **SysVinit** init system
- Different autologin mechanisms

This caused the kiosk mode to not start automatically after reboot.

## Solution
Updated all kiosk client scripts to automatically detect the Linux distribution and configure accordingly.

## Files Modified

### 1. `start-kiosk.sh`
**Changes:**
- Added automatic display manager detection (LightDM, SLiM, or none)
- Added SLiM autologin configuration
- Added SysVinit inittab autologin configuration
- Added `.xsession` and `.xinitrc` creation for antiX
- Added `.bash_profile` auto-startx configuration
- Made SSH service management compatible with both systemd and SysVinit
- Made power-saving disable compatible with both systemd and SysVinit

**Key additions:**
```bash
# Detects and configures based on display manager
if command -v lightdm >/dev/null 2>&1; then
  # Configure LightDM (Linux Mint)
elif command -v slim >/dev/null 2>&1; then
  # Configure SLiM (antiX)
else
  # Configure inittab + startx (antiX without DM)
fi
```

### 2. `setup-autostart-kiosk.sh`
**Changes:**
- Same display manager detection logic as `start-kiosk.sh`
- Simplified version for quick setup

### 3. New Documentation Files

#### `README.md` (Main)
- Overview of all supported distributions
- Quick start guide for any distribution
- Hardware requirements
- Troubleshooting guide

#### `README-ANTIX.md` (antiX-specific)
- Detailed antiX setup guide
- Explanation of how autologin works on antiX
- SLiM vs. inittab configuration details
- Troubleshooting specific to antiX
- Performance tips for 2GB RAM systems

#### `ANTIX-CHANGES.md` (This file)
- Summary of changes made
- Technical details

## How It Works Now

### For antiX with SLiM:
1. Script detects SLiM is installed
2. Configures `/etc/slim.conf`:
   - `default_user student`
   - `auto_login yes`
3. Creates `/home/student/.xsession` to launch kiosk
4. On boot: SLiM → auto-login → `.xsession` → kiosk starts

### For antiX without Display Manager:
1. Script detects no display manager
2. Modifies `/etc/inittab` to auto-login on tty1
3. Creates `/home/student/.bash_profile` to auto-startx
4. Creates `/home/student/.xinitrc` to launch kiosk
5. On boot: inittab → auto-login → bash_profile → startx → xinitrc → kiosk starts

### For Linux Mint (unchanged):
1. Script detects LightDM
2. Configures LightDM autologin
3. Creates X-session entry
4. On boot: LightDM → auto-login → X-session → kiosk starts

## Testing Instructions

### On antiX 386:

1. **Copy the updated script:**
   ```bash
   # Transfer start-kiosk.sh to antiX machine
   ```

2. **Configure server address:**
   ```bash
   nano start-kiosk.sh
   # Set SERVER_BASE="http://YOUR_SERVER_IP:4000"
   ```

3. **Run setup:**
   ```bash
   chmod +x start-kiosk.sh
   sudo ./start-kiosk.sh
   ```

4. **Reboot:**
   ```bash
   sudo reboot
   ```

5. **Expected result:**
   - System boots
   - Auto-login as 'student'
   - X server starts
   - Browser launches in fullscreen kiosk mode
   - Connects to server

### Verification:

1. **Check autologin configuration:**
   ```bash
   # For SLiM
   cat /etc/slim.conf | grep -E "default_user|auto_login"
   
   # For inittab
   cat /etc/inittab | grep student
   ```

2. **Check session files:**
   ```bash
   ls -la /home/student/.xsession /home/student/.xinitrc /home/student/.bash_profile
   ```

3. **Check logs:**
   ```bash
   cat /var/log/kiosk-client.log
   cat /var/log/Xorg.0.log
   ```

## Backward Compatibility

✅ **All changes are backward compatible:**
- Linux Mint installations continue to work as before
- Detection is automatic - no manual configuration needed
- Existing kiosk clients are unaffected

## Browser Selection for Modern Web Apps

The script uses **Firefox** as the primary browser because:

1. **Modern web frameworks require it** (Tailwind CSS, Next.js)
2. **Midori cannot handle** modern JavaScript frameworks
3. **Firefox works on 2GB RAM** (though slower than on 4GB)
4. **Chrome is fallback** (if Firefox unavailable)

**Important:** While antiX 386 has only 2GB RAM, Firefox is still used because Midori cannot properly render modern web applications. The script will log a warning about low RAM but will proceed with Firefox.

## Additional Improvements

1. **Service management:** Works with both systemd and SysVinit
2. **Power management:** Disables sleep/suspend on both init systems
3. **SSH setup:** Compatible with both service managers
4. **Logging:** Works regardless of init system

## Known Limitations

1. **inittab method requires reboot:** Changes to `/etc/inittab` require `init q` or reboot
2. **Manual testing:** Best tested on actual antiX hardware
3. **Display manager preference:** If both SLiM and LightDM are installed, LightDM takes precedence

## Future Enhancements

Potential improvements:
- Support for other lightweight distros (Puppy Linux, Tiny Core)
- Wayland support (currently X11 only)
- More display manager support (GDM, SDDM)
- Automatic browser selection based on CPU speed

## Rollback Instructions

If you need to revert changes on antiX:

1. **Restore SLiM config:**
   ```bash
   sudo cp /etc/slim.conf.backup /etc/slim.conf
   ```

2. **Restore inittab:**
   ```bash
   sudo cp /etc/inittab.backup /etc/inittab
   sudo init q
   ```

3. **Remove kiosk user:**
   ```bash
   sudo userdel -r student
   ```

## Support

For issues:
1. Check [README-ANTIX.md](README-ANTIX.md) for troubleshooting
2. Review logs in `/var/log/kiosk-client.log`
3. Test manual startup: `su - student` then `/usr/local/bin/kiosk-client.sh`
