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

    // Behavior flags
    const disableContextMenu = !!cfg.disableContextMenu;
    const disableShortcuts = !!cfg.disableShortcuts;
    window.__kioskFlags = { disableContextMenu, disableShortcuts };
}

// Setup SSE to receive config and actions
function initSSE() {
    const es = new EventSource('/api/stream');
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
                if (frame && frame.contentWindow) frame.contentWindow.location.reload();
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
        es.close(); // Close the current connection
        setTimeout(initSSE, 5000); // Reinitialize SSE after delay
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
    
    // Conditional kiosk restrictions (only for client view, not admin)
    const isClientView = window.location.pathname.endsWith('/client') || window.location.pathname.endsWith('/client.html');
    if (isClientView) {
        document.addEventListener('contextmenu', (e) => {
            if (window.__kioskFlags?.disableContextMenu) {
                e.preventDefault();
                return false;
            }
        });

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
        const url = (document.getElementById('admin-url')?.value || '').trim();
        if (!url) return;
        try {
            await postJson('/api/config', { kioskUrl: url });
        } catch (e) {
            console.error('Failed to update kiosk URL', e);
            if (e.message.includes('401')) {
                alert('Failed to update kiosk URL: Authorization failed. Is the Admin Token correct?');
            } else {
                alert(`Failed to update kiosk URL: ${e.message}`);
            }
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

            const isValidArray = (arr) => Array.isArray(arr);
            const sse = isValidArray(sseDevices) ? sseDevices : [];
            const hb = isValidArray(hbClients) ? hbClients : [];

            if (sse.length === 0 && hb.length === 0) {
                devicesListEl.innerHTML = '<p>No devices are currently connected.</p>';
                return;
            }

            const sseHtml = sse.map(device => `
                <div class="device-item">
                    <div class="device-id">[SSE] ID: ${device.id.substring(0, 8)}...</div>
                    <div class="device-ip">IP: ${device.ip}</div>
                    <div class="device-agent">Agent: ${device.userAgent.substring(0, 60)}...</div>
                    <div class="device-url">URL: ${device.currentUrl || 'Unknown'}</div>
                    <div class="device-action"><button onclick="setUrlForIp('${device.ip}')">Set URL</button></div>
                </div>
            `).join('');

            const hbHtml = hb.map(c => `
                <div class="device-item">
                    <div class="device-id">[HB] ${c.key} ${c.online ? '<span style="color:#4caf50; margin-left:6px;">● online</span>' : '<span style="color:#999; margin-left:6px;">● offline</span>'}</div>
                    <div class="device-ip">IP: ${c.ip || '-'}</div>
                    <div class="device-agent">Host: ${c.hostname || '-'} | Ver: ${c.version || '-'}</div>
                    <div class="device-url">URL: ${c.currentUrl || 'Unknown'}</div>
                </div>
            `).join('');

            devicesListEl.innerHTML = sseHtml + hbHtml;
        } catch (error) {
            if (error.message.includes('401')) {
                devicesListEl.innerHTML = `<p class="error">Authorization failed. Is the Admin Token correct?</p>`;
            } else {
                devicesListEl.innerHTML = `<p class="error">Failed to load devices: ${error.message}</p>`;
            }
        }
    }

    function startDevicesPolling() {
        if (!devicesListEl) return;
        fetchAndRenderDevices();
        if (!devicesIntervalId) {
            devicesIntervalId = setInterval(fetchAndRenderDevices, 10000);
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
                .then(response => {
                    alert(`URL updated for IP ${ip} to ${url}`);
                    fetchAndRenderDevices(); // Refresh the list
                })
                .catch(e => {
                    console.error('Failed to update URL for IP', e);
                    alert(`Failed to update URL for IP ${ip}: ${e.message}`);
                });
        }
    }

    // Make function available globally for button onclick
    window.setUrlForIp = setUrlForIp;

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
            // Fetch both network scan and connected devices
            const [scanRes, connectedDevices] = await Promise.all([
                getJson(buildScanUrl()),
                getJson('/api/devices').catch(() => [])
            ]);
            
            const devices = Array.isArray(scanRes.devices) ? scanRes.devices : [];
            if (devices.length === 0) {
                lanResultsEl.innerHTML = '<p>No devices discovered.</p>';
                return;
            }

            // Create a Set of IPs that have active client connections
            const connectedIPs = new Set(
                Array.isArray(connectedDevices) 
                    ? connectedDevices.map(d => d.ip) 
                    : []
            );

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

    // Open current URL in new tab
    const btnOpenUrl = document.getElementById('btn-open-url');
    btnOpenUrl?.addEventListener('click', () => {
        const url = document.getElementById('current-url-display')?.textContent || 'about:blank';
        if (url !== 'URL not set') {
            window.open(url, '_blank');
        } else {
            alert('No URL set. Please set a URL first.');
        }
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

    // Auto-fill server base URL from current location
    if (inputServerBase) {
        inputServerBase.value = window.location.origin;
    }

    async function deployToClients() {
        if (!inputUsername || !inputServerBase) return;
        const username = (inputUsername.value || '').trim();
        const password = (inputPassword?.value || '').trim();
        const serverBase = (inputServerBase.value || '').trim();
        const runSetup = !!(chkRunSetup && chkRunSetup.checked);
        const reboot = !!(chkReboot && chkReboot.checked);
        const hostsRaw = (inputHosts?.value || '').trim();
        const hosts = hostsRaw ? hostsRaw.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : undefined;

        if (!username) { alert('SSH username is required'); return; }
        if (!serverBase) { alert('Server Base is required'); return; }

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
                } else {
                    deployResult.textContent = 'Deploy finished (no details)';
                }
            }
        } catch (err) {
            if (deployResult) deployResult.textContent = `Deploy failed: ${err.message || err}`;
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

        if (!username) { alert('SSH username is required'); return; }

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
                    restartResult.innerHTML = `<strong>Restart finished</strong><br/>` + lines.join('<br/>');
                } else {
                    restartResult.textContent = 'Restart finished (no details)';
                }
            }
        } catch (err) {
            if (restartResult) restartResult.textContent = `Restart failed: ${err.message || err}`;
        } finally {
            btnRestart && (btnRestart.disabled = false);
        }
    }

    btnRestart?.addEventListener('click', restartClients);

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
        if (!target || !type) { alert('Target and command type are required'); return; }
        let payload = {};
        if (payloadRaw) {
            try { payload = JSON.parse(payloadRaw); } catch (e) { alert('Payload must be valid JSON'); return; }
        }
        hbSendBtn.disabled = true;
        if (hbResult) { hbResult.style.display = 'block'; hbResult.textContent = 'Sending...'; }
        try {
            const resp = await postJson('/api/heartbeat/command', { target, type, payload });
            if (hbResult) hbResult.textContent = `Queued. Total queued: ${resp.queued}`;
        } catch (err) {
            if (hbResult) hbResult.textContent = `Failed: ${err.message}`;
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
