# Environment Variables Setup Guide

## Required vs Optional Variables

### ✅ REQUIRED (Must be set)
**NONE** - The server works out-of-the-box with defaults!

### 🔧 RECOMMENDED (Should customize)

```bash
# Server settings
PORT=4000                    # Port to run on (default: 4000)
KIOSK_URL=https://example.com  # Default URL to display

# Security (highly recommended for production)
ADMIN_TOKEN=yoursecrettoken  # Protects admin endpoints
CORS_ORIGIN=https://yourdomain.com  # Restrict API access
```

### ⚙️ OPTIONAL (Advanced configuration)

```bash
# Environment
NODE_ENV=production          # 'development' or 'production'
FORCE_HTTPS=false           # Force HTTPS redirect

# UI Customization
KIOSK_TITLE=My Kiosk        # Browser title
KIOSK_FOOTER_TEXT=© 2025    # Footer text
TIMEZONE=Europe/Berlin      # Timezone for clock
DISABLE_CONTEXT_MENU=true   # Disable right-click
DISABLE_SHORTCUTS=true      # Disable keyboard shortcuts

# Security Limits
MAX_SSE_CLIENTS=100         # Max concurrent SSE connections
MAX_HB_CLIENTS=200          # Max heartbeat clients
MAX_HEARTBEAT_RATE=120      # Heartbeats per minute per IP
MAX_COMMAND_QUEUE_SIZE=100  # Max queued commands

# SSH Deployment (for admin UI prefill)
SERVER_BASE=http://192.168.1.10:4000  # Server URL for clients
DEFAULT_SSH_USERNAME=kiosk   # Default SSH username
DEFAULT_SSH_PASSWORD=        # Leave empty, use SSH keys

# Static Files
STATIC_DIR=public           # Static assets directory
```

## Quick Start Configurations

### Minimal .env (Testing)
```bash
# Just copy .env.example to .env and start!
# Everything has sensible defaults
PORT=4000
KIOSK_URL=https://google.com
```

### Development .env
```bash
PORT=4000
NODE_ENV=development
CORS_ORIGIN=*
KIOSK_URL=https://example.com
KIOSK_TITLE=Dev Kiosk
# No ADMIN_TOKEN for easy testing
```

### Production .env
```bash
PORT=4000
NODE_ENV=production
CORS_ORIGIN=https://yourdomain.com
KIOSK_URL=https://yourapp.com
KIOSK_TITLE=Production Kiosk
ADMIN_TOKEN=your-strong-secret-token-here
FORCE_HTTPS=true

# Security limits
MAX_SSE_CLIENTS=100
MAX_HB_CLIENTS=200
MAX_HEARTBEAT_RATE=60

# Deployment
SERVER_BASE=https://kiosk.yourdomain.com
DEFAULT_SSH_USERNAME=kiosk
```

## Environment Variable Behavior

### PORT
- **Default**: 4000
- **Usage**: Server listens on this port
- **Example**: `PORT=8080`

### ADMIN_TOKEN
- **Default**: Empty (no authentication)
- **Usage**: If set, these endpoints require `x-admin-token` header:
  - `POST /api/config`
  - `POST /api/config/ip/:ip`
  - `POST /api/action`
  - `GET /api/devices`
  - `GET /api/heartbeat/clients`
  - `POST /api/heartbeat/command`
  - `POST /api/deploy`
  - `POST /api/restart`
- **Example**: `ADMIN_TOKEN=mysecrettoken123`

### CORS_ORIGIN
- **Default**: `*` (allow all)
- **Usage**: Controls which origins can access the API
- **Examples**:
  - `CORS_ORIGIN=*` - Allow all (development only!)
  - `CORS_ORIGIN=https://yourdomain.com` - Single origin
  - `CORS_ORIGIN=https://admin.example.com,https://kiosk.example.com` - Multiple (NOT currently supported, use single or *)

### KIOSK_URL
- **Default**: Empty string
- **Usage**: Initial URL displayed in kiosks
- **Example**: `KIOSK_URL=https://dashboard.company.com`

### Security Limits
- **Defaults**: See values above
- **Usage**: Prevents resource exhaustion attacks
- **When to change**:
  - Increase for larger deployments
  - Decrease for resource-constrained servers

## Common Issues

### ❌ "Unauthorized" errors
**Problem**: ADMIN_TOKEN is set but not provided
**Solution**: 
- Remove ADMIN_TOKEN from .env for testing
- OR provide token in admin dashboard settings
- OR send `x-admin-token` header in API requests

### ❌ "CORS error" in browser
**Problem**: CORS_ORIGIN doesn't include your domain
**Solution**: Set `CORS_ORIGIN=*` or add your domain

### ❌ Port already in use
**Problem**: Another process using the port
**Solution**: 
```bash
# Change port
PORT=4001

# Or kill existing process (Windows)
netstat -ano | findstr :4000
taskkill /PID <PID> /F

# Or kill existing process (Linux/Mac)
lsof -i :4000
kill -9 <PID>
```

### ❌ Kiosks not updating
**Problem**: Could be multiple issues
**Check**:
1. Is ADMIN_TOKEN set? If yes, check admin panel settings
2. Are kiosks connected? Check Devices panel
3. Firewall blocking connections?

## Testing Your Configuration

### 1. Test server starts
```bash
npm start
# Should see: "Kiosk server running on port 4000"
```

### 2. Test API access
```bash
# Should return server time
curl http://localhost:4000/api/time

# Should return config
curl http://localhost:4000/api/config
```

### 3. Test with ADMIN_TOKEN
```bash
# Set in .env
ADMIN_TOKEN=testtoken

# Test without token (should fail)
curl http://localhost:4000/api/devices
# Returns: {"error":"Unauthorized"}

# Test with token (should work)
curl -H "x-admin-token: testtoken" http://localhost:4000/api/devices
```

## Best Practices

### 🔒 Security
1. **Always** set ADMIN_TOKEN in production
2. **Never** commit .env to git (already in .gitignore)
3. Use specific CORS_ORIGIN, not `*`
4. Use HTTPS in production (FORCE_HTTPS=true)

### 🚀 Performance
1. Adjust security limits based on your scale
2. Use PM2 cluster mode for load balancing
3. Put Nginx in front for SSL termination

### 🛠️ Development
1. Keep ADMIN_TOKEN empty for easy testing
2. Use CORS_ORIGIN=* during development
3. Enable detailed logging with NODE_ENV=development

## Need Help?

1. **Copy the example**: `cp .env.example .env`
2. **Edit minimal settings**: Just PORT and KIOSK_URL
3. **Start server**: `npm start`
4. **Add security later**: Set ADMIN_TOKEN when ready

The server is designed to work with ZERO configuration - just `npm start`!
