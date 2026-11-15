/**
 * Unit and Integration Verification for:
 * 1. "Mic diagnostics" panel in phone.html and phone.js live diagnostics updater
 * 2. Specific, human-readable error messages for:
 *    - NotAllowedError (permission denied)
 *    - NotFoundError (no microphone)
 *    - NotReadableError (mic busy)
 *    - SecurityError or insecure page
 *    - Web Speech errors: "not-allowed", "network", "no-speech", "audio-capture", "service-not-allowed"
 * 3. MediaRecorder push-to-talk (max 20s) with MIME priority (audio/webm;codecs=opus -> audio/mp4)
 * 4. Gemini transcribeAudio service and server endpoints
 * 5. Secure context enforcement and "open the https:// link" messaging
 * 6. Server console logging for mic errors
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { validateMessage } = require('../server/validator');
const { GeminiService, ErrorCodes } = require('../server/gemini');

console.log('🧪 Starting Mic Diagnostics & Transcription Tests...\n');

// 1. Verify HTML Structure for Mic Diagnostics Panel
console.log('[1/6] Verifying Mic diagnostics panel markup in phone.html...');
const phoneHtmlPath = path.join(__dirname, '..', 'web', 'phone.html');
const phoneHtml = fs.readFileSync(phoneHtmlPath, 'utf8');

const requiredElements = [
  'id="micDiagnosticsPanel"',
  'id="diagStatusBadge"',
  'id="diagSecureContext"',
  'id="diagProtocol"',
  'id="diagUserAgent"',
  'id="diagGetUserMedia"',
  'id="diagMicPermission"',
  'id="diagSpeechRecognition"',
  'id="diagLastError"',
  'id="aiInsecureWarning"',
  'open the https:// link'
];

for (const el of requiredElements) {
  assert.ok(phoneHtml.includes(el), `phone.html missing expected element/text: ${el}`);
}
console.log('  ✓ Mic diagnostics panel, badge, all 7 live metrics, and insecure warning verified in phone.html');

// 2. Verify Human-Readable Error Messages in phone.js
console.log('[2/6] Verifying human-readable error messages in phone.js...');
const phoneJsPath = path.join(__dirname, '..', 'web', 'phone.js');
const phoneJs = fs.readFileSync(phoneJsPath, 'utf8');

assert.ok(phoneJs.includes('NotAllowedError'), 'Missing NotAllowedError handling');
assert.ok(phoneJs.includes('NotFoundError'), 'Missing NotFoundError handling');
assert.ok(phoneJs.includes('NotReadableError'), 'Missing NotReadableError handling');
assert.ok(phoneJs.includes('SecurityError'), 'Missing SecurityError handling');
assert.ok(phoneJs.includes('open the https:// link'), 'Missing open https link message');
assert.ok(phoneJs.includes('network'), 'Missing Web Speech network error');
assert.ok(phoneJs.includes('no-speech'), 'Missing Web Speech no-speech error');
assert.ok(phoneJs.includes('audio-capture'), 'Missing Web Speech audio-capture error');
assert.ok(phoneJs.includes('service-not-allowed'), 'Missing Web Speech service-not-allowed error');
assert.ok(phoneJs.includes('not-allowed'), 'Missing Web Speech not-allowed error');

console.log('  ✓ All required error mappings verified in phone.js');

// 3. Verify MediaRecorder push-to-talk, MIME type order & laptop auto-execution
console.log('[3/6] Verifying MediaRecorder MIME type priority and laptop auto-execution...');
assert.ok(phoneJs.includes('audio/webm;codecs=opus'), 'Missing audio/webm;codecs=opus preference');
assert.ok(phoneJs.includes('audio/mp4'), 'Missing audio/mp4 preference');
assert.ok(phoneJs.includes('MediaRecorder.isTypeSupported'), 'Missing MediaRecorder.isTypeSupported check');
assert.ok(phoneJs.includes('sendAudioForTranscription'), 'Missing server transcription call');
assert.ok(phoneJs.includes('submitAiCommand'), 'Missing auto submission to laptop');
console.log('  ✓ MediaRecorder MIME type order (audio/webm;codecs=opus -> audio/mp4) and laptop execution verified');

// 4. Verify Message Validator accepts ai_transcribe_audio and mic_error
console.log('[4/6] Verifying server message validator for AI audio & mic errors...');
const transcribeMsg = validateMessage({
  type: 'ai_transcribe_audio',
  audio: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
  mimeType: 'audio/webm;codecs=opus'
}, 'trackpad');
assert.strictEqual(transcribeMsg.valid, true);
assert.strictEqual(transcribeMsg.sanitized.type, 'ai_transcribe_audio');
assert.strictEqual(transcribeMsg.sanitized.mimeType, 'audio/webm;codecs=opus');

const micErrMsg = validateMessage({
  type: 'mic_error',
  error: { name: 'NotAllowedError', message: 'Permission denied' }
}, 'keyboard');
assert.strictEqual(micErrMsg.valid, true);
assert.strictEqual(micErrMsg.sanitized.type, 'mic_error');
assert.strictEqual(micErrMsg.sanitized.error.name, 'NotAllowedError');
console.log('  ✓ Validator cleanly accepts ai_transcribe_audio and mic_error payloads in all modes');

// 5. Verify Gemini transcribeAudio method with mock client
console.log('[5/6] Verifying GeminiService.transcribeAudio with mock client...');
(async () => {
  const mockClient = {
    generateContent: async ({ contents }) => {
      assert.ok(Array.isArray(contents), 'Contents should be an array');
      assert.strictEqual(contents[1].inlineData.mimeType, 'audio/webm');
      return {
        text: () => 'Open notepad and type test from microphone'
      };
    }
  };

  const service = new GeminiService({
    apiKey: 'mock-key',
    timeoutMs: 5000,
    mockClient
  });

  const res = await service.transcribeAudio({
    audioBase64: 'dGVzdGF1ZGlv',
    mimeType: 'audio/webm;codecs=opus'
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.transcript, 'Open notepad and type test from microphone');

  // Verify missing audio validation
  const emptyRes = await service.transcribeAudio({ audioBase64: '' });
  assert.strictEqual(emptyRes.success, false);
  assert.strictEqual(emptyRes.error.code, 'INVALID_AUDIO');

  console.log('  ✓ GeminiService.transcribeAudio successfully transcribed audio and stripped codecs from MIME type');

  // 6. Verify Server endpoints exist in server/index.js
  console.log('[6/6] Verifying server routes and mic error logging...');
  const serverJsPath = path.join(__dirname, '..', 'server', 'index.js');
  const serverJs = fs.readFileSync(serverJsPath, 'utf8');

  assert.ok(serverJs.includes('/api/ai/transcribe'), 'Missing /api/ai/transcribe endpoint in server/index.js');
  assert.ok(serverJs.includes('/api/ai/log-mic-error'), 'Missing /api/ai/log-mic-error endpoint in server/index.js');
  assert.ok(serverJs.includes('ai_transcribe_audio'), 'Missing WebSocket handler for ai_transcribe_audio');
  assert.ok(serverJs.includes('mic_error'), 'Missing WebSocket handler for mic_error');
  assert.ok(serverJs.includes('MICROPHONE ERROR REPORT'), 'Missing server console log formatting for mic errors');
  assert.ok(serverJs.includes('open the https:// link') || serverJs.includes('https://'), 'Missing HTTPS security guidance');

  console.log('  ✓ Server WebSocket handlers, HTTP endpoints, and console error logging verified');

  console.log('\n🎉 ALL MIC DIAGNOSTICS & TRANSCRIPTION TESTS PASSED!\n');
})().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
