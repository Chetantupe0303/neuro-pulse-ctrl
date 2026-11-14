/**
 * Stage 14 Verification Test
 * Verifies Opt-In Screen Vision System:
 * - Strict opt-in requirement (disabled by default; rejected if not enabled)
 * - Gemini multimodal element localization with bounding box
 * - DPI / scaleFactor coordinate mapping to screen pixels
 * - Privacy notice and active visual indicator in laptop UI
 * - macOS Screen Recording documentation
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { ScreenVisionService } = require('../server/vision');
const { captureScreen } = require('../helper/screenCapture');

console.log('🧪 Starting Stage 14 Verification Tests...\n');

// 1. Verify Strict Opt-In Enforcement
console.log('[1/5] Verifying strict opt-in requirement...');
const vision = new ScreenVisionService();
const sessionA = 'sess-vision-test';

// Before opt-in: should be disabled and reject requests
assert.strictEqual(vision.isOptedIn(sessionA), false);
(async () => {
  const rejectedRes = await vision.locateElement({
    imageBase64: 'fake-png-data',
    targetDescription: 'Submit button',
    sessionId: sessionA
  });

  assert.strictEqual(rejectedRes.success, false);
  assert.strictEqual(rejectedRes.error.code, 'VISION_NOT_PERMITTED');
  console.log('  ✓ Requests rejected when screen vision is not opted-in');

  // Opt-in enabled
  vision.setOptIn(sessionA, true);
  assert.strictEqual(vision.isOptedIn(sessionA), true);

  // Opt-in disabled
  vision.setOptIn(sessionA, false);
  assert.strictEqual(vision.isOptedIn(sessionA), false);
  console.log('  ✓ Opt-in state toggles cleanly per session');

  // 2. Verify Coordinate Normalization & Scaling Math
  console.log('[2/5] Verifying bounding box to screen pixel coordinate translation...');
  // Box: ymin=100, xmin=200, ymax=300, xmax=400 (normalized 0-1000)
  // Center is x=300 (30%), y=200 (20%)
  const box = [100, 200, 300, 400];

  // Standard 1080p display (1920x1080, scale 1.0)
  const coords1080p = vision.convertToScreenCoords(box, 1920, 1080, 1.0);
  assert.strictEqual(coords1080p.x, 576); // 1920 * 0.30 = 576
  assert.strictEqual(coords1080p.y, 216); // 1080 * 0.20 = 216

  // Retina / High-DPI display (scale factor 2.0, e.g. 2880x1800 rendered at 1440x900)
  const coordsRetina = vision.convertToScreenCoords(box, 2880, 1800, 2.0);
  assert.strictEqual(coordsRetina.x, 432); // (2880 * 0.30) / 2 = 432
  assert.strictEqual(coordsRetina.y, 180); // (1800 * 0.20) / 2 = 180
  console.log('  ✓ Bounding box center coordinates accurately converted to screen pixels and DPI scaling');

  // 3. Verify Multimodal locateElement Execution
  console.log('[3/5] Verifying locateElement with mock multimodal Gemini...');
  const mockGeminiVision = {
    generateJson: async () => ({
      success: true,
      data: {
        box_2d: [400, 400, 600, 600],
        label: 'Submit Button',
        confidence: 0.98
      }
    })
  };

  const enabledVisionService = new ScreenVisionService(mockGeminiVision);
  enabledVisionService.setOptIn('sess-active', true);

  const locateRes = await enabledVisionService.locateElement({
    imageBase64: 'valid-base64',
    targetDescription: 'Submit Button',
    screenWidth: 1920,
    screenHeight: 1080,
    sessionId: 'sess-active'
  });

  assert.strictEqual(locateRes.success, true);
  assert.strictEqual(locateRes.x, 960); // 50% of 1920
  assert.strictEqual(locateRes.y, 540); // 50% of 1080
  assert.strictEqual(locateRes.label, 'Submit Button');
  console.log('  ✓ Multimodal localization computed correct target center');

  // 4. Verify Helper Screen Capture
  console.log('[4/5] Verifying helper screenCapture module...');
  const capture = await captureScreen();
  assert.ok(capture);
  assert.strictEqual(typeof capture.imageBase64, 'string');
  assert.ok(capture.width > 0);
  assert.ok(capture.height > 0);
  console.log('  ✓ Helper screen capture module functional');

  // 5. Verify UI Elements and macOS Permissions in Documentation
  console.log('[5/5] Verifying laptop UI elements and README permissions...');
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'web', 'index.html'), 'utf8');
  const laptopJs = fs.readFileSync(path.join(__dirname, '..', 'web', 'laptop.js'), 'utf8');
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');

  assert.ok(indexHtml.includes('id="toggleScreenVision"'), 'Missing toggleScreenVision in index.html');
  assert.ok(indexHtml.includes('id="visionStatusIndicator"'), 'Missing visionStatusIndicator in index.html');
  assert.ok(indexHtml.includes('Privacy Notice'), 'Missing Privacy Notice in index.html');

  assert.ok(laptopJs.includes('toggleScreenVision'), 'Missing toggleScreenVision in laptop.js');
  assert.ok(laptopJs.includes('set_screen_vision'), 'Missing set_screen_vision dispatch in laptop.js');

  assert.ok(readme.includes('Screen Recording'), 'Missing Screen Recording documentation in README');
  console.log('  ✓ UI toggle, privacy notice, visual indicator, and macOS documentation verified');

  console.log('\n🎉 ALL STAGE 14 VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
})();
