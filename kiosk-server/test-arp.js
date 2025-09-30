// Quick test script to verify ARP scanning
const { exec } = require('child_process');

function normalizeMac(mac) {
  if (!mac) return '';
  return mac.toLowerCase().replace(/-/g, ':');
}

function isValidDeviceAddress(ip, mac) {
  if (!ip || !mac) return false;
  
  // Filter out broadcast MAC addresses
  if (mac === 'ff:ff:ff:ff:ff:ff') return false;
  
  // Filter out multicast MAC addresses (first octet has LSB set)
  const firstOctet = parseInt(mac.substring(0, 2), 16);
  if (firstOctet & 0x01) return false; // Multicast bit set
  
  // Parse IP address
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return false;
  
  // Filter out broadcast addresses (x.x.x.255)
  if (parts[3] === 255) return false;
  
  // Filter out network addresses (x.x.x.0)
  if (parts[3] === 0) return false;
  
  // Filter out multicast range (224.0.0.0 - 239.255.255.255)
  if (parts[0] >= 224 && parts[0] <= 239) return false;
  
  // Filter out loopback (127.x.x.x)
  if (parts[0] === 127) return false;
  
  return true;
}

function parseArpTable(text) {
  const devices = [];
  const lines = (text || '').split(/\r?\n/);
  console.log(`Parsing ${lines.length} lines from ARP output...`);
  
  for (const line of lines) {
    // Windows format: "  192.168.0.1          aa-bb-cc-dd-ee-ff     dynamic"
    let m = line.match(/\s*(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F:\-]{11,17})\s+\w+/);
    if (m) {
      const ip = m[1];
      const mac = normalizeMac(m[2]);
      
      if (isValidDeviceAddress(ip, mac)) {
        devices.push({ ip, mac });
        console.log(`  ✓ Valid: ${ip} -> ${mac}`);
      } else {
        console.log(`  ✗ Filtered: ${ip} -> ${mac}`);
      }
      continue;
    }
    // Unix format: "? (192.168.0.1) at aa:bb:cc:dd:ee:ff [ether] on en0"
    m = line.match(/\((\d+\.\d+\.\d+\.\d+)\)\s+at\s+([0-9a-fA-F:]{17})/);
    if (m) {
      const ip = m[1];
      const mac = normalizeMac(m[2]);
      
      if (isValidDeviceAddress(ip, mac)) {
        devices.push({ ip, mac });
        console.log(`  ✓ Valid: ${ip} -> ${mac}`);
      } else {
        console.log(`  ✗ Filtered: ${ip} -> ${mac}`);
      }
      continue;
    }
  }
  
  // de-duplicate by ip
  const map = new Map();
  for (const d of devices) { map.set(d.ip, d); }
  return Array.from(map.values());
}

function getMacVendor(mac) {
  if (!mac) return 'Unknown';
  const oui = mac.substring(0, 8).toUpperCase();
  
  const vendors = {
    'B0:92:4A': 'D-Link',
    '20:28:BC': 'Samsung',
    '08:D2:3E': 'LG Electronics',
    '0C:8B:FD': 'Apple',
    'FE:E3:D1': 'Unknown (Local)',
    '6C:F6:DA': 'Unknown'
  };
  
  return vendors[oui] || 'Unknown Vendor';
}

console.log('Testing ARP scan with filtering...\n');
exec('arp -a', { windowsHide: true }, (err, stdout, stderr) => {
  if (err) {
    console.error('ARP command failed:', err);
    console.error('stderr:', stderr);
    return;
  }
  
  console.log('Raw ARP output:');
  console.log('---');
  console.log(stdout);
  console.log('---\n');
  
  const devices = parseArpTable(stdout);
  console.log(`\n✓ Found ${devices.length} valid devices:\n`);
  devices.forEach(d => {
    const vendor = getMacVendor(d.mac);
    console.log(`  ${d.ip.padEnd(15)} ${d.mac.padEnd(17)} ${vendor}`);
  });
  
  console.log('\nThese devices should now appear in the web UI scan!');
});
