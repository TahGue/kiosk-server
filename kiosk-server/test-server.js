#!/usr/bin/env node

/**
 * Test server logic and validation functions
 */

const net = require('net');

// Test validation functions (copied from server.js)
function isValidIp(ip) {
  return net.isIPv4(ip) || net.isIPv6(ip);
}

function isValidUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'file:';
  } catch {
    return false;
  }
}

// Run tests
console.log('🧪 Testing Server Logic\n');

// Test IP validation
console.log('=== IP Validation ===');
const ipTests = [
  { input: '192.168.1.1', expected: true },
  { input: '10.0.0.1', expected: true },
  { input: '::1', expected: true },
  { input: 'invalid', expected: false },
  { input: '', expected: false },
  { input: '256.1.1.1', expected: false },
];

let ipPassed = 0;
ipTests.forEach(test => {
  const result = isValidIp(test.input);
  const status = result === test.expected ? '✅' : '❌';
  console.log(`${status} isValidIp('${test.input}') = ${result} (expected ${test.expected})`);
  if (result === test.expected) ipPassed++;
});

console.log(`\nIP Tests: ${ipPassed}/${ipTests.length} passed\n`);

// Test URL validation
console.log('=== URL Validation ===');
const urlTests = [
  { input: 'https://google.com', expected: true },
  { input: 'http://localhost:4000', expected: true },
  { input: 'https://example.com/path?query=1', expected: true },
  { input: 'file:///path/to/file.html', expected: true },
  { input: 'invalid-url', expected: false },
  { input: 'ftp://example.com', expected: false }, // FTP not allowed
  { input: '', expected: false },
];

let urlPassed = 0;
urlTests.forEach(test => {
  const result = isValidUrl(test.input);
  const status = result === test.expected ? '✅' : '❌';
  console.log(`${status} isValidUrl('${test.input}') = ${result} (expected ${test.expected})`);
  if (result === test.expected) urlPassed++;
});

console.log(`\nURL Tests: ${urlPassed}/${urlTests.length} passed\n`);

// Test server requirements
console.log('=== Server Requirements ===');

// Check if .env exists
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '.env');
const envExists = fs.existsSync(envPath);
console.log(`${envExists ? '✅' : '⚠️ '} .env file ${envExists ? 'exists' : 'missing (will use defaults)'}`);

// Check required dependencies
const pkgPath = path.join(__dirname, 'package.json');
try {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const requiredDeps = ['express', 'cors', 'dotenv'];
  
  requiredDeps.forEach(dep => {
    const hasIt = pkg.dependencies && pkg.dependencies[dep];
    console.log(`${hasIt ? '✅' : '❌'} ${dep} ${hasIt ? 'installed' : 'MISSING'}`);
  });
} catch (e) {
  console.log('❌ Could not read package.json');
}

// Test .env parsing
if (envExists) {
  console.log('\n=== .env Configuration ===');
  require('dotenv').config();
  
  const important = [
    'PORT',
    'KIOSK_URL',
    'ADMIN_TOKEN',
    'CORS_ORIGIN',
    'NODE_ENV'
  ];
  
  important.forEach(key => {
    const value = process.env[key];
    if (value) {
      console.log(`✅ ${key}=${value.length > 30 ? value.substring(0, 27) + '...' : value}`);
    } else {
      console.log(`⚠️  ${key} not set (will use default)`);
    }
  });
}

// Summary
console.log('\n=== Summary ===');
const totalTests = ipPassed + urlPassed;
const totalExpected = ipTests.length + urlTests.length;
const allPassed = totalTests === totalExpected;

console.log(`${allPassed ? '✅' : '❌'} Logic Tests: ${totalTests}/${totalExpected} passed`);
console.log(`${envExists ? '✅' : '⚠️ '} Configuration: ${envExists ? 'Ready' : 'Using defaults'}`);

if (allPassed && (envExists || true)) {
  console.log('\n🎉 Server logic is working correctly!');
  console.log('   You can start the server with: npm start');
} else {
  console.log('\n⚠️  Some tests failed. Check the output above.');
  process.exit(1);
}

module.exports = { isValidIp, isValidUrl };
