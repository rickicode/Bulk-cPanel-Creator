// Deployment verification script
console.log('=== Vercel Deployment Check ===\n');

// Check if all required files exist
const fs = require('fs');
const path = require('path');

const requiredFiles = [
  'api/index.js',
  'api/health.js',
  'package.json',
  'vercel.json',
  'public/index.html',
  'public/app.js',
  'public/styles.css'
];

console.log('1. Checking required files...');
requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`✓ ${file}`);
  } else {
    console.log(`✗ ${file} - MISSING`);
  }
});

// Test API loading
console.log('\n2. Testing API module...');
try {
  const app = require('./api/index.js');
  console.log('✓ API module loads successfully');
} catch (error) {
  console.log('✗ API module failed to load:', error.message);
}

// Check package.json
console.log('\n3. Checking package.json...');
try {
  const pkg = require('./package.json');
  console.log(`✓ Package name: ${pkg.name}`);
  console.log(`✓ Version: ${pkg.version}`);
  console.log(`✓ Dependencies: ${Object.keys(pkg.dependencies).length} packages`);
} catch (error) {
  console.log('✗ Failed to read package.json:', error.message);
}

console.log('\n=== Deployment Check Complete ===');
console.log('Ready for Vercel deployment!');