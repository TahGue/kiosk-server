# Troubleshooting Guide

## Quick Diagnostics

Run this to test if the server logic is working:

```bash
node test-server.js
```

This will verify:
- ✅ Validation functions work correctly
- ✅ Dependencies are installed  
- ✅ .env file is configured
- ✅ All required modules load

## Common Issues & Solutions

### 🔴 Issue: "Address already in use" (EADDRINUSE)

**Symptom**: Server won't start, error about port 4000 in use

**Solutions**:

```bash
# Option 1: Kill the existing process
# Windows:
netstat -ano | findstr :4000
taskkill /PID <PID_NUMBER> /F

# Linux/Mac:
lsof -i :4000
kill -9 <PID>

# Option 2: Change the port in .env
PORT=4001
```

### 🔴 Issue: "Unauthorized" errors in admin panel

**Symptom**: Can't change URL or access devices panel

**Causes**:
1. `ADMIN_TOKEN` is set in `.env` but not provided in UI
2. Token mismatch

**Solutions**:

```bash
# Option 1: Remove token for testing
# In .env, change:
ADMIN_TOKEN=
# (leave it empty)

# Option 2: Set token in admin dashboard
# Click "Settings" button in top right
# Enter your ADMIN_TOKEN value
```

### 🔴 Issue: Kiosks not receiving URL updates

**Symptom**: Change URL in admin, but kiosks don't update

**Diagnostic steps**:

1. **Check if kiosk is connected**:
   - Open admin panel → Devices tab
   - Look for the kiosk's IP address
   - Green = connected, Grey = disconnected

2. **Check browser console** (on kiosk):
   - Press F12
   - Look for SSE connection errors
   - Should see "SSE connected" message

3. **Check firewall**:
   ```bash
   # On server (Linux):
   sudo ufw allow 4000
   
   # Windows: Add inbound rule for port 4000
   ```

4. **Test SSE endpoint**:
   ```bash
   curl http://YOUR-SERVER-IP:4000/api/stream
   # Should keep connection open and eventually send events
   ```

5. **Force reload on kiosk**:
   - Refresh browser (Ctrl+R or F5)
   - Or use admin panel "Reload All" button

### 🔴 Issue: CORS errors in browser console

**Symptom**: "Access-Control-Allow-Origin" errors

**Solution**:

```bash
# In .env, set:
CORS_ORIGIN=*

# Or for specific domain:
CORS_ORIGIN=https://yourdomain.com
```

### 🔴 Issue: Config changes don't persist after restart

**Symptom**: URL resets to default after server restart

**Cause**: Config file not saving properly

**Check**:

```bash
# Verify config directory exists
ls -la config/

# Check permissions (Linux)
chmod 755 config/
chmod 644 config/kiosk-config.json

# Check file contents
cat config/kiosk-config.json
```

**Solution**: Ensure `config/` directory is writable

### 🔴 Issue: Network scan returns no devices

**Symptom**: Network panel shows empty or few devices

**Solutions**:

1. **Try different scan modes**:
   - Fast mode (default)
   - Detailed mode (more thorough)
   - Aggressive mode (most thorough)

2. **Check nmap is working**:
   ```bash
   nmap --version
   # Should show version info
   ```

3. **Run with elevated privileges** (Linux):
   ```bash
   sudo npm start
   # Some scan features need root
   ```

### 🔴 Issue: Heartbeat clients show as offline

**Symptom**: Clients sending heartbeats but marked offline

**Check**:

1. **Verify heartbeat is reaching server**:
   ```bash
   # Check server logs
   npm run dev
   # Should see heartbeat messages
   ```

2. **Check client script is running**:
   ```bash
   # On client machine:
   ps aux | grep start-kiosk
   ```

3. **Test heartbeat manually**:
   ```bash
   curl -X POST http://SERVER-IP:4000/api/heartbeat \
     -H 'Content-Type: application/json' \
     -d '{"id":"test","hostname":"test","status":"ok"}'
   ```

4. **Check client clock**:
   - Clients more than 30 minutes stale are auto-cleaned
   - Sync time: `sudo ntpdate pool.ntp.org`

### 🔴 Issue: High memory usage

**Symptom**: Server using too much RAM

**Solutions**:

1. **Check connected clients**:
   ```bash
   curl http://localhost:4000/api/devices
   # Look for connection count
   ```

2. **Adjust limits** in `.env`:
   ```bash
   MAX_SSE_CLIENTS=50       # Reduce if needed
   MAX_HB_CLIENTS=100
   ```

3. **Restart server** periodically or use PM2:
   ```bash
   npm run pm2:start
   # PM2 will auto-restart on memory limit
   ```

### 🔴 Issue: Deployment/SSH features not working

**Symptom**: Can't deploy to clients via SSH

**Check**:

1. **SSH access works manually**:
   ```bash
   ssh username@client-ip
   ```

2. **Correct credentials**:
   - Use SSH keys instead of passwords
   - Or ensure password is correct

3. **Client is reachable**:
   ```bash
   ping client-ip
   ```

4. **Admin token** is set if required

## Validation Logic Issues

If you think the validation logic is broken:

### Test IP validation

```javascript
// Should work for these:
192.168.1.1  ✅
10.0.0.1     ✅
::1          ✅

// Should reject these:
invalid      ❌
256.1.1.1    ❌
```

### Test URL validation

```javascript
// Should work for these:
https://google.com         ✅
http://localhost:4000      ✅
file:///path/to/file.html  ✅

// Should reject these:
invalid-url    ❌
ftp://site.com ❌ (only http/https/file allowed)
```

Run `node test-server.js` to verify all validation logic.

## Debug Mode

Enable detailed logging:

```bash
# In .env:
NODE_ENV=development

# Run with:
npm run dev

# You'll see:
# - All SSE connections
# - Heartbeat messages  
# - Config changes
# - Cleanup operations
```

## Still Having Issues?

### Collect Debug Information

```bash
# 1. Test server logic
node test-server.js > debug-logic.txt

# 2. Check environment
cat .env > debug-env.txt  # Remove sensitive data!

# 3. Test endpoints
curl http://localhost:4000/api/time > debug-api.txt
curl http://localhost:4000/api/config >> debug-api.txt

# 4. Check server startup
npm start 2>&1 | head -50 > debug-startup.txt
```

### Report the Issue

Include:
1. What you're trying to do
2. What's happening instead
3. Error messages (full text)
4. Output of `node test-server.js`
5. Relevant .env settings (hide ADMIN_TOKEN!)
6. Browser console errors (if UI issue)

## Known Limitations

1. **CORS_ORIGIN**: Currently only supports `*` or single origin, not comma-separated list
2. **PM2 cluster mode**: Config file writes may need external sync for multiple instances
3. **Large deployments**: >200 clients may need Redis for state management
4. **Windows SSH**: Deploy feature works best on Linux; Windows SSH can be flaky

## Quick Reset

Start fresh:

```bash
# 1. Stop all servers
pm2 stop all  # if using PM2
# or Ctrl+C if running directly

# 2. Reset config
rm -rf config/*.json

# 3. Reset .env
cp .env.example .env
# Edit .env with your values

# 4. Restart
npm start
```

## Performance Benchmarks

Expected performance:
- **SSE connections**: 100 concurrent (default limit)
- **Heartbeat rate**: 120/min per IP (default limit)
- **Memory usage**: ~50-150MB typical, <500MB normal
- **CPU usage**: <5% idle, <20% under load
- **Network scan**: 3-30 seconds depending on mode

If you're seeing worse performance, check your limits and server resources.
