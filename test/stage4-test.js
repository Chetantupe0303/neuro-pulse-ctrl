/**
 * Stage 4 Verification Test: Phone UI Redesign & Haptics
 * Tests:
 * 1. Phone HTML contains bottom tab bar with 4 tabs (trackpad, keyboard, both, ai)
 * 2. 4 mode panels present (panelTrackpad, panelKeyboard, panelBoth, panelAi)
 * 3. Dedicated keyboard and both mode typing elements present
 * 4. CSS enforces large touch targets (min 48px) and short transitions (<200ms)
 * 5. JavaScript implements haptics via navigator.vibrate
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runStage4Tests() {
  console.log('🧪 Starting Stage 4 Verification Tests...\n');

  const phoneHtmlPath = path.resolve(__dirname, '..', 'web', 'phone.html');
  const phoneCssPath = path.resolve(__dirname, '..', 'web', 'phone.css');
  const phoneJsPath = path.resolve(__dirname, '..', 'web', 'phone.js');

  const html = fs.readFileSync(phoneHtmlPath, 'utf8');
  const css = fs.readFileSync(phoneCssPath, 'utf8');
  const js = fs.readFileSync(phoneJsPath, 'utf8');

  // 1. Bottom Tab Bar with 4 tabs
  console.log('[1/5] Verifying 4-tab bottom navigation...');
  assert(html.includes('class="bottom-tab-bar"'), 'Must have bottom-tab-bar container');
  assert(html.includes('data-tab="trackpad"'), 'Must have trackpad tab');
  assert(html.includes('data-tab="keyboard"'), 'Must have keyboard tab');
  assert(html.includes('data-tab="both"'), 'Must have both tab');
  assert(html.includes('data-tab="ai"'), 'Must have AI placeholder tab');
  console.log('  ✓ Bottom tab bar contains Trackpad, Keyboard, Both, and AI tabs');

  // 2. All 4 panels present in DOM
  console.log('[2/5] Verifying 4 view panels in HTML...');
  assert(html.includes('id="panelTrackpad"'), 'panelTrackpad must exist');
  assert(html.includes('id="panelKeyboard"'), 'panelKeyboard must exist');
  assert(html.includes('id="panelBoth"'), 'panelBoth must exist');
  assert(html.includes('id="panelAi"'), 'panelAi must exist');
  console.log('  ✓ All 4 panels present (#panelTrackpad, #panelKeyboard, #panelBoth, #panelAi)');

  // 3. Dedicated Keyboard input and keys
  console.log('[3/5] Verifying Dedicated Keyboard controls...');
  assert(html.includes('id="keyboardTextInput"'), 'Must have keyboardTextInput');
  assert(html.includes('id="btnKeyboardSend"'), 'Must have btnKeyboardSend');
  assert(html.includes('id="btnKeyboardBackspace"'), 'Must have btnKeyboardBackspace');
  assert(html.includes('data-shortcut="copy"'), 'Must have copy shortcut');
  console.log('  ✓ Dedicated Keyboard panel inputs and shortcuts verified');

  // 4. Touch target sizes and transitions in CSS
  console.log('[4/5] Verifying CSS touch targets (min 48px) and short transitions (<200ms)...');
  assert(css.includes('.bottom-tab-item'), 'Must style .bottom-tab-item');
  assert(css.includes('min-height: 52px') || css.includes('min-height: 48px'), 'Bottom tabs must meet min 48px touch targets');
  assert(css.includes('150ms'), 'Transitions must be short (<200ms)');
  console.log('  ✓ Touch targets meet 48px+ and transitions are under 200ms (150ms ease)');

  // 5. Haptic feedback engine in phone.js
  console.log('[5/5] Verifying haptic feedback implementation...');
  assert(js.includes('navigator.vibrate'), 'Must implement haptics with navigator.vibrate');
  assert(js.includes('triggerHaptic'), 'triggerHaptic helper function must exist');
  assert(js.includes('keyboardTextInput'), 'phone.js must bind dedicated keyboard');
  assert(js.includes('bottomTabItems'), 'phone.js must bind bottom tab bar items');
  console.log('  ✓ Haptic engine and tab event listeners verified');

  console.log('\n🎉 ALL STAGE 4 VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
  process.exit(0);
}

runStage4Tests().catch((err) => {
  console.error('\n❌ STAGE 4 TESTS FAILED:', err);
  process.exit(1);
});
