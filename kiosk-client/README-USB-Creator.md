# Kiosk USB Creator Guide

## Overview
This script creates a customized Linux Mint USB installer that automatically sets up kiosks with Swedish keyboard, Stockholm timezone, and all necessary configurations pre-installed.

## Prerequisites (Linux Build Machine)

You need a Linux machine (can be a VM) to run the ISO builder. Install these packages:

```bash
sudo apt-get update
sudo apt-get install -y \
    squashfs-tools \
    xorriso \
    curl \
    isolinux \
    syslinux-utils
```

## Swedish/Stockholm Customizations Included

### 🇸🇪 **Language & Region:**
- **Locale:** Swedish (sv_SE.UTF-8)
- **Keyboard:** Swedish layout (se)
- **Timezone:** Europe/Stockholm
- **Console:** Swedish keyboard support

### ⚡ **Performance Optimizations:**
- **Disabled Services:** Bluetooth, CUPS printing, Avahi
- **Faster Boot:** 2-second GRUB timeout
- **Firefox Policies:** Disabled updates, telemetry, studies
- **Library Preloading:** Faster Firefox startup

### 🔧 **Pre-Seeded Components:**
- **User Account:** `tahar`/`tahar` with sudo access
- **Student User:** Passwordless account for kiosk display
- **SSH Server:** Pre-installed, enabled, and configured
- **Auto-Login:** Student user logs in automatically to kiosk mode
- **Firefox:** Pre-configured policies for kiosk use
- **Remote Management:** Immediately accessible from admin dashboard
- **Kiosk Session:** Custom X session that launches browser automatically

## How to Use

### Step 1: Prepare Files
Copy your entire `kiosk-client` directory to your Linux build machine:
```bash
# On your Linux build machine
scp -r user@windows-machine:/path/to/kiosk-client ./
cd kiosk-client
```

### Step 2: Make Script Executable
```bash
chmod +x create-kiosk-iso.sh
```

### Step 3: Run the Builder
```bash
sudo ./create-kiosk-iso.sh
```

**What happens:**
1. Downloads Linux Mint 21.3 ISO (~2.8GB)
2. Extracts and customizes the system
3. Adds Swedish localization
4. Installs kiosk components
5. Creates `kiosk-mint.iso` (~3GB)

### Step 4: Create USB Drive
Use any USB imaging tool:
- **Rufus** (Windows): https://rufus.ie
- **balenaEtcher** (Any OS): https://www.balena.io/etcher
- **dd** (Linux): `sudo dd if=kiosk-mint.iso of=/dev/sdX bs=4M status=progress`

## Installation Process

### What the User Sees:
1. **Boot from USB** - Normal Linux Mint installer appears
2. **Install Normally** - Follow standard installation process  
3. **Swedish by Default** - Keyboard and timezone already set
4. **First Reboot** - System automatically configures itself as a kiosk
5. **Ready to Use** - Kiosk connects to your server and appears in admin dashboard

### Post-Installation:
- **SSH User:** `tahar`/`tahar` - Ready for admin dashboard deployment
- **Kiosk User:** `student` - Auto-logs in and launches Firefox
- **SSH Access:** Enabled and configured (port 22)
- **Sudo Access:** `tahar` can run system commands without password prompts
- **Auto-Boot:** Machine boots directly to kiosk mode
- **Remote Control:** Immediately appears in admin dashboard
- **Zero Configuration:** Ready to use out of the box

## Customization Options

### Change Default Server:
Edit `start-kiosk.sh` before building:
```bash
SERVER_BASE="http://YOUR_SERVER_IP:4000"
```

### Different Linux Mint Version:
Edit `create-kiosk-iso.sh`:
```bash
BASE_ISO_URL="https://mirrors.edge.kernel.org/linuxmint/stable/21.3/linuxmint-21.3-xfce-64bit.iso"
```

### Add More Software:
In `create-kiosk-iso.sh`, add to the `CHROOT_COMMANDS`:
```bash
CHROOT_COMMANDS+="apt-get install -y your-package-here; "
```

## Troubleshooting

### Build Fails:
- Check internet connection (downloads ISO)
- Ensure you have enough disk space (6GB+)
- Run with sudo
- Check all prerequisite packages are installed

### USB Won't Boot:
- Use Rufus in "DD Image" mode
- Ensure UEFI/Legacy BIOS settings match
- Try different USB ports/drives

### Swedish Layout Not Working:
- The customization happens during OS installation
- Should work automatically after first reboot
- Can manually switch with `setxkbmap se`

## File Structure After Build:
```
kiosk-client/
├── create-kiosk-iso.sh          # USB creator script
├── start-kiosk.sh               # Main kiosk script
├── kiosk-mint.iso               # Final customized ISO (created)
└── mint_build/                  # Temporary build files (auto-cleaned)
```

## Benefits of This Approach:
- **Zero Manual Configuration** - Everything automated
- **Swedish-Ready** - Keyboard and timezone pre-set
- **Mass Deployment** - One USB for many machines
- **Consistent Setup** - Identical configuration every time
- **Fast Installation** - Optimized for performance
