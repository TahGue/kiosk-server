// Update the current time display
function updateCurrentTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
    
    const dateString = now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    document.getElementById('current-time').innerHTML = `
        <div class="date">${dateString}</div>
        <div class="time">${timeString}</div>
    `;
}

// Toast helpers
function showToast({ title = 'Notice', message = '', level = 'info', timeout = 3500 } = {}) {
    const root = document.getElementById('toast-root');
    if (!root) return;
    const el = document.createElement('div');
    el.className = `toast ${level}`;
    el.innerHTML = `<div class="toast-title">${title}</div><div class="toast-msg">${message}</div>`;
    root.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(6px)';
        setTimeout(() => el.remove(), 300);
    }, timeout);
}

// Fetch server time
async function fetchServerTime() {
    try {
        const response = await fetch('/api/time');
        const data = await response.json();
        const serverTime = new Date(data.time);
        const timeEl = document.getElementById('server-time-value');
        
        if (timeEl) {
            timeEl.textContent = serverTime.toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            });
        }
    } catch (error) {
        console.error('Error fetching server time:', error);
        const timeEl = document.getElementById('server-time-value');
        if (timeEl) timeEl.textContent = 'Error fetching time';
    }
}

// Apply configuration received from the server
function applyConfig(cfg) {
    // Title and footer
    if (cfg.title) document.getElementById('kiosk-title').textContent = cfg.title;
    if (cfg.footerText) document.getElementById('kiosk-footer').textContent = cfg.footerText;

    // Kiosk URL -> display
    const urlDisplay = document.getElementById('current-url-display');
    if (urlDisplay && typeof cfg.kioskUrl === 'string') {
        urlDisplay.textContent = cfg.kioskUrl || 'URL not set';
    }

    // Update iframe source for client view and admin preview
    if (typeof cfg.kioskUrl === 'string' && cfg.kioskUrl) {
        const frame = document.getElementById('kiosk-frame');
        if (frame && frame.src !== cfg.kioskUrl) {
            frame.src = cfg.kioskUrl;
        }
    }

    // Behavior flags
    const disableContextMenu = !!cfg.disableContextMenu;
    const disableShortcuts = !!cfg.disableShortcuts;
    window.__kioskFlags = { disableContextMenu, disableShortcuts };
}

// Setup SSE to receive config and actions
function initSSE() {
    const es = new EventSource('/api/stream');
    // SSE status elements
    const sseDot = document.getElementById('sse-dot');
    const sseText = document.getElementById('sse-text');
    function setSseStatus(state) {
        if (!sseDot || !sseText) return;
        sseDot.classList.remove('ok','warn','err');
        if (state === 'ok') { sseDot.classList.add('ok'); sseText.textContent = 'Connected'; }
        else if (state === 'warn') { sseDot.classList.add('warn'); sseText.textContent = 'Reconnecting…'; }
        else { sseDot.classList.add('err'); sseText.textContent = 'Disconnected'; }
    }
    es.onopen = () => setSseStatus('ok');
    es.addEventListener('config', (e) => {
        try {
            const cfg = JSON.parse(e.data);
            applyConfig(cfg);
            // Seed admin input with current URL
            const input = document.getElementById('admin-url');
            if (input && typeof cfg.kioskUrl === 'string') input.value = cfg.kioskUrl;
        } catch (err) { console.error('Bad config payload', err); }
    });
    es.addEventListener('action', (e) => {
        try {
            const payload = JSON.parse(e.data);
            if (payload.type === 'reload') {
                const frame = document.getElementById('kiosk-frame');
                if (frame && frame.contentWindow) {
                    frame.contentWindow.location.reload();
                } else {
                    window.location.reload();
                }
            } else if (payload.type === 'blackout') {
                const ov = document.getElementById('blackout-overlay');
                if (!ov) return;
                if (payload.value) ov.classList.remove('hidden');
                else ov.classList.add('hidden');
            }
        } catch (err) { console.error('Bad action payload', err); }
    });
    es.onerror = (e) => {
        console.warn('SSE connection error. Retrying in 5 seconds...', e);
        setSseStatus('warn');
        es.close();
        setTimeout(() => { setSseStatus('err'); initSSE(); }, 5000);
    };
}

// Helpers
function getAdminToken() {
    const el = document.getElementById('admin-token');
    return el && el.value ? el.value : '';
}

function hasAdminToken() {
    return getAdminToken().trim().length > 0;
}

async function getJson(url) {
    const headers = {};
    const token = getAdminToken();
    if (token) headers['x-admin-token'] = token;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json().catch(() => ({}));
}

async function postJson(url, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getAdminToken();
    if (token) headers['x-admin-token'] = token;
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json().catch(() => ({}));
}

// Initialize the kiosk
function initKiosk() {
    // Update time immediately and then every second
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    
    // Fetch server time and refresh every 30 seconds
    fetchServerTime();
    setInterval(fetchServerTime, 30000);
    
    // Apply saved theme
    try {
        const savedTheme = localStorage.getItem('kioskTheme');
        if (savedTheme === 'dark') document.body.classList.add('theme-dark');
    } catch (_) {}

    // Conditional kiosk restrictions (only for client view, not admin)
    const isClientView = window.location.pathname.endsWith('/client') || window.location.pathname.endsWith('/client.html');
    // Set document title depending on mode
    try {
        document.title = isClientView ? 'Kiosk Client' : 'Kiosk Admin';
    } catch (_) {}
    if (isClientView) {
        // Hide admin-only panels for minimal client view
        const adminPanels = [
            'control-panel','hb-panel','deploy-panel','restart-panel','devices-panel','lan-panel','admin-token','btn-reload','toggle-blackout'
        ];
        adminPanels.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                // If an input or control, hide its container
                const container = el.closest?.('.content-panel') || el.closest?.('.admin-row') || el;
                container.style.display = 'none';
            }
        });
        // Expand stage area for client
        const stage = document.getElementById('stage');
        if (stage) stage.style.minHeight = '80vh';

        document.addEventListener('contextmenu', (e) => {
            if (window.__kioskFlags?.disableContextMenu) {
                e.preventDefault();
                return false;
            }
        });

    // Lightweight SPA navigation by hash
    const sections = {
        control: document.getElementById('control-panel'),
        heartbeat: document.getElementById('hb-panel'),
        devices: document.getElementById('devices-panel'),
        network: document.getElementById('lan-panel'),
        client: document.getElementById('stage'),
    };
    const navLinks = Array.from(document.querySelectorAll('.kiosk-nav .nav-btn'));

    function setActiveNav(section) {
        navLinks.forEach(a => {
            const s = a.getAttribute('data-section');
            if (s === section) a.classList.add('active'); else a.classList.remove('active');
        });
    }

    function showSection(section) {
        Object.entries(sections).forEach(([key, el]) => {
            if (!el) return;
            el.style.display = (key === section) ? '' : 'none';
        });
        setActiveNav(section);
        try { localStorage.setItem('kioskSelectedSection', section); } catch (_) {}
        // Ensure SSE is running and frame is visible when switching to client
        if (section === 'client') {
            const frame = document.getElementById('kiosk-frame');
            if (frame && (!frame.src || frame.src === 'about:blank')) {
                // Use current config display if available
                const url = document.getElementById('current-url-display')?.textContent || '';
                if (url && url !== 'URL not set') frame.src = url;
            }
        }
    }

    function applyInitialRoute() {
        if (isClientView) {
            showSection('client');
            return;
        }
        const hash = (window.location.hash || '').replace('#', '');
        let section = sections[hash] ? hash : null;
        if (!section) {
            try {
                const saved = localStorage.getItem('kioskSelectedSection');
                if (saved && sections[saved]) section = saved;
            } catch (_) {}
        }
        if (!section) section = 'control';
        showSection(section);
    }

    window.addEventListener('hashchange', applyInitialRoute);
    navLinks.forEach(a => {
        a.addEventListener('click', (e) => {
            const s = a.getAttribute('data-section');
            if (s) {
                // Update hash for deep-linking
                window.location.hash = s;
            }
        });
    });

    // Apply initial route after DOM ready
    applyInitialRoute();

        document.addEventListener('keydown', (e) => {
            if (window.__kioskFlags?.disableShortcuts) {
                if (e.ctrlKey || e.altKey || e.metaKey) {
                    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                        e.preventDefault();
                        return false;
                    }
                }
                if (['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'].includes(e.key)) {
                    e.preventDefault();
                    return false;
                }
            }
        });
    }

    // Admin UI events
    const btnApply = document.getElementById('btn-apply-url');
    btnApply?.addEventListener('click', async () => {
        let url = (document.getElementById('admin-url')?.value || '').trim();
        if (!url) return;
        
        // Auto-add http:// if no protocol specified
        if (!url.match(/^https?:\/\//i) && !url.match(/^file:\/\//i)) {
            url = 'http://' + url;
            document.getElementById('admin-url').value = url;
        }
        
        try {
            await postJson('/api/config', { kioskUrl: url });
            showToast({ title: 'URL Updated', message: 'Clients will update shortly.', level: 'info' });
        } catch (e) {
            console.error('Failed to update kiosk URL', e);
            const msg = e.message.includes('400') ? 'Invalid URL format. Use http:// or https://' : 
                        e.message.includes('401') ? 'Authorization failed. Check Admin Token.' : 
                        e.message;
            showToast({ title: 'Update Failed', message: msg, level: 'error' });
        }
    });

    // Improve URL input UX: apply on Enter
    const adminUrlInput = document.getElementById('admin-url');
    adminUrlInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('btn-apply-url')?.click();
        }
    });
    // Ensure input is focusable and editable
    if (adminUrlInput) {
        adminUrlInput.focus();
        adminUrlInput.removeAttribute('readonly');
    }

    const btnReload = document.getElementById('btn-reload');
    btnReload?.addEventListener('click', async () => {
        try { await postJson('/api/action', { type: 'reload' }); } catch (e) { console.error(e); }
    });

    const toggleBlackout = document.getElementById('toggle-blackout');
    toggleBlackout?.addEventListener('change', async (e) => {
        try { await postJson('/api/action', { type: 'blackout', value: e.target.checked }); } catch (err) { console.error(err); }
    });

    // Device list fetching and rendering
    const devicesListEl = document.getElementById('devices-list');
    const refreshDevicesBtn = document.getElementById('btn-refresh-devices');
    const tokenInput = document.getElementById('admin-token');
    let devicesIntervalId = null;

    // Seed token from URL (?token=...) or localStorage
    try {
        const params = new URLSearchParams(location.search);
        const urlToken = params.get('token');
        if (urlToken && tokenInput) {
            tokenInput.value = urlToken;
            localStorage.setItem('adminToken', urlToken);
        } else if (tokenInput) {
            const saved = localStorage.getItem('adminToken');
            if (saved) tokenInput.value = saved;
        }
    } catch (_) {}

    async function fetchAndRenderDevices() {
        try {
            const [sseDevices, hbClients] = await Promise.all([
                getJson('/api/devices'),
                getJson('/api/heartbeat/clients').catch(() => [])
            ]);

            const sse = Array.isArray(sseDevices) ? sseDevices : [];
            const hb = Array.isArray(hbClients) ? hbClients : [];

            if (sse.length === 0 && hb.length === 0) {
                devicesListEl.innerHTML = '<p>No devices are currently connected.</p>';
                return;
            }

            // Merge by IP when available. Fallback to HB entries without IP as separate items.
            const byIp = new Map();
            sse.forEach(d => {
                const ip = d.ip || '';
                if (!ip) return; // ignore if no IP
                byIp.set(ip, {
                    ip,
                    sse: d,
                    hb: null
                });
            });
            hb.forEach(c => {
                const ip = c.ip || '';
                if (ip) {
                    const e = byIp.get(ip) || { ip, sse: null, hb: null };
                    e.hb = c;
                    byIp.set(ip, e);
                }
            });

            // Build unified list: entries with IP first (merged), then HB-only without IP
            const rows = [];
            const ipEntries = Array.from(byIp.values());
            ipEntries.forEach(entry => {
                const { ip, sse: s, hb: h } = entry;
                const sseActive = !!s;
                const hbOnline = !!(h && h.online);
                const agent = (s && s.userAgent) ? s.userAgent.substring(0, 60) : (h && h.hostname ? `Host: ${h.hostname}` : '-');
                const url = (s && s.currentUrl) || (h && h.currentUrl) || 'Unknown';
                const hbKey = h && h.key ? h.key : '';
                rows.push({
                    key: ip,
                    label: ip,
                    agent,
                    url,
                    sseActive,
                    hbOnline,
                    hbKey
                });
            });

            // Add HB-only entries lacking IP
            hb.forEach(h => {
                if (!h.ip) {
                    rows.push({
                        key: `hb:${h.key}`,
                        label: h.key,
                        agent: `Host: ${h.hostname || '-'} | Ver: ${h.version || '-'}`,
                        url: h.currentUrl || 'Unknown',
                        sseActive: false,
                        hbOnline: !!h.online,
                        hbKey: h.key
                    });
                }
            });

            // Sort: active SSE first, then online HB, then label asc
            rows.sort((a, b) => {
                if (a.sseActive !== b.sseActive) return a.sseActive ? -1 : 1;
                if (a.hbOnline !== b.hbOnline) return a.hbOnline ? -1 : 1;
                return String(a.label).localeCompare(String(b.label));
            });

            // Render rows
            const html = rows.map(r => {
                const chips = [
                    r.sseActive ? '<span class="chip ok"><span class="dot"></span> Client Active</span>' : '<span class="chip err"><span class="dot"></span> No Client</span>',
                    r.hbOnline ? '<span class="chip ok"><span class="dot"></span> HB Online</span>' : '<span class="chip warn"><span class="dot"></span> HB Unknown</span>'
                ].join(' ');
                const actions = [
                    r.label ? `<button onclick="copyIp('${r.label}')">Copy IP</button>` : '',
                    r.url && r.url !== 'Unknown' ? `<button onclick="openUrlNewTab('${r.url}')">Open URL</button>` : '',
                    r.label ? `<button onclick="resolveIpHostname('${r.label}')">Resolve</button>` : '',
                    r.label ? `<button onclick="setUrlForIp('${r.label}')">Set URL</button>` : '',
                    r.label ? `<button onclick="sshToHost('${r.label}')">SSH</button>` : '',
                    r.hbKey ? `<button onclick="hbReboot('${r.hbKey}')">Reboot</button>` : '',
                    r.hbKey ? `<button onclick="hbShutdown('${r.hbKey}')">Shutdown</button>` : ''
                ].filter(Boolean).join(' ');
                return `
                    <div class="device-item">
                        <div class="device-id"><strong>${r.label}</strong> ${chips}</div>
                        <div class="device-agent">${r.agent}</div>
                        <div class="device-url">URL: ${r.url}</div>
                        <div class="device-action">${actions}</div>
                    </div>
                `;
            }).join('');

            devicesListEl.innerHTML = applyDevicesFilter(html);
        } catch (error) {
            if (error.message.includes('401')) {
                devicesListEl.innerHTML = `<p class="error">Authorization failed. Is the Admin Token correct?</p>`;
            } else {
                devicesListEl.innerHTML = `<p class="error">Failed to load devices: ${error.message}</p>`;
            }
        }
    }

    const devicesFilterInput = document.getElementById('devices-filter');
    function applyDevicesFilter(html) {
        if (!devicesFilterInput) return html;
        const q = devicesFilterInput.value.trim().toLowerCase();
        if (!q) return html;
        // Filter by wrapping matches only; simple approach: parse DOM after render
        const wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        const items = Array.from(wrapper.querySelectorAll('.device-item'));
        items.forEach(item => {
            const text = item.textContent.toLowerCase();
            if (!text.includes(q)) item.remove();
        });
        return wrapper.innerHTML || '<p>No devices match your filter.</p>';
    }

    devicesFilterInput?.addEventListener('input', () => {
        // Re-render with filter applied
        fetchAndRenderDevices();
    });

    function startDevicesPolling() {
        if (!devicesListEl) return;
        fetchAndRenderDevices();
        if (!devicesIntervalId) {
            devicesIntervalId = setInterval(fetchAndRenderDevices, 5000);
        }
    }

    refreshDevicesBtn?.addEventListener('click', () => {
        fetchAndRenderDevices();
    });

    tokenInput?.addEventListener('input', () => {
        // Restart polling behavior when token changes
        if (devicesIntervalId) { clearInterval(devicesIntervalId); devicesIntervalId = null; }
        try { localStorage.setItem('adminToken', getAdminToken()); } catch (_) {}
        startDevicesPolling();
    });

    // Function to set URL for a specific IP
    function setUrlForIp(ip) {
        const url = prompt(`Enter URL for client IP ${ip}:`);
        if (url) {
            postJson(`/api/config/ip/${ip}`, { kioskUrl: url })
                .then(() => {
                    showToast({ title: 'URL Updated', message: `IP ${ip} -> ${url}`, level: 'info' });
                    fetchAndRenderDevices();
                })
                .catch(e => {
                    console.error('Failed to update URL for IP', e);
                    showToast({ title: 'Update Failed', message: e.message, level: 'error' });
                });
        }
    }

    // Device action helpers
    async function copyIp(ip) {
        try { await navigator.clipboard.writeText(ip); showToast({ title: 'Copied IP', message: ip, level: 'info' }); }
        catch { showToast({ title: 'Copy Failed', message: ip, level: 'warn' }); }
    }
    async function resolveIpHostname(ip) {
        try {
            const res = await getJson(`/api/lan/resolve/${encodeURIComponent(ip)}`);
            const name = res && res.hostname ? res.hostname : 'not found';
            showToast({ title: 'Resolved', message: `${ip} -> ${name}`, level: 'info' });
        } catch (e) {
            showToast({ title: 'Resolve Failed', message: String(e.message || e), level: 'error' });
        }
    }
    function openUrlNewTab(url) {
        if (!url || url === 'Unknown') { showToast({ title: 'No URL', message: 'No URL available for this device.', level: 'warn' }); return; }
        window.open(url, '_blank');
    }
    function sshToHost(ip) {
        const user = (window.__uiDefaults?.defaultSshUsername || 'student').trim();
        const cmd = `ssh ${user}@${ip}`;
        // Copy command for reliability
        copyIp(cmd);
        showToast({ title: 'SSH Command Copied', message: cmd, level: 'info' });
    }
    async function hbReboot(target) {
        try { await postJson('/api/heartbeat/command', { target, type: 'reboot', payload: {} }); showToast({ title: 'Reboot Queued', message: target, level: 'info' }); }
        catch (e) { showToast({ title: 'Reboot Failed', message: String(e.message || e), level: 'error' }); }
    }
    async function hbShutdown(target) {
        try { await postJson('/api/heartbeat/command', { target, type: 'shutdown', payload: {} }); showToast({ title: 'Shutdown Queued', message: target, level: 'info' }); }
        catch (e) { showToast({ title: 'Shutdown Failed', message: String(e.message || e), level: 'error' }); }
    }

    // Expose helpers for inline onclick handlers
    window.setUrlForIp = setUrlForIp;
    window.copyIp = copyIp;
    window.resolveIpHostname = resolveIpHostname;
    window.openUrlNewTab = openUrlNewTab;
    window.sshToHost = sshToHost;
    window.hbReboot = hbReboot;
    window.hbShutdown = hbShutdown;

    startDevicesPolling();

    // LAN scan and interfaces
    const btnScanLan = document.getElementById('btn-scan-lan');
    const btnShowIfaces = document.getElementById('btn-show-interfaces');
    const lanResultsEl = document.getElementById('lan-results');
    const lanIfacesEl = document.getElementById('lan-interfaces');
    const inputScanMode = document.getElementById('scan-mode');
    const inputScanSubnet = document.getElementById('scan-subnet');
    const inputScanPorts = document.getElementById('scan-ports');

    async function renderInterfaces() {
        if (!lanIfacesEl) return;
        lanIfacesEl.classList.remove('hidden');
        lanIfacesEl.innerHTML = '<p>Loading interfaces...</p>';
        try {
            const ifaces = await getJson('/api/lan/interfaces');
            if (!Array.isArray(ifaces) || ifaces.length === 0) {
                lanIfacesEl.innerHTML = '<p>No active IPv4 interfaces found.</p>';
                return;
            }
            lanIfacesEl.innerHTML = ifaces.map(i => `
                <div class="device-item">
                    <div class="device-id">${i.name}</div>
                    <div class="device-ip">IP: ${i.address} / ${i.cidr || i.netmask}</div>
                    <div class="device-agent">MAC: ${i.mac || 'n/a'}</div>
                </div>
            `).join('');
        } catch (err) {
            lanIfacesEl.innerHTML = `<p class="error">Failed to load interfaces: ${err.message}</p>`;
        }
    }

    function buildScanUrl() {
        const params = new URLSearchParams();
        const mode = inputScanMode?.value || 'fast';
        if (mode) params.set('mode', mode);
        const subnet = (inputScanSubnet?.value || '').trim();
        if (subnet) params.set('subnet', subnet);
        const ports = (inputScanPorts?.value || '').trim();
        if (ports) params.set('ports', ports);
        return `/api/lan/scan?${params.toString()}`;
    }

    async function scanLan() {
        if (!lanResultsEl) return;
        lanResultsEl.innerHTML = '<p>Scanning network... this may take a few seconds.</p>';
        try {
            // Fetch network scan, connected SSE devices, and heartbeat clients
            const [scanRes, connectedDevices, hbClients] = await Promise.all([
                getJson(buildScanUrl()),
                getJson('/api/devices').catch(() => []),
                getJson('/api/heartbeat/clients').catch(() => [])
            ]);
            
            const devices = Array.isArray(scanRes.devices) ? scanRes.devices : [];
            if (devices.length === 0) {
                lanResultsEl.innerHTML = '<p>No devices discovered.</p>';
                return;
            }

            // Create a Set of IPs that have active client connections
            // Consider both SSE-connected clients and heartbeat-online clients
            const connectedIPs = new Set();
            if (Array.isArray(connectedDevices)) {
                connectedDevices.forEach(d => d?.ip && connectedIPs.add(d.ip));
            }
            if (Array.isArray(hbClients)) {
                hbClients.forEach(c => { if (c?.ip && c.online) connectedIPs.add(c.ip); });
            }

            // Add scan summary header
            const scanMode = scanRes.scanMode || 'fast';
            const scanTime = scanRes.scanTime ? `${scanRes.scanTime}ms` : 'N/A';
            const methods = scanRes.methods ? scanRes.methods.join(', ') : 'unknown';
            const summaryHtml = `
                <div style="background: #f5f5f5; padding: 10px; margin-bottom: 15px; border-radius: 4px; font-size: 0.9em;">
                    <strong>Scan Results:</strong> ${devices.length} device(s) found in ${scanTime} using ${methods}
                    <span style="margin-left: 15px; color: #666;">(Mode: ${scanMode})</span>
                </div>
            `;

            // Render devices with status indicators
            lanResultsEl.innerHTML = summaryHtml + devices.map(d => {
                const isConnected = connectedIPs.has(d.ip);
                const statusClass = isConnected ? 'connected' : 'disconnected';
                const statusText = isConnected ? 'Client Active' : 'No Client';
                const statusLabel = isConnected ? '<span style="color: #4caf50; font-weight: bold; margin-left: 10px;">✓ KIOSK ACTIVE</span>' : '';
                const vendor = d.vendor || 'Unknown Vendor';
                
                // Determine display name (prefer hostname over vendor)
                let displayName = vendor;
                if (d.hostname) {
                    displayName = d.hostname;
                } else if (d.name && d.name !== 'Unknown Vendor' && d.name !== 'Unknown Device') {
                    displayName = d.name;
                }
                
                const deviceType = d.deviceType && d.deviceType !== 'Unknown' ? ` (${d.deviceType})` : '';
                const hostnameInfo = d.hostname ? `<div class="device-hostname" style="font-size: 0.9em; color: #2196F3; margin-top: 3px;">🖥️ ${d.hostname}</div>` : '';
                const vendorInfo = d.vendor && d.vendor !== 'Unknown Vendor' ? `<div class="device-vendor" style="font-size: 0.85em; color: #666; margin-top: 2px;">Vendor: ${d.vendor}</div>` : '';
                const osInfo = d.os ? `<div class="device-os" style="font-size: 0.85em; color:#444;">OS: ${d.os}${d.osAccuracy ? ` (${d.osAccuracy}%)` : ''}</div>` : '';
                const ports = Array.isArray(d.ports) && d.ports.length > 0
                    ? `<div class="device-ports" style="font-size:0.85em; color:#555; margin-top:2px;">Ports: ${d.ports.slice(0,8).map(p => `${p.port}/${p.protocol}${p.service?` (${p.service})`:''}`).join(', ')}${d.ports.length>8?' …':''}</div>`
                    : '';
                const services = Array.isArray(d.services) && d.services.length > 0
                    ? `<div class="device-services" style="font-size:0.85em; color:#555; margin-top:2px;">Services: ${d.services.slice(0,6).map(s => s.type || s.name).join(', ')}${d.services.length>6?' …':''}</div>`
                    : '';
                
                return `
                    <div class="device-item">
                        <div class="device-status ${statusClass}" title="${statusText}"></div>
                        <div class="device-id"><strong>${displayName}${deviceType}</strong></div>
                        ${hostnameInfo}
                        <div class="device-ip">IP: ${d.ip || '-'}${statusLabel}</div>
                        <div class="device-agent">MAC: ${d.mac || '-'}</div>
                        ${vendorInfo}
                        ${osInfo}
                        ${ports}
                        ${services}
                    </div>
                `;
            }).join('');
        } catch (err) {
            if (err.message.includes('501')) {
                lanResultsEl.innerHTML = '<p class="error">LAN scan is not available. Install dependencies on the server.</p>';
            } else {
                lanResultsEl.innerHTML = `<p class="error">Scan failed: ${err.message}</p>`;
            }
        }
    }

    btnShowIfaces?.addEventListener('click', renderInterfaces);
    btnScanLan?.addEventListener('click', scanLan);

    // Automatically scan the network on page load for convenience
    scanLan();

    // Header quick actions
    const btnOpenClient = document.getElementById('btn-open-client');
    btnOpenClient?.addEventListener('click', () => {
        window.open('/client', '_blank');
    });
    const btnCopyClient = document.getElementById('btn-copy-client');
    btnCopyClient?.addEventListener('click', async () => {
        const link = `${window.location.origin}/client`;
        try { await navigator.clipboard.writeText(link); showToast({ title: 'Copied', message: link, level: 'info' }); }
        catch { showToast({ title: 'Copy Failed', message: link, level: 'warn' }); }
    });
    const btnToggleTheme = document.getElementById('btn-toggle-theme');
    btnToggleTheme?.addEventListener('click', () => {
        const dark = document.body.classList.toggle('theme-dark');
        try { localStorage.setItem('kioskTheme', dark ? 'dark' : 'light'); } catch (_) {}
        showToast({ title: dark ? 'Dark Mode' : 'Light Mode', message: '', level: 'info' });
    });

    // Open current URL in new tab
    const btnOpenUrl = document.getElementById('btn-open-url');
    btnOpenUrl?.addEventListener('click', () => {
        const url = document.getElementById('current-url-display')?.textContent || 'about:blank';
        if (url !== 'URL not set') {
            window.open(url, '_blank');
        } else {
            showToast({ title: 'No URL', message: 'Set a URL first.', level: 'warn' });
        }
    });

    // Download start-kiosk.sh prefilled with this server address
    const btnDownloadClient = document.getElementById('btn-download-client');
    btnDownloadClient?.addEventListener('click', () => {
        const base = window.location.origin;
        const link = document.createElement('a');
        link.href = `/client/start-kiosk.sh?serverBase=${encodeURIComponent(base)}`;
        link.download = 'start-kiosk.sh';
        document.body.appendChild(link);
        link.click();
        requestAnimationFrame(() => link.remove());
    });

    // Start SSE after wiring UI
    initSSE();

    // Deploy to Clients wiring
    const btnDeploy = document.getElementById('btn-deploy');
    const inputUsername = document.getElementById('deploy-username');
    const inputPassword = document.getElementById('deploy-password');
    const inputServerBase = document.getElementById('deploy-server-base');
    const inputHosts = document.getElementById('deploy-hosts');
    const chkRunSetup = document.getElementById('deploy-run-setup');
    const chkReboot = document.getElementById('deploy-reboot');
    const deployResult = document.getElementById('deploy-result');

    // Auto-fill defaults from server env (and fallback to current origin)
    (async () => {
        try {
            const ui = await getJson('/api/ui-defaults').catch(() => ({}));
            // expose globally for SSH helper defaults
            window.__uiDefaults = ui || {};
            if (inputServerBase) {
                const envBase = ui.serverBase && ui.serverBase.trim();
                inputServerBase.value = envBase || window.location.origin;
            }
            if (inputUsername && !inputUsername.value) {
                inputUsername.value = (ui.defaultSshUsername || '').trim();
            }
            if (inputPassword && !inputPassword.value) {
                inputPassword.value = (ui.defaultSshPassword || '').trim();
            }
        } catch (_) {
            if (inputServerBase && !inputServerBase.value) {
                inputServerBase.value = window.location.origin;
            }
        }
    })();

    async function deployToClients() {
        if (!inputUsername || !inputServerBase) return;
        const username = (inputUsername.value || '').trim();
        const password = (inputPassword?.value || '').trim();
        const serverBase = (inputServerBase.value || '').trim();
        const runSetup = !!(chkRunSetup && chkRunSetup.checked);
        const reboot = !!(chkReboot && chkReboot.checked);
        const hostsRaw = (inputHosts?.value || '').trim();
        const hosts = hostsRaw ? hostsRaw.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : undefined;

        if (!username) { showToast({ title: 'Missing Field', message: 'SSH username is required.', level: 'warn' }); return; }
        if (!serverBase) { showToast({ title: 'Missing Field', message: 'Server Base is required.', level: 'warn' }); return; }

        if (deployResult) { deployResult.style.display = 'block'; deployResult.textContent = 'Deploying...'; }
        btnDeploy && (btnDeploy.disabled = true);
        try {
            const body = { username, serverBase, runSetup, reboot };
            if (password) body.password = password;
            if (hosts) body.hosts = hosts;
            // Ask server to also seed SSH config on clients when possible
            body.sshConfig = { enable: true, user: username };
            if (password) {
                body.sshConfig.password = password;
            }

            const resp = await postJson('/api/deploy', body);
            if (deployResult) {
                if (resp && Array.isArray(resp.results)) {
                    const lines = resp.results.map(r => {
                    let errorDetails = r.error || r.stderr || '';
                    if (errorDetails && errorDetails.includes('sudo: a password is required')) {
                        errorDetails = 'Authentication failed: Incorrect password for sudo.';
                    }
                    return `${r.host}: ${r.ok ? 'OK' : 'FAIL'}${errorDetails ? ' - ' + errorDetails.trim() : ''}`;
                });
                    deployResult.innerHTML = `<strong>Deploy finished</strong><br/>` + lines.join('<br/>');
                    showToast({ title: 'Deploy Finished', message: 'See details below.', level: 'info' });
                } else {
                    deployResult.textContent = 'Deploy finished (no details)';
                    showToast({ title: 'Deploy Finished', message: 'No details returned.', level: 'info' });
                }
            }
        } catch (err) {
            if (deployResult) deployResult.textContent = `Deploy failed: ${err.message || err}`;
            showToast({ title: 'Deploy Failed', message: String(err.message || err), level: 'error' });
        } finally {
            btnDeploy && (btnDeploy.disabled = false);
        }
    }

    btnDeploy?.addEventListener('click', deployToClients);

    // Restart Clients wiring
    const btnRestart = document.getElementById('btn-restart');
    const inputRestartUsername = document.getElementById('restart-username');
    const inputRestartPassword = document.getElementById('restart-password');
    const inputRestartHosts = document.getElementById('restart-hosts');
    const restartResult = document.getElementById('restart-result');

    async function restartClients() {
        if (!inputRestartUsername) return;
        const username = (inputRestartUsername.value || '').trim();
        const password = (inputRestartPassword?.value || '').trim();
        const hostsRaw = (inputRestartHosts?.value || '').trim();
        const hosts = hostsRaw ? hostsRaw.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : undefined;

        if (!username) { showToast({ title: 'Missing Field', message: 'SSH username is required.', level: 'warn' }); return; }

        if (restartResult) { restartResult.style.display = 'block'; restartResult.textContent = 'Restarting clients...'; }
        btnRestart && (btnRestart.disabled = true);
        try {
            const body = { username };
            if (password) body.password = password;
            if (hosts) body.hosts = hosts;

            const resp = await postJson('/api/restart', body);
            if (restartResult) {
                if (resp && Array.isArray(resp.results)) {
                    const lines = resp.results.map(r => {
                        let errorDetails = r.error || r.stderr || '';
                        return `${r.host}: ${r.ok ? 'OK - Restarted' : 'FAIL'}${errorDetails ? ' - ' + errorDetails.trim() : ''}`;
                    });
                    restartResult.innerHTML = `<strong>Restart finished</strong><br/>` + lines.join('<br/>' );
                    showToast({ title: 'Restart Finished', message: 'See details below.', level: 'info' });
                } else {
                    restartResult.textContent = 'Restart finished (no details)';
                    showToast({ title: 'Restart Finished', message: 'No details returned.', level: 'info' });
                }
            }
        } catch (err) {
            if (restartResult) restartResult.textContent = `Restart failed: ${err.message || err}`;
            showToast({ title: 'Restart Failed', message: String(err.message || err), level: 'error' });
        } finally {
            btnRestart && (btnRestart.disabled = false);
        }
    }

    // Heartbeat panel wiring
    const hbListEl = document.getElementById('hb-list');
    const hbRefreshBtn = document.getElementById('btn-refresh-hb');
    const hbTarget = document.getElementById('hb-target');
    const hbCmdType = document.getElementById('hb-cmd-type');
    const hbCmdPayload = document.getElementById('hb-cmd-payload');
    const hbSendBtn = document.getElementById('btn-send-hb-cmd');
    const hbResult = document.getElementById('hb-result');

    async function fetchHeartbeatClients() {
        if (!hbListEl) return;
        hbListEl.innerHTML = '<p>Loading...</p>';
        try {
            const clients = await getJson('/api/heartbeat/clients');
            if (!Array.isArray(clients) || clients.length === 0) {
                hbListEl.innerHTML = '<p>No heartbeat clients.</p>';
                return;
            }
            hbListEl.innerHTML = clients.map(c => `
                <div class="device-item">
                    <div class="device-id"><strong>${c.key}</strong> ${c.online ? '<span style="color:#4caf50; margin-left:6px;">● online</span>' : '<span style="color:#999; margin-left:6px;">● offline</span>'}</div>
                    <div class="device-ip">IP: ${c.ip || '-'}</div>
                    <div class="device-agent">Host: ${c.hostname || '-'} | Ver: ${c.version || '-'}</div>
                    <div class="device-agent">Status: ${c.status || '-'}${c.currentUrl ? ` | URL: ${c.currentUrl}` : ''}</div>
                    <div class="device-agent">Last Seen: ${c.lastSeen || '-'}</div>
                </div>
            `).join('');
        } catch (err) {
            hbListEl.innerHTML = `<p class="error">Failed to load heartbeat clients: ${err.message}</p>`;
        }
    }

    async function sendHeartbeatCommand() {
        if (!hbSendBtn) return;
        const target = (hbTarget?.value || '').trim();
        const type = (hbCmdType?.value || '').trim();
        const payloadRaw = (hbCmdPayload?.value || '').trim();
        if (!target || !type) { showToast({ title: 'Missing Fields', message: 'Target and command type are required.', level: 'warn' }); return; }
        let payload = {};
        if (payloadRaw) {
            try { payload = JSON.parse(payloadRaw); } catch (e) { showToast({ title: 'Invalid JSON', message: 'Payload must be valid JSON.', level: 'warn' }); return; }
        }
        hbSendBtn.disabled = true;
        if (hbResult) { hbResult.style.display = 'block'; hbResult.textContent = 'Sending...'; }
        try {
            const resp = await postJson('/api/heartbeat/command', { target, type, payload });
            if (hbResult) hbResult.textContent = `Queued. Total queued: ${resp.queued}`;
            showToast({ title: 'Command Queued', message: `Queued for ${target}.`, level: 'info' });
        } catch (err) {
            if (hbResult) hbResult.textContent = `Failed: ${err.message}`;
            showToast({ title: 'Command Failed', message: String(err.message || err), level: 'error' });
        } finally {
            hbSendBtn.disabled = false;
        }
    }

    hbRefreshBtn?.addEventListener('click', fetchHeartbeatClients);
    hbSendBtn?.addEventListener('click', sendHeartbeatCommand);
    // Initial load
    fetchHeartbeatClients();
}

// Start the kiosk when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initKiosk);
