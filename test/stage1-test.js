/**
 * Stage 1 Verification Test
 * Tests:
 * 1. Environment config module loads properly and handles .env
 * 2. API key is never exposed via health check
 * 3. /api/health endpoint behaves correctly
 * 4. Helper OS reporting (win32/darwin/linux) stores OS on session
 */

const assert = require('assert');
const http = require('http');
const config = require('../server/config');
const { app, sessionManager } = require('../server/index');
const { Session } = require('../server/session');

function mockGet(path) {
  return new Promise((resolve) => {
    const req = new http.IncomingMessage();
    req.method = 'GET';
    req.url = path;
    req.headers = { host: 'localhost' };

    const res = new http.ServerResponse(req);
    let output = '';

    res.write = (chunk) => {
      output += chunk;
      return true;
    };
    res.end = (chunk) => {
      if (chunk) output += chunk;
      try {
        resolve({
          statusCode: res.statusCode || 200,
          body: JSON.parse(output),
          rawBody: output
        });
      } catch (err) {
        resolve({
          statusCode: res.statusCode || 200,
          body: null,
          rawBody: output
        });
      }
    };

    app.handle(req, res);
  });
}

async function runStage1Tests() {
  console.log('🧪 Starting Stage 1 Verification Tests...\n');

  // 1. Config module verification
  console.log('[1/4] Verifying config module...');
  assert.strictEqual(typeof config.port, 'number', 'Port should be a number');
  assert.strictEqual(typeof config.host, 'string', 'Host should be a string');
  assert.strictEqual(typeof config.geminiModel, 'string', 'geminiModel should be a string');
  assert.strictEqual(typeof config.isGeminiConfigured, 'boolean', 'isGeminiConfigured should be boolean');
  console.log(`  ✓ Config loaded (Model: ${config.geminiModel}, Gemini configured: ${config.isGeminiConfigured})`);

  // 2. Session OS tracking verification
  console.log('[2/4] Verifying Session OS tracking...');
  const fakeWs = { readyState: 1, send: () => {} };
  const winSession = sessionManager.createSession(fakeWs, 'win32');
  assert.strictEqual(winSession.os, 'win32', 'Session should store win32 OS');

  const macSession = sessionManager.createSession(fakeWs, 'darwin');
  assert.strictEqual(macSession.os, 'darwin', 'Session should store darwin OS');

  const linuxSession = sessionManager.createSession(fakeWs, 'linux');
  assert.strictEqual(linuxSession.os, 'linux', 'Session should store linux OS');
  console.log('  ✓ Session OS tracking works for win32, darwin, and linux');

  // Clean up test sessions
  sessionManager.sessions.delete(winSession.id);
  sessionManager.sessions.delete(macSession.id);
  sessionManager.sessions.delete(linuxSession.id);

  // 3. /api/health endpoint test
  console.log('[3/4] Verifying /api/health endpoint...');
  const healthData = await mockGet('/api/health');

  assert.strictEqual(healthData.statusCode, 200, 'Health endpoint should return 200');
  assert.strictEqual(healthData.body.status, 'ok', 'Status should be ok');
  assert.strictEqual(typeof healthData.body.geminiConfigured, 'boolean', 'geminiConfigured must be boolean');
  assert.strictEqual(typeof healthData.body.model, 'string', 'model must be string');
  assert.strictEqual(healthData.rawBody.includes(config.geminiApiKey), config.geminiApiKey.length === 0, 'Raw response must never contain the API key');
  console.log('  ✓ /api/health returns valid status and NEVER exposes the API key:', healthData.body);

  // 4. Verification with a simulated helper session
  console.log('[4/4] Verifying /api/health reports helper status and OS...');
  const activeHelperWs = { readyState: 1, send: () => {} };
  const activeHelperSession = sessionManager.createSession(activeHelperWs, 'darwin');

  const healthWithHelper = await mockGet('/api/health');

  assert.strictEqual(healthWithHelper.body.helperConnected, true, 'Helper should be reported as connected');
  assert.strictEqual(healthWithHelper.body.helperOs, 'darwin', 'Helper OS should be reported as darwin');
  console.log('  ✓ /api/health correctly reports helper connected status and OS:', healthWithHelper.body);

  // Clean up
  sessionManager.sessions.delete(activeHelperSession.id);
  const { server } = require('../server/index');
  server.close();

  console.log('\n🎉 ALL STAGE 1 VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
  process.exit(0);
}

runStage1Tests().catch((err) => {
  console.error('\n❌ STAGE 1 TESTS FAILED:', err);
  process.exit(1);
});
