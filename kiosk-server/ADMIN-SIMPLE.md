# Simplified Admin Dashboard

A streamlined admin interface for managing kiosk devices with only the essential features you need.

## Access the Dashboard

Open your browser and navigate to:
```
http://YOUR_SERVER_IP:4000/admin.html
```

For example: `http://192.168.0.178:4000/admin.html`

## Features

### 1. 📺 Change Display URL

**Switch URL for specific devices:**
1. Enter the URL you want to display
2. Click on devices in the list to select them
3. Click "Apply to Selected"

**Switch URL for all devices:**
1. Enter the URL you want to display
2. Click "Apply to All Devices"
3. Confirm the action

The URL will be changed immediately on all selected devices.

### 2. 🔍 Network Scanner

**Automatic device discovery:**
- The dashboard automatically loads devices from ARP table on startup
- Your subnet is auto-detected (e.g., `172.168.1.0/24`)
- All devices on your local network are shown immediately

**Scan your network to find more devices:**
1. The subnet field is pre-filled with your network
2. Choose scan mode:
   - **Fast**: Quick scan (recommended)
   - **Detailed**: Slower but more thorough
3. Click "Scan Network"

**Refresh options:**
- **Refresh Connected**: Update heartbeat clients and ARP table
- **Resolve Hostnames**: Look up hostnames for devices showing only IP addresses

The dashboard shows devices from two sources:
- **Heartbeat Clients**: Kiosk devices actively sending status updates (shown as "Online")
- **ARP Devices**: All devices detected on your network (shown as "Detected (ARP)")

### 3. 💻 Device Management

**View all devices:**
- Devices are shown as cards with:
  - Hostname and IP address
  - Device ID
  - Last seen time
  - Current URL (if available)
  - Online/Offline status

**Select devices:**
- Click on any device card to select/deselect it
- Selected devices are highlighted in blue
- Use "Select All" / "Deselect All" buttons for bulk selection

**Control devices:**
- **Reboot Selected**: Restart the selected devices
- **Shutdown Selected**: Power off the selected devices (requires physical power-on to restart)

All actions require confirmation before executing.

## How It Works

### Device Detection

The dashboard automatically shows devices from three sources:

1. **Heartbeat Clients**: Devices running the kiosk client script that send regular heartbeats (shown as "Online (Heartbeat)")
2. **ARP Table**: All devices on your local network detected via ARP (shown as "Detected (ARP)")
3. **Network Scan**: Additional devices discovered via manual network scanning

**Your specific case:**
- Devices like `172.168.1.23` are automatically detected via ARP
- They appear in the dashboard even if they're not running the kiosk client
- You can see their IP and MAC address
- Use "Resolve Hostnames" to get their device names

### Real-Time Updates

- The device list automatically refreshes every 30 seconds
- Online status is based on the last heartbeat (within the last 60 seconds)
- Manual refresh available with the "Refresh Connected" button

### Commands

When you send a command (URL change, reboot, shutdown):
1. The command is queued on the server
2. The next time the device sends a heartbeat, it receives the command
3. The device executes the command immediately
4. The device list updates to reflect the change

**Note**: Commands are executed within 15 seconds (the heartbeat interval).

## Supported Commands

### URL Change (`update_url`)
- Changes the displayed URL on the kiosk
- Browser automatically reloads with the new URL
- URL is saved locally on the device

### Reboot (`reboot`)
- Restarts the device
- Device will come back online automatically
- Kiosk mode resumes after reboot

### Shutdown (`shutdown`)
- Powers off the device completely
- **Requires physical power button** to turn back on
- Use this for end-of-day shutdown

## Tips

### Finding Your Subnet

If you're not sure what subnet to use:
1. Click "Scan Network" without entering a subnet (auto-detects)
2. Or check your server's IP address:
   - If your server is `192.168.0.178`, use `192.168.0.0/24`
   - If your server is `10.0.0.5`, use `10.0.0.0/24`

### Bulk Operations

To change URL or reboot multiple devices:
1. Use "Select All" to select all devices
2. Or click individual devices to select specific ones
3. Apply your action

### Troubleshooting

**No devices showing:**
- Click "Scan Network" to discover devices
- Make sure kiosk clients are running and connected
- Check that devices are on the same network

**Device shows as offline:**
- Device hasn't sent a heartbeat in over 60 seconds
- Check network connectivity
- Check if the kiosk client script is running

**Commands not working:**
- Make sure the device is online (green status)
- Wait 15-30 seconds for the command to be picked up
- Check device logs: `/var/log/kiosk-client.log`

**Shutdown requires password:**
- The kiosk setup script should configure sudo permissions
- If it doesn't work, run the setup script again as root

## Comparison with Old Dashboard

### Old Dashboard (index.html)
- ❌ Complex interface with many panels
- ❌ Deploy panel with SSH configuration
- ❌ Multiple tabs and sections
- ❌ Preview frame and blackout controls
- ❌ SSE clients and heartbeat clients separate

### New Dashboard (admin.html)
- ✅ Simple, focused interface
- ✅ Only essential features
- ✅ Network scanner built-in
- ✅ Easy device selection
- ✅ Clear visual feedback
- ✅ All devices in one view

## Security Notes

- The simplified dashboard has no authentication
- Use it only on trusted networks
- Consider adding firewall rules to restrict access
- The old dashboard (index.html) is still available if needed

## Next Steps

1. **Access the dashboard**: `http://YOUR_SERVER_IP:4000/admin.html`
2. **Scan your network** to find all devices
3. **Select devices** you want to control
4. **Change URLs** or **reboot/shutdown** as needed

The dashboard is designed to be simple and intuitive - no manual required!
