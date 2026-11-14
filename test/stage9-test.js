/**
 * Stage 9 Verification Test
 * Verifies Plan Execution, Step-by-Step Helper Protocol,
 * Acknowledgment Handling, Live Progress, Instant Stop, and Failure Abort.
 */

const assert = require('assert');
const { executeStep, launchApp, APP_LAUNCHERS } = require('../helper/executor');
const { PlanRunner } = require('../server/planRunner');

console.log('🧪 Starting Stage 9 Verification Tests...\n');

// 1. Verify Helper App Launch Allowlist & OS Launchers
console.log('[1/5] Verifying Helper APP_LAUNCHERS and launchApp allowlist...');
assert.ok(APP_LAUNCHERS.win32.calculator);
assert.ok(APP_LAUNCHERS.win32.notepad);
assert.ok(APP_LAUNCHERS.win32.chrome);
assert.ok(APP_LAUNCHERS.win32.edge);
assert.ok(APP_LAUNCHERS.win32.explorer);
assert.ok(APP_LAUNCHERS.win32.vscode);

assert.ok(APP_LAUNCHERS.darwin.calculator);
assert.ok(APP_LAUNCHERS.darwin.finder);
assert.ok(APP_LAUNCHERS.linux.calculator);

// Verify rejection of unauthorized applications
assert.throws(() => {
  launchApp('cmd.exe');
}, /is not allowlisted/);

assert.throws(() => {
  launchApp('powershell');
}, /is not allowlisted/);

assert.throws(() => {
  launchApp('malware.exe');
}, /is not allowlisted/);
console.log('  ✓ Helper APP_LAUNCHERS verified; arbitrary shell execution blocked');

// 2. Verify executeStep for wait, open_app, and input tools
console.log('[2/5] Verifying executeStep implementation...');
(async () => {
  // Test wait tool
  const startTime = Date.now();
  const waitRes = await executeStep({ tool: 'wait', args: { durationMs: 60 } });
  const elapsed = Date.now() - startTime;
  assert.strictEqual(waitRes.success, true);
  assert.ok(elapsed >= 45, `Elapsed time should be at least 45ms (was ${elapsed}ms)`);
  console.log('  ✓ executeStep handled wait correctly');

  // 3. Verify PlanRunner sequential step execution with acknowledgments
  console.log('[3/5] Verifying PlanRunner sequential execution and acknowledgments...');
  const testPlan = {
    summary: 'Test Calculator Flow',
    steps: [
      { id: 's1', tool: 'open_app', args: { app: 'calculator' }, description: 'Launch Calculator' },
      { id: 's2', tool: 'wait', args: { durationMs: 100 }, description: 'Wait for window' },
      { id: 's3', tool: 'type_text', args: { text: '42' }, description: 'Type 42' }
    ]
  };

  const progressEvents = [];
  let doneEvent = null;
  const helperDispatches = [];

  const runner = new PlanRunner({
    stepTimeoutMs: 2000,
    onProgress: (prog) => progressEvents.push(prog),
    onDone: (done) => { doneEvent = done; },
    sendToHelper: (msg) => {
      helperDispatches.push(msg);
      // Simulate asynchronous helper acknowledgment
      setTimeout(() => {
        runner.handleStepAck({
          type: 'ai_step_ack',
          stepId: msg.stepId,
          success: true
        });
      }, 20);
    }
  });

  const execResult = await runner.execute(testPlan);
  assert.strictEqual(execResult.success, true);
  assert.strictEqual(execResult.completedSteps, 3);
  assert.strictEqual(progressEvents.length, 3);
  assert.strictEqual(progressEvents[0].currentStep, 1);
  assert.strictEqual(progressEvents[1].currentStep, 2);
  assert.strictEqual(progressEvents[2].currentStep, 3);
  assert.strictEqual(helperDispatches.length, 3);
  assert.strictEqual(helperDispatches[0].stepId, 's1');
  assert.strictEqual(helperDispatches[1].stepId, 's2');
  assert.strictEqual(helperDispatches[2].stepId, 's3');
  assert.ok(doneEvent);
  console.log('  ✓ PlanRunner executed 3 steps sequentially with live progress and helper acknowledgments');

  // 4. Verify Instant Stop Cancellation
  console.log('[4/5] Verifying instant Stop cancellation...');
  let stoppedEvent = null;
  const stopRunner = new PlanRunner({
    stepTimeoutMs: 2000,
    onStopped: (st) => { stoppedEvent = st; },
    sendToHelper: (msg) => {
      // Don't auto-ack, trigger immediate stop instead
      setTimeout(() => {
        stopRunner.stop('Aborted by laptop owner');
      }, 15);
    }
  });

  const stopResult = await stopRunner.execute(testPlan);
  assert.strictEqual(stopResult.success, false);
  assert.ok(stoppedEvent, 'Should have emitted onStopped event');
  assert.ok(stoppedEvent.reason.includes('Aborted by laptop owner'));
  console.log('  ✓ Instant Stop canceled execution and notified listeners');

  // 5. Verify Halting on Step Failure
  console.log('[5/5] Verifying halt on helper step failure...');
  let failureStopped = null;
  const failingDispatches = [];

  const failRunner = new PlanRunner({
    stepTimeoutMs: 2000,
    onStopped: (st) => { failureStopped = st; },
    sendToHelper: (msg) => {
      failingDispatches.push(msg);
      setTimeout(() => {
        if (msg.stepId === 's1') {
          // Fail on step 1
          failRunner.handleStepAck({
            type: 'ai_step_ack',
            stepId: msg.stepId,
            success: false,
            error: 'Window could not be focused'
          });
        }
      }, 15);
    }
  });

  const failResult = await failRunner.execute(testPlan);
  assert.strictEqual(failResult.success, false);
  assert.strictEqual(failingDispatches.length, 1, 'Subsequent steps must not be executed after failure');
  assert.strictEqual(failResult.completedSteps, 0);
  assert.ok(failureStopped.reason.includes('Window could not be focused'));
  console.log('  ✓ Execution halted immediately upon step failure; subsequent steps skipped');

  console.log('\n🎉 ALL STAGE 9 VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
})();
