/**
 * Master Verification Test Suite: Stages 1 through 15 End-to-End
 * Executes comprehensive integration checks across all server, helper, web,
 * security, AI planner, guardian, and UI layers of PulseCtrl AI.
 */

const child_process = require('child_process');
const path = require('path');
const assert = require('assert');

console.log('='.repeat(65));
console.log('  ⚡ PULSECTRL AI — MASTER ALL-STAGES VERIFICATION SUITE ⚡');
console.log('='.repeat(65));
console.log('');

const stages = [
  { num: 1, file: 'stage1-test.js', desc: 'Setup, Env, OS Reporting & Health Check' },
  { num: 2, file: 'stage2-test.js', desc: 'Local HTTPS & SAN SSL Certificates' },
  { num: 3, file: 'stage3-test.js', desc: 'Single-Accent Design System & Badges' },
  { num: 4, file: 'stage4-test.js', desc: 'Phone UI Redesign, 4 Tabs & Haptics' },
  { num: 5, file: 'stage5-test.js', desc: 'Laptop Console 3-Column Redesign' },
  { num: 6, file: 'stage6-test.js', desc: 'AI Tab UI, Pulse Trace & Voice Input' },
  { num: 7, file: 'stage7-test.js', desc: 'Gemini Service, Rate Limiting & Error Mapping' },
  { num: 8, file: 'stage8-test.js', desc: 'Voice-to-Action Planner & Strict Plan Validation' },
  { num: 9, file: 'stage9-test.js', desc: 'Plan Execution, Step Acks & Instant Stop' },
  { num: 10, file: 'stage10-test.js', desc: 'Rule-Based Blocklist Security Layer' },
  { num: 11, file: 'stage11-test.js', desc: 'AI Guardian 3-Tier Safety & Fail-Closed Design' },
  { num: 12, file: 'stage12-test.js', desc: 'Owner Confirmation (30s Auto-Deny) & Audit Log' },
  { num: 13, file: 'stage13-test.js', desc: 'Plain-Language Session Summary & Fallbacks' },
  { num: 14, file: 'stage14-test.js', desc: 'Opt-In Screen Vision & DPI Coordinate Mapping' }
];

let totalPassed = 0;
let totalFailed = 0;

for (const stage of stages) {
  process.stdout.write(`Running Stage ${stage.num} (${stage.desc})... `);
  try {
    const testPath = path.join(__dirname, stage.file);
    child_process.execSync(`node "${testPath}"`, {
      stdio: 'pipe',
      timeout: 15000,
      env: process.env
    });
    console.log('✓ PASSED');
    totalPassed++;
  } catch (err) {
    console.log('❌ FAILED');
    console.error(err.stdout ? err.stdout.toString() : err.message);
    totalFailed++;
  }
}

// Stage 15 Specific Verification: Demo Mode & Documentation
process.stdout.write('Running Stage 15 (Polish, Demo Mode Pills & Comprehensive Docs)... ');
try {
  const fs = require('fs');
  const phoneHtml = fs.readFileSync(path.join(__dirname, '..', 'web', 'phone.html'), 'utf8');
  const phoneJs = fs.readFileSync(path.join(__dirname, '..', 'web', 'phone.js'), 'utf8');
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');

  assert.ok(phoneHtml.includes('demo-pill-btn'), 'Missing demo pills in phone.html');
  assert.ok(phoneJs.includes('demo-pill-btn'), 'Missing demo pills click handler in phone.js');
  assert.ok(readme.includes('PulseCtrl AI checks'), 'Missing tagline in README.md');
  assert.ok(readme.includes('Architecture Overview'), 'Missing Architecture Overview in README.md');
  assert.ok(readme.includes('Interactive Demo Script'), 'Missing Interactive Demo Script in README.md');

  console.log('✓ PASSED');
  totalPassed++;
} catch (err) {
  console.log('❌ FAILED: ' + err.message);
  totalFailed++;
}

console.log('');
console.log('='.repeat(65));
console.log(`  SUMMARY: ${totalPassed} passed, ${totalFailed} failed out of ${stages.length + 1} stages.`);
console.log('='.repeat(65));
console.log('');

if (totalFailed > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL 15 STAGES FULLY VERIFIED AND PASSING SUCCESSFULLY!\n');
}
