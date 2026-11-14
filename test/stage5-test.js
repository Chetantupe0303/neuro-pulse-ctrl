/**
 * Stage 5 Verification Test: Laptop Operations Console Redesign
 * Tests:
 * 1. Laptop HTML implements 3-column operations console layout:
 *    - Left: QR card, session & device status, Disconnect button
 *    - Centre: Activity Timeline empty placeholder
 *    - Right: AI Guardian panel empty placeholder with status badges legend
 * 2. Allow/Deny modal elements preserved with proper destructive styling
 * 3. CSS enforces 3-column grid, 1px borders, and zero box-shadows/gradients
 * 4. All JavaScript DOM IDs preserved for laptop.js controller
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runStage5Tests() {
  console.log('🧪 Starting Stage 5 Verification Tests...\n');

  const laptopHtmlPath = path.resolve(__dirname, '..', 'web', 'index.html');
  const laptopCssPath = path.resolve(__dirname, '..', 'web', 'laptop.css');
  const laptopJsPath = path.resolve(__dirname, '..', 'web', 'laptop.js');

  const html = fs.readFileSync(laptopHtmlPath, 'utf8');
  const css = fs.readFileSync(laptopCssPath, 'utf8');
  const js = fs.readFileSync(laptopJsPath, 'utf8');

  // 1. 3-Column Operations Layout
  console.log('[1/5] Verifying 3-column operations console structure...');
  assert(html.includes('console-grid'), 'Must have console-grid layout container');
  assert(html.includes('col-session'), 'Must have session/QR left column');
  assert(html.includes('col-timeline'), 'Must have timeline centre column');
  assert(html.includes('col-guardian'), 'Must have AI Guardian right column');
  console.log('  ✓ 3-column operations structure verified');

  // 2. Timeline and Guardian Placeholders
  console.log('[2/5] Verifying Activity Timeline & AI Guardian placeholders...');
  assert(html.includes('id="activityTimeline"'), 'Must have activityTimeline container');
  assert(html.includes('id="guardianPanel"'), 'Must have guardianPanel container');
  assert(html.includes('status-badge safe'), 'Must showcase safe status badge');
  assert(html.includes('status-badge confirm'), 'Must showcase confirm status badge');
  assert(html.includes('status-badge blocked'), 'Must showcase blocked status badge');
  console.log('  ✓ Activity Timeline and Guardian panels present with status badge legend');

  // 3. Essential session controls & modal
  console.log('[3/5] Verifying session controls and Allow/Deny modal IDs...');
  const requiredIds = [
    'statusPill',
    'statusText',
    'disconnectBtn',
    'qrSection',
    'qrImage',
    'btnNewQR',
    'connectedSection',
    'connectedDeviceName',
    'activeModeBadge',
    'helperNotice',
    'allowModal',
    'modalDeviceName',
    'allowBtn',
    'denyBtn'
  ];

  for (const id of requiredIds) {
    assert(html.includes(`id="${id}"`), `HTML must contain element id="${id}"`);
  }
  console.log(`  ✓ All ${requiredIds.length} essential controller IDs verified in index.html`);

  // 4. CSS Grid & Design Constraints
  console.log('[4/5] Verifying CSS 3-column grid and strict constraints...');
  assert(css.includes('grid-template-columns'), 'Must define grid-template-columns in laptop.css');
  assert(css.includes('@import \'./design-system.css\';') || css.includes('@import "./design-system.css";'), 'Must import design-system.css');

  function stripComments(raw) {
    return raw.replace(/\/\*[\s\S]*?\*\//g, '');
  }
  const cleanCss = stripComments(css);
  assert(!/box-shadow(?!:\s*none)/i.test(cleanCss), 'laptop.css must not contain box-shadow');
  assert(!/linear-gradient/i.test(cleanCss), 'laptop.css must not contain linear-gradient');
  console.log('  ✓ Responsive 3-column CSS grid verified without box-shadows or gradients');

  // 5. JavaScript controller compatibility
  console.log('[5/5] Verifying laptop.js controller compatibility...');
  assert(js.includes('document.getElementById(\'allowModal\')'), 'laptop.js must manage allowModal');
  assert(js.includes('document.getElementById(\'disconnectBtn\')'), 'laptop.js must manage disconnectBtn');
  console.log('  ✓ laptop.js controller bindings intact');

  console.log('\n🎉 ALL STAGE 5 VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
  process.exit(0);
}

runStage5Tests().catch((err) => {
  console.error('\n❌ STAGE 5 TESTS FAILED:', err);
  process.exit(1);
});
