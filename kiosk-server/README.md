# Kiosk Server

A simple kiosk server built with Node.js and Express. This application provides a full-screen kiosk interface that can be displayed on a dedicated screen, with an admin panel to manage the content URL.

## Features

- **Full-Screen Kiosk Display**: Displays content in full-screen mode on client devices.
- **Admin Control Panel**: Change the displayed URL directly from the admin page at `http://localhost:4000`.
- **Real-Time Clock Display**: Shows current time on the admin interface.
- **Server Time Synchronization**: Periodically syncs time with the server.
- **Responsive Design**: Adapts to different screen sizes.
- **Basic Security Measures**: Options to disable context menus and shortcuts in kiosk mode.
- **Advanced Network Device Scanning**: Comprehensive multi-method device discovery with OS detection, service identification, and MAC vendor lookup.
- **Persistent Configuration**: URL changes are saved to disk and survive server restarts.
- **Client URL Update Handling**: Kiosk clients check for URL changes periodically and update when a new URL is set.
- **Client Heartbeat and Remote Control**: Bash/PowerShell clients can send heartbeats to the server, appear as 'online' in the UI, and receive commands like `reboot` or `update_url`.
- **Remote Deployment and Restart**: Deploy the client script and restart kiosk devices directly from the admin UI via SSH.
- **Per-IP URL Configuration**: Set specific URLs for individual client IPs from the admin panel.

## Prerequisites

- Node.js (v14 or later)
- npm (comes with Node.js)

## Installation

1. Clone or download this repository to your server machine.
2. Navigate to the `kiosk-server` directory:
   ```bash
   cd kiosk-server
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
   ```bash
   npm run dev
   ```
   Or start in production mode:
   ```bash
    npm start
  ```

## Offline APT Repository (for LAN/offline clients)

You can host a lightweight APT repo on the kiosk server so clients (Linux Mint/Ubuntu) can install required packages without Internet.

Steps:

1. Collect `.deb` packages (e.g., `firefox`, `midori`, `curl`, `bcmwl-kernel-source`, legacy `nvidia-driver-340`, etc.) into a local folder.
2. Run the helper script to build `Packages` index and place files under `kiosk-server/public/repo/`:

   ```bash
   cd kiosk-server
   bash scripts/prepare-offline-repo.sh /path/to/deb-folder
   ```

3. Start the kiosk server. The repo will be reachable at `http://<server-ip>:4000/repo`.

Client usage:

- During root setup, the updated `kiosk-client/start-kiosk.sh` attempts to detect and add the local repo automatically if the server is reachable. It writes `/etc/apt/sources.list.d/kiosk-local.list` with:

  ```
  deb [trusted=yes] http://<server-ip>:4000/repo ./
  ```

- If not reachable during setup, you can add it manually on the client:

  ```bash
  echo "deb [trusted=yes] http://<server-ip>:4000/repo ./" | sudo tee /etc/apt/sources.list.d/kiosk-local.list
  sudo apt-get update
  sudo apt-get install -y firefox midori curl
  ```

Notes:

- The script uses `dpkg-scanpackages` (from `dpkg-dev`) to generate `Packages` index.
- Packages are served as static files by Express from `public/repo/`.
- Keep your `.deb` set aligned with client distro version for best compatibility.

## Heartbeat and Remote Control

The server includes a heartbeat system for monitoring and controlling non-browser clients (like simple bash or PowerShell scripts).

### Heartbeat API

- **`POST /api/heartbeat`**: A client sends a JSON payload with its status (`id`, `hostname`, `version`, `status`, `currentUrl`). The server registers the client and responds with any queued commands.
- **`GET /api/heartbeat/clients`**: Returns a list of all registered heartbeat clients, including their online status.
- **`POST /api/heartbeat/command`**: Queues a command for a specific client. Requires a payload like `{ "target": "client-key", "type": "reboot", "payload": {} }`.

### Heartbeat UI

The admin dashboard now includes a **Heartbeat Clients** panel where you can:
- See a list of all registered clients and their online status.
- Send commands (`reboot`, `update_url`) to a specific client.

### Heartbeat API Usage (Examples)

Below are practical examples to interact with the heartbeat API directly. If you set `ADMIN_TOKEN` in `kiosk-server/.env`, include it as `x-admin-token` on protected routes.

#### List clients

```bash
# Without admin token (works if ADMIN_TOKEN is not set)
curl -s http://<SERVER_IP>:4000/api/heartbeat/clients | jq .

# With admin token
curl -s http://<SERVER_IP>:4000/api/heartbeat/clients \
  -H "x-admin-token: <YOUR_ADMIN_TOKEN>" | jq .
```

#### Send a heartbeat (from a device)

```bash
curl -s -X POST http://<SERVER_IP>:4000/api/heartbeat \
  -H 'Content-Type: application/json' \
  -d '{
        "id": "my-device-123",
        "hostname": "my-device",
        "version": "kiosk-client-1.1.0",
        "status": "ok",
        "currentUrl": "https://example.com"
      }' | jq .
```

The response includes any queued commands and the effective config for the device:

```json
{
  "ok": true,
  "time": "2025-10-07T05:45:00.000Z",
  "config": { "kioskUrl": "https://example.com", "title": "Kiosk Display", ... },
  "commands": [ { "type": "update_url", "payload": { "url": "https://new" }, "createdAt": "..." } ]
}
```

#### Queue a command for a device

Note the payload shape: top-level `type` and `payload`.

```bash
# Update URL for a target (id or IP)
curl -s -X POST http://<SERVER_IP>:4000/api/heartbeat/command \
  -H 'Content-Type: application/json' \
  -H 'x-admin-token: <YOUR_ADMIN_TOKEN>' \
  -d '{
        "target": "my-device-123",
        "type": "update_url",
        "payload": { "url": "https://new.example.com" }
      }' | jq .

# Reboot a device
curl -s -X POST http://<SERVER_IP>:4000/api/heartbeat/command \
  -H 'Content-Type: application/json' \
  -H 'x-admin-token: <YOUR_ADMIN_TOKEN>' \
  -d '{
        "target": "my-device-123",
        "type": "reboot",
        "payload": {}
      }' | jq .
```

#### Minimal client examples

```bash
# Bash (Linux) minimal heartbeat loop
SERVER_BASE="http://<SERVER_IP>:4000"
ID="$(hostname)-$(cat /etc/machine-id 2>/dev/null || echo unknown)"
while true; do
  payload=$(cat <<EOF
{"id":"$ID","hostname":"$(hostname)","version":"kiosk-client-1.1.0","status":"ok"}
EOF
)
  resp=$(curl -fsS -X POST "$SERVER_BASE/api/heartbeat" -H 'Content-Type: application/json' -d "$payload" || true)
  # Optionally parse and act on commands using jq
  # echo "$resp" | jq -r '.commands[] | .type'
  sleep 15
done
```

```powershell
# PowerShell (Windows) minimal heartbeat loop
$SERVER_BASE = "http://<SERVER_IP>:4000"
$id = "$env:COMPUTERNAME"
while ($true) {
  $payload = @{ id=$id; hostname=$env:COMPUTERNAME; version="ps-client-1.0"; status="ok" } | ConvertTo-Json
  try { Invoke-RestMethod -Uri "$SERVER_BASE/api/heartbeat" -Method Post -Body $payload -ContentType "application/json" } catch {}
  Start-Sleep -Seconds 15
}
```

## Client Management and Deployment

The admin UI includes panels for deploying scripts and restarting clients via SSH.

- **Deploy to Clients**: Enter SSH credentials and the server's base URL to push the `start-kiosk.sh` script to multiple clients, set it up as a service, and optionally reboot them.
- **Restart Clients**: Remotely reboot a group of clients using SSH credentials.

## Usage

- **Admin Interface**: Access the admin panel at `http://localhost:4000` (or the IP address of your server machine) to change the kiosk URL and manage settings.
  - Enter a new URL in the "Control Panel" and click "Switch URL" or press Enter.
  - In the "Connected Devices" panel, see client IPs, user agents, and current URLs; click "Set URL" to assign a specific URL to a client IP.
- **Kiosk Client (Linux)**: The `kiosk-client/start-kiosk.sh` script is designed for Linux (Debian/Ubuntu/Mint). It now includes a heartbeat function to report status and receive commands.
  - **Setup**: Run with `sudo ./start-kiosk.sh` once to create a 'student' user, enable autologin, and install necessary packages (`jq`, browsers).
  - **Run**: After setup, the system will automatically log in and start the kiosk. To run manually, execute `./start-kiosk.sh` as a regular user.

- **Kiosk Client (Windows/Other OS)**: You can use a simple PowerShell or bash script to interact with the heartbeat system.

  **PowerShell Example:**
  ```powershell
  $SERVER_BASE = "http://<YOUR_SERVER_IP>:4000"
  while ($true) {
    $payload = @{
      id = "$env:COMPUTERNAME"
      hostname = "$env:COMPUTERNAME"
      version = "ps-client-1.0"
      status = "ok"
    } | ConvertTo-Json
    try {
      Invoke-RestMethod -Uri "$SERVER_BASE/api/heartbeat" -Method Post -Body $payload -ContentType "application/json"
    } catch {}
    Start-Sleep -Seconds 60
  }
  ```
  - Copy the `kiosk-client/start-kiosk.sh` script to your client machine.
  - If run with `sudo`, it sets up a 'student' user with no password and autologin, configuring the system to boot into kiosk mode.
  - If run as a regular user, it starts the kiosk browser in full-screen mode with the specified URL.
  - Make it executable: `chmod +x start-kiosk.sh`
  - Run setup with `sudo ./start-kiosk.sh` (once), then reboot to autologin as 'student', or run as regular user `./start-kiosk.sh` to start kiosk mode manually.
  - The client will display the current URL set on the server, update to a new URL periodically or when the browser restarts, and notify the server of its connection status.

## Exiting Kiosk Mode

- **Manual Exit**: If running the kiosk script manually, press `Ctrl+C` in the terminal to stop the script. To close the browser, press `Ctrl+Alt+Shift+Q` (if configured) or force-quit with `Alt+F4` if enabled.
- **Terminal Access**: If possible, open a terminal with `Ctrl+Alt+T` and run `pkill -f google-chrome` or `pkill -f firefox` to kill the browser, and `pkill -f start-kiosk.sh` to stop the script.
- **Disable Autologin**: If autologin is set up and you can't exit, boot into recovery mode (via GRUB menu > Advanced options > Recovery mode > root shell) and remove the autologin config: `rm /etc/lightdm/lightdm.conf.d/60-kiosk-autologin.conf`, then reboot.
- **Emergency**: If all else fails, boot from a live USB to access and modify the system configuration.

## Configuration

- **Environment Variables**: Customize settings in `kiosk-server/.env`:
  - `PORT`: Server port (default: 4000)
  - `KIOSK_URL`: Default URL to display
  - `KIOSK_TITLE`: Title shown on the kiosk
  - `KIOSK_FOOTER_TEXT`: Footer text
  - `TIMEZONE`: Timezone for clock display
  - `DISABLE_CONTEXT_MENU` and `DISABLE_SHORTCUTS`: Security flags for kiosk mode
- **Persisted Config**: URL changes made from the admin panel are saved to `kiosk-server/config/kiosk-config.json`.

## Network Scanning Features

The server includes comprehensive network device discovery capabilities using multiple scanning methods:

### Scanning Methods

1. **Bonjour/mDNS Discovery**: Fast discovery of devices advertising services (printers, media devices, etc.) with friendly names
2. **ARP Table Scanning**: Quick MAC address and IP discovery using system ARP cache or node-arp library
3. **Nmap Scanning**: Advanced scanning with OS detection, service identification, and port scanning
4. **MAC Vendor Lookup**: Comprehensive OUI database for identifying device manufacturers

### Scan Modes

Access the scan API at `/api/lan/scan?mode=<mode>`:

- **Fast Mode** (default): Quick scan using Bonjour, ARP, and basic nmap ping scan (3-5 seconds)
  ```
  GET /api/lan/scan?mode=fast
  ```

- **Detailed Mode**: Adds OS detection and common port scanning (10-30 seconds)
  ```
  GET /api/lan/scan?mode=detailed
  ```

- **Aggressive Mode**: Full OS detection, service version detection, and port scanning 1-1000 (30-120 seconds)
  ```
  GET /api/lan/scan?mode=aggressive
  ```

### Device Information Gathered

Depending on scan mode and device type, the scan returns:

- **IP Address**: IPv4 address of the device
- **MAC Address**: Physical hardware address
- **Hostname**: Device network name
- **Vendor**: Manufacturer identified from MAC address OUI
- **Device Type**: Automatically identified (Windows PC, Linux Server, Printer, Router, etc.)
- **Operating System**: OS name and detection accuracy (detailed/aggressive modes)
- **Open Ports**: List of accessible ports with service names and versions
- **Services**: Bonjour/mDNS advertised services (AirPlay, SMB, HTTP, etc.)
- **Scan Sources**: Which methods successfully detected the device

### Single Device Scan

For detailed information about a specific IP:

```
GET /api/lan/scan/192.168.1.100
```

This performs a comprehensive scan of the single device including OS detection, port scanning, and service identification.

### Custom Subnet and Ports

Specify custom subnet or port ranges:

```
GET /api/lan/scan?mode=detailed&subnet=192.168.1.0/24&ports=22,80,443,3389
```

## Troubleshooting

- **Can't Type in Admin Input Field**: Hard refresh the page (`Ctrl+Shift+R`) to load the latest scripts. If the issue persists, check the browser console for errors (right-click > Inspect > Console).
- **Kiosk Client Not Updating URL**: Ensure the client script is the latest version with polling logic. Verify the client can reach the server at `http://<server-ip>:4000/api/config`. Stop and restart the script (`Ctrl+C`, then `./start-kiosk.sh`). If needed, kill the browser (`pkill -f google-chrome`) to force a relaunch with the new URL.
- **LAN Scan Returns Few/No Devices**: Try using detailed or aggressive scan mode. Ensure nmap is installed on the server (`npm install` should handle node-nmap). For best results, run the server with appropriate network permissions.
- **Nmap Requires Root/Admin**: Some nmap features (OS detection) require elevated privileges. Run the server with `sudo` on Linux or as Administrator on Windows for full functionality.
- **Can't Exit Kiosk Mode**: Follow the steps in 'Exiting Kiosk Mode' above. If stuck, force a reboot by holding the power button, then boot into recovery mode to disable autologin.

## License

This project is licensed under the MIT License - see the LICENSE file for details (if applicable).
