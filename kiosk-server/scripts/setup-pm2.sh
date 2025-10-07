#!/bin/bash

# PM2 Setup Script for Kiosk Server
# Run this on your production server

set -e

echo "=== Kiosk Server PM2 Setup ==="

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2 globally..."
    npm install -g pm2
fi

# Create logs directory
mkdir -p logs

# Check if .env exists
if [ ! -f .env ]; then
    echo "Creating .env from production example..."
    if [ -f env.production.example ]; then
        cp env.production.example .env
        echo "✓ Created .env - Please edit it with your actual values!"
    else
        echo "✗ No env.production.example found!"
        exit 1
    fi
fi

# Install dependencies
echo "Installing dependencies..."
npm ci --production || npm install --production

# Start with PM2
echo "Starting application with PM2..."
pm2 start ecosystem.config.js --env production

# Save PM2 process list
pm2 save

# Generate startup script
echo ""
echo "To enable auto-start on system boot, run:"
echo "  pm2 startup"
echo "Then follow the instructions provided."
echo ""

# Show status
pm2 status

echo ""
echo "=== Setup Complete ==="
echo "Useful commands:"
echo "  pm2 status        - Show process status"
echo "  pm2 logs          - Show logs"
echo "  pm2 reload all    - Graceful reload"
echo "  pm2 monit         - Monitor CPU/Memory"
echo "  pm2 plus          - Web dashboard (optional)"
