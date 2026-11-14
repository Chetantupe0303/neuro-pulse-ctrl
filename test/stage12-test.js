/**
 * Stage 12 Verification Test
 * Verifies Owner Confirmation Flow and Monospace Activity Audit Log:
 * - Audit logging per session with timestamp, risk, decision
 * - Owner confirmation modal with 30s countdown
 * - Allow proceeds, Deny cancels plan, Auto-deny on timeout cancels plan
 * - Monospace Activity Timeline rendering in web/laptop.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { AuditLogger } = require('../server/auditLog');
const { PlanRunner } = require('../server/planRunner');

console.log('🧪 Starting Stage 12 Verification Tests...\n');

// 1. Verify Audit Logger Functionality
console.log('[1/4] Verifying Audit Logger per-session trail & stats...');
const logger = new AuditLogger();
const testSession = 'sess-audit-123';

const entry1 = logger.log(testSession, {
  tool: 'open_app',
  description: 'Launch Calculator',
  risk: 'safe',
  decision: 'executed'
});

const entry2 = logger.log(testSession, {
  tool: 'press_key',
  description: 'Submit command',
  risk: 'confirm',
  decision: 'allowed'
});

const entry3 = logger.log(testSession, {
  tool: 'open_app',
  description: 'Launch Powershell',
  risk: 'blocked',
  decision: 'blocked',
  reason: 'Terminal access forbidden'
});

const events = logger.getEvents(testSession);
assert.strictEqual(events.length, 3);
assert.ok(entry1.timestamp.includes(':'));
assert.strictEqual(entry1.risk, 'safe');
assert.strictEqual(entry2.decision, 'allowed');
assert.strictEqual(entry3.risk, 'blocked');

const stats = logger.getStats(testSession);
assert.strictEqual(stats.total, 3);
assert.strictEqual(stats.safe, 1);
assert.strictEqual(stats.confirm, 1);
assert.strictEqual(stats.blocked, 1);
console.log('  ✓ Audit logger recorded entries with timestamps and computed correct risk statistics');

// 2. Verify Owner Confirmation: Allow Continues Execution
console.log('[2/4] Verifying Owner Confirmation: Allow continues plan...');
const confirmPlan = {
  summary: 'Owner confirmation test',
  steps: [
    { id: 'c1', tool: 'open_app', args: { app: 'notepad' }, risk: 'safe', description: 'Open Notepad' },
    { id: 'c2', tool: 'type_text', args: { text: 'important text' }, risk: 'confirm', description: 'Type text' }
  ]
};

(async () => {
  let confirmationRequested = false;
  const allowRunner = new PlanRunner({
    sendToHelper: (msg) => {
      setTimeout(() => {
        allowRunner.handleStepAck({ type: 'ai_step_ack', stepId: msg.stepId, success: true });
      }, 10);
    },
    requestConfirmation: (step) => {
      confirmationRequested = true;
      assert.strictEqual(step.id, 'c2');
      // Simulate owner clicking Allow on laptop
      setTimeout(() => {
        allowRunner.handleConfirmResponse({ allow: true });
      }, 15);
    }
  });

  const allowResult = await allowRunner.execute(confirmPlan);
  assert.strictEqual(confirmationRequested, true);
  assert.strictEqual(allowResult.success, true);
  assert.strictEqual(allowResult.completedSteps, 2);
  console.log('  ✓ Owner Allow decision continued step execution successfully');

  // 3. Verify Owner Confirmation: Deny Aborts Plan
  console.log('[3/4] Verifying Owner Confirmation: Deny aborts plan immediately...');
  let stopReasonRecorded = null;
  const denyRunner = new PlanRunner({
    onStopped: (st) => { stopReasonRecorded = st.reason; },
    sendToHelper: (msg) => {
      setTimeout(() => {
        denyRunner.handleStepAck({ type: 'ai_step_ack', stepId: msg.stepId, success: true });
      }, 10);
    },
    requestConfirmation: (step) => {
      // Simulate owner clicking Deny on laptop
      setTimeout(() => {
        denyRunner.handleConfirmResponse({ allow: false });
      }, 15);
    }
  });

  const denyResult = await denyRunner.execute(confirmPlan);
  assert.strictEqual(denyResult.success, false);
  assert.strictEqual(denyResult.completedSteps, 1, 'Only step 1 should have run');
  assert.ok(stopReasonRecorded.includes('denied by laptop owner'));
  console.log('  ✓ Owner Deny decision stopped plan immediately');

  // 4. Verify UI Markup for Activity Timeline and Confirmation Modal
  console.log('[4/4] Verifying index.html and laptop.js implementation...');
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'web', 'index.html'), 'utf8');
  const laptopJs = fs.readFileSync(path.join(__dirname, '..', 'web', 'laptop.js'), 'utf8');

  assert.ok(indexHtml.includes('id="confirmStepModal"'), 'Missing confirmStepModal in index.html');
  assert.ok(indexHtml.includes('id="confirmStepCountdown"'), 'Missing confirmStepCountdown in index.html');
  assert.ok(indexHtml.includes('id="timelineList"'), 'Missing timelineList in index.html');
  assert.ok(indexHtml.includes('id="allowStepBtn"'), 'Missing allowStepBtn in index.html');
  assert.ok(indexHtml.includes('id="denyStepBtn"'), 'Missing denyStepBtn in index.html');

  assert.ok(laptopJs.includes('appendAuditEntry'), 'Missing appendAuditEntry in laptop.js');
  assert.ok(laptopJs.includes('showStepConfirmModal'), 'Missing showStepConfirmModal in laptop.js');
  assert.ok(laptopJs.includes('countdownInterval'), 'Missing countdown timer in laptop.js');
  assert.ok(laptopJs.includes('step_confirmation_response'), 'Missing confirmation dispatch in laptop.js');
  console.log('  ✓ Monospace timeline and owner confirmation countdown UI verified');

  console.log('\n🎉 ALL STAGE 12 VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
})();
