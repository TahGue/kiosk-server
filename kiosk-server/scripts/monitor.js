#!/usr/bin/env node

/**
 * Monitoring script for Kiosk Server
 * Checks health and sends alerts if issues detected
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  serverUrl: process.env.KIOSK_SERVER_URL || 'http://localhost:4000',
  checkInterval: 60000, // 1 minute
  maxFailures: 3,
  logFile: path.join(__dirname, '..', 'logs', 'monitor.log'),
  alertWebhook: process.env.ALERT_WEBHOOK || '', // Slack/Discord webhook URL
};

let failureCount = 0;

// Ensure logs directory exists
const logsDir = path.dirname(CONFIG.logFile);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  console.log(logMessage);
  
  // Append to log file
  fs.appendFileSync(CONFIG.logFile, logMessage + '\n');
}

async function checkHealth() {
  const checks = {
    api: false,
    sse: false,
    devices: false,
    memory: process.memoryUsage(),
  };
  
  try {
    // Check /api/time endpoint
    const timeRes = await fetch(`${CONFIG.serverUrl}/api/time`);
    if (timeRes.ok) {
      const data = await timeRes.json();
      checks.api = !!data.time;
    }
    
    // Check /api/devices (may require auth)
    try {
      const devRes = await fetch(`${CONFIG.serverUrl}/api/devices`, {
        headers: { 'x-admin-token': process.env.ADMIN_TOKEN || '' }
      });
      checks.devices = devRes.ok;
    } catch (e) {
      // Expected if auth required
    }
    
    // Check SSE stream connectivity
    const sseCheck = await new Promise((resolve) => {
      const req = http.get(`${CONFIG.serverUrl}/api/stream`, (res) => {
        resolve(res.statusCode === 200);
        req.abort();
      });
      req.on('error', () => resolve(false));
      req.setTimeout(5000, () => {
        req.abort();
        resolve(false);
      });
    });
    checks.sse = sseCheck;
    
    // Overall health
    const healthy = checks.api && checks.sse;
    
    if (healthy) {
      if (failureCount > 0) {
        log(`Service recovered after ${failureCount} failures`, 'WARN');
        sendAlert('✅ Kiosk Server Recovered', `Service is back online after ${failureCount} failures`);
      }
      failureCount = 0;
      log(`Health check passed - API: ${checks.api}, SSE: ${checks.sse}, Devices: ${checks.devices}`);
    } else {
      failureCount++;
      log(`Health check failed (${failureCount}/${CONFIG.maxFailures}) - API: ${checks.api}, SSE: ${checks.sse}`, 'ERROR');
      
      if (failureCount >= CONFIG.maxFailures) {
        sendAlert('🚨 Kiosk Server Down', `Service has failed ${failureCount} consecutive health checks`);
      }
    }
    
    // Log memory usage if high
    const memMB = Math.round(checks.memory.heapUsed / 1024 / 1024);
    if (memMB > 400) {
      log(`High memory usage: ${memMB}MB`, 'WARN');
    }
    
  } catch (error) {
    failureCount++;
    log(`Health check error (${failureCount}/${CONFIG.maxFailures}): ${error.message}`, 'ERROR');
    
    if (failureCount >= CONFIG.maxFailures) {
      sendAlert('🚨 Kiosk Server Unreachable', error.message);
    }
  }
}

async function sendAlert(title, message) {
  if (!CONFIG.alertWebhook) return;
  
  try {
    // Format for Slack/Discord
    const payload = {
      text: title,
      attachments: [{
        color: title.includes('🚨') ? 'danger' : 'good',
        text: message,
        footer: 'Kiosk Monitor',
        ts: Math.floor(Date.now() / 1000),
      }]
    };
    
    await fetch(CONFIG.alertWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    log(`Failed to send alert: ${error.message}`, 'ERROR');
  }
}

// Run health checks
log('Starting Kiosk Server monitoring...');
log(`Monitoring ${CONFIG.serverUrl} every ${CONFIG.checkInterval / 1000} seconds`);

// Initial check
checkHealth();

// Schedule periodic checks
setInterval(checkHealth, CONFIG.checkInterval);

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('Monitoring stopped');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Monitoring stopped');
  process.exit(0);
});
