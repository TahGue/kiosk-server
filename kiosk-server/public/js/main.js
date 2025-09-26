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
    
    // Conditional kiosk restrictions based on flags
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
            const devices = await getJson('/api/devices');
            if (!Array.isArray(devices)) throw new Error('Invalid response');

            if (devices.length === 0) {
                devicesListEl.innerHTML = '<p>No devices are currently connected.</p>';
                return;
            }

            devicesListEl.innerHTML = devices.map(device => `
                <div class="device-item">
                    <div class="device-id">ID: ${device.id.substring(0, 8)}...</div>
                    <div class="device-ip">IP: ${device.ip}</div>
                    <div class="device-agent">Agent: ${device.userAgent.substring(0, 40)}...</div>
                    <div class="device-url">URL: ${device.currentUrl || 'Unknown'}</div>
                    <div class="device-action"><button onclick="setUrlForIp('${device.ip}')">Set URL</button></div>
                </div>
            `).join('');
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

    async function scanLan() {
        if (!lanResultsEl) return;
        lanResultsEl.innerHTML = '<p>Scanning network... this may take a few seconds.</p>';
        try {
            const res = await getJson('/api/lan/scan');
            const devices = Array.isArray(res.devices) ? res.devices : [];
            if (devices.length === 0) {
                lanResultsEl.innerHTML = '<p>No devices discovered.</p>';
                return;
            }
            lanResultsEl.innerHTML = devices.map(d => `
                <div class="device-item">
                    <div class="device-id">${(d.name || 'Unknown').toString()}</div>
                    <div class="device-ip">IP: ${d.ip || '-'}</div>
                    <div class="device-agent">MAC: ${d.mac || '-'}</div>
                </div>
            `).join('');
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

            const resp = await postJson('/api/deploy', body);
            if (deployResult) {
                if (resp && Array.isArray(resp.results)) {
                    const lines = resp.results.map(r => `${r.host}: ${r.ok ? 'OK' : 'FAIL'}${r.error ? ' - ' + r.error : ''}`);
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
}

// Start the kiosk when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initKiosk);
