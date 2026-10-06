'use strict';

const AgyLocator = require('../lib/agy-locator');

try {
  const found = AgyLocator.find();
  if (found) {
    console.log(`[zerog] ✓ Found Antigravity CLI (agy) at: ${found}`);
  } else {
    console.log('\n[zerog] Notice: Antigravity CLI (\'agy\') is required but was not detected.');
    console.log('To install agy automatically, run:');
    console.log('  zerog install-agy');
    console.log('Or install manually:');
    console.log('  curl -fsSL https://antigravity.google/cli/install.sh | bash\n');
  }
} catch {
  // Never fail npm install on postinstall check
}
