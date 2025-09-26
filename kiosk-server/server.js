const express = require('express');
const path = require('path');
const http = require('http');
const enforce = require('express-sslify');
const cors = require('cors');
const { exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const { NodeSSH } = require('node-ssh');
let findLocalDevices;
try { findLocalDevices = require('local-devices'); } catch (_) { findLocalDevices = null; }
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// CORS (configurable)
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: corsOrigin === '*' ? true : corsOrigin, optionsSuccessStatus: 200 }));

// Static assets directory (configurable)
const staticDir = process.env.STATIC_DIR || 'public';
app.use(express.static(path.join(__dirname, staticDir), { index: false }));

// Force HTTPS in production
const forceHttps = (process.env.FORCE_HTTPS || 'false').toLowerCase() === 'true';
if (process.env.NODE_ENV === 'production' || forceHttps) {
  app.use(enforce.HTTPS({ trustProtoHeader: true }));
}

// Config persistence helpers
const CONFIG_DIR = path.join(__dirname, 'config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'kiosk-config.json');

function ensureConfigDir() {
  try { fs.mkdirSync(CONFIG_DIR, { recursive: true }); } catch (_) {}
}

function loadConfigFromDisk() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Failed to load persisted config:', e.message || e);
  }
  return null;
}

function saveConfigToDisk(cfg) {
  try {
    ensureConfigDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {
    console.warn('Failed to persist config:', e.message || e);
  }
}

// In-memory kiosk configuration (modifiable via API), seeded from env then overridden by persisted values
const envDefaults = {
  kioskUrl: process.env.KIOSK_URL || '',
  title: process.env.KIOSK_TITLE || 'Kiosk Display',
  footerText: process.env.KIOSK_FOOTER_TEXT || ' 2025 Kiosk System',
  timezone: process.env.TIMEZONE || 'UTC',
  disableContextMenu: (process.env.DISABLE_CONTEXT_MENU || 'true').toLowerCase() === 'true',
  disableShortcuts: (process.env.DISABLE_SHORTCUTS || 'true').toLowerCase() === 'true',
};

const persisted = loadConfigFromDisk();
const kioskConfig = Object.assign({}, envDefaults, persisted || {});

// SSE clients registry
const sseClients = new Map(); // Use a Map to store more client data

// Client-specific configurations (for per-IP URL overrides)
const clientSpecificConfigs = new Map();
const CLIENT_CONFIG_FILE = path.join(CONFIG_DIR, 'client-configs.json');

function loadClientConfigsFromDisk() {
  try {
    if (fs.existsSync(CLIENT_CONFIG_FILE)) {
      const raw = fs.readFileSync(CLIENT_CONFIG_FILE, 'utf8');
      const configs = JSON.parse(raw);
      for (const [ip, config] of Object.entries(configs)) {
        clientSpecificConfigs.set(ip, config);
      }
    }
  } catch (e) {
    console.warn('Failed to load client-specific configs:', e.message || e);
  }
}

function saveClientConfigsToDisk() {
  try {
    ensureConfigDir();
    const configs = Object.fromEntries(clientSpecificConfigs);
    fs.writeFileSync(CLIENT_CONFIG_FILE, JSON.stringify(configs, null, 2), 'utf8');
  } catch (e) {
    console.warn('Failed to persist client-specific configs:', e.message || e);
  }
}

// Load client-specific configs on startup
loadClientConfigsFromDisk();

function broadcast(event, payload) {
  const data = `event: ${event}\n` +
               `data: ${JSON.stringify(payload)}\n\n`;
  // Iterate over the Map values to get the response object
  for (const client of sseClients.values()) {
    try { client.res.write(data); } catch {}
  }
}

// API Routes
app.get('/api/time', (req, res) => {
  res.json({ time: new Date().toISOString() });
});

// --- LAN scanning helpers (fallback via ARP) ---
function normalizeMac(mac) {
  if (!mac) return '';
  return mac.toLowerCase().replace(/-/g, ':');
}

function parseArpTable(text) {
  const devices = [];
  const lines = (text || '').split(/\r?\n/);
  for (const line of lines) {
    // Windows format: "  192.168.0.1          aa-bb-cc-dd-ee-ff     dynamic"
    let m = line.match(/\s*(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F:\-]{11,17})\s+\w+/);
    if (m) {
      devices.push({ ip: m[1], mac: normalizeMac(m[2]) });
      continue;
    }
    // Unix format: "? (192.168.0.1) at aa:bb:cc:dd:ee:ff [ether] on en0"
    m = line.match(/\((\d+\.\d+\.\d+\.\d+)\)\s+at\s+([0-9a-fA-F:]{17})/);
    if (m) {
      devices.push({ ip: m[1], mac: normalizeMac(m[2]) });
      continue;
    }
  }
  // de-duplicate by ip
  const map = new Map();
  for (const d of devices) { map.set(d.ip, d); }
  return Array.from(map.values());
}

function scanLanViaArp() {
  return new Promise((resolve, reject) => {
    const cmd = 'arp -a';
    exec(cmd, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(err);
      try {
        const devices = parseArpTable(stdout || '');
        resolve(devices);
      } catch (e) {
        reject(e);
      }
    });
  });
}

// List local IPv4 interfaces
app.get('/api/lan/interfaces', (req, res) => {
  const ifaces = os.networkInterfaces();
  const out = [];
  for (const [name, arr] of Object.entries(ifaces)) {
    for (const info of arr || []) {
      if (info.family === 'IPv4' && !info.internal) {
        out.push({ name, address: info.address, netmask: info.netmask, cidr: info.cidr, mac: info.mac });
      }
    }
  }
  res.json(out);
});

// Scan local network for devices (best-effort, cross-platform)
app.get('/api/lan/scan', async (req, res) => {
  try {
    let devices = [];
    if (findLocalDevices) {
      try {
        devices = await findLocalDevices();
      } catch (e) {
        console.warn('local-devices failed, falling back to ARP:', e?.message || e);
      }
    }
    if (!devices || devices.length === 0) {
      // Fallback via ARP table
      devices = await scanLanViaArp();
    }
    res.json({ devices });
  } catch (err) {
    console.error('LAN scan error:', err);
    res.status(500).json({ error: 'LAN scan failed', details: String(err.message || err) });
  }
});

// Helper to get LAN device IPs from either explicit hosts or scan results
async function getLanDeviceIps(hosts) {
  if (Array.isArray(hosts) && hosts.length > 0) {
    return hosts.filter(Boolean);
  }
  try {
    if (findLocalDevices) {
      const devices = await findLocalDevices();
      if (Array.isArray(devices) && devices.length > 0) {
        return devices.map(d => d.ip).filter(Boolean);
      }
    }
  } catch (e) {
    console.warn('local-devices failed in deploy helper:', e?.message || e);
  }
  try {
    const devices = await scanLanViaArp();
    return devices.map(d => d.ip).filter(Boolean);
  } catch (_) {
    return [];
  }
}

// SSH deploy endpoint: push client script and config to Mint clients
// POST /api/deploy { username, password, privateKeyPath, serverBase, runSetup, reboot, hosts?: ["ip",...] }
app.post('/api/deploy', async (req, res) => {
  const adminToken = process.env.ADMIN_TOKEN || '';
  if (adminToken && req.headers['x-admin-token'] !== adminToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { username, password, privateKeyPath, serverBase, runSetup, reboot, hosts, sshConfig } = req.body || {};
  if (!username) return res.status(400).json({ error: 'username is required' });
  if (!serverBase) return res.status(400).json({ error: 'serverBase is required' });

  const ips = await getLanDeviceIps(hosts);
  if (!ips || ips.length === 0) return res.status(400).json({ error: 'No target hosts found' });

  const clientScriptPath = path.join(__dirname, '..', 'kiosk-client', 'start-kiosk.sh');
  if (!fs.existsSync(clientScriptPath)) {
    return res.status(500).json({ error: 'Client script not found', path: clientScriptPath });
  }

  const results = [];
  for (const ip of ips) {
    const ssh = new NodeSSH();
    const hostLabel = `${username}@${ip}`;
    try {
      const connOpts = { host: ip, username };
      if (privateKeyPath) connOpts.privateKey = privateKeyPath;
      if (password) connOpts.password = password;
      connOpts.readyTimeout = 12000;
      await ssh.connect(connOpts);

      // Upload script to temporary location
      const remoteTmp = '/tmp/start-kiosk.sh';
      await ssh.putFile(clientScriptPath, remoteTmp);

      // Build remote commands with sudo; if password provided, pipe it to sudo -S
      const sudoPrefix = password ? `echo ${JSON.stringify(password)} | sudo -S -p ""` : 'sudo';

      // Build kiosk-client.conf content
      const cfgLines = [`SERVER_BASE=\"${serverBase}\"`];
      // Auto seed SSH config if provided or if we have a password
      const sc = sshConfig || {};
      const enableSsh = String(sc.enable ?? (password ? true : false)) === 'true' || sc.enable === true;
      if (enableSsh) {
        cfgLines.push(`SSH_ENABLE=\"true\"`);
        const sshUserLine = (sc.user || username) ? `SSH_USER=\"${sc.user || username}\"` : '';
        if (sshUserLine) cfgLines.push(sshUserLine);
        if (password) {
          cfgLines.push(`SSH_PASSWORD=\"${password}\"`);
          cfgLines.push(`SSH_PASSWORD_AUTH=\"yes\"`);
        } else if (typeof sc.password === 'string' && sc.password.length > 0) {
          cfgLines.push(`SSH_PASSWORD=\"${sc.password}\"`);
          cfgLines.push(`SSH_PASSWORD_AUTH=\"yes\"`);
        }
        if (sc.authorizedKey) cfgLines.push(`SSH_AUTHORIZED_KEY=\"${sc.authorizedKey.replace(/"/g, '\\"')}\"`);
        if (sc.passwordAuth === 'no' || sc.passwordAuth === 'yes') {
          cfgLines.push(`SSH_PASSWORD_AUTH=\"${sc.passwordAuth}\"`);
        }
      }

      const printfArgs = cfgLines.map(l => `"${l}"`).join(' ');
      const writeConfigCmd = `printf %s\\n ${printfArgs} | ${sudoPrefix} tee /etc/kiosk-client.conf > /dev/null`;

      const cmds = [
        `${sudoPrefix} mkdir -p /usr/local/bin`,
        `${sudoPrefix} mv ${remoteTmp} /usr/local/bin/start-kiosk.sh`,
        `${sudoPrefix} chown root:root /usr/local/bin/start-kiosk.sh`,
        `${sudoPrefix} chmod +x /usr/local/bin/start-kiosk.sh`,
        writeConfigCmd
      ];
      if (runSetup) {
        cmds.push(`${sudoPrefix} bash /usr/local/bin/start-kiosk.sh`);
      }
      // Restart browsers to pick up latest config
      cmds.push(`pkill -f 'google-chrome' >/dev/null 2>&1 || true`);
      cmds.push(`pkill -f 'firefox' >/dev/null 2>&1 || true`);
      if (reboot) cmds.push(`${sudoPrefix} reboot`);

      const fullCmd = cmds.join(' && ');
      const { stdout, stderr, code } = await ssh.execCommand(fullCmd, { cwd: '/tmp' });
      results.push({ host: hostLabel, ok: code === 0, code, stdout, stderr });
      ssh.dispose();
    } catch (e) {
      try { ssh.dispose(); } catch (_) {}
      results.push({ host: hostLabel, ok: false, error: String(e?.message || e) });
    }
  }

  res.json({ ok: true, count: results.length, results });
});

// Get current kiosk config
app.get('/api/config', (req, res) => {
  // Check if there's a client-specific config for the requesting IP
  const clientIp = req.ip;
  if (clientSpecificConfigs.has(clientIp)) {
    const clientConfig = Object.assign({}, kioskConfig, clientSpecificConfigs.get(clientIp));
    res.json(clientConfig);
  } else {
    res.json(kioskConfig);
  }
});

// Update kiosk config (requires admin token if set)
app.post('/api/config', (req, res) => {
  const adminToken = process.env.ADMIN_TOKEN || '';
  if (adminToken && req.headers['x-admin-token'] !== adminToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const allowed = ['kioskUrl', 'title', 'footerText', 'timezone', 'disableContextMenu', 'disableShortcuts'];
  let changed = false;
  for (const key of allowed) {
    if (key in req.body) {
      kioskConfig[key] = req.body[key];
      changed = true;
    }
  }
  if (changed) {
    broadcast('config', kioskConfig);
    // Persist changes so they survive restarts
    saveConfigToDisk(kioskConfig);
  }
  res.json(kioskConfig);
});

// Update kiosk config for a specific IP (requires admin token if set)
app.post('/api/config/ip/:ip', (req, res) => {
  const adminToken = process.env.ADMIN_TOKEN || '';
  if (adminToken && req.headers['x-admin-token'] !== adminToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const clientIp = req.params.ip;
  const allowed = ['kioskUrl'];
  const clientConfig = {};
  for (const key of allowed) {
    if (key in req.body) {
      clientConfig[key] = req.body[key];
    }
  }
  clientSpecificConfigs.set(clientIp, clientConfig);
  saveClientConfigsToDisk();
  // Broadcast to the specific client if connected
  for (const [id, client] of sseClients.entries()) {
    if (client.ip === clientIp) {
      const customConfig = Object.assign({}, kioskConfig, clientConfig);
      client.res.write(`event: config\n`);
      client.res.write(`data: ${JSON.stringify(customConfig)}\n\n`);
    }
  }
  res.json({ ip: clientIp, config: clientConfig });
});

// Get list of client-specific configurations
app.get('/api/config/clients', (req, res) => {
  const adminToken = process.env.ADMIN_TOKEN || '';
  if (adminToken && req.headers['x-admin-token'] !== adminToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const configs = Array.from(clientSpecificConfigs.entries()).map(([ip, config]) => ({ ip, config }));
  res.json(configs);
});

// Control actions for the kiosk client (e.g., reload, blackout)
// POST /api/action { type: 'reload' } or { type: 'blackout', value: true|false }
app.post('/api/action', (req, res) => {
  const adminToken = process.env.ADMIN_TOKEN || '';
  if (adminToken && req.headers['x-admin-token'] !== adminToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { type, value } = req.body || {};
  if (!type) return res.status(400).json({ error: 'type is required' });
  if (!['reload', 'blackout'].includes(type)) return res.status(400).json({ error: 'invalid type' });
  broadcast('action', { type, value: !!value });
  res.json({ ok: true });
});

// SSE stream for real-time updates
// Get list of connected devices
app.get('/api/devices', (req, res) => {
  const adminToken = process.env.ADMIN_TOKEN || '';
  if (adminToken && req.headers['x-admin-token'] !== adminToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const devices = Array.from(sseClients.entries()).map(([id, client]) => ({
    id,
    ip: client.ip,
    userAgent: client.userAgent,
    connectedAt: client.connectedAt,
    currentUrl: client.currentUrl || 'Unknown'
  }));

  res.json(devices);
});

app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  // Determine client-specific config if available
  const clientIp = req.ip;
  let clientConfig = kioskConfig;
  if (clientSpecificConfigs.has(clientIp)) {
    clientConfig = Object.assign({}, kioskConfig, clientSpecificConfigs.get(clientIp));
  }

  // Send initial config
  res.write(`event: config\n`);
  res.write(`data: ${JSON.stringify(clientConfig)}\n\n`);

  const clientId = require('crypto').randomUUID();
  const clientInfo = {
    res,
    ip: clientIp,
    userAgent: req.headers['user-agent'],
    connectedAt: new Date(),
    currentUrl: clientConfig.kioskUrl || 'Unknown'
  };

  sseClients.set(clientId, clientInfo);

  req.on('close', () => {
    sseClients.delete(clientId);
  });
});

// Client registration endpoint to update current URL
app.post('/api/register', (req, res) => {
  const clientIp = req.ip;
  const { currentUrl } = req.body || {};
  for (const [id, client] of sseClients.entries()) {
    if (client.ip === clientIp) {
      client.currentUrl = currentUrl || 'Unknown';
      console.log(`Client ${clientIp} registered with URL: ${client.currentUrl}`);
    }
  }
  res.json({ ok: true, ip: clientIp });
});

// Dedicated client-only view (no admin UI)
app.get(['/client', '/'], (req, res) => {
  res.sendFile(path.join(__dirname, staticDir, 'client.html'));
});

// Redirect direct requests to index.html to /admin explicitly
app.get('/index.html', (req, res) => {
  res.redirect(302, '/admin');
});

// Admin dashboard route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, staticDir, 'index.html'));
});

// Serve the kiosk client for all other routes by default
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, staticDir, 'client.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Start server
const server = http.createServer(app);
server.listen(port, () => {
  console.log(`Kiosk server running on port ${port}`);
  console.log(`Visit http://localhost:${port} in your browser`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});
