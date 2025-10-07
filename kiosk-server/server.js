const express = require('express');
const path = require('path');
const http = require('http');
const enforce = require('express-sslify');
const cors = require('cors');
const net = require('net');
const { exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const dns = require('dns').promises;
const { NodeSSH } = require('node-ssh');
let findLocalDevices;
try { findLocalDevices = require('local-devices'); } catch (_) { findLocalDevices = null; }
let nmap;
try { nmap = require('node-nmap'); } catch (_) { nmap = null; }
let bonjour;
try { bonjour = require('bonjour')(); } catch (_) { bonjour = null; }
let oui;
try { oui = require('oui'); } catch (_) { oui = null; }
let arp;
try { arp = require('node-arp'); } catch (_) { arp = null; }
require('dotenv').config();

const app = express();
const port = process.env.PORT || 4000;

// Security limits
const MAX_HEARTBEAT_RATE = 120; // max 120 heartbeats per minute per IP
const MAX_SSE_CLIENTS = 100; // max concurrent SSE connections
const MAX_HB_CLIENTS = 200; // max tracked heartbeat clients
const MAX_COMMAND_QUEUE_SIZE = 100; // max queued commands per client
const rateLimits = new Map(); // IP -> { count, resetTime }

// Middleware
app.use(express.json({ limit: '1mb' })); // Reduce from default to 1mb for security

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
const HEARTBEAT_FILE = path.join(CONFIG_DIR, 'heartbeat-clients.json');

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

// Serve SPA for client path as well
app.get(['/client', '/client.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// UI defaults from environment (for admin dashboard prefill)
const uiDefaults = {
  serverBase: process.env.SERVER_BASE || '',
  defaultSshUsername: process.env.DEFAULT_SSH_USERNAME || '',
  defaultSshPassword: process.env.DEFAULT_SSH_PASSWORD || ''
};

// SSE clients registry
const sseClients = new Map(); // Use a Map to store more client data

// Client-specific configurations (for per-IP URL overrides)
const clientSpecificConfigs = new Map();
const CLIENT_CONFIG_FILE = path.join(CONFIG_DIR, 'client-configs.json');

// Heartbeat registry (bash clients)
const heartbeatClients = new Map(); // key: id_or_ip -> { id, ip, hostname, version, status, tags, metrics, lastSeen }
const heartbeatCommands = new Map(); // key: id_or_ip -> [ { type, payload, createdAt } ]

function loadHeartbeatFromDisk() {
  try {
    if (fs.existsSync(HEARTBEAT_FILE)) {
      const raw = fs.readFileSync(HEARTBEAT_FILE, 'utf8');
      const obj = JSON.parse(raw);
      for (const [k, v] of Object.entries(obj)) {
        heartbeatClients.set(k, v);
      }
    }
  } catch (e) {
    console.warn('Failed to load heartbeat registry:', e.message || e);
  }
}

function saveHeartbeatToDisk() {
  try {
    ensureConfigDir();
    const obj = Object.fromEntries(heartbeatClients);
    fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (e) {
    console.warn('Failed to persist heartbeat registry:', e.message || e);
  }
}

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
// Load heartbeat registry on startup
loadHeartbeatFromDisk();

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

// Get current kiosk configuration
app.get('/api/config', (req, res) => {
  // Check if there's a client-specific config for the requesting IP
  const clientIp = normalizeIp(req.ip);
  if (clientSpecificConfigs.has(clientIp)) {
    const clientConfig = Object.assign({}, kioskConfig, clientSpecificConfigs.get(clientIp));
    res.json(clientConfig);
  } else {
    res.json(kioskConfig);
  }
});

// Update kiosk configuration and broadcast to clients
app.post('/api/config', (req, res) => {
  // Check admin token if set
  const adminToken = process.env.ADMIN_TOKEN || '';
  if (adminToken && req.headers['x-admin-token'] !== adminToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const updates = req.body || {};
    
    // Validate URL if provided
    if (updates.kioskUrl && !isValidUrl(updates.kioskUrl)) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }
    
    // Only allow specific fields
    const allowed = ['kioskUrl', 'title', 'footerText', 'timezone', 'disableContextMenu', 'disableShortcuts'];
    const filtered = {};
    for (const key of allowed) {
      if (key in updates) filtered[key] = updates[key];
    }
    
    Object.assign(kioskConfig, filtered);
    saveConfigToDisk(kioskConfig);
    broadcast('config', kioskConfig);
    res.json({ ok: true, config: kioskConfig });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

// Set per-IP configuration override (currently supports kioskUrl)
app.post('/api/config/ip/:ip', (req, res) => {
  // Check admin token if set
  const adminToken = process.env.ADMIN_TOKEN || '';
  if (adminToken && req.headers['x-admin-token'] !== adminToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const ip = req.params.ip;
    
    // Validate IP format
    if (!isValidIp(ip)) {
      return res.status(400).json({ error: 'Invalid IP address format' });
    }
    
    const body = req.body || {};
    
    // Validate URL if provided
    if (body.kioskUrl && !isValidUrl(body.kioskUrl)) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }
    const existing = clientSpecificConfigs.get(ip) || {};
    const merged = Object.assign({}, existing, body);
    clientSpecificConfigs.set(ip, merged);
    saveClientConfigsToDisk();
    // Broadcast to the specific client if connected
    for (const [id, client] of sseClients.entries()) {
      if (client.ip === ip) {
        const customConfig = Object.assign({}, kioskConfig, merged);
        try {
          client.res.write(`event: config\ndata: ${JSON.stringify(customConfig)}\n\n`);
        } catch (_) {}
      }
    }
    res.json({ ok: true, ip, config: merged });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

// UI defaults endpoint to help prefill admin inputs
app.get('/api/ui-defaults', (req, res) => {
  res.json(uiDefaults);
});

// Server-Sent Events stream for admin/client UI
app.get('/api/stream', (req, res) => {
  // Check max SSE clients limit
  if (sseClients.size >= MAX_SSE_CLIENTS) {
    return res.status(503).json({ error: 'Too many connections, try again later' });
  }
  
  // Standard SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Register client
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const client = {
    id,
    res,
    ip: normalizeIp(req.ip),
    userAgent: req.headers['user-agent'] || '',
    connectedAt: new Date().toISOString(),
    currentUrl: null
  };
  sseClients.set(id, client);

  // Send initial config event
  try {
    const init = `event: config\n` +
                 `data: ${JSON.stringify(kioskConfig)}\n\n`;
    res.write(init);
  } catch (_) {}

  // Keep-alive ping every 25s
  const ping = setInterval(() => {
    try { res.write(`: ping\n\n`); } catch (_) {}
  }, 25000);

  // Cleanup on close
  req.on('close', () => {
    clearInterval(ping);
    sseClients.delete(id);
    try { res.end(); } catch (_) {}
  });
});

// (Removed duplicate /api/devices route; single implementation exists later with authorization)

// Broadcast UI actions (e.g., reload, blackout)
app.post('/api/action', (req, res) => {
  // Check admin token if set
  const adminToken = process.env.ADMIN_TOKEN || '';
  if (adminToken && req.headers['x-admin-token'] !== adminToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { type, value } = req.body || {};
  if (!type) return res.status(400).json({ error: 'type is required' });
  try {
    broadcast('action', { type, value: value ?? true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

// Serve a templated kiosk client script with SERVER_BASE injected
app.get('/client/start-kiosk.sh', (req, res) => {
  try {
    const scriptPath = path.join(__dirname, '..', 'kiosk-client', 'start-kiosk.sh');
    let content = fs.readFileSync(scriptPath, 'utf8');

    // Determine server base in order of precedence: query -> env -> current origin
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0];
    const origin = `${proto}://${host}`;
    const serverBase = (req.query.serverBase || process.env.SERVER_BASE || origin).toString();

    // Replace the SERVER_BASE assignment line
    content = content.replace(
      /^(\s*SERVER_BASE=)"[^"]*"/m,
      `$1"${serverBase}"`
    );

    // Add a header comment indicating templated generation
    const header = `# --- Templated by kiosk-server at ${new Date().toISOString()} ---\n` +
                   `# SERVER_BASE=${serverBase}\n`;
    content = content.replace(/^#!\/bin\/bash\n/, m => m + header);

    res.setHeader('Content-Type', 'text/x-shellscript');
    res.setHeader('Content-Disposition', 'attachment; filename="start-kiosk.sh"');
    res.send(content);
  } catch (err) {
    res.status(500).send(`# Error generating script: ${String(err?.message || err)}\n`);
  }
});

// Heartbeat endpoint for bash clients
// POST /api/heartbeat { id?, hostname?, version?, status?, tags?, metrics?, currentUrl? }
app.post('/api/heartbeat', (req, res) => {
  try {
    const clientIp = normalizeIp(req.ip);
    
    // Rate limiting check
    if (!checkRateLimit(clientIp, MAX_HEARTBEAT_RATE)) {
      return res.status(429).json({ error: 'Rate limit exceeded', retry_after: 60 });
    }
    
    // Clean up old clients if we're at the limit
    if (heartbeatClients.size >= MAX_HB_CLIENTS) {
      const now = Date.now();
      const cutoff = now - (10 * 60 * 1000); // 10 minutes
      for (const [key, client] of heartbeatClients.entries()) {
        if (new Date(client.lastSeen).getTime() < cutoff) {
          heartbeatClients.delete(key);
          heartbeatCommands.delete(key); // Clean associated commands too
        }
      }
    }
    const {
      id,
      hostname,
      version,
      status,
      tags,
      metrics,
      currentUrl
    } = req.body || {};

    const key = (id && String(id).trim()) || clientIp;
    const record = heartbeatClients.get(key) || { id: id || null, ip: clientIp };
    record.id = id || record.id;
    record.ip = clientIp;
    if (hostname) record.hostname = hostname;
    if (version) record.version = version;
    if (status) record.status = status;
    if (tags) record.tags = tags;
    if (metrics) record.metrics = metrics;
    if (currentUrl) record.currentUrl = currentUrl;
    record.lastSeen = new Date().toISOString();

    heartbeatClients.set(key, record);
    saveHeartbeatToDisk();

    // Prepare response: config for this IP and queued commands
    let clientConfig = kioskConfig;
    if (clientSpecificConfigs.has(clientIp)) {
      clientConfig = Object.assign({}, kioskConfig, clientSpecificConfigs.get(clientIp));
    }

    const queue = heartbeatCommands.get(key) || [];
    // send and clear queued commands
    heartbeatCommands.set(key, []);

    res.json({
      ok: true,
      time: new Date().toISOString(),
      config: clientConfig,
      commands: queue
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

// List heartbeat clients (admin-protected if ADMIN_TOKEN set)
app.get('/api/heartbeat/clients', (req, res) => {
  const adminToken = process.env.ADMIN_TOKEN || '';
  if (adminToken && req.headers['x-admin-token'] !== adminToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const now = Date.now();
  const items = Array.from(heartbeatClients.entries()).map(([key, c]) => {
    const last = c.lastSeen ? Date.parse(c.lastSeen) : 0;
    const online = last && (now - last) < 10 * 60 * 1000; // 10 minutes
    return { key, online, ...c };
  });
  res.json(items);
});

// Queue a command for a heartbeat client
// POST /api/heartbeat/command { target, type, payload }
app.post('/api/heartbeat/command', (req, res) => {
  const adminToken = process.env.ADMIN_TOKEN || '';
  if (adminToken && req.headers['x-admin-token'] !== adminToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { target, type, payload } = req.body || {};
  if (!target || !type) return res.status(400).json({ error: 'target and type are required' });
  
  // Check command queue size limit
  const q = heartbeatCommands.get(target) || [];
  if (q.length >= MAX_COMMAND_QUEUE_SIZE) {
    return res.status(507).json({ error: 'Command queue full for target' });
  }
  
  q.push({ type, payload: payload || {}, createdAt: new Date().toISOString() });
  heartbeatCommands.set(target, q);
  res.json({ ok: true, queued: q.length });
});

// --- LAN scanning helpers (fallback via ARP) ---
function normalizeMac(mac) {
  if (!mac) return '';
  return mac.toLowerCase().replace(/-/g, ':');
}

// Normalize IPv6-mapped IPv4 addresses to plain IPv4
function normalizeIp(ip) {
  if (!ip) return '';
  // Remove IPv6 prefix if present (::ffff:192.168.0.1 -> 192.168.0.1)
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }
  return ip;
}

// Input validation helpers
function isValidIp(ip) {
  return net.isIPv4(ip) || net.isIPv6(ip);
}

function isValidUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'file:';
  } catch {
    return false;
  }
}

// Rate limiting helper
function checkRateLimit(ip, maxPerMinute) {
  const now = Date.now();
  const limit = rateLimits.get(ip) || { count: 0, resetTime: now + 60000 };
  
  if (now > limit.resetTime) {
    limit.count = 1;
    limit.resetTime = now + 60000;
  } else {
    limit.count++;
  }
  
  rateLimits.set(ip, limit);
  
  // Clean old entries periodically
  if (rateLimits.size > 1000) {
    for (const [key, val] of rateLimits.entries()) {
      if (now > val.resetTime) rateLimits.delete(key);
    }
  }
  
  return limit.count <= maxPerMinute;
}

// Clean up verbose vendor names from OUI database
function cleanVendorName(vendor) {
  if (!vendor) return 'Unknown';
  
  // Remove common suffixes and address information
  let cleaned = vendor
    .split(/[,\n\r]/)[0]  // Take only first part before comma or newline
    .trim();
  
  // Remove common corporate suffixes
  cleaned = cleaned
    .replace(/\s+(Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|Co\.?,?\s*Ltd\.?|GmbH|S\.A\.?|LLC|L\.L\.C\.|PLC|AG)$/i, '')
    .replace(/\s+Technologies?$/i, '')
    .replace(/\s+Electronics?$/i, '')
    .replace(/\s+International$/i, '')
    .replace(/\s+Company$/i, '')
    .trim();
  
  // Shorten very long names
  if (cleaned.length > 30) {
    cleaned = cleaned.substring(0, 27) + '...';
  }
  
  return cleaned || 'Unknown';
}

// MAC vendor lookup (OUI prefix to manufacturer name)
function getMacVendor(mac) {
  if (!mac) return 'Unknown';
  
  // Try using the oui library first for comprehensive lookup
  if (oui) {
    try {
      const vendor = oui(mac);
      if (vendor) {
        // Clean up vendor name - extract just the company name
        return cleanVendorName(vendor);
      }
    } catch (e) {
      // Fallback to manual lookup
    }
  }
  
  const ouiPrefix = mac.substring(0, 8).toUpperCase();
  
  // Common vendors database (OUI prefix) - fallback
  const vendors = {
    '00:50:56': 'VMware',
    '00:0C:29': 'VMware',
    '00:05:69': 'VMware',
    '00:1C:42': 'VMware',
    '08:00:27': 'VirtualBox',
    '00:15:5D': 'Microsoft (Hyper-V)',
    '00:03:FF': 'Microsoft',
    'B0:92:4A': 'D-Link',
    'E8:DE:27': 'TP-Link',
    '50:C7:BF': 'TP-Link',
    'A0:F3:C1': 'TP-Link',
    '20:28:BC': 'Samsung',
    '34:CD:BE': 'Samsung',
    'F8:D0:AC': 'Samsung',
    '08:D2:3E': 'LG Electronics',
    '0C:8B:FD': 'Apple',
    '00:1C:B3': 'Apple',
    '00:03:93': 'Apple',
    '40:6C:8F': 'Apple',
    '98:01:A7': 'Apple',
    'AC:DE:48': 'Apple',
    'B8:27:EB': 'Raspberry Pi',
    'DC:A6:32': 'Raspberry Pi',
    'E4:5F:01': 'Raspberry Pi',
    '00:1B:44': 'Intel',
    '00:13:20': 'Intel',
    '00:15:17': 'Intel',
    'D8:9E:F3': 'Intel',
    '94:C6:91': 'Intel',
    'A4:BB:6D': 'Intel',
    '00:50:F2': 'Realtek',
    '00:E0:4C': 'Realtek',
    '52:54:00': 'QEMU/KVM',
    '00:16:3E': 'Xen',
    '00:1A:4D': 'Cisco',
    '00:0A:B8': 'Cisco',
    '00:18:0A': 'Cisco',
    '88:75:56': 'Huawei',
    'F0:79:59': 'Huawei',
    '00:1E:10': 'Huawei'
  };
  
  return vendors[ouiPrefix] || 'Unknown Vendor';
}

function parseArpTable(text) {
  const devices = [];
  const lines = (text || '').split(/\r?\n/);
  for (const line of lines) {
    // Windows format: "  192.168.0.1          aa-bb-cc-dd-ee-ff     dynamic"
    let m = line.match(/\s*(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F:\-]{11,17})\s+\w+/);
    if (m) {
      const ip = m[1];
      const mac = normalizeMac(m[2]);
      
      // Filter out broadcast, multicast, and invalid addresses
      if (isValidDeviceAddress(ip, mac)) {
        devices.push({ ip, mac });
      }
      continue;
    }
    // Unix format: "? (192.168.0.1) at aa:bb:cc:dd:ee:ff [ether] on en0"
    m = line.match(/\((\d+\.\d+\.\d+\.\d+)\)\s+at\s+([0-9a-fA-F:]{17})/);
    if (m) {
      const ip = m[1];
      const mac = normalizeMac(m[2]);
      
      if (isValidDeviceAddress(ip, mac)) {
        devices.push({ ip, mac });
      }
      continue;
    }
  }
  // de-duplicate by ip
  const map = new Map();
  for (const d of devices) { map.set(d.ip, d); }
  return Array.from(map.values());
}

// Filter out broadcast, multicast, and invalid addresses
function isValidDeviceAddress(ip, mac) {
  if (!ip || !mac) return false;
  
  // Filter out broadcast MAC addresses
  if (mac === 'ff:ff:ff:ff:ff:ff') return false;
  
  // Filter out multicast MAC addresses (first octet has LSB set)
  const firstOctet = parseInt(mac.substring(0, 2), 16);
  if (firstOctet & 0x01) return false; // Multicast bit set
  
  // Parse IP address
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return false;
  
  // Filter out broadcast addresses (x.x.x.255)
  if (parts[3] === 255) return false;
  
  // Filter out network addresses (x.x.x.0)
  if (parts[3] === 0) return false;
  
  // Filter out multicast range (224.0.0.0 - 239.255.255.255)
  if (parts[0] >= 224 && parts[0] <= 239) return false;
  
  // Filter out loopback (127.x.x.x)
  if (parts[0] === 127) return false;
  
  return true;
}

// In-memory cache for resolved hostnames
const hostnameCache = new Map();

function cacheHostname(ip, hostname) {
  if (ip && hostname) {
    hostnameCache.set(ip, { hostname, timestamp: Date.now() });
  }
}

function getCachedHostname(ip) {
  const entry = hostnameCache.get(ip);
  if (entry && Date.now() - entry.timestamp < 3600 * 1000) {
    return entry.hostname;
  }
  return null;
}

// Enhanced hostname resolution with cache and parallel methods
async function resolveHostname(ip) {
  const cached = getCachedHostname(ip);
  if (cached) {
    console.log(`[HOSTNAME] Cache hit for ${ip}: ${cached}`);
    return cached;
  }

  const resolvers = [
    // 1) Reverse DNS
    async () => {
      try {
        const hostnames = await dns.reverse(ip);
        return hostnames && hostnames.length > 0 ? hostnames[0] : null;
      } catch (_) {
        return null;
      }
    },
    // 2) NetBIOS (Windows)
    async () => {
      if (process.platform !== 'win32') return null;
      try {
        return await new Promise((resolve) => {
          const t = setTimeout(() => resolve(null), 2500);
          exec(`nbtstat -A ${ip}`, { windowsHide: true }, (err, stdout) => {
            clearTimeout(t);
            if (err || !stdout) return resolve(null);
            const lines = String(stdout).split(/\r?\n/);
            for (const line of lines) {
              const m = line.match(/^\s*([A-Z0-9_.\-]+)\s+<00>\s+UNIQUE/i);
              if (m && m[1]) return resolve(m[1]);
            }
            resolve(null);
          });
        });
      } catch (_) {
        return null;
      }
    },
    // 3) ping -a (Windows)
    async () => {
      if (process.platform !== 'win32') return null;
      try {
        return await new Promise((resolve) => {
          const t = setTimeout(() => resolve(null), 2500);
          exec(`ping -a -n 1 ${ip}`, { windowsHide: true }, (err, stdout) => {
            clearTimeout(t);
            if (err || !stdout) return resolve(null);
            const m = String(stdout).match(/Pinging\s+([^\s\[]+)\s+\[/i);
            if (m && m[1] && !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(m[1])) return resolve(m[1]);
            resolve(null);
          });
        });
      } catch (_) {
        return null;
      }
    },
    // 4) Optional LLMNR (only if module present)
    async () => {
      try {
        const llmnr = require('node-llmnr');
        const resolver = new llmnr.Resolver();
        const name = await resolver.resolve(ip, { timeout: 2000 });
        return name || null;
      } catch (_) {
        return null;
      }
    }
  ];

  const results = await Promise.all(resolvers.map(r => r()));
  const hostname = results.find(h => h && typeof h === 'string' && h !== ip) || null;

  if (hostname) {
    cacheHostname(ip, hostname);
    console.log(`[HOSTNAME] Resolved ${ip} -> ${hostname}`);
  } else {
    console.log(`[HOSTNAME] No hostname resolved for ${ip}`);
  }

  return hostname;
}

async function scanLanViaArp() {
  return new Promise((resolve, reject) => {
    // Use command-line arp (most reliable)
    const cmd = 'arp -a';
    exec(cmd, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        console.error('ARP command failed:', err);
        return reject(err);
      }
      try {
        const devices = parseArpTable(stdout || '');
        console.log(`[ARP] Parsed ${devices.length} devices from ARP table`);
        resolve(devices);
      } catch (e) {
        console.error('ARP parsing failed:', e);
        reject(e);
      }
    });
  });
}

// Enhanced scan using nmap with OS and service detection
function scanLanViaNmap(subnet, options = {}) {
  return new Promise((resolve, reject) => {
    if (!nmap) {
      return reject(new Error('nmap not available'));
    }
    
    try {
      // Enhanced nmap options:
      // -sn: Ping scan (no port scan)
      // -O: OS detection
      // -sV: Service version detection
      // -A: Aggressive scan (OS, version, script, traceroute)
      // --osscan-guess: Guess OS more aggressively
      // -p: Port range (if specified)
      const { aggressive, ports, osDetection } = options;
      
      let nmapFlags = '-sn -PR'; // Default: ping scan
      
      if (aggressive) {
        nmapFlags = '-A --osscan-guess'; // Full aggressive scan
      } else if (osDetection) {
        nmapFlags = '-O --osscan-guess -sV'; // OS and service detection
      } else if (ports) {
        nmapFlags = `-sV -p ${ports}`; // Service detection on specific ports
      }
      
      const nmapScan = new nmap.NmapScan(subnet || '192.168.0.0/24', nmapFlags);
      
      const devices = [];
      
      nmapScan.on('complete', (data) => {
        if (Array.isArray(data)) {
          for (const host of data) {
            if (host && host.ip) {
              const device = {
                ip: host.ip,
                mac: host.mac || '',
                hostname: host.hostname || '',
                name: host.hostname || getMacVendor(host.mac),
                vendor: getMacVendor(host.mac)
              };
              
              // Add OS information if available
              if (host.os && host.os.length > 0) {
                device.os = host.os[0].name || 'Unknown';
                device.osAccuracy = host.os[0].accuracy || 0;
              }
              
              // Add open ports and services if available
              if (host.openPorts && host.openPorts.length > 0) {
                device.ports = host.openPorts.map(p => ({
                  port: p.port,
                  protocol: p.protocol,
                  service: p.service || 'unknown',
                  version: p.version || ''
                }));
              }
              
              devices.push(device);
            }
          }
        }
        resolve(devices);
      });
      
      nmapScan.on('error', (err) => {
        reject(err);
      });
      
      nmapScan.startScan();
    } catch (e) {
      reject(e);
    }
  });
}

// Bonjour/mDNS discovery for device names and services
function scanViaBonjourMdns(timeout = 5000) {
  return new Promise((resolve) => {
    if (!bonjour) {
      return resolve([]);
    }
    
    const devices = new Map();
    
    try {
      // Browse for all services
      const browser = bonjour.find({});
      
      browser.on('up', (service) => {
        const ip = service.referer?.address || service.addresses?.[0];
        if (ip && ip.includes('.')) { // IPv4 only
          const key = ip;
          if (!devices.has(key)) {
            devices.set(key, {
              ip,
              name: service.name || service.host || '',
              hostname: service.host || '',
              type: service.type || '',
              services: []
            });
          }
          const device = devices.get(key);
          device.services.push({
            type: service.type,
            name: service.name,
            port: service.port,
            protocol: service.protocol
          });
        }
      });
      
      // Stop browsing after timeout
      setTimeout(() => {
        browser.stop();
        resolve(Array.from(devices.values()));
      }, timeout);
    } catch (e) {
      console.warn('Bonjour/mDNS scan error:', e?.message || e);
      resolve([]);
    }
  });
}

// Port scanning for device type identification
function scanCommonPorts(ip) {
  return new Promise((resolve) => {
    if (!nmap) {
      return resolve([]);
    }
    
    try {
      // Scan common ports: SSH, HTTP, HTTPS, RDP, VNC, etc.
      const commonPorts = '22,80,443,3389,5900,8080,8443,9090';
      const nmapScan = new nmap.NmapScan(ip, `-sV -p ${commonPorts}`);
      
      const ports = [];
      
      nmapScan.on('complete', (data) => {
        if (Array.isArray(data) && data.length > 0) {
          const host = data[0];
          if (host.openPorts) {
            for (const p of host.openPorts) {
              ports.push({
                port: p.port,
                protocol: p.protocol,
                service: p.service || 'unknown',
                version: p.version || ''
              });
            }
          }
        }
        resolve(ports);
      });
      
      nmapScan.on('error', () => {
        resolve([]);
      });
      
      nmapScan.startScan();
    } catch (e) {
      resolve([]);
    }
  });
}

// Merge device data from multiple sources
function mergeDeviceData(sources) {
  const deviceMap = new Map();
  
  for (const source of sources) {
    for (const device of source.devices || []) {
      const key = device.ip;
      if (!deviceMap.has(key)) {
        deviceMap.set(key, { ...device, sources: [source.method] });
      } else {
        const existing = deviceMap.get(key);
        // Merge data, preferring more detailed information
        existing.sources.push(source.method);
        if (device.mac && !existing.mac) existing.mac = device.mac;
        if (device.hostname && !existing.hostname) existing.hostname = device.hostname;
        if (device.name && (!existing.name || existing.name === 'Unknown Vendor')) existing.name = device.name;
        if (device.vendor && !existing.vendor) existing.vendor = device.vendor;
        if (device.os && !existing.os) existing.os = device.os;
        if (device.osAccuracy && !existing.osAccuracy) existing.osAccuracy = device.osAccuracy;
        if (device.ports && (!existing.ports || existing.ports.length === 0)) existing.ports = device.ports;
        if (device.services && (!existing.services || existing.services.length === 0)) existing.services = device.services;
        if (device.type && !existing.type) existing.type = device.type;
      }
    }
  }
  
  return Array.from(deviceMap.values());
}

// Debug endpoint to test ARP parsing
app.get('/api/lan/arp-debug', async (req, res) => {
  try {
    const { exec } = require('child_process');
    exec('arp -a', { windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        return res.json({ error: err.message, stderr });
      }
      const devices = parseArpTable(stdout);
      res.json({
        raw: stdout,
        parsed: devices,
        count: devices.length
      });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Simple ARP endpoint (no raw output), for UI consumption
app.get('/api/lan/arp', async (req, res) => {
  try {
    exec('arp -a', { windowsHide: true }, (err, stdout) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      const devices = parseArpTable(stdout || '');
      res.json({ parsed: devices, count: devices.length });
    });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// Resolve hostname for a given IP
app.get('/api/lan/resolve/:ip', async (req, res) => {
  try {
    const ip = req.params.ip;
    const hostname = await resolveHostname(ip);
    res.json({ ip, hostname });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

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

// Scan local network for devices (comprehensive multi-method scan)
app.get('/api/lan/scan', async (req, res) => {
  try {
    const { mode, subnet, ports } = req.query;
    const scanMode = mode || 'fast'; // fast, detailed, aggressive
    
    console.log(`[SCAN] Starting ${scanMode} scan...`);
    const startTime = Date.now();
    
    const sources = [];
    
    // 1. Bonjour/mDNS discovery (fast, gets friendly names)
    if (bonjour && (scanMode === 'fast' || scanMode === 'detailed' || scanMode === 'aggressive')) {
      try {
        console.log('[SCAN] Running Bonjour/mDNS discovery...');
        const bonjourDevices = await scanViaBonjourMdns(scanMode === 'fast' ? 3000 : 5000);
        if (bonjourDevices && bonjourDevices.length > 0) {
          sources.push({ method: 'bonjour', devices: bonjourDevices });
          console.log(`[SCAN] Bonjour found ${bonjourDevices.length} devices`);
        } else {
          console.log('[SCAN] Bonjour found no devices');
        }
      } catch (e) {
        console.warn('Bonjour scan failed:', e?.message || e);
      }
    } else if (!bonjour) {
      console.log('[SCAN] Bonjour not available (package not installed)');
    }
    
    // 2. ARP scan (fast, gets MAC addresses)
    try {
      console.log('[SCAN] Running ARP scan...');
      const arpDevices = await scanLanViaArp();
      if (arpDevices && arpDevices.length > 0) {
        sources.push({ method: 'arp', devices: arpDevices });
        console.log(`[SCAN] ARP found ${arpDevices.length} devices`);
      } else {
        console.warn('[SCAN] ARP returned no devices');
      }
    } catch (e) {
      console.error('ARP scan failed:', e?.message || e);
    }
    
    // 3. Nmap scan (detailed or aggressive)
    if (nmap && (scanMode === 'detailed' || scanMode === 'aggressive')) {
      try {
        console.log(`[SCAN] Running nmap ${scanMode} scan...`);
        const nmapOptions = {
          aggressive: scanMode === 'aggressive',
          osDetection: scanMode === 'detailed' || scanMode === 'aggressive',
          ports: ports || (scanMode === 'aggressive' ? '1-1000' : '22,80,443,3389,5900')
        };
        const nmapDevices = await scanLanViaNmap(subnet, nmapOptions);
        sources.push({ method: 'nmap', devices: nmapDevices });
        console.log(`[SCAN] nmap found ${nmapDevices.length} devices`);
      } catch (e) {
        console.warn('nmap scan failed:', e?.message || e);
      }
    } else if (nmap && scanMode === 'fast') {
      // Fast nmap ping scan
      try {
        console.log('[SCAN] Running nmap fast scan...');
        const nmapDevices = await scanLanViaNmap(subnet);
        sources.push({ method: 'nmap', devices: nmapDevices });
        console.log(`[SCAN] nmap found ${nmapDevices.length} devices`);
      } catch (e) {
        console.warn('nmap scan failed:', e?.message || e);
      }
    }
    
    // 4. local-devices fallback
    if (findLocalDevices && sources.length === 0) {
      try {
        console.log('[SCAN] Attempting local-devices scan...');
        const localDevices = await findLocalDevices();
        sources.push({ method: 'local-devices', devices: localDevices });
        console.log(`[SCAN] local-devices found ${localDevices.length} devices`);
      } catch (e) {
        console.warn('local-devices failed:', e?.message || e);
      }
    }
    
    // Merge all device data from different sources
    console.log(`[SCAN] Merging data from ${sources.length} sources:`, sources.map(s => `${s.method}(${s.devices.length})`).join(', '));
    let devices = mergeDeviceData(sources);
    console.log(`[SCAN] After merge: ${devices.length} unique devices`);
    
    // Resolve hostnames for devices that don't have one
    console.log(`[SCAN] Resolving hostnames for ${devices.length} devices...`);
    const hostnamePromises = devices.map(async (d) => {
      if (!d.hostname) {
        try {
          const hostname = await resolveHostname(d.ip);
          if (hostname) {
            d.hostname = hostname;
            console.log(`[SCAN] ✓ Resolved ${d.ip} -> ${hostname}`);
          } else {
            console.log(`[SCAN] ✗ No hostname for ${d.ip}`);
          }
        } catch (e) {
          console.log(`[SCAN] ✗ Failed to resolve ${d.ip}: ${e.message}`);
        }
      } else {
        console.log(`[SCAN] ✓ ${d.ip} already has hostname: ${d.hostname}`);
      }
      return d;
    });
    devices = await Promise.all(hostnamePromises);
    console.log(`[SCAN] Hostname resolution complete`);
    
    // Enhance devices with vendor information
    devices = devices.map(d => {
      const enhanced = { ...d };
      if (d.mac && !d.vendor) {
        enhanced.vendor = getMacVendor(d.mac);
      }
      if (!d.name || d.name === 'Unknown Vendor') {
        enhanced.name = d.hostname || enhanced.vendor || 'Unknown Device';
      }
      // Identify device type based on services/ports
      if (!enhanced.deviceType) {
        enhanced.deviceType = identifyDeviceType(enhanced);
      }
      return enhanced;
    });
    
    const scanTime = Date.now() - startTime;
    console.log(`[SCAN] Completed in ${scanTime}ms, found ${devices.length} unique devices`);
    
    // Log device summary
    devices.forEach(d => {
      console.log(`[SCAN] Device: ${d.ip} | Name: ${d.name} | Hostname: ${d.hostname || 'N/A'} | Vendor: ${d.vendor || 'N/A'} | Type: ${d.deviceType || 'N/A'}`);
    });
    
    res.json({ 
      devices, 
      scanMode,
      scanTime,
      methods: sources.map(s => s.method),
      totalDevices: devices.length
    });
  } catch (err) {
    console.error('LAN scan error:', err);
    res.status(500).json({ error: 'LAN scan failed', details: String(err.message || err) });
  }
});

// Helper function to identify device type based on available information
function identifyDeviceType(device) {
  // Check services first (from Bonjour)
  if (device.services && device.services.length > 0) {
    const serviceTypes = device.services.map(s => s.type.toLowerCase());
    if (serviceTypes.some(t => t.includes('printer') || t.includes('ipp'))) return 'Printer';
    if (serviceTypes.some(t => t.includes('airplay') || t.includes('raop'))) return 'Media Device';
    if (serviceTypes.some(t => t.includes('smb') || t.includes('afp'))) return 'File Server';
    if (serviceTypes.some(t => t.includes('http') || t.includes('https'))) return 'Web Server';
  }
  
  // Check open ports
  if (device.ports && device.ports.length > 0) {
    const portNumbers = device.ports.map(p => p.port);
    const services = device.ports.map(p => p.service?.toLowerCase() || '');
    
    if (portNumbers.includes(3389)) return 'Windows PC';
    if (portNumbers.includes(5900)) return 'VNC Server';
    if (portNumbers.includes(22) && services.some(s => s.includes('ssh'))) return 'Linux/Unix Server';
    if (portNumbers.includes(80) || portNumbers.includes(443)) return 'Web Server';
    if (services.some(s => s.includes('printer'))) return 'Printer';
  }
  
  // Check OS information
  if (device.os) {
    const os = device.os.toLowerCase();
    if (os.includes('windows')) return 'Windows PC';
    if (os.includes('linux')) return 'Linux Device';
    if (os.includes('mac') || os.includes('darwin')) return 'Mac';
    if (os.includes('ios')) return 'iOS Device';
    if (os.includes('android')) return 'Android Device';
  }
  
  // Check vendor
  if (device.vendor) {
    const vendor = device.vendor.toLowerCase();
    if (vendor.includes('raspberry')) return 'Raspberry Pi';
    if (vendor.includes('apple')) return 'Apple Device';
    if (vendor.includes('samsung')) return 'Samsung Device';
    if (vendor.includes('cisco')) return 'Network Device';
    if (vendor.includes('tp-link') || vendor.includes('d-link')) return 'Router/Switch';
    if (vendor.includes('vmware') || vendor.includes('virtualbox')) return 'Virtual Machine';
  }
  
  return 'Unknown';
}

// New endpoint for detailed device scan (single IP)
app.get('/api/lan/scan/:ip', async (req, res) => {
  try {
    const { ip } = req.params;
    console.log(`[SCAN] Detailed scan of ${ip}...`);
    
    const deviceInfo = {
      ip,
      scannedAt: new Date().toISOString()
    };
    
    // Get MAC from ARP
    try {
      const arpDevices = await scanLanViaArp();
      const arpDevice = arpDevices.find(d => d.ip === ip);
      if (arpDevice) {
        deviceInfo.mac = arpDevice.mac;
        deviceInfo.vendor = getMacVendor(arpDevice.mac);
      }
    } catch (e) {
      console.warn('ARP lookup failed:', e?.message || e);
    }
    
    // Port scan
    if (nmap) {
      try {
        const ports = await scanCommonPorts(ip);
        deviceInfo.ports = ports;
      } catch (e) {
        console.warn('Port scan failed:', e?.message || e);
      }
    }
    
    // OS detection
    if (nmap) {
      try {
        const nmapResult = await scanLanViaNmap(ip, { osDetection: true });
        if (nmapResult.length > 0) {
          const device = nmapResult[0];
          if (device.os) deviceInfo.os = device.os;
          if (device.osAccuracy) deviceInfo.osAccuracy = device.osAccuracy;
          if (device.hostname) deviceInfo.hostname = device.hostname;
        }
      } catch (e) {
        console.warn('OS detection failed:', e?.message || e);
      }
    }
    
    deviceInfo.deviceType = identifyDeviceType(deviceInfo);
    deviceInfo.name = deviceInfo.hostname || deviceInfo.vendor || 'Unknown Device';
    
    res.json(deviceInfo);
  } catch (err) {
    console.error('Device scan error:', err);
    res.status(500).json({ error: 'Device scan failed', details: String(err.message || err) });
  }
});

// Helper to get LAN device IPs from either explicit hosts or scan results
async function getLanDeviceIps(hosts) {
  let ips = [];
  if (Array.isArray(hosts) && hosts.length > 0) {
    ips = hosts.filter(Boolean);
  } else {
    try {
      let devices = [];
      if (findLocalDevices) {
        devices = await findLocalDevices();
      } else {
        devices = await scanLanViaArp();
      }
      if (Array.isArray(devices)) {
        ips = devices.map(d => d.ip).filter(Boolean);
      }
    } catch (e) {
      console.warn('LAN scan for deploy failed:', e?.message || e);
    }
  }

  // Filter out invalid, broadcast, and multicast addresses
  return ips.filter(ip => {
    if (!ip) return false;
    // Basic regex for IPv4
    if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip)) return false;
    const parts = ip.split('.').map(Number);
    if (parts[0] >= 224) return false; // Multicast
    if (parts[3] === 255 || parts[3] === 0) return false; // Broadcast or network address
    return true;
  });
}

// SSH restart endpoint: restart kiosk clients
// POST /api/restart { username, password, hosts?: ["ip",...] }
app.post('/api/restart', async (req, res) => {
  const adminToken = process.env.ADMIN_TOKEN || '';
  if (adminToken && req.headers['x-admin-token'] !== adminToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { username, password, hosts } = req.body || {};
  if (!username) return res.status(400).json({ error: 'username is required' });

  const ips = await getLanDeviceIps(hosts);
  if (!ips || ips.length === 0) return res.status(400).json({ error: 'No target hosts found' });

  const results = [];
  for (const ip of ips) {
    const ssh = new NodeSSH();
    const hostLabel = `${username}@${ip}`;
    try {
      const connOpts = { host: ip, username };
      if (password) connOpts.password = password;
      connOpts.readyTimeout = 12000;
      await ssh.connect(connOpts);

      // Simple restart command
      const restartCmd = password ? 
        `echo ${JSON.stringify(password)} | sudo -S -p "" reboot` : 
        'sudo reboot';
      
      const { stdout, stderr, code } = await ssh.execCommand(restartCmd, { cwd: '/tmp' });
      // Restart is always successful if we can connect (reboot kills connection)
      results.push({ host: hostLabel, ok: true, code, stdout, stderr });
      ssh.dispose();
    } catch (e) {
      try { ssh.dispose(); } catch (_) {}
      results.push({ host: hostLabel, ok: false, error: String(e?.message || e) });
    }
  }

  res.json({ ok: true, count: results.length, results });
});

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

      const printfArgs = cfgLines.map(l => `'${l}'`).join(' ');
      const writeConfigCmd = `printf '%s\n' ${printfArgs} | ${sudoPrefix} tee /etc/kiosk-client.conf > /dev/null`;

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
      
      // Consider deployment successful if the main script succeeds, even if cleanup commands fail
      const isSuccess = code === 0 || (runSetup && (stdout.includes('Setup complete!') || stderr.includes('Setup complete!')));
      results.push({ host: hostLabel, ok: isSuccess, code, stdout, stderr });
      ssh.dispose();
    } catch (e) {
      try { ssh.dispose(); } catch (_) {}
      results.push({ host: hostLabel, ok: false, error: String(e?.message || e) });
    }
  }

  res.json({ ok: true, count: results.length, results });
});

// (Removed duplicate /api/config GET - already defined earlier at line ~177)

// (Removed duplicate /api/config POST - already defined earlier at line ~182)

// (Removed duplicate /api/config/ip/:ip POST - already defined earlier at line ~195)

// Get list of client-specific configurations
app.get('/api/config/clients', (req, res) => {
  const adminToken = process.env.ADMIN_TOKEN || '';
  if (adminToken && req.headers['x-admin-token'] !== adminToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const configs = Array.from(clientSpecificConfigs.entries()).map(([ip, config]) => ({ ip, config }));
  res.json(configs);
});

// (Removed duplicate /api/action POST - already defined earlier at line ~257)

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

  console.log(`[API] /api/devices - Returning ${devices.length} connected client(s):`, devices.map(d => d.ip).join(', '));
  res.json(devices);
});

// (Removed duplicate /api/stream GET - already defined earlier at line ~215)

// Client registration endpoint to update current URL
app.post('/api/register', (req, res) => {
  const clientIp = normalizeIp(req.ip);
  const { currentUrl } = req.body || {};
  for (const [id, client] of sseClients.entries()) {
    if (client.ip === clientIp) {
      client.currentUrl = currentUrl || 'Unknown';
      console.log(`Client ${clientIp} registered with URL: ${client.currentUrl}`);
    }
  }
  res.json({ ok: true, ip: clientIp });
});

// (Removed duplicate /client route - already defined earlier to serve index.html as SPA)

// Serve the admin management UI at root and /admin
app.get(['/', '/admin'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Minimal 404 for unknown GET routes to avoid confusion
app.use((req, res, next) => {
  if (req.method === 'GET') {
    return res.status(404).json({ error: 'Not found' });
  }
  return next();
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
  
  // Periodic cleanup of stale connections and rate limits (every 5 minutes)
  setInterval(() => {
    const now = Date.now();
    
    // Clean stale SSE connections
    for (const [id, client] of sseClients.entries()) {
      try {
        // Test if connection is still alive
        client.res.write(`: ping\n\n`);
      } catch {
        // Connection is dead, remove it
        sseClients.delete(id);
      }
    }
    
    // Clean old heartbeat clients
    const hbCutoff = now - (30 * 60 * 1000); // 30 minutes
    for (const [key, client] of heartbeatClients.entries()) {
      if (new Date(client.lastSeen).getTime() < hbCutoff) {
        heartbeatClients.delete(key);
        heartbeatCommands.delete(key);
      }
    }
    
    // Clean expired rate limits
    for (const [ip, limit] of rateLimits.entries()) {
      if (now > limit.resetTime + 60000) { // 1 minute after reset
        rateLimits.delete(ip);
      }
    }
    
    console.log(`[CLEANUP] SSE: ${sseClients.size}, HB: ${heartbeatClients.size}, RateLimits: ${rateLimits.size}`);
  }, 5 * 60 * 1000); // Every 5 minutes
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});
