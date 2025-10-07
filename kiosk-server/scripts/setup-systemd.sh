#!/bin/bash

# Systemd Setup Script for Kiosk Server
# Run this on Ubuntu/Debian systems

set -e

if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root (use sudo)" 
   exit 1
fi

echo "=== Kiosk Server Systemd Setup ==="

# Configuration
INSTALL_DIR="/opt/kiosk-server"
SERVICE_USER="kiosk"
SERVICE_FILE="/etc/systemd/system/kiosk-server.service"

# Create service user
if ! id "$SERVICE_USER" &>/dev/null; then
    echo "Creating service user: $SERVICE_USER"
    useradd -r -s /bin/false -m -d /var/lib/kiosk $SERVICE_USER
fi

# Create installation directory
echo "Setting up installation directory: $INSTALL_DIR"
mkdir -p $INSTALL_DIR
mkdir -p $INSTALL_DIR/logs
mkdir -p $INSTALL_DIR/config

# Copy application files
echo "Copying application files..."
cp -r . $INSTALL_DIR/
chown -R $SERVICE_USER:$SERVICE_USER $INSTALL_DIR

# Install dependencies
echo "Installing Node.js dependencies..."
cd $INSTALL_DIR
sudo -u $SERVICE_USER npm ci --production || sudo -u $SERVICE_USER npm install --production

# Setup environment file
if [ ! -f "$INSTALL_DIR/.env" ]; then
    echo "Creating .env from production example..."
    cp $INSTALL_DIR/env.production.example $INSTALL_DIR/.env
    chown $SERVICE_USER:$SERVICE_USER $INSTALL_DIR/.env
    chmod 600 $INSTALL_DIR/.env
    echo "✓ Created .env - Please edit it with your actual values:"
    echo "  nano $INSTALL_DIR/.env"
fi

# Install systemd service
echo "Installing systemd service..."
cp $INSTALL_DIR/scripts/kiosk-server.service $SERVICE_FILE

# Adjust paths in service file
sed -i "s|/opt/kiosk-server|$INSTALL_DIR|g" $SERVICE_FILE
sed -i "s|User=kiosk|User=$SERVICE_USER|g" $SERVICE_FILE

# Reload systemd
systemctl daemon-reload

# Enable and start service
echo "Enabling service..."
systemctl enable kiosk-server

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Edit the environment configuration:"
echo "   sudo nano $INSTALL_DIR/.env"
echo ""
echo "2. Start the service:"
echo "   sudo systemctl start kiosk-server"
echo ""
echo "3. Check status:"
echo "   sudo systemctl status kiosk-server"
echo ""
echo "4. View logs:"
echo "   sudo journalctl -u kiosk-server -f"
echo ""
echo "5. Enable auto-start on boot:"
echo "   sudo systemctl enable kiosk-server"
