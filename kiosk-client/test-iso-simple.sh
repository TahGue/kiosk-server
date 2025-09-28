#!/bin/bash

# Simple test script - just repack the original ISO without modifications
# This will test if our repack process works at all

set -e

log() { echo "[INFO] $1"; }
error() { echo "[ERROR] $1" >&2; exit 1; }

# Check for root
if [[ $EUID -ne 0 ]]; then
   error "Run with sudo"
fi

BASE_ISO="linuxmint-21.3-cinnamon-64bit.iso"
TEST_ISO="test-mint.iso"

# Download original if needed
if [ ! -f "$BASE_ISO" ]; then
    log "Downloading Linux Mint ISO..."
    curl -L "https://mirrors.edge.kernel.org/linuxmint/stable/21.3/$BASE_ISO" -o "$BASE_ISO"
fi

log "Creating test directory..."
rm -rf test_build
mkdir test_build
cd test_build

log "Extracting original ISO..."
7z x "../$BASE_ISO" -o./iso_new

log "Creating bootable ISO with xorriso..."
xorriso -as mkisofs \
    -r -V "Test_Mint" \
    -J -joliet-long -l \
    -b isolinux/isolinux.bin \
    -c isolinux/boot.cat \
    -no-emul-boot \
    -boot-load-size 4 \
    -boot-info-table \
    -eltorito-alt-boot \
    -e boot/grub/efi.img \
    -no-emul-boot \
    -isohybrid-mbr ../isohdpfx.bin \
    -o "../$TEST_ISO" \
    iso_new/

cd ..
rm -rf test_build

log "Test ISO created: $TEST_ISO"
log "Try booting this first - it should work identical to original"
