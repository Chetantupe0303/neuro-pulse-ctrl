/**
 * Stage 10 Verification Test
 * Verifies Rule-based Blocklist Safety Layer:
 * - Pre-Gemini command filtering
 * - Pre-step execution validation
 * - Categories: Terminal/Shell, File Deletion, Credentials, Financial/Banking, Installers, Dangerous Hotkeys
 * - Safe inputs pass cleanly
 */

const assert = require('assert');
const { checkCommand, checkStep, BLOCKED_CATEGORIES } = require('../server/blocklist');

console.log('🧪 Starting Stage 10 Verification Tests...\n');

// 1. Verify Safe Commands are NOT blocked
console.log('[1/4] Verifying safe commands pass blocklist...');
const safeCommands = [
  'Open calculator and calculate 42 * 8',
  'Open notepad and write a shopping list',
  'Open Chrome and search for local weather',
  'Open VSCode and show recent files',
  'Type hello world into the active document',
  'Press Enter to submit form'
];

for (const cmd of safeCommands) {
  const check = checkCommand(cmd);
  assert.strictEqual(check.blocked, false, `Safe command was incorrectly blocked: "${cmd}"`);
}
console.log('  ✓ All 6 safe user commands passed blocklist cleanly');

// 2. Verify Dangerous Commands are Blocked
console.log('[2/4] Verifying dangerous commands are blocked with proper categories...');
const dangerousCommands = [
  { cmd: 'Open cmd.exe and format c:', category: BLOCKED_CATEGORIES.TERMINAL_SHELL },
  { cmd: 'Start powershell and list processes', category: BLOCKED_CATEGORIES.TERMINAL_SHELL },
  { cmd: 'Run bash script to wipe disk', category: BLOCKED_CATEGORIES.TERMINAL_SHELL },
  { cmd: 'rm -rf / and delete all files', category: BLOCKED_CATEGORIES.FILE_DELETION },
  { cmd: 'Run sudo mimikatz to dump passwords', category: BLOCKED_CATEGORIES.CREDENTIALS },
  { cmd: 'Type my credit card number and cvv into the site', category: BLOCKED_CATEGORIES.FINANCIAL },
  { cmd: 'Run npm install backdoor-pkg', category: BLOCKED_CATEGORIES.INSTALLER }
];

for (const item of dangerousCommands) {
  const check = checkCommand(item.cmd);
  assert.strictEqual(check.blocked, true, `Dangerous command should have been blocked: "${item.cmd}"`);
  assert.strictEqual(check.category, item.category);
  assert.ok(check.reason && check.reason.length > 5);
}
console.log('  ✓ All 7 dangerous commands successfully intercepted with accurate categories & reasons');

// 3. Verify Dangerous Hotkey Steps are Blocked
console.log('[3/4] Verifying dangerous hotkeys in steps are blocked...');

// Win+R
const winRStep = {
  tool: 'press_key',
  args: { key: 'r', modifiers: ['win'] }
};
const resWinR = checkStep(winRStep);
assert.strictEqual(resWinR.blocked, true);
assert.strictEqual(resWinR.category, BLOCKED_CATEGORIES.DANGEROUS_HOTKEY);

// Ctrl+Alt+Del
const cadStep = {
  tool: 'press_key',
  args: { key: 'delete', modifiers: ['ctrl', 'alt'] }
};
const resCad = checkStep(cadStep);
assert.strictEqual(resCad.blocked, true);
assert.strictEqual(resCad.category, BLOCKED_CATEGORIES.DANGEROUS_HOTKEY);

// Safe shortcut (Ctrl+C)
const safeStep = {
  tool: 'press_key',
  args: { key: 'c', modifiers: ['ctrl'] }
};
const resSafe = checkStep(safeStep);
assert.strictEqual(resSafe.blocked, false);
console.log('  ✓ Dangerous hotkeys (Win+R, Ctrl+Alt+Del) blocked; safe shortcuts permitted');

// 4. Verify Typed Injections and Terminal open_app in Steps
console.log('[4/4] Verifying typed injection and terminal apps in steps are blocked...');

// Dangerous typed text
const typedInjectionStep = {
  tool: 'type_text',
  args: { text: 'format c: /q' }
};
const resInjection = checkStep(typedInjectionStep);
assert.strictEqual(resInjection.blocked, true);
assert.strictEqual(resInjection.category, BLOCKED_CATEGORIES.FILE_DELETION);

// Terminal app
const shellAppStep = {
  tool: 'open_app',
  args: { app: 'powershell' }
};
const resShell = checkStep(shellAppStep);
assert.strictEqual(resShell.blocked, true);
assert.strictEqual(resShell.category, BLOCKED_CATEGORIES.TERMINAL_SHELL);

// Safe app
const safeAppStep = {
  tool: 'open_app',
  args: { app: 'calculator' }
};
const resSafeApp = checkStep(safeAppStep);
assert.strictEqual(resSafeApp.blocked, false);
console.log('  ✓ Typed command injection and shell app steps blocked');

console.log('\n🎉 ALL STAGE 10 VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
