# Kiosk Setup Guide for antiX 386

This guide explains how to set up the kiosk client on **antiX 386** (or other lightweight Debian-based distributions using SysVinit instead of systemd).

## Why antiX is Different

antiX is a lightweight distribution designed for older hardware that:
- Uses **SysVinit** instead of systemd
- Uses **SLiM** display manager (or no display manager at all)
- Uses `.xsession` or `.xinitrc` for X session startup
- Has minimal RAM requirements (works well with 2GB RAM)

The kiosk scripts have been updated to automatically detect and configure antiX properly.

## Prerequisites

- antiX 386 installed on the client machine
- Network connectivity to the kiosk server
- At least 2GB RAM (antiX works well with this)
- Basic X server installed (usually included in antiX)

## Installation Steps

### 1. Download the Setup Script

Copy the `start-kiosk.sh` script to your antiX machine. You can do this via:
- USB drive
- Network transfer (scp, wget, etc.)
- Direct download if you have internet access

### 2. Configure Server Address

Edit the script to set your kiosk server IP address:

```bash
nano start-kiosk.sh
```

Find and update this line:
```bash
SERVER_BASE="http://192.168.0.178:4000"
```

Replace `192.168.0.178` with your actual server IP address.

### 3. Run Setup as Root

Make the script executable and run it as root:

```bash
chmod +x start-kiosk.sh
sudo ./start-kiosk.sh
```

The script will automatically:
- Detect that you're using antiX (SysVinit/SLiM)
- Install Firefox or Midori (lightweight browsers suitable for 2GB RAM)
- Create a 'student' user for the kiosk
- Configure autologin based on your display manager:
  - **If SLiM is installed**: Configure SLiM autologin + `.xsession`
  - **If no display manager**: Configure `.xinitrc` + inittab autologin
- Set up the kiosk session to start automatically

### 4. Reboot

After setup completes, reboot the machine:

```bash
sudo reboot
```

The system should now:
1. Boot to the login screen (or auto-login if configured)
2. Automatically start the X session
3. Launch the kiosk browser in fullscreen mode

## How It Works on antiX

### With SLiM Display Manager

If antiX is using SLiM, the setup:

1. **Configures `/etc/slim.conf`**:
   ```
   default_user        student
   auto_login          yes
   ```

2. **Creates `~/.xsession`** for the student user:
   ```bash
   #!/bin/bash
   exec /usr/local/bin/kiosk-session.sh
   ```

3. On boot: SLiM → auto-login as student → runs `.xsession` → starts kiosk

### Without Display Manager (startx method)

If no display manager is detected, the setup:

1. **Modifies `/etc/inittab`** to auto-login on tty1:
   ```
   1:2345:respawn:/bin/login -f student tty1 </dev/tty1 >/dev/tty1 2>&1
   ```

2. **Creates `~/.bash_profile`** to auto-start X:
   ```bash
   if [[ -z "$DISPLAY" ]] && [[ $(tty) == "/dev/tty1" ]]; then
     exec startx
   fi
   ```

3. **Creates `~/.xinitrc`** to launch kiosk:
   ```bash
   #!/bin/bash
   exec /usr/local/bin/kiosk-session.sh
   ```

4. On boot: inittab → auto-login → bash_profile → startx → xinitrc → kiosk

## Troubleshooting

### Kiosk doesn't start after reboot

1. **Check if X server is running**:
   ```bash
   ps aux | grep X
   ```

2. **Check display manager status**:
   ```bash
   # For SLiM
   ps aux | grep slim
   
   # Check if SLiM is configured
   cat /etc/slim.conf | grep -E "default_user|auto_login"
   ```

3. **Check autologin configuration**:
   ```bash
   # For SysVinit
   cat /etc/inittab | grep student
   
   # Check user's session files
   ls -la /home/student/.xsession /home/student/.xinitrc /home/student/.bash_profile
   ```

4. **Check logs**:
   ```bash
   # X server log
   cat /var/log/Xorg.0.log
   
   # Kiosk client log
   cat /var/log/kiosk-client.log
   # or
   cat /home/student/.local/share/kiosk-client.log
   ```

### Manual start for testing

To test the kiosk manually without rebooting:

1. **Login as student** (or switch user):
   ```bash
   su - student
   ```

2. **Run the kiosk client directly**:
   ```bash
   /usr/local/bin/kiosk-client.sh
   ```

3. **Or start the session script**:
   ```bash
   /usr/local/bin/kiosk-session.sh
   ```

### Browser issues on low-RAM systems

The script uses **Firefox** as the primary browser because:
- Modern web apps (Next.js, Tailwind CSS) require a modern browser
- Midori cannot handle modern JavaScript frameworks
- Firefox works on 2GB RAM, though performance may be slower

**Performance tips for 2GB RAM:**
1. Firefox will show a warning but will work
2. Consider upgrading to 4GB RAM for better performance
3. Keep the kiosk URL simple (avoid heavy animations)
4. Chrome is avoided on antiX 386 (too heavy for old hardware)

To check which browser is being used:
```bash
cat /var/log/kiosk-client.log | grep "Using"
```

### Network connectivity issues

1. **Check if server is reachable**:
   ```bash
   ping 192.168.0.178
   ```

2. **Test server connection**:
   ```bash
   curl http://192.168.0.178:4000/api/config
   ```

3. **Check network interface**:
   ```bash
   ip addr show
   ```

### Disable autologin (for maintenance)

**For SLiM**:
```bash
sudo nano /etc/slim.conf
# Change: auto_login yes → auto_login no
```

**For inittab**:
```bash
sudo nano /etc/inittab
# Comment out the student autologin line
# Then: sudo init q  (reload inittab)
```

## Performance Tips for 2GB RAM

1. **Firefox is required** for modern web apps (Tailwind CSS, Next.js)
   - Midori cannot handle modern JavaScript frameworks
   - Firefox will work but may be slower on 2GB RAM
   
2. **Disable unnecessary services**:
   ```bash
   sudo update-rc.d bluetooth remove
   sudo update-rc.d cups remove
   ```

3. **Use a lightweight window manager** (antiX already does this)

4. **Optimize your web app**:
   - Minimize heavy animations
   - Reduce image sizes
   - Use lazy loading for components
   - Consider server-side rendering (Next.js already does this)

5. **Consider RAM upgrade**: 4GB RAM is recommended for smooth performance with modern web apps

## Reverting Changes

To remove the kiosk setup:

1. **Restore SLiM config** (if backed up):
   ```bash
   sudo cp /etc/slim.conf.backup /etc/slim.conf
   ```

2. **Restore inittab** (if backed up):
   ```bash
   sudo cp /etc/inittab.backup /etc/inittab
   sudo init q
   ```

3. **Remove student user**:
   ```bash
   sudo userdel -r student
   ```

4. **Remove kiosk files**:
   ```bash
   sudo rm /usr/local/bin/kiosk-session.sh
   sudo rm /usr/local/bin/kiosk-client.sh
   sudo rm /etc/kiosk-client.conf
   ```

## Additional Resources

- [antiX Documentation](https://antixlinux.com/wiki/)
- [SLiM Configuration](https://wiki.archlinux.org/title/SLiM)
- [SysVinit Guide](https://wiki.debian.org/SysVinit)

## Support

If you encounter issues specific to antiX, check:
1. The kiosk client logs: `/var/log/kiosk-client.log`
2. X server logs: `/var/log/Xorg.0.log`
3. System logs: `/var/log/messages` or `/var/log/syslog`
