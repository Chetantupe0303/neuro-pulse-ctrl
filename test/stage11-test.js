/**
 * Stage 11 Verification Test
 * Verifies AI Guardian Safety Engine:
 * - 3-tier classification: safe, confirm, blocked
 * - Strict "Fail Closed" design (offline/error -> confirm at minimum)
 * - Hard blocklist precedence over AI ratings
 * - Safety flags (hasBlocked, hasConfirm)
 */

const assert = require('assert');
const { AiGuardian, GUARDIAN_SYSTEM_PROMPT } = require('../server/guardian');

console.log('🧪 Starting Stage 11 Verification Tests...\n');

// 1. Verify Guardian System Prompt & Schema
console.log('[1/4] Verifying Guardian System Prompt definitions...');
assert.ok(GUARDIAN_SYSTEM_PROMPT.includes('"safe"'));
assert.ok(GUARDIAN_SYSTEM_PROMPT.includes('"confirm"'));
assert.ok(GUARDIAN_SYSTEM_PROMPT.includes('"blocked"'));
assert.ok(GUARDIAN_SYSTEM_PROMPT.includes('ratings'));
console.log('  ✓ Guardian system prompt correctly defines safe, confirm, and blocked tiers');

// 2. Verify AI Inspection with Ratings
console.log('[2/4] Verifying AI Guardian inspection and rating assignment...');
const mockGeminiSuccess = {
  generateJson: async () => ({
    success: true,
    data: {
      ratings: [
        { stepId: 's1', risk: 'safe', reason: 'Opening calculator is safe' },
        { stepId: 's2', risk: 'safe', reason: 'Routine window wait' },
        { stepId: 's3', risk: 'confirm', reason: 'Sending enter could trigger form submit' }
      ]
    }
  })
};

const guardian = new AiGuardian(mockGeminiSuccess);
const testPlan = {
  summary: 'Calculate math',
  steps: [
    { id: 's1', tool: 'open_app', args: { app: 'calculator' }, description: 'Open Calc' },
    { id: 's2', tool: 'wait', args: { durationMs: 2000 }, description: 'Wait' },
    { id: 's3', tool: 'press_key', args: { key: 'enter' }, description: 'Press Enter' }
  ]
};

(async () => {
  const result = await guardian.inspectPlan(testPlan);
  assert.strictEqual(result.hasBlocked, false);
  assert.strictEqual(result.hasConfirm, true);
  assert.strictEqual(result.plan.steps[0].risk, 'safe');
  assert.strictEqual(result.plan.steps[1].risk, 'safe');
  assert.strictEqual(result.plan.steps[2].risk, 'confirm');
  console.log('  ✓ AI ratings mapped accurately to plan steps');

  // 3. Verify Fail-Closed Behavior (Offline / Error -> confirm)
  console.log('[3/4] Verifying Fail-Closed guarantee when Gemini fails...');
  const mockGeminiError = {
    generateJson: async () => ({
      success: false,
      error: { code: 'API_ERROR', message: 'Gemini service unreachable' }
    })
  };

  const offlineGuardian = new AiGuardian(mockGeminiError);
  const offlineResult = await offlineGuardian.inspectPlan(testPlan);
  assert.strictEqual(offlineResult.hasConfirm, true, 'Fail-closed must set hasConfirm to true');
  for (const step of offlineResult.plan.steps) {
    assert.strictEqual(step.risk, 'confirm', `Step ${step.id} did not fail closed to confirm`);
    assert.ok(step.guardianReason.includes('fail-closed') || step.guardianReason.includes('offline'));
  }
  console.log('  ✓ Fail-closed enforced: all steps conservatively marked as "confirm" when offline');

  // 4. Verify Hard Blocklist Precedence over AI ratings
  console.log('[4/4] Verifying Hard Blocklist overrides rogue AI safe ratings...');
  const mockRogueGemini = {
    generateJson: async () => ({
      success: true,
      data: {
        ratings: [
          // Rogue AI incorrectly claims Win+R is safe
          { stepId: 'bad-1', risk: 'safe', reason: 'Rogue rating claims this is fine' }
        ]
      }
    })
  };

  const rogueGuardian = new AiGuardian(mockRogueGemini);
  const dangerousPlan = {
    summary: 'Rogue test',
    steps: [
      { id: 'bad-1', tool: 'press_key', args: { key: 'r', modifiers: ['win'] }, description: 'Press Win+R' }
    ]
  };

  const rogueResult = await rogueGuardian.inspectPlan(dangerousPlan);
  assert.strictEqual(rogueResult.hasBlocked, true);
  assert.strictEqual(rogueResult.plan.steps[0].risk, 'blocked', 'Hard blocklist must override AI to blocked');
  console.log('  ✓ Hard blocklist safety rules took precedence over AI ratings');

  console.log('\n🎉 ALL STAGE 11 VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
})();
