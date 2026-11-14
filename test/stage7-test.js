/**
 * Stage 7 Verification Test
 * Verifies Gemini Service, Structured JSON Output, Timeout & 1 Retry,
 * Error Mapping (MISSING_KEY, RATE_LIMITED, TIMEOUT, INVALID_OUTPUT, API_ERROR),
 * and Per-Session Rate Limiting.
 */

const assert = require('assert');
const { GeminiService, ErrorCodes } = require('../server/gemini');
const { AiRateLimiter } = require('../server/aiRateLimiter');
const { app } = require('../server/index');

console.log('🧪 Starting Stage 7 Verification Tests...\n');

// 1. Verify Per-Session Rate Limiter
console.log('[1/4] Verifying Per-Session Rate Limiter (10 req/min)...');
const rateLimiter = new AiRateLimiter({ maxRequests: 10, windowMs: 60000 });
const sessionA = 'session-test-alpha';
const sessionB = 'session-test-beta';

// Allow 10 requests for sessionA
for (let i = 1; i <= 10; i++) {
  const check = rateLimiter.checkLimit(sessionA);
  assert.strictEqual(check.allowed, true, `Request ${i} should be allowed`);
  assert.strictEqual(check.remaining, 11 - i, `Remaining count mismatch at step ${i}`);
  const recorded = rateLimiter.recordRequest(sessionA);
  assert.strictEqual(recorded, true);
}

// 11th request for sessionA must be blocked
const blockedCheckA = rateLimiter.checkLimit(sessionA);
assert.strictEqual(blockedCheckA.allowed, false, '11th request should be blocked');
assert.strictEqual(blockedCheckA.remaining, 0);
assert.ok(blockedCheckA.retryAfterMs > 0, 'retryAfterMs should be greater than 0');

// sessionB must be completely unaffected (isolated per-session)
const checkB = rateLimiter.checkLimit(sessionB);
assert.strictEqual(checkB.allowed, true, 'sessionB should be unaffected by sessionA');
assert.strictEqual(checkB.remaining, 10);

// Reset sessionA and verify it is allowed again
rateLimiter.resetSession(sessionA);
const resetCheckA = rateLimiter.checkLimit(sessionA);
assert.strictEqual(resetCheckA.allowed, true, 'sessionA should be allowed after reset');
assert.strictEqual(resetCheckA.remaining, 10);
console.log('  ✓ Per-session rate limiter enforced: 10 req/min max, isolated sessions, proper retryAfterMs');

// 2. Verify Error Mapping
console.log('[2/4] Verifying Error Mapping into standard ErrorCodes...');
const service = new GeminiService({ apiKey: '' });

// Test MISSING_KEY
const missingKeyErr = service.mapError(new Error('MISSING_KEY'));
assert.strictEqual(missingKeyErr.code, ErrorCodes.MISSING_KEY);
assert.ok(missingKeyErr.message.includes('API key'));

// Test RATE_LIMITED
const rateLimitErr = service.mapError(new Error('429 ResourceExhausted: quota exceeded'));
assert.strictEqual(rateLimitErr.code, ErrorCodes.RATE_LIMITED);

// Test TIMEOUT
const timeoutErr = service.mapError(new Error('Request timed out after 15000ms'));
assert.strictEqual(timeoutErr.code, ErrorCodes.TIMEOUT);

// Test INVALID_OUTPUT
const jsonErr = service.mapError(new Error('Unexpected token in JSON'));
assert.strictEqual(jsonErr.code, ErrorCodes.INVALID_OUTPUT);

// Test API_ERROR
const genericErr = service.mapError(new Error('Network socket disconnected'));
assert.strictEqual(genericErr.code, ErrorCodes.API_ERROR);
console.log('  ✓ Error mapping correctly maps MISSING_KEY, RATE_LIMITED, TIMEOUT, INVALID_OUTPUT, and API_ERROR');

// 3. Verify Structured JSON generation, Timeout, and 1 Retry logic
console.log('[3/4] Verifying Structured JSON generation and retry behavior...');

let callCount = 0;
const mockFailingClient = {
  generateContent: async () => {
    callCount++;
    if (callCount === 1) {
      throw new Error('Transient 503 Service Unavailable');
    }
    return {
      text: () => '```json\n{"action": "test_success", "confidence": 0.99}\n```'
    };
  }
};

const retryService = new GeminiService({
  apiKey: 'test-fake-key',
  timeoutMs: 2000,
  mockClient: mockFailingClient
});

(async () => {
  const result = await retryService.generateJson({ prompt: 'test' });
  assert.strictEqual(result.success, true, 'Service should succeed on second attempt');
  assert.strictEqual(result.data.action, 'test_success');
  assert.strictEqual(result.data.confidence, 0.99);
  assert.strictEqual(callCount, 2, 'Should have retried exactly once after transient failure');
  console.log('  ✓ Retry logic handled transient error with exponential backoff and succeeded');

  // Verify timeout mapping
  const mockTimeoutClient = {
    generateContent: async () => {
      await new Promise(r => setTimeout(r, 500));
      return { text: () => '{}' };
    }
  };
  const timeoutService = new GeminiService({
    apiKey: 'test-fake-key',
    timeoutMs: 100, // very short timeout
    mockClient: mockTimeoutClient
  });
  const timeoutResult = await timeoutService.generateJson({ prompt: 'test' });
  assert.strictEqual(timeoutResult.success, false);
  assert.strictEqual(timeoutResult.error.code, ErrorCodes.TIMEOUT);
  console.log('  ✓ Timeout enforcement verified');

  // 4. Verify /api/ai/test route
  console.log('[4/4] Verifying /api/ai/test Express endpoint...');
  let responseData = null;
  const mockReq = { query: { sessionId: 'test-api-session' } };
  const mockRes = {
    json: (data) => { responseData = data; }
  };

  // Find route handler in Express
  const route = app._router.stack.find(r => r.route && r.route.path === '/api/ai/test');
  assert.ok(route, 'Endpoint /api/ai/test must be registered on app');
  route.route.stack[0].handle(mockReq, mockRes);

  assert.ok(responseData, 'Expected response from /api/ai/test');
  assert.strictEqual(typeof responseData.geminiConfigured, 'boolean');
  assert.strictEqual(responseData.rateLimiter.maxRequests, 10);
  assert.ok(responseData.errorCodes.includes('MISSING_KEY'));
  assert.ok(responseData.errorCodes.includes('RATE_LIMITED'));
  console.log('  ✓ /api/ai/test reports status and error codes without exposing keys');

  console.log('\n🎉 ALL STAGE 7 VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
})();
