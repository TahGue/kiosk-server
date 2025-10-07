# Device Status Guide

## Understanding Device Colors in Admin Dashboard

### 🟢 Green - "Online (Heartbeat)"
**What it means:**
- Device is running the kiosk client script
- Actively sending heartbeats every 15 seconds
- Fully controllable from dashboard

**What you can do:**
- ✅ Change URL
- ✅ Reboot device
- ✅ Shutdown device
- ✅ See current URL being displayed

### 🔵 Blue - "Detected (ARP)"
**What it means:**
- Device is on your network and detected via ARP
- NOT running the kiosk client yet
- Just a regular network device

**What you can do:**
- ❌ Cannot change URL (no kiosk client)
- ❌ Cannot reboot remotely (no kiosk client)
- ❌ Cannot shutdown remotely (no kiosk client)
- ✅ Can see IP and MAC address
- ✅ Can install kiosk client on it

### ⚫ Gray - "Offline"
**What it means:**
- Was running kiosk client before
- Hasn't sent heartbeat in over 60 seconds
- Might be powered off or disconnected

**What you can do:**
- ❌ Cannot control (not responding)
- ✅ Will come back online when device reconnects

## Your Situation: Device Shows in Red/Blue

If your device (e.g., 172.168.1.23) shows as "Detected (ARP)" in blue:

### This is NORMAL if:
1. ✅ You haven't installed the kiosk client on it yet
2. ✅ It's a fresh device you just connected
3. ✅ It's a Windows/Mac/other device (not Linux with kiosk client)
4. ✅ The kiosk client script isn't running

### This is a PROBLEM if:
1. ❌ You already ran the kiosk setup script on it
2. ❌ It should be running in kiosk mode
3. ❌ It was working before but stopped

## How to Fix: Convert Blue Device to Green

### Step 1: Verify Device is Accessible
```bash
# From your server, ping the device
ping 172.168.1.23

# Try to SSH into it
ssh student@172.168.1.23
# or
ssh tahar@172.168.1.23
```

### Step 2: Check if Kiosk Client is Running
```bash
# SSH into the device
ssh student@172.168.1.23

# Check if kiosk script is running
ps aux | grep kiosk

# Check logs
cat /var/log/kiosk-client.log
# or
cat ~/.local/share/kiosk-client.log
```

### Step 3: Install/Reinstall Kiosk Client

**If kiosk client is NOT installed:**
```bash
# Copy the script to the device
scp start-kiosk.sh student@172.168.1.23:~/

# SSH into device
ssh student@172.168.1.23

# Run setup
chmod +x start-kiosk.sh
sudo ./start-kiosk.sh

# Reboot
sudo reboot
```

**If kiosk client IS installed but not running:**
```bash
# SSH into device
ssh student@172.168.1.23

# Check if student user exists
id student

# Check if kiosk session is configured
ls -la /home/student/.xsession
ls -la /home/student/.xinitrc

# Check display manager
ps aux | grep slim
ps aux | grep lightdm

# Manually start kiosk (for testing)
su - student
/usr/local/bin/kiosk-client.sh
```

### Step 4: Verify Heartbeat Connection

**Check if device can reach server:**
```bash
# From the kiosk device
curl http://172.168.1.X:4000/api/config

# Should return JSON with server config
```

**Check server logs:**
```bash
# On your server
tail -f /var/log/kiosk-server.log

# Look for heartbeat messages from the device
```

## Common Issues and Solutions

### Issue 1: Device is antiX but shows Blue

**Cause:** Kiosk client not running or not configured for antiX

**Solution:**
1. SSH into device
2. Check if SLiM or inittab is configured:
   ```bash
   cat /etc/slim.conf | grep student
   cat /etc/inittab | grep student
   ```
3. If not configured, run setup again:
   ```bash
   sudo ./start-kiosk.sh
   sudo reboot
   ```

### Issue 2: Device was Green, now Blue

**Cause:** Kiosk client crashed or stopped

**Solution:**
1. Check device logs:
   ```bash
   ssh student@172.168.1.23
   tail -50 /var/log/kiosk-client.log
   ```
2. Look for errors
3. Restart kiosk manually:
   ```bash
   /usr/local/bin/kiosk-client.sh
   ```

### Issue 3: Cannot SSH into Device

**Cause:** SSH not enabled or wrong credentials

**Solution:**
1. Try default credentials:
   - Username: `student` or `tahar`
   - Password: (check setup script)
2. Enable SSH:
   - Access device physically
   - Run: `sudo systemctl start ssh` (systemd)
   - Or: `sudo service ssh start` (SysVinit)

### Issue 4: Device Reboots but Still Blue

**Cause:** Autologin not configured properly

**Solution for antiX:**
```bash
# Check SLiM config
sudo cat /etc/slim.conf | grep -E "default_user|auto_login"

# Should show:
# default_user        student
# auto_login          yes

# If not, edit:
sudo nano /etc/slim.conf

# Or check inittab
sudo cat /etc/inittab | grep student

# Should show autologin line
```

### Issue 5: Heartbeats Not Reaching Server

**Cause:** Network issue or wrong server address

**Solution:**
1. Check server address in kiosk config:
   ```bash
   cat /etc/kiosk-client.conf | grep SERVER_BASE
   ```
2. Should match your server IP:
   ```
   SERVER_BASE="http://172.168.1.X:4000"
   ```
3. Test connection:
   ```bash
   curl http://172.168.1.X:4000/api/heartbeat/clients
   ```

## Quick Diagnostic Commands

Run these on the kiosk device to diagnose:

```bash
# 1. Check if kiosk script exists
ls -la /usr/local/bin/kiosk-client.sh

# 2. Check if student user exists
id student

# 3. Check if X is running
ps aux | grep X

# 4. Check if browser is running
ps aux | grep firefox
ps aux | grep chrome

# 5. Check network connectivity to server
ping -c 3 172.168.1.X
curl http://172.168.1.X:4000/api/config

# 6. Check logs
tail -50 /var/log/kiosk-client.log
tail -50 /home/student/.local/share/kiosk-client.log

# 7. Check if heartbeat is being sent
# (should see output every 15 seconds in logs)
tail -f /var/log/kiosk-client.log | grep -i heartbeat
```

## Expected Timeline

After running setup and rebooting:

- **0-30 seconds**: Device boots up
- **30-60 seconds**: X server starts, browser launches
- **60-90 seconds**: First heartbeat sent to server
- **90 seconds+**: Device shows as GREEN in dashboard

If device is still BLUE after 2 minutes, something is wrong.

## Testing Without Reboot

To test if kiosk client works without rebooting:

```bash
# SSH into device
ssh student@172.168.1.23

# Stop any running kiosk (if any)
pkill -f kiosk-client

# Start manually
/usr/local/bin/kiosk-client.sh

# Watch for errors
# Should see:
# - Browser detection
# - Server connection
# - Heartbeat messages
```

If it works manually but not on boot, the autologin is not configured correctly.

## Summary

**Blue/Red device = Device detected but not running kiosk client**

To fix:
1. Install kiosk client if not installed
2. Check if autologin is configured
3. Verify server address is correct
4. Check logs for errors
5. Test manual startup

Once fixed, device will turn GREEN and be fully controllable from dashboard.
