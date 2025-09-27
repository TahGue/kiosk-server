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
# sudo apt-get install -y squashfs-tools genisoimage curl
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
    log "Cleaning up previous build environment..."
    if mount | grep -q "$WORK_DIR/iso_mount"; then
        sudo umount "$WORK_DIR/iso_mount"
    fi
    if mount | grep -q "$WORK_DIR/chroot/proc"; then
        sudo umount "$WORK_DIR/chroot/proc"
    fi
    if mount | grep -q "$WORK_DIR/chroot/sys"; then
        sudo umount "$WORK_DIR/chroot/sys"
    fi
    if mount | grep -q "$WORK_DIR/chroot/dev"; then
        sudo umount "$WORK_DIR/chroot/dev"
    fi
    sudo rm -rf "$WORK_DIR"
}

# --- Main Script ---

# 1. Check for root privileges
if [[ $EUID -ne 0 ]]; then
   error "This script must be run as root. Please use sudo."
fi

# 2. Check for start-kiosk.sh
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
# Update package lists
CHROOT_COMMANDS+="apt-get update; "
# Install SSH server for remote deployment
CHROOT_COMMANDS+="apt-get install -y openssh-server; "
# Install a browser if needed (Mint includes Firefox by default)
CHROOT_COMMANDS+="apt-get install -y firefox; "

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

# Run the chroot commands
sudo chroot chroot /bin/bash -c "$CHROOT_COMMANDS"

# Copy the kiosk script into the chroot environment
log "Copying start-kiosk.sh into the new filesystem..."
sudo cp "../start-kiosk.sh" "chroot/$KIOSK_SCRIPT_DEST"
sudo chmod +x "chroot/$KIOSK_SCRIPT_DEST"

# 9. Clean up the chroot environment
log "Cleaning up chroot environment..."
sudo umount chroot/dev chroot/proc chroot/sys

# 10. Repack the filesystem
log "Repacking the SquashFS filesystem..."
sudo rm iso_new/casper/filesystem.squashfs
sudo mksquashfs chroot iso_new/casper/filesystem.squashfs -comp xz -b 1M

# Update the filesystem size manifest
printf $(sudo du -sx --block-size=1 chroot | cut -f1) > iso_new/casper/filesystem.size

# 11. Create the new bootable ISO
log "Creating the final bootable ISO: $FINAL_ISO_NAME..."
(cd iso_new && sudo genisoimage -r -V "Kiosk Mint" -b isolinux/isolinux.bin -c isolinux/boot.cat -no-emul-boot -boot-load-size 4 -boot-info-table -o "../$FINAL_ISO_NAME" .)

# 12. Final cleanup
cd ..
cleanup

log "Successfully created '$FINAL_ISO_NAME'!"
log "You can now burn this ISO to a USB drive."
