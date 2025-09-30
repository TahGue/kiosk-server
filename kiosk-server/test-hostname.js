// Test script to check hostname resolution
const dns = require('dns').promises;
const { exec } = require('child_process');

// Test IPs from your scan
const testIPs = [
  '192.168.0.1',
  '192.168.0.17',
  '192.168.0.122',
  '192.168.0.175',
  '192.168.0.194'
];

async function resolveHostname(ip) {
  console.log(`\nTesting hostname resolution for ${ip}:`);
  
  // Try DNS reverse lookup
  try {
    console.log('  Trying DNS reverse lookup...');
    const hostnames = await dns.reverse(ip);
    if (hostnames && hostnames.length > 0) {
      console.log(`  ✓ DNS Success: ${hostnames[0]}`);
      return hostnames[0];
    } else {
      console.log('  ✗ DNS returned no hostnames');
    }
  } catch (e) {
    console.log(`  ✗ DNS failed: ${e.message}`);
  }
  
  // Try NetBIOS on Windows
  if (process.platform === 'win32') {
    try {
      console.log('  Trying NetBIOS (nbtstat)...');
      return await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.log('  ✗ NetBIOS timeout');
          resolve(null);
        }, 3000);
        
        exec(`nbtstat -A ${ip}`, { windowsHide: true }, (err, stdout) => {
          clearTimeout(timeout);
          if (err) {
            console.log(`  ✗ NetBIOS failed: ${err.message}`);
            return resolve(null);
          }
          
          // Parse NetBIOS name from output
          const match = stdout.match(/([A-Z0-9\-]+)\s+<00>\s+UNIQUE/i);
          if (match) {
            console.log(`  ✓ NetBIOS Success: ${match[1]}`);
            return resolve(match[1]);
          } else {
            console.log('  ✗ No NetBIOS name found');
            resolve(null);
          }
        });
      });
    } catch (e) {
      console.log(`  ✗ NetBIOS exception: ${e.message}`);
    }
  }
  
  console.log(`  Result: No hostname found for ${ip}`);
  return null;
}

async function testAll() {
  console.log('Testing hostname resolution for network devices...\n');
  
  for (const ip of testIPs) {
    await resolveHostname(ip);
  }
  
  console.log('\nTest complete.');
}

testAll();
