/**
 * Stage 13 Verification Test
 * Verifies Plain-Language Session Summary Engine:
 * - Summarization via Gemini with structured breakdown
 * - Accurate stats aggregation (total, safe, confirm, blocked)
 * - Deterministic local fallback if Gemini is offline
 * - UI elements (Summarize button, summary modal, breakdown counters)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { SessionSummarizer } = require('../server/summarizer');
const auditLogger = require('../server/auditLog');

console.log('🧪 Starting Stage 13 Verification Tests...\n');

// 1. Verify Local Fallback on Empty or Offline Session
console.log('[1/4] Verifying SessionSummarizer on empty session...');
const summarizer = new SessionSummarizer();
const emptySessionId = 'sess-empty-test';

(async () => {
  const emptySummary = await summarizer.generate(emptySessionId);
  assert.strictEqual(emptySummary.generatedBy, 'local');
  assert.strictEqual(emptySummary.stats.total, 0);
  assert.ok(emptySummary.summaryText.includes('No remote control or AI actions'));
  console.log('  ✓ Empty session returned clean, factual local summary');

  // 2. Verify Local Fallback with populated audit trail
  console.log('[2/4] Verifying deterministic local fallback with populated trail...');
  const fallbackSessionId = 'sess-fallback-populated';
  auditLogger.log(fallbackSessionId, { tool: 'open_app', description: 'Launch Calculator', risk: 'safe' });
  auditLogger.log(fallbackSessionId, { tool: 'type_text', description: 'Enter numbers', risk: 'safe' });
  auditLogger.log(fallbackSessionId, { tool: 'press_key', description: 'Submit transaction', risk: 'confirm' });
  auditLogger.log(fallbackSessionId, { tool: 'open_app', description: 'Launch cmd', risk: 'blocked', reason: 'Shell forbidden' });

  // Use offline Gemini service to test fallback
  const offlineGemini = {
    generateJson: async () => ({ success: false, error: { message: 'offline' } })
  };
  const fallbackSummarizer = new SessionSummarizer(offlineGemini);
  const fallbackRes = await fallbackSummarizer.generate(fallbackSessionId);

  assert.strictEqual(fallbackRes.generatedBy, 'local');
  assert.strictEqual(fallbackRes.stats.total, 4);
  assert.strictEqual(fallbackRes.stats.safe, 2);
  assert.strictEqual(fallbackRes.stats.confirm, 1);
  assert.strictEqual(fallbackRes.stats.blocked, 1);
  assert.ok(fallbackRes.summaryText.includes('4 operations'));
  assert.ok(fallbackRes.summaryText.includes('2 ran automatically'));
  assert.ok(fallbackRes.highlights.length >= 2);
  console.log('  ✓ Deterministic local fallback produced accurate operations breakdown');

  // 3. Verify Gemini-Powered Summary Generation
  console.log('[3/4] Verifying Gemini structured summary generation...');
  const mockGeminiSummarizer = {
    generateJson: async () => ({
      success: true,
      data: {
        summaryText: 'During this session, the user opened Calculator and computed 42 * 8. A terminal launch attempt was intercepted by the AI Guardian.',
        highlights: [
          'Successfully executed calculator commands',
          'Blocked unauthorized terminal access'
        ]
      }
    })
  };

  const aiSummarizer = new SessionSummarizer(mockGeminiSummarizer);
  const aiRes = await aiSummarizer.generate(fallbackSessionId);

  assert.strictEqual(aiRes.generatedBy, 'gemini');
  assert.strictEqual(aiRes.stats.total, 4);
  assert.ok(aiRes.summaryText.includes('Calculator'));
  assert.strictEqual(aiRes.highlights.length, 2);
  console.log('  ✓ Gemini generated operational summary with highlights');

  // 4. Verify UI Elements in index.html and laptop.js
  console.log('[4/4] Verifying index.html and laptop.js UI bindings...');
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'web', 'index.html'), 'utf8');
  const laptopJs = fs.readFileSync(path.join(__dirname, '..', 'web', 'laptop.js'), 'utf8');

  assert.ok(indexHtml.includes('id="btnSummarize"'), 'Missing btnSummarize in index.html');
  assert.ok(indexHtml.includes('id="summaryModal"'), 'Missing summaryModal in index.html');
  assert.ok(indexHtml.includes('id="summaryCountSafe"'), 'Missing summaryCountSafe in index.html');
  assert.ok(indexHtml.includes('id="summaryCountConfirm"'), 'Missing summaryCountConfirm in index.html');
  assert.ok(indexHtml.includes('id="summaryCountBlocked"'), 'Missing summaryCountBlocked in index.html');

  assert.ok(laptopJs.includes('displaySessionSummary'), 'Missing displaySessionSummary in laptop.js');
  assert.ok(laptopJs.includes('request_session_summary'), 'Missing request_session_summary in laptop.js');
  console.log('  ✓ Summarize button, modal, counters, and event handlers verified');

  console.log('\n🎉 ALL STAGE 13 VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
})();
