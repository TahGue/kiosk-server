# Production Deployment Guide

This guide covers deploying the Kiosk Server to a production Linux server.

## Prerequisites

- Ubuntu 20.04+ or Debian 11+ (or equivalent)
- Node.js 16+ installed
- Nginx (optional, for reverse proxy)
- Domain name pointing to your server (optional)

## Quick Start with PM2

PM2 is a production process manager for Node.js applications with built-in load balancer.

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/kiosk-server.git
cd kiosk-server

# 2. Run the PM2 setup script
chmod +x scripts/setup-pm2.sh
./scripts/setup-pm2.sh

# 3. Configure your environment
nano .env

# 4. Start the application
pm2 start ecosystem.config.js --env production

# 5. Save PM2 configuration
pm2 save
pm2 startup  # Follow the instructions to enable auto-start
```

## Alternative: Systemd Service

For systems that prefer systemd over PM2:

```bash
# Run as root (or with sudo)
sudo bash scripts/setup-systemd.sh

# Edit configuration
sudo nano /opt/kiosk-server/.env

# Start service
sudo systemctl start kiosk-server
sudo systemctl enable kiosk-server
```

## Nginx Reverse Proxy Setup

```bash
# 1. Copy nginx configuration
sudo cp scripts/nginx-kiosk.conf /etc/nginx/sites-available/kiosk

# 2. Edit the configuration
sudo nano /etc/nginx/sites-available/kiosk
# Update server_name with your domain

# 3. Enable the site
sudo ln -s /etc/nginx/sites-available/kiosk /etc/nginx/sites-enabled/

# 4. Test configuration
sudo nginx -t

# 5. Reload Nginx
sudo systemctl reload nginx
```

## SSL with Let's Encrypt

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d kiosk.example.com

# Auto-renewal is set up automatically
```

## CORS Configuration

Edit your `.env` file to set allowed origins:

```bash
# Single origin
CORS_ORIGIN=https://kiosk.example.com

# Multiple origins (comma-separated)
CORS_ORIGIN=https://admin.example.com,https://kiosk.example.com

# Allow all (not recommended for production)
CORS_ORIGIN=*
```

## Monitoring

### Built-in Monitoring Script

```bash
# Start the monitoring script
cd /opt/kiosk-server
node scripts/monitor.js &

# Or with PM2
pm2 start scripts/monitor.js --name kiosk-monitor
```

### PM2 Monitoring

```bash
# Real-time monitoring
pm2 monit

# View logs
pm2 logs kiosk-server

# View detailed metrics
pm2 info kiosk-server

# Web-based dashboard (optional)
pm2 plus
```

### System Logs (systemd)

```bash
# View logs
sudo journalctl -u kiosk-server -f

# View last 100 lines
sudo journalctl -u kiosk-server -n 100

# View logs from last hour
sudo journalctl -u kiosk-server --since "1 hour ago"
```

## Resource Limits

Default limits in production:

- `MAX_SSE_CLIENTS`: 100 concurrent SSE connections
- `MAX_HB_CLIENTS`: 200 tracked heartbeat clients
- `MAX_HEARTBEAT_RATE`: 60 requests/minute per IP
- `MAX_COMMAND_QUEUE_SIZE`: 50 queued commands per client

Adjust in `.env` based on your server capacity:

```bash
# For a small server (1GB RAM, 1 CPU)
MAX_SSE_CLIENTS=50
MAX_HB_CLIENTS=100

# For a larger server (4GB RAM, 2+ CPUs)
MAX_SSE_CLIENTS=200
MAX_HB_CLIENTS=500
```

## Performance Tuning

### PM2 Cluster Mode

Edit `ecosystem.config.js`:

```javascript
// Number of instances (0 = auto-detect CPU cores)
instances: 0,
exec_mode: 'cluster',
```

### Node.js Memory

```javascript
// In ecosystem.config.js
node_args: '--max-old-space-size=1024',  // 1GB heap
max_memory_restart: '1G',  // Auto-restart if memory exceeds 1GB
```

### Nginx Caching

Enable caching for static assets in nginx configuration.

## Backup and Recovery

### Database Backup

```bash
# Backup configuration and heartbeat data
tar -czf kiosk-backup-$(date +%Y%m%d).tar.gz config/

# Restore
tar -xzf kiosk-backup-20240101.tar.gz
```

### PM2 Backup

```bash
# Save current PM2 configuration
pm2 save

# Backup PM2 config
cp ~/.pm2/dump.pm2 ~/pm2-backup-$(date +%Y%m%d).pm2

# Restore
pm2 resurrect ~/pm2-backup-20240101.pm2
```

## Security Checklist

- [ ] Change default ports if exposed to internet
- [ ] Set strong ADMIN_TOKEN in production
- [ ] Configure CORS_ORIGIN to specific domains
- [ ] Use HTTPS with valid SSL certificates
- [ ] Set up firewall rules (ufw or iptables)
- [ ] Regular security updates: `sudo apt update && sudo apt upgrade`
- [ ] Monitor logs for suspicious activity
- [ ] Set up fail2ban for brute force protection
- [ ] Use SSH keys instead of passwords

## Troubleshooting

### Service won't start

```bash
# Check logs
pm2 logs kiosk-server --lines 100
# or
sudo journalctl -u kiosk-server -n 50

# Check port availability
sudo lsof -i :4000

# Verify Node.js version
node --version  # Should be 16+
```

### High Memory Usage

```bash
# Check current usage
pm2 info kiosk-server

# Restart to clear memory
pm2 restart kiosk-server

# Adjust memory limit in ecosystem.config.js
```

### SSE Connections Dropping

- Check nginx `proxy_read_timeout` settings
- Verify firewall/proxy timeout settings
- Monitor with: `pm2 logs kiosk-server | grep SSE`

### Rate Limiting Issues

```bash
# Check cleanup stats in logs
pm2 logs kiosk-server | grep CLEANUP

# Temporarily increase limits in .env
MAX_HEARTBEAT_RATE=120
```

## Support

- Check logs first: `pm2 logs` or `journalctl`
- Monitor resource usage: `pm2 monit` or `htop`
- Test endpoints: `curl http://localhost:4000/api/time`
- Review this guide and README.md
