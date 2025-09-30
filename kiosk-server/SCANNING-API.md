# Network Scanning API Reference

## Overview

The kiosk server provides comprehensive network device discovery using multiple scanning methods:
- **Bonjour/mDNS**: Service discovery with friendly names
- **ARP**: Fast MAC address discovery
- **Nmap**: Advanced OS and service detection
- **OUI Database**: MAC vendor identification

## API Endpoints

### 1. Network Scan

**Endpoint**: `GET /api/lan/scan`

**Query Parameters**:
- `mode` (optional): Scan intensity - `fast`, `detailed`, or `aggressive` (default: `fast`)
- `subnet` (optional): Custom subnet to scan (e.g., `192.168.1.0/24`)
- `ports` (optional): Custom port range (e.g., `22,80,443,3389` or `1-1000`)

**Examples**:
```bash
# Fast scan (3-5 seconds)
curl http://localhost:4000/api/lan/scan?mode=fast

# Detailed scan with OS detection (10-30 seconds)
curl http://localhost:4000/api/lan/scan?mode=detailed

# Aggressive scan with full port scanning (30-120 seconds)
curl http://localhost:4000/api/lan/scan?mode=aggressive

# Custom subnet and ports
curl "http://localhost:4000/api/lan/scan?mode=detailed&subnet=10.0.0.0/24&ports=22,80,443"
```

**Response**:
```json
{
  "devices": [
    {
      "ip": "192.168.1.100",
      "mac": "aa:bb:cc:dd:ee:ff",
      "hostname": "desktop-pc",
      "name": "desktop-pc",
      "vendor": "Intel",
      "deviceType": "Windows PC",
      "os": "Windows 10",
      "osAccuracy": 95,
      "ports": [
        {
          "port": 3389,
          "protocol": "tcp",
          "service": "ms-wbt-server",
          "version": ""
        }
      ],
      "services": [
        {
          "type": "_smb._tcp",
          "name": "Desktop-PC",
          "port": 445,
          "protocol": "tcp"
        }
      ],
      "sources": ["bonjour", "arp", "nmap"]
    }
  ],
  "scanMode": "detailed",
  "scanTime": 15234,
  "methods": ["bonjour", "arp", "nmap"],
  "totalDevices": 12
}
```

### 2. Single Device Scan

**Endpoint**: `GET /api/lan/scan/:ip`

**Description**: Performs a comprehensive scan of a single device including OS detection, port scanning, and service identification.

**Example**:
```bash
curl http://localhost:4000/api/lan/scan/192.168.1.100
```

**Response**:
```json
{
  "ip": "192.168.1.100",
  "scannedAt": "2025-09-29T21:04:00.000Z",
  "mac": "aa:bb:cc:dd:ee:ff",
  "vendor": "Intel",
  "hostname": "desktop-pc",
  "name": "desktop-pc",
  "deviceType": "Windows PC",
  "os": "Windows 10",
  "osAccuracy": 95,
  "ports": [
    {
      "port": 22,
      "protocol": "tcp",
      "service": "ssh",
      "version": "OpenSSH 8.2"
    },
    {
      "port": 80,
      "protocol": "tcp",
      "service": "http",
      "version": "nginx 1.18.0"
    }
  ]
}
```

### 3. Network Interfaces

**Endpoint**: `GET /api/lan/interfaces`

**Description**: Lists all local IPv4 network interfaces on the server.

**Example**:
```bash
curl http://localhost:4000/api/lan/interfaces
```

**Response**:
```json
[
  {
    "name": "eth0",
    "address": "192.168.1.10",
    "netmask": "255.255.255.0",
    "cidr": "192.168.1.10/24",
    "mac": "00:11:22:33:44:55"
  }
]
```

## Scan Modes Comparison

| Mode | Duration | Methods | Information Gathered |
|------|----------|---------|---------------------|
| **Fast** | 3-5s | Bonjour, ARP, Nmap ping | IP, MAC, hostname, vendor, basic services |
| **Detailed** | 10-30s | Bonjour, ARP, Nmap OS/service | + OS detection, common ports (22,80,443,3389,5900) |
| **Aggressive** | 30-120s | Bonjour, ARP, Nmap full | + Full port scan (1-1000), service versions, scripts |

## Device Type Identification

The system automatically identifies device types based on:

1. **Bonjour Services**: Printers (IPP), media devices (AirPlay), file servers (SMB/AFP)
2. **Open Ports**: RDP (3389) = Windows PC, SSH (22) = Linux/Unix, VNC (5900) = VNC Server
3. **OS Detection**: Windows, Linux, macOS, iOS, Android
4. **MAC Vendor**: Raspberry Pi, Apple, Cisco, TP-Link, VMware, etc.

**Identified Types**:
- Windows PC
- Linux Device / Linux/Unix Server
- Mac
- iOS Device / Android Device
- Raspberry Pi
- Printer
- Media Device
- File Server / Web Server
- Router/Switch / Network Device
- Virtual Machine
- Unknown

## MAC Vendor Lookup

The system uses the comprehensive OUI (Organizationally Unique Identifier) database to identify device manufacturers from MAC addresses. Includes 40,000+ vendor entries.

**Common Vendors**:
- Apple, Samsung, LG Electronics
- Intel, Realtek, Cisco
- TP-Link, D-Link, Huawei
- Raspberry Pi Foundation
- VMware, VirtualBox, Microsoft (Hyper-V)

## Requirements

### Software Dependencies

All installed via `npm install`:
- `node-nmap`: Nmap integration
- `bonjour`: mDNS/Bonjour service discovery
- `oui`: MAC vendor database
- `node-arp`: Enhanced ARP table access

### System Requirements

- **Nmap**: Must be installed on the system for advanced scanning
  - Linux: `sudo apt-get install nmap`
  - macOS: `brew install nmap`
  - Windows: Download from https://nmap.org/download.html

- **Permissions**: Some features require elevated privileges:
  - OS detection requires root/admin
  - Port scanning works without elevation but may be limited
  - ARP and Bonjour work without elevation

## Performance Tips

1. **Fast Mode**: Use for quick device discovery in the admin UI
2. **Detailed Mode**: Use when you need OS information and common services
3. **Aggressive Mode**: Use sparingly for comprehensive security audits
4. **Single Device Scan**: Use for troubleshooting specific devices
5. **Custom Ports**: Specify only needed ports to speed up scans

## Security Considerations

- Network scanning may trigger security alerts on monitored networks
- Aggressive scans can be detected by intrusion detection systems
- Always have authorization before scanning networks you don't own
- Consider using `ADMIN_TOKEN` environment variable to restrict scan access

## Error Handling

The API gracefully handles failures:
- If nmap is not available, falls back to ARP and Bonjour
- If Bonjour fails, continues with other methods
- Empty results are returned as empty arrays, not errors
- Scan errors are logged but don't stop other methods

## Integration Example

```javascript
// Fast scan for device discovery
async function scanNetwork() {
  const response = await fetch('http://localhost:4000/api/lan/scan?mode=fast');
  const data = await response.json();
  
  console.log(`Found ${data.totalDevices} devices in ${data.scanTime}ms`);
  
  data.devices.forEach(device => {
    console.log(`${device.ip} - ${device.name} (${device.deviceType})`);
  });
}

// Detailed scan of specific device
async function scanDevice(ip) {
  const response = await fetch(`http://localhost:4000/api/lan/scan/${ip}`);
  const device = await response.json();
  
  console.log(`Device: ${device.name}`);
  console.log(`OS: ${device.os} (${device.osAccuracy}% confidence)`);
  console.log(`Open ports: ${device.ports.map(p => p.port).join(', ')}`);
}
```
