'use strict';

const AgyLocator = require('../lib/agy-locator');

try {
  const found = AgyLocator.find();
  if (found) {
    console.log(`[zerog] ✓ Found Antigravity CLI (agy) at: ${found}`);
  } else {
    console.log('\n[zerog] Notice: Antigravity CLI (\'agy\') was not detected.');
    console.log('[zerog] Automatically installing agy from Google...\n');
    const installed = AgyLocator.installAgy();
    if (!installed) {
      console.log('\n[zerog] Notice: Could not auto-install agy. You can install it manually:');
      console.log('  curl -fsSL https://antigravity.google/cli/install.sh | bash\n');
    }
  }
} catch {
  // Never fail npm install on postinstall check
}
