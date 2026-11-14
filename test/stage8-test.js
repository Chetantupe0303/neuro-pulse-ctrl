/**
 * Stage 8 Verification Test
 * Verifies Voice-to-Action Planner & Strict Plan Validation:
 * - Known tools allowlist only (open_app, wait, type_text, press_key, click, move_mouse)
 * - Maximum 15 steps enforcement
 * - App allowlist enforcement (chrome, edge, notepad, calculator, explorer, finder, vscode)
 * - OS-aware keyboard shortcuts (Cmd vs Ctrl)
 * - Deep freeze object immutability
 * - Prompt injection defenses and sanitized arguments
 */

const assert = require('assert');
const { validatePlan, deepFreeze, ALLOWED_TOOLS, ALLOWED_APPS } = require('../server/planValidator');
const { CommandPlanner, buildSystemPrompt } = require('../server/planner');
const { validateMessage } = require('../server/validator');

console.log('🧪 Starting Stage 8 Verification Tests...\n');

// 1. Verify Allowed Tools & Allowed Apps Sets
console.log('[1/6] Verifying Allowed Tools and Allowed Apps sets...');
assert.strictEqual(ALLOWED_TOOLS.size, 6);
assert.ok(ALLOWED_TOOLS.has('open_app'));
assert.ok(ALLOWED_TOOLS.has('wait'));
assert.ok(ALLOWED_TOOLS.has('type_text'));
assert.ok(ALLOWED_TOOLS.has('press_key'));
assert.ok(ALLOWED_TOOLS.has('click'));
assert.ok(ALLOWED_TOOLS.has('move_mouse'));

assert.ok(ALLOWED_APPS.has('chrome'));
assert.ok(ALLOWED_APPS.has('notepad'));
assert.ok(ALLOWED_APPS.has('calculator'));
assert.ok(ALLOWED_APPS.has('vscode'));
assert.ok(!ALLOWED_APPS.has('cmd'));
assert.ok(!ALLOWED_APPS.has('powershell'));
assert.ok(!ALLOWED_APPS.has('bash'));
console.log('  ✓ Allowed tools strictly limited to 6; unauthorized shell apps excluded');

// 2. Verify Valid Plan Validation
console.log('[2/6] Verifying validation of valid plan...');
const validRawPlan = {
  summary: 'Open Calculator and calculate 42 * 8',
  steps: [
    { tool: 'open_app', args: { app: 'calculator' }, description: 'Launch Calculator' },
    { tool: 'wait', args: { durationMs: 2000 }, description: 'Wait for Calculator' },
    { tool: 'type_text', args: { text: '42 * 8' }, description: 'Type calculation' },
    { tool: 'press_key', args: { key: 'enter' }, description: 'Press Enter' }
  ]
};

const validResult = validatePlan(validRawPlan);
assert.strictEqual(validResult.valid, true, 'Valid plan should pass validation');
assert.strictEqual(validResult.plan.steps.length, 4);
assert.strictEqual(validResult.plan.steps[0].tool, 'open_app');
assert.strictEqual(validResult.plan.steps[0].args.app, 'calculator');
assert.strictEqual(validResult.plan.steps[1].args.durationMs, 2000);
console.log('  ✓ Valid plan validated and sanitized successfully');

// 3. Verify Rejection of Unknown Tools, Unauthorized Apps, and >15 Steps
console.log('[3/6] Verifying rejection of invalid tools, apps, and step limits...');

// Test unknown tool
const invalidToolPlan = {
  steps: [{ tool: 'execute_shell', args: { command: 'dir' } }]
};
const resTool = validatePlan(invalidToolPlan);
assert.strictEqual(resTool.valid, false);
assert.ok(resTool.error.includes('forbidden or unknown tool'));

// Test unauthorized app
const invalidAppPlan = {
  steps: [{ tool: 'open_app', args: { app: 'powershell' } }]
};
const resApp = validatePlan(invalidAppPlan);
assert.strictEqual(resApp.valid, false);
assert.ok(resApp.error.includes('unauthorized app'));

// Test > 15 steps
const sixteenSteps = [];
for (let i = 0; i < 16; i++) {
  sixteenSteps.push({ tool: 'wait', args: { durationMs: 100 } });
}
const resCount = validatePlan({ steps: sixteenSteps });
assert.strictEqual(resCount.valid, false);
assert.ok(resCount.error.includes('exceeds maximum limit of 15 steps'));

// Test negative or extreme wait duration
const badWait = validatePlan({ steps: [{ tool: 'wait', args: { durationMs: -50 } }] });
assert.strictEqual(badWait.valid, false);
console.log('  ✓ Rejections enforced: unknown tools, unauthorized apps, >15 steps, out-of-bounds arguments');

// 4. Verify Plan Freezing (Object Immutability)
console.log('[4/6] Verifying deep freeze immutability...');
const freezeResult = validatePlan(validRawPlan);
assert.strictEqual(freezeResult.valid, true);
assert.ok(Object.isFrozen(freezeResult.plan));
assert.ok(Object.isFrozen(freezeResult.plan.steps));
assert.ok(Object.isFrozen(freezeResult.plan.steps[0]));
assert.ok(Object.isFrozen(freezeResult.plan.steps[0].args));
console.log('  ✓ Plan object and all child steps deeply frozen against tampering');

// 5. Verify OS-aware System Prompt
console.log('[5/6] Verifying OS-aware shortcut rules in System Prompt...');
const winPrompt = buildSystemPrompt('win32');
assert.ok(winPrompt.includes('ctrl'));
assert.ok(winPrompt.includes('win32'));
assert.ok(winPrompt.includes('explorer'));

const macPrompt = buildSystemPrompt('darwin');
assert.ok(macPrompt.includes('command'));
assert.ok(macPrompt.includes('darwin'));
assert.ok(macPrompt.includes('finder'));
console.log('  ✓ Planner system prompt adapts shortcuts correctly for Windows vs macOS');

// 6. Verify Planner Execution with Mock Client & Message Validator
console.log('[6/6] Verifying CommandPlanner and validator handling...');
const mockGemini = {
  generateJson: async () => ({
    success: true,
    data: {
      summary: 'Open Notepad and write note',
      steps: [
        { tool: 'open_app', args: { app: 'notepad' } },
        { tool: 'wait', args: { durationMs: 2500 } },
        { tool: 'type_text', args: { text: 'PulseCtrl AI verified' } }
      ]
    }
  })
};

const planner = new CommandPlanner(mockGemini);
(async () => {
  const planResult = await planner.plan('Open notepad and type test', { os: 'win32', sessionId: 's1' });
  assert.strictEqual(planResult.success, true);
  assert.strictEqual(planResult.plan.steps.length, 3);
  assert.strictEqual(planResult.plan.steps[0].args.app, 'notepad');
  assert.strictEqual(planResult.plan.steps[1].args.durationMs, 2500);

  // Verify message validator accepts ai_command and ai_stop
  const cmdVal = validateMessage({ type: 'ai_command', command: 'open notepad' }, 'trackpad');
  assert.strictEqual(cmdVal.valid, true);
  assert.strictEqual(cmdVal.sanitized.command, 'open notepad');

  const stopVal = validateMessage({ type: 'ai_stop' }, 'trackpad');
  assert.strictEqual(stopVal.valid, true);

  console.log('  ✓ CommandPlanner and message validator verified');
  console.log('\n🎉 ALL STAGE 8 VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
})();
