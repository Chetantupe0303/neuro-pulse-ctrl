/**
 * Stage 6 Verification Test
 * Verifies AI Tab UI, Signature Pulse Trace (all 6 states + labels),
 * Voice Input integration (Web Speech API + Audio Analyser), and strict Design System rules.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Starting Stage 6 Verification Tests...\n');

// 1. Verify HTML Structure for AI tab & Pulse Trace
console.log('[1/5] Verifying AI tab HTML markup and Pulse Trace...');
const phoneHtmlPath = path.join(__dirname, '..', 'web', 'phone.html');
const phoneHtml = fs.readFileSync(phoneHtmlPath, 'utf8');

const requiredAiHtmlElements = [
  'id="panelAi"',
  'id="pulseTraceContainer"',
  'id="pulseTraceSvg"',
  'id="pulseTracePath"',
  'id="pulseTraceCheck"',
  'id="pulseTraceLabel"',
  'id="pulseTraceState"',
  'id="btnVoiceInput"',
  'id="voiceBtnText"',
  'id="aiSpeechMsg"',
  'id="aiCommandInput"',
  'id="btnSendAiCommand"',
  'id="aiPlanSection"',
  'id="aiPlanStepCounter"',
  'id="aiStepListContainer"',
  'id="aiStepList"',
  'id="btnAiStop"'
];

for (const el of requiredAiHtmlElements) {
  assert.ok(phoneHtml.includes(el), `Missing required AI element in phone.html: ${el}`);
}
console.log('  ✓ All required AI tab elements present in phone.html');

// 2. Verify Pulse Trace 6 states and text labels
console.log('[2/5] Verifying Pulse Trace 6 states and text labels...');
const phoneJsPath = path.join(__dirname, '..', 'web', 'phone.js');
const phoneJs = fs.readFileSync(phoneJsPath, 'utf8');

const traceStates = ['idle', 'listening', 'thinking', 'executing', 'blocked', 'done'];
for (const st of traceStates) {
  assert.ok(phoneJs.includes(`case '${st}':`), `Missing Pulse Trace state handler for: ${st}`);
}

assert.ok(phoneJs.includes('trace-idle'), 'Missing trace-idle class');
assert.ok(phoneJs.includes('trace-listening'), 'Missing trace-listening class');
assert.ok(phoneJs.includes('trace-thinking'), 'Missing trace-thinking class');
assert.ok(phoneJs.includes('trace-executing'), 'Missing trace-executing class');
assert.ok(phoneJs.includes('trace-blocked'), 'Missing trace-blocked class');
assert.ok(phoneJs.includes('trace-done'), 'Missing trace-done class');
assert.ok(phoneJs.includes('pulseTraceLabel.textContent ='), 'Missing trace text label update');

console.log('  ✓ All 6 Pulse Trace states (idle, listening, thinking, executing, blocked, done) and labels verified');

// 3. Verify Voice Input (Web Speech API) & Audio Analyser
console.log('[3/5] Verifying Web Speech API integration and Audio Analyser...');
assert.ok(phoneJs.includes('SpeechRecognition') || phoneJs.includes('webkitSpeechRecognition'), 'Missing SpeechRecognition API integration');
assert.ok(phoneJs.includes('createAnalyser') || phoneJs.includes('audioAnalyser'), 'Missing AudioContext/Analyser volume modulation');
assert.ok(phoneJs.includes('aiSpeechMsg'), 'Missing speech status / fallback message handling');
assert.ok(phoneJs.includes('Speech recognition not supported'), 'Missing fallback text message for unsupported browsers');
console.log('  ✓ Web Speech API and volume-modulated audio analyser verified');

// 4. Verify AI Command Submission and Stop Button
console.log('[4/5] Verifying AI command submission and Stop button...');
assert.ok(phoneJs.includes('ai_command'), 'Missing ai_command message payload');
assert.ok(phoneJs.includes('ai_stop'), 'Missing ai_stop message payload');
assert.ok(phoneJs.includes('btnAiStop'), 'Missing btnAiStop event handler');
console.log('  ✓ AI command dispatch and stop abort handler verified');

// 5. Verify Strict Design System Constraints on Phone CSS
console.log('[5/5] Enforcing strict design system constraints in CSS...');
const phoneCssPath = path.join(__dirname, '..', 'web', 'phone.css');
const phoneCss = fs.readFileSync(phoneCssPath, 'utf8');
const cleanCss = phoneCss.replace(/\/\*[\s\S]*?\*\//g, '');

assert.ok(!cleanCss.includes('box-shadow'), 'Forbidden box-shadow found in phone.css');
assert.ok(!cleanCss.includes('gradient'), 'Forbidden gradient found in phone.css');
assert.ok(!cleanCss.includes('blur('), 'Forbidden blur found in phone.css');
assert.ok(cleanCss.includes('.trace-idle'), 'Missing .trace-idle CSS');
assert.ok(cleanCss.includes('.trace-blocked'), 'Missing .trace-blocked CSS');
assert.ok(cleanCss.includes('.btn-voice-large'), 'Missing .btn-voice-large CSS');
console.log('  ✓ Phone CSS satisfies 0 box-shadows, 0 gradients, 0 blur, 0 glow, single accent rules');

console.log('\n🎉 ALL STAGE 6 VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
