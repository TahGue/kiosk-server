# Kiosk System (Server + Clients)

A complete kiosk solution consisting of a Node.js server and Linux client scripts for running full-screen kiosk browsers. The server provides an admin panel to set and manage the displayed URL globally or per client. Clients fetch the URL, launch a browser in kiosk mode, and periodically refresh/apply changes.

## Project Structure

```
.
├─ kiosk-server/                  # Node.js/Express server and admin UI
│  ├─ server.js                   # Main server entry
│  ├─ public/                     # Static assets (admin UI, repo hosting, etc.)
│  ├─ config/
│  │  └─ client-configs.json      # Example per-IP kiosk URL mapping
│  ├─ scripts/
│  │  └─ prepare-offline-repo.sh  # Helper to build a local APT repo (optional)
│  ├─ .env.example                # Copy to .env and customize
│  ├─ package.json
│  └─ README.md                   # Server-only documentation
│
└─ kiosk-client/                  # Client-side scripts for Linux kiosk machines
   ├─ start-kiosk.sh              # Main script; run as user or with sudo for setup
   ├─ start-kiosk-direct.sh       # Direct-launch variant
   ├─ setup-autostart-kiosk.sh    # Desktop autostart helper
   ├─ scripts/
   │  └─ Deploy-Clients.ps1       # Windows PowerShell mass-deploy helper (ssh/scp)
   └─ hosts.example.txt           # Example hosts file (one host per line)
```

## Features

- **Admin panel to control kiosk URL**
- **Per-IP configuration** via server-side config
- **Client auto-update** of the displayed URL
- **Optional offline APT repo** hosted by the server for LAN-only environments
- **Mass deployment script** from Windows using OpenSSH (`ssh`, `scp`)

## Prerequisites

- **Server**
  - Node.js v14+ and npm
  - (Optional) `dpkg-dev` if you plan to host an offline APT repo
- **Deployment Host (Windows)**
  - PowerShell 7+ recommended
  - OpenSSH client tools available in PATH (`ssh`, `scp`)
- **Clients (Linux Mint/Ubuntu recommended)**
  - Network access to the server (e.g., `http://<server-ip>:4000`)

## Quick Start

### 1) Server

1. Open a terminal and go to `kiosk-server/`.
2. Install and run:
   ```bash
   npm install
   npm run dev      # for development with nodemon
   # or
   npm start        # for production
   ```
3. Open the admin panel at `http://localhost:4000` (or `http://<server-ip>:4000`).
4. Set the kiosk URL in the admin panel. This will be used by clients.

Optional: Configure environment variables by copying `.env.example` to `.env` and adjusting values.

### 2) Single Client (Manual)

On a Linux client machine:

1. Copy `kiosk-client/start-kiosk.sh` to the client.
2. Make it executable and run:
   ```bash
   chmod +x start-kiosk.sh
   # One-time root setup (creates autologin user/session and installs dependencies if needed)
   sudo ./start-kiosk.sh
   # or run as regular user to launch kiosk mode without system changes
   ./start-kiosk.sh
   ```
3. The client will launch a browser in kiosk mode pointing at the server-defined URL and periodically check for updates.

### 3) Mass-Deploy to Many Clients (Windows)

Use the PowerShell helper `kiosk-client/scripts/Deploy-Clients.ps1` to copy and apply the latest client script and config to multiple hosts via `ssh/scp`.

1. Prepare a hosts file (one IP/hostname per line). You can start from `kiosk-client/hosts.example.txt`.
2. From a PowerShell terminal on your Windows machine, run:
   ```powershell
   pwsh -File .\kiosk-client\scripts\Deploy-Clients.ps1 `
     -HostsFile .\kiosk-client\hosts.txt `
     -ServerBase "http://<server-ip>:4000" `
     -Username student `
     [-KeyPath C:\path\to\ssh\key] `
     [-RunSetup] `
     [-Reboot]
   ```
   - **-RunSetup**: After copying, runs the root setup flow on the client (one-time) to create the kiosk user/session and autologin.
   - **-Reboot**: Reboots the client at the end of the update.

Notes:
- Ensure `ssh` and `scp` work to each target host.
- The script writes `/etc/kiosk-client.conf` with `SERVER_BASE` and installs the latest `start-kiosk.sh` under `/usr/local/bin/`.

## Offline APT Repository (Optional)

If your clients do not have Internet access, you can host a lightweight APT repo from the server.

1. Collect required `.deb` files (e.g., browsers, drivers) on the server.
2. Build the Packages index and place under `kiosk-server/public/repo/`:
   ```bash
   cd kiosk-server
   bash scripts/prepare-offline-repo.sh /path/to/deb-folder
   ```
3. Start the server; the repo will be available at `http://<server-ip>:4000/repo`.
4. The client setup script will attempt to auto-add this repo; otherwise add manually:
   ```bash
   echo "deb [trusted=yes] http://<server-ip>:4000/repo ./" | sudo tee /etc/apt/sources.list.d/kiosk-local.list
   sudo apt-get update
   ```

## Configuration

- **Server env (`kiosk-server/.env`)**
  - `PORT` (default: 4000)
  - `KIOSK_URL` default value
  - `KIOSK_TITLE`, `KIOSK_FOOTER_TEXT`
  - `TIMEZONE`
  - `DISABLE_CONTEXT_MENU`, `DISABLE_SHORTCUTS`
- **Per-IP config**
  - Example mapping in `kiosk-server/config/client-configs.json`.
- **Client config**
  - `/etc/kiosk-client.conf` stores `SERVER_BASE` on the client.

## Troubleshooting

- **Client not updating URL**
  - Verify the client can reach `http://<server-ip>:4000/api/config`.
  - Restart the client script or kill the browser process (`pkill -f firefox` or `pkill -f google-chrome`).
- **Admin UI issues**
  - Hard refresh (`Ctrl+Shift+R`). Check browser console for errors.
- **Mass deploy fails**
  - Ensure `ssh/scp` are installed and in PATH on Windows.
  - Check credentials and network connectivity to each host.

## Development

- **Server**
  - `npm run dev` for hot-reload with nodemon.
  - Main entry: `kiosk-server/server.js`.
- **Client**
  - Primary script: `kiosk-client/start-kiosk.sh`.
  - Windows deploy helper: `kiosk-client/scripts/Deploy-Clients.ps1`.

## License

MIT (see `kiosk-server/README.md` for details).
