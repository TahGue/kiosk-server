# Kiosk Server

A simple kiosk server built with Node.js and Express. This application provides a full-screen kiosk interface that can be displayed on a dedicated screen, with an admin panel to manage the content URL.

## Features

- **Full-Screen Kiosk Display**: Displays content in full-screen mode on client devices.
- **Admin Control Panel**: Change the displayed URL directly from the admin page at `http://localhost:4000`.
- **Real-Time Clock Display**: Shows current time on the admin interface.
- **Server Time Synchronization**: Periodically syncs time with the server.
- **Responsive Design**: Adapts to different screen sizes.
- **Basic Security Measures**: Options to disable context menus and shortcuts in kiosk mode.
- **Network Device Scanning**: Discover devices on the local network from the admin panel.
- **Persistent Configuration**: URL changes are saved to disk and survive server restarts.
- **Client URL Update Handling**: Kiosk clients check for URL changes periodically and update when a new URL is set.
- **Client Connection Tracking**: Clients notify the server when connected, providing IP, user agent, and current URL.
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

## Usage

- **Admin Interface**: Access the admin panel at `http://localhost:4000` (or the IP address of your server machine) to change the kiosk URL and manage settings.
  - Enter a new URL in the "Control Panel" and click "Switch URL" or press Enter.
  - In the "Connected Devices" panel, see client IPs, user agents, and current URLs; click "Set URL" to assign a specific URL to a client IP.
- **Kiosk Client**: Run the client script on a dedicated display machine (e.g., Linux Mint):
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

## Troubleshooting

- **Can't Type in Admin Input Field**: Hard refresh the page (`Ctrl+Shift+R`) to load the latest scripts. If the issue persists, check the browser console for errors (right-click > Inspect > Console).
- **Kiosk Client Not Updating URL**: Ensure the client script is the latest version with polling logic. Verify the client can reach the server at `http://<server-ip>:4000/api/config`. Stop and restart the script (`Ctrl+C`, then `./start-kiosk.sh`). If needed, kill the browser (`pkill -f google-chrome`) to force a relaunch with the new URL.
- **LAN Scan Returns Few/No Devices**: Run the scan again after a minute or interact with your LAN (e.g., browse to your router page) to populate the ARP table.
- **Can't Exit Kiosk Mode**: Follow the steps in 'Exiting Kiosk Mode' above. If stuck, force a reboot by holding the power button, then boot into recovery mode to disable autologin.

## License

This project is licensed under the MIT License - see the LICENSE file for details (if applicable).
