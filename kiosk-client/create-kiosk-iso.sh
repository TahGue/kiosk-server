#!/bin/bash
#
# Script to create a customized Linux Mint Kiosk Live ISO.
# This automates the process of adding the kiosk script and its dependencies
# to a standard Linux Mint installation ISO.
#
# WARNING:
# 1. This script MUST be run with sudo.
# 2. It requires an internet connection to download the ISO and packages.
# 3. It should be run on a dedicated Linux build machine or VM, NOT your primary workstation.
#
# PREREQUISITES on the build machine:
# sudo apt-get update
# sudo apt-get install -y squashfs-tools xorriso curl isolinux syslinux-utils genisoimage
#

set -e

# --- Configuration ---
# You can change this URL to a different Linux Mint version if needed.
BASE_ISO_URL="https://mirrors.edge.kernel.org/linuxmint/stable/21.3/linuxmint-21.3-cinnamon-64bit.iso"
ISO_FILENAME=$(basename "$BASE_ISO_URL")
WORK_DIR="mint_build"
FINAL_ISO_NAME="kiosk-mint.iso"

# --- Helper Functions ---
log() {
    echo "[INFO] $1"
}

error() {
    echo "[ERROR] $1" >&2
    exit 1
}

cleanup() {
  log "Cleaning up temporary files..."
  cd ..
  
  # Ensure all mounts are properly unmounted before cleanup
  if [[ -d "$WORK_DIR/chroot" ]]; then
    sudo umount "$WORK_DIR/chroot/proc" 2>/dev/null || true
    sudo umount "$WORK_DIR/chroot/sys" 2>/dev/null || true  
    sudo umount "$WORK_DIR/chroot/dev/pts" 2>/dev/null || true
    sudo umount "$WORK_DIR/chroot/dev" 2>/dev/null || true
    # Wait a moment for unmounts to complete
    sleep 1
  fi
  
  if [[ -d "$WORK_DIR" ]]; then
    sudo rm -rf "$WORK_DIR"
  fi
}

# --- Main Script ---

# 1. Check for root privileges
if [[ $EUID -ne 0 ]]; then
   error "This script must be run as root. Please use sudo."
fi

# 2. Check for start-kiosk.sh and store absolute path
SCRIPT_DIR="$(pwd)"
KIOSK_SCRIPT_SOURCE="$SCRIPT_DIR/start-kiosk.sh"

if [ ! -f "start-kiosk.sh" ]; then
    error "'start-kiosk.sh' not found. Make sure it's in the same directory as this script."
fi

# 3. Clean up and set up the build directory
cleanup
mkdir -p "$WORK_DIR"
cd "$WORK_DIR"

# 4. Download the base Linux Mint ISO if it doesn't exist
if [ ! -f "$ISO_FILENAME" ]; then
    log "Downloading Linux Mint ISO: $ISO_FILENAME..."
    curl -L -o "$ISO_FILENAME" "$BASE_ISO_URL"
else
    log "Using existing ISO: $ISO_FILENAME"
fi

# 5. Mount the ISO and extract its contents
log "Mounting and extracting ISO contents..."
mkdir -p iso_mount iso_new
sudo mount -o loop "$ISO_FILENAME" iso_mount
rsync -a iso_mount/ iso_new/
sudo umount iso_mount

# 6. Unpack the main filesystem
log "Unpacking SquashFS filesystem..."
mkdir -p chroot
sudo unsquashfs -d chroot iso_new/casper/filesystem.squashfs

# 7. Prepare the chroot environment
log "Preparing chroot environment..."
sudo mount --bind /dev/ chroot/dev
sudo mount -t proc proc chroot/proc
sudo mount -t sysfs sys chroot/sys

# Copy DNS configuration to allow internet access inside chroot
sudo cp /etc/resolv.conf chroot/etc/

# 8. Customize the system inside the chroot
log "Customizing system inside chroot..."

# Path to the kiosk script inside the chroot
KIOSK_SCRIPT_DEST="/usr/local/bin/start-kiosk.sh"

# The commands to be run inside the chroot
CHROOT_COMMANDS=""
# Set non-interactive frontend to avoid prompts
CHROOT_COMMANDS+="export DEBIAN_FRONTEND=noninteractive; "

# Configure Swedish locale and keyboard
CHROOT_COMMANDS+="locale-gen sv_SE.UTF-8; "
CHROOT_COMMANDS+="update-locale LANG=sv_SE.UTF-8; "
CHROOT_COMMANDS+="echo 'XKBLAYOUT=\"se\"' >> /etc/default/keyboard; "
CHROOT_COMMANDS+="setupcon -k --force; "

# Set Stockholm timezone
CHROOT_COMMANDS+="ln -sf /usr/share/zoneinfo/Europe/Stockholm /etc/localtime; "
CHROOT_COMMANDS+="echo 'Europe/Stockholm' > /etc/timezone; "
CHROOT_COMMANDS+="dpkg-reconfigure -f noninteractive tzdata; "

# Update package lists (with retry for reliability)
CHROOT_COMMANDS+="apt-get update || (sleep 5 && apt-get update); "

# Install essential packages
CHROOT_COMMANDS+="apt-get install -y openssh-server firefox curl wget sudo; "

# Create tahar user with password and sudo access
CHROOT_COMMANDS+="useradd -m -s /bin/bash tahar; "
CHROOT_COMMANDS+="echo 'tahar:tahar' | chpasswd; "
CHROOT_COMMANDS+="usermod -aG sudo tahar; "

# Create student user (used by kiosk)
CHROOT_COMMANDS+="useradd -m -s /bin/bash student; "
CHROOT_COMMANDS+="passwd -d student; "

# Configure SSH server
CHROOT_COMMANDS+="systemctl enable ssh; "
CHROOT_COMMANDS+="sed -i 's/#PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config; "
CHROOT_COMMANDS+="sed -i 's/#PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config; "
CHROOT_COMMANDS+="sed -i 's/#PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config; "

# Allow tahar to use sudo without password for system management
CHROOT_COMMANDS+="echo 'tahar ALL=(ALL) NOPASSWD: /usr/bin/systemctl, /sbin/reboot, /sbin/shutdown, /usr/local/bin/start-kiosk.sh' >> /etc/sudoers; "

# Performance optimizations
CHROOT_COMMANDS+="systemctl disable bluetooth; "
CHROOT_COMMANDS+="systemctl disable cups; "
CHROOT_COMMANDS+="systemctl disable avahi-daemon; "

# Preload common libraries for faster Firefox startup
CHROOT_COMMANDS+="echo '/usr/lib/firefox' >> /etc/ld.so.conf.d/firefox.conf; "
CHROOT_COMMANDS+="ldconfig; "

# Create a service to run the kiosk setup on first boot
# This service will run start-kiosk.sh with sudo, then disable itself.
CHROOT_COMMANDS+="cat <<'EOF' > /etc/systemd/system/kiosk-first-boot.service
[Unit]
Description=Kiosk First Boot Setup
After=network-online.target

[Service]
Type=oneshot
ExecStart=/bin/bash -c 'sudo bash /usr/local/bin/start-kiosk.sh && systemctl disable kiosk-first-boot.service'
RemainAfterExit=true

[Install]
WantedBy=multi-user.target
EOF
"

# Enable the first-boot service
CHROOT_COMMANDS+="systemctl enable kiosk-first-boot.service; "

# Configure Swedish regional settings
CHROOT_COMMANDS+="cat <<'EOF' > /etc/default/locale
LANG=sv_SE.UTF-8
LANGUAGE=sv_SE:sv:en
LC_ALL=sv_SE.UTF-8
EOF
"

# Set Swedish keyboard for console
CHROOT_COMMANDS+="cat <<'EOF' > /etc/default/console-setup
CHARMAP=\"UTF-8\"
CODESET=\"Lat15\"
FONTFACE=\"Fixed\"
FONTSIZE=\"16\"
XKBMODEL=\"pc105\"
XKBLAYOUT=\"se\"
XKBVARIANT=\"\"
XKBOPTIONS=\"\"
EOF
"

# Create a faster boot configuration
CHROOT_COMMANDS+="cat <<'EOF' >> /etc/default/grub
# Faster boot for kiosk
GRUB_TIMEOUT=2
GRUB_CMDLINE_LINUX_DEFAULT=\"quiet splash nomodeset\"
EOF
"
CHROOT_COMMANDS+="update-grub; "

# Pre-configure Firefox for kiosk use
CHROOT_COMMANDS+="mkdir -p /etc/firefox/policies; "
CHROOT_COMMANDS+="cat <<'EOF' > /etc/firefox/policies/policies.json
{
  \"policies\": {
    \"DisableAppUpdate\": true,
    \"DisableFirefoxStudies\": true,
    \"DisableTelemetry\": true,
    \"DisableProfileImport\": true,
    \"OverrideFirstRunPage\": \"\",
    \"OverridePostUpdatePage\": \"\",
    \"DontCheckDefaultBrowser\": true,
    \"DisableProfileRefresh\": true,
    \"NoDefaultBookmarks\": true
  }
}
EOF
"

# Configure LightDM for auto-login to student user
CHROOT_COMMANDS+="mkdir -p /etc/lightdm/lightdm.conf.d; "
CHROOT_COMMANDS+="cat <<'EOF' > /etc/lightdm/lightdm.conf.d/60-kiosk-autologin.conf
[Seat:*]
autologin-user=student
autologin-session=kiosk
EOF
"

# Create the kiosk session desktop file
CHROOT_COMMANDS+="mkdir -p /usr/share/xsessions; "
CHROOT_COMMANDS+="cat <<'EOF' > /usr/share/xsessions/kiosk.desktop
[Desktop Entry]
Name=Kiosk Mode
Comment=Starts the kiosk browser session
Exec=/usr/local/bin/start-kiosk.sh
Type=Application
EOF
"

# Create a simple kiosk configuration file
CHROOT_COMMANDS+="mkdir -p /etc; "
CHROOT_COMMANDS+="cat <<'EOF' > /etc/kiosk-client.conf
# Kiosk client configuration - will be updated by deployment
SERVER_BASE=\"http://192.168.0.178:4000\"
SSH_ENABLE=\"true\"
SSH_USER=\"tahar\"
SSH_PASSWORD=\"tahar\"
SSH_PASSWORD_AUTH=\"yes\"
EOF
"

# Run the chroot commands
sudo chroot chroot /bin/bash -c "$CHROOT_COMMANDS"

# Copy the kiosk script into the chroot environment
log "Copying start-kiosk.sh into the new filesystem..."
sudo cp "$KIOSK_SCRIPT_SOURCE" "chroot/$KIOSK_SCRIPT_DEST"
sudo chmod +x "chroot/$KIOSK_SCRIPT_DEST"

# 9. Clean up the chroot environment
log "Cleaning up chroot environment..."
# Unmount in reverse order of mounting, with error tolerance
sudo umount chroot/proc || true
sudo umount chroot/sys || true  
sudo umount chroot/dev || true

# 10. Repack the filesystem
log "Repacking the SquashFS filesystem..."
sudo rm iso_new/casper/filesystem.squashfs
sudo mksquashfs chroot iso_new/casper/filesystem.squashfs -comp xz -b 1M

# Update the filesystem size manifest
printf $(sudo du -sx --block-size=1 chroot | cut -f1) > iso_new/casper/filesystem.size

# 11. Update MD5 checksums for integrity
log "Updating MD5 checksums..."
cd iso_new
find . -type f -print0 | xargs -0 md5sum > md5sum.txt
cd ..

# 12. Create the new bootable ISO with proper boot support
FINAL_ISO_PATH="$(pwd)/../$FINAL_ISO_NAME"
log "Creating bootable ISO: $FINAL_ISO_PATH..."

# Method 1: Try with xorriso first (recommended)
if command -v xorriso >/dev/null 2>&1; then
    log "Using xorriso for ISO creation..."
    sudo xorriso \
        -as mkisofs \
        -iso-level 3 \
        -full-iso9660-filenames \
        -volid "Kiosk_Mint" \
        -eltorito-boot isolinux/isolinux.bin \
        -eltorito-catalog isolinux/boot.cat \
        -no-emul-boot \
        -boot-load-size 4 \
        -boot-info-table \
        -eltorito-alt-boot \
        -e boot/grub/efi.img \
        -no-emul-boot \
        -isohybrid-gpt-basdat \
        -output "$FINAL_ISO_PATH" \
        iso_new/
        
    # Make it hybrid bootable for USB
    if command -v isohybrid >/dev/null 2>&1; then
        log "Making ISO hybrid for USB boot..."
        sudo isohybrid "$FINAL_ISO_PATH" 2>/dev/null || log "isohybrid warning (non-fatal)"
    fi
    
# Method 2: Fallback to genisoimage
elif command -v genisoimage >/dev/null 2>&1; then
    log "Using genisoimage for ISO creation..."
    sudo genisoimage \
        -r -V "Kiosk_Mint" \
        -cache-inodes -J -l \
        -b isolinux/isolinux.bin \
        -c isolinux/boot.cat \
        -no-emul-boot \
        -boot-load-size 4 \
        -boot-info-table \
        -o "$FINAL_ISO_PATH" \
        iso_new/
        
    # Make it hybrid bootable for USB
    if command -v isohybrid >/dev/null 2>&1; then
        log "Making ISO hybrid for USB boot..."
        sudo isohybrid "$FINAL_ISO_PATH" 2>/dev/null || log "isohybrid warning (non-fatal)"
    fi
    
# Method 3: Last resort with mkisofs
elif command -v mkisofs >/dev/null 2>&1; then
    log "Using mkisofs for ISO creation..."
    sudo mkisofs \
        -r -V "Kiosk_Mint" \
        -cache-inodes -J -l \
        -b isolinux/isolinux.bin \
        -c isolinux/boot.cat \
        -no-emul-boot \
        -boot-load-size 4 \
        -boot-info-table \
        -o "$FINAL_ISO_PATH" \
        iso_new/
        
    # Make it hybrid bootable for USB
    if command -v isohybrid >/dev/null 2>&1; then
        log "Making ISO hybrid for USB boot..."
        sudo isohybrid "$FINAL_ISO_PATH" 2>/dev/null || log "isohybrid warning (non-fatal)"
    fi
else
    error "No ISO creation tool found (xorriso, genisoimage, or mkisofs required)"
fi

# Verify the ISO was created
if [[ -f "$FINAL_ISO_PATH" ]]; then
    log "ISO successfully created at: $FINAL_ISO_PATH"
    ISO_SIZE=$(du -h "$FINAL_ISO_PATH" | cut -f1)
    log "ISO file size: $ISO_SIZE"
    
    # Verify it's bootable by checking for boot signature
    if hexdump -C "$FINAL_ISO_PATH" | head -1 | grep -q "55 aa"; then
        log "ISO appears to have proper boot signature"
    else
        log "Warning: ISO may not have proper boot signature"
    fi
else
    error "Failed to create ISO file at $FINAL_ISO_PATH"
fi

# 13. Final cleanup
cd ..
cleanup

log "Successfully created '$FINAL_ISO_NAME'!"
log "Final location: $FINAL_ISO_PATH"
log ""
log "To write to USB drive, use one of these methods:"
log "1. sudo dd if='$FINAL_ISO_PATH' of=/dev/sdX bs=4M status=progress && sync"
log "2. Use Rufus (Windows) or Etcher (cross-platform)"
log "3. Use 'sudo cp $FINAL_ISO_PATH /dev/sdX && sync' (simple method)"
log ""
log "Replace /dev/sdX with your actual USB device (check with 'lsblk')"