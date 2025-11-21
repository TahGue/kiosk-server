# Kiosk Server Improvements

## 1. Architecture & Code Structure
- **Modularization**: Refactor the monolithic `server.js` (currently ~1700 lines) into a proper MVC structure:
  - `routes/`: Define API endpoints.
  - `controllers/`: Handle request logic.
  - `services/`: Business logic (e.g., scanning, SSH, config management).
  - `middleware/`: Auth, logging, error handling.
- **Error Handling**: Implement a centralized error handling middleware instead of scattered `try/catch` blocks.

## 2. Database & Persistence
- **Migrate from JSON to SQLite**: Currently, data is stored in `json` files (`heartbeat-clients.json`). This is prone to corruption on concurrent writes.
  - **Recommendation**: Use `better-sqlite3` or `sequelize` with SQLite.
  - **Benefits**: ACID transactions, better query capability, file-based (no extra server process needed).

## 3. Security
- **Secure Headers**: Install `helmet` to set secure HTTP headers automatically.
- **Rate Limiting**: Replace the custom `checkRateLimit` function with `express-rate-limit` for more robust protection.
- **Input Validation**: Use `zod` or `joi` to validate incoming request bodies (e.g., ensuring `kioskUrl` is valid).
- **Authentication**: Upgrade from a static `ADMIN_TOKEN` to a proper session-based or JWT authentication system for the admin panel.

## 4. Reliability & Logging
- **Structured Logging**: Replace `console.log` with `winston` or `pino`. This allows log levels (INFO, WARN, ERROR) and JSON formatting for easy parsing.
- **HTTP Logging**: Add `morgan` to log HTTP requests.
- **Graceful Shutdown**: Ensure database connections and ongoing processes are closed properly on SIGTERM/SIGINT.

## 5. Features
- **WebSockets (Socket.io)**: Currently using Server-Sent Events (SSE). WebSockets would allow real-time bidirectional communication (e.g., pushing a "Refresh" command to a client immediately).
- **Remote Screenshots**: Allow clients to upload screenshots during heartbeat for visual monitoring.
- **Health Checks**: Add a `/health` endpoint for uptime monitoring.

## 6. DevOps
- **Docker**: Add a `Dockerfile` and `docker-compose.yml` for consistent deployment.
- **Testing**: Add unit tests (using `jest` or `mocha`) for critical logic like IP normalization and network scanning.
