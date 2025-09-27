# Admin Dashboard Feature Backlog

This is a living TODO for the kiosk admin dashboard. Grouped by capability. Use it to prioritize and track work.

## Core Device Inventory
- [ ] Unique device identity (ID, hostname) in `/api/devices` and client heartbeat
- [ ] Show IP, MAC, OS, browser, uptime, last seen
- [ ] Grouping by location/department (device `group` field)
- [ ] Tags and notes per device (persist server-side)

## Real-Time Presence and Control
- [ ] Live device list via SSE (`/api/stream`) with online/offline status
- [ ] Per-device actions: reload, blackout toggle, change URL, restart client script, reboot
- [ ] Bulk actions by selection or group
- [ ] Confirmation modals and progress feedback for actions

## Configuration Management
- [ ] Global config (already exists) surfaced in UI
- [ ] Per-group config with precedence: IP > group > global (extend `/api/config`)
- [ ] Templates/presets (Recent URLs, Named presets) with quick apply
- [ ] Versioned config with rollback (keep history in `config/`)

## Scheduling and Playlists
- [ ] Day/Evening URL schedule (server resolves active URL in `/api/config`)
- [ ] Playlists: rotate URLs with durations; server pushes current entry via SSE
- [ ] Maintenance windows for quiet reboots/updates

## Software and Content Deployment
- [ ] UI for `/api/deploy` (credentials, hosts, keypath, run-setup, reboot)
- [ ] Staged rollout (pilot group, then all)
- [ ] Post-deploy verification (hash/signature of installed files)
- [ ] Manage SSH keys in UI; push authorized keys to clients

## Monitoring, Health, and Alerts
- [ ] Client heartbeat endpoint `/api/heartbeat` (CPU, RAM, disk, browser status)
- [ ] Dashboard KPIs: total devices, online, degraded, pending updates
- [ ] Alert rules: offline/online, high CPU/RAM, repeated crashes, failed deploy
- [ ] Webhook/email notifications (configurable via `.env` and UI)

## Security and Access Control
- [ ] Enforce `ADMIN_TOKEN` on all state-changing routes
- [ ] IP allowlist for admin endpoints
- [ ] Role-based access (viewer/operator/admin)
- [ ] Audit logging: config changes, deploys, actions → `logs/audit.log`
- [ ] Secrets handling for SSH keys/tokens (never stored in plaintext in config)

## Compliance and Guardrails
- [ ] Domain allowlist/denylist for kiosk destinations
- [ ] Kiosk policy enforcement (disable shortcuts/context menu) as server flags
- [ ] Signed config files (sign/verify to detect tampering)

## Remote Support Utilities
- [ ] Time-limited support access: enable SSH/VNC for N minutes from UI
- [ ] On-demand client logs (tail and download)
- [ ] Optional screenshot/snapshot request (opt-in)

## Reporting and History
- [ ] URL change history and per-device change history
- [ ] Export inventory, uptime, incidents (CSV/JSON)
- [ ] Trend charts (last 24h/7d offline incidents)

## UI/UX Enhancements
- [ ] Device table: filters (group/status/search), pin-able columns, pagination
- [ ] Device detail drawer: live status, quick actions, recent events
- [ ] Theme/branding controls: primary color, logo, footer, large-text mode
- [ ] Accessibility: high-contrast and keyboard navigation

## Scalability and Reliability
- [ ] LAN discovery improvements: ARP + optional active scan with timeouts
- [ ] Server-side pagination and search for `/api/devices`
- [ ] Graceful offline support: service worker for admin UI, cached offline page

## Documentation and DX
- [ ] Update root `README.md` with simplified routes and admin usage
- [ ] Add operator handbook (common tasks, troubleshooting)
- [ ] Add API reference for `/api/*` endpoints

---

## Implementation Pointers
- Server routes: `kiosk-server/server.js`
- Admin UI: `kiosk-server/public/index.html`, `kiosk-server/public/js/main.js`, CSS in `public/css/styles.css`
- Persistence: `kiosk-server/config/` (kiosk-config.json, client-configs.json)
- Client: `kiosk-client/start-kiosk.sh` (heartbeat, policy), `scripts/Deploy-Clients.ps1`

## Suggested First Milestone
- [ ] Heartbeat + health display
- [ ] Audit log + ADMIN_TOKEN enforcement + IP allowlist
- [ ] Recent URLs + quick apply
- [ ] Per-group config precedence
