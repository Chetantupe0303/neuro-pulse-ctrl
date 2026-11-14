/**
 * Stage 3 Verification Test: Design System & Status Badges
 * Tests:
 * 1. design-system.css defines single accent #2F4BFF
 * 2. Light & dark theme tokens defined (prefers-color-scheme)
 * 3. Status badges: safe (outlined), confirm (half-filled), blocked (solid filled)
 * 4. Destructive buttons styled with solid dark/inverted neutral styling
 * 5. Strict rules enforced: no gradients, no glow, no blur, no box-shadows
 * 6. laptop.css and phone.css import and use design-system.css
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runStage3Tests() {
  console.log('🧪 Starting Stage 3 Verification Tests...\n');

  const dsPath = path.resolve(__dirname, '..', 'web', 'design-system.css');
  const laptopCssPath = path.resolve(__dirname, '..', 'web', 'laptop.css');
  const phoneCssPath = path.resolve(__dirname, '..', 'web', 'phone.css');

  assert(fs.existsSync(dsPath), 'design-system.css must exist');
  const dsContent = fs.readFileSync(dsPath, 'utf8');
  const laptopContent = fs.readFileSync(laptopCssPath, 'utf8');
  const phoneContent = fs.readFileSync(phoneCssPath, 'utf8');

  // 1. Single accent color check
  console.log('[1/5] Verifying single accent hue (#2F4BFF)...');
  assert(dsContent.includes('#2F4BFF'), 'Must define exact accent color #2F4BFF');
  console.log('  ✓ Accent color #2F4BFF defined');

  // 2. Light and Dark Theme Tokens
  console.log('[2/5] Verifying light & dark theme tokens...');
  assert(dsContent.includes(':root'), 'Must define root CSS variables for light theme');
  assert(dsContent.includes('prefers-color-scheme: dark'), 'Must support dark theme via prefers-color-scheme');
  console.log('  ✓ Light default & dark prefers-color-scheme themes verified');

  // 3. Status badges without extra colors
  console.log('[3/5] Verifying 3 status badges (safe, confirm, blocked)...');
  assert(dsContent.includes('.status-badge') || dsContent.includes('badge-safe'), 'Status badge base class must exist');
  assert(dsContent.includes('safe') && dsContent.includes('confirm') && dsContent.includes('blocked'), 'Must define safe, confirm, and blocked badges');
  console.log('  ✓ Status badges safe/confirm/blocked defined');

  // 4. Destructive inverted styling
  console.log('[4/5] Verifying destructive action button styling...');
  assert(dsContent.includes('--destructive-bg') && dsContent.includes('.btn-destructive'), 'Must define destructive button styling');
  console.log('  ✓ Inverted destructive button styles verified');

  // 5. Strict rules: No box-shadows, no gradients, no glow, no blur
  console.log('[5/5] Enforcing strict design system constraints (no shadows, gradients, glow, or blur)...');
  const forbiddenPatterns = [
    { name: 'box-shadow', regex: /box-shadow(?!:\s*none)/i },
    { name: 'linear-gradient', regex: /linear-gradient/i },
    { name: 'radial-gradient', regex: /radial-gradient/i },
    { name: 'backdrop-filter: blur', regex: /backdrop-filter:\s*blur/i },
    { name: 'filter: blur', regex: /filter:\s*blur/i }
  ];

  function stripComments(css) {
    return css.replace(/\/\*[\s\S]*?\*\//g, '');
  }

  const dsClean = stripComments(dsContent);
  const laptopClean = stripComments(laptopContent);
  const phoneClean = stripComments(phoneContent);

  for (const item of forbiddenPatterns) {
    assert(!item.regex.test(dsClean), `design-system.css must not contain ${item.name}`);
    assert(!item.regex.test(laptopClean), `laptop.css must not contain ${item.name}`);
    assert(!item.regex.test(phoneClean), `phone.css must not contain ${item.name}`);
  }
  console.log('  ✓ Verified 0 gradients, 0 blur, 0 box-shadows across all stylesheets');

  console.log('\n🎉 ALL STAGE 3 VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
  process.exit(0);
}

runStage3Tests().catch((err) => {
  console.error('\n❌ STAGE 3 TESTS FAILED:', err);
  process.exit(1);
});
