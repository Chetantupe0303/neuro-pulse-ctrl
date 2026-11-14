/**
 * Rule-Based Blocklist Security Engine for PulseCtrl AI
 * Deterministic safety layer evaluated BEFORE sending prompts to Gemini
 * and BEFORE executing every individual action step.
 */

const BLOCKED_CATEGORIES = {
  TERMINAL_SHELL: 'Terminal / Shell Execution',
  FILE_DELETION: 'File Deletion / System Modification',
  CREDENTIALS: 'Passwords & Sensitive Credentials',
  FINANCIAL: 'Banking & Payment Information',
  INSTALLER: 'Software Installation / Package Management',
  DANGEROUS_HOTKEY: 'Dangerous System Key Combination'
};

// Regex patterns for dangerous inputs and command contents
const COMMAND_PATTERNS = [
  // 1. Shell / Terminal
  {
    regex: /\b(cmd(\.exe)?|powershell|pwsh|bash|zsh|wsl|terminal\.app|conhost|xterm)\b/i,
    category: BLOCKED_CATEGORIES.TERMINAL_SHELL,
    reason: 'Terminal and shell access are strictly prohibited.'
  },
  // 2. File deletion & disk wipe
  {
    regex: /(del\s+\/|rm\s+-rf|rmdir\s+\/|format\s+[a-z]:|shred|empty\s+recycle\s+bin|delete\s+all\s+files|wipe\s+disk)/i,
    category: BLOCKED_CATEGORIES.FILE_DELETION,
    reason: 'Destructive file deletion and disk formatting are strictly blocked.'
  },
  // 3. Passwords & credentials
  {
    regex: /\b(sudo\s+|runas\s+|mimikatz|id_rsa|private\.key|dump\s+passwords?|show\s+passwords?)\b/i,
    category: BLOCKED_CATEGORIES.CREDENTIALS,
    reason: 'Credential access, privilege escalation, and password extraction are blocked.'
  },
  // 4. Banking / payment / crypto private keys
  {
    regex: /\b(credit\s*card\s*number|cvv|cvc|banking\s*pin|wire\s*transfer|crypto\s*wallet\s*seed|seed\s*phrase)\b/i,
    category: BLOCKED_CATEGORIES.FINANCIAL,
    reason: 'Financial credentials, payment cards, and wallet seed phrases are blocked.'
  },
  // 5. Software install / package management
  {
    regex: /\b(msiexec|apt(-get)?\s+install|brew\s+install|choco\s+install|npm\s+(i|install)|pip\s+install|install\s+software)\b/i,
    category: BLOCKED_CATEGORIES.INSTALLER,
    reason: 'Software and package installation are prohibited.'
  }
];

// Dangerous key combos
const DANGEROUS_KEYS = [
  // Win+R (Run dialog)
  {
    check: (step) => {
      if (step.tool !== 'press_key') return false;
      const key = String(step.args.key || '').toLowerCase();
      const mods = (step.args.modifiers || []).map(m => String(m).toLowerCase());
      return (key === 'r' && (mods.includes('win') || mods.includes('meta')));
    },
    category: BLOCKED_CATEGORIES.DANGEROUS_HOTKEY,
    reason: 'Windows Run dialog shortcut (Win+R) is blocked.'
  },
  // Ctrl+Alt+Del
  {
    check: (step) => {
      if (step.tool !== 'press_key') return false;
      const key = String(step.args.key || '').toLowerCase();
      const mods = (step.args.modifiers || []).map(m => String(m).toLowerCase());
      return (
        (key === 'delete' || key === 'del') &&
        (mods.includes('ctrl') || mods.includes('control')) &&
        mods.includes('alt')
      );
    },
    category: BLOCKED_CATEGORIES.DANGEROUS_HOTKEY,
    reason: 'System interrupt shortcut (Ctrl+Alt+Delete) is blocked.'
  }
];

/**
 * Check whether a user voice/text command violates security blocklist
 * @param {string} command
 * @returns {{ blocked: boolean, category?: string, reason?: string }}
 */
function checkCommand(command) {
  if (!command || typeof command !== 'string') {
    return { blocked: false };
  }

  const text = command.trim();

  for (const rule of COMMAND_PATTERNS) {
    if (rule.regex.test(text)) {
      return {
        blocked: true,
        category: rule.category,
        reason: rule.reason
      };
    }
  }

  return { blocked: false };
}

/**
 * Check whether an individual action step violates security blocklist
 * @param {Object} step
 * @returns {{ blocked: boolean, category?: string, reason?: string }}
 */
function checkStep(step) {
  if (!step || typeof step !== 'object') {
    return { blocked: true, category: 'Invalid Step', reason: 'Malformed step object' };
  }

  // 1. Check dangerous hotkeys
  for (const hotkeyRule of DANGEROUS_KEYS) {
    if (hotkeyRule.check(step)) {
      return {
        blocked: true,
        category: hotkeyRule.category,
        reason: hotkeyRule.reason
      };
    }
  }

  // 2. Check typed text contents against command patterns
  if (step.tool === 'type_text' && step.args && step.args.text) {
    const textCheck = checkCommand(step.args.text);
    if (textCheck.blocked) {
      return textCheck;
    }
  }

  // 3. Verify open_app is never a shell
  if (step.tool === 'open_app' && step.args && step.args.app) {
    const app = String(step.args.app).toLowerCase();
    if (['cmd', 'powershell', 'pwsh', 'bash', 'zsh', 'terminal', 'sh'].includes(app)) {
      return {
        blocked: true,
        category: BLOCKED_CATEGORIES.TERMINAL_SHELL,
        reason: `Opening terminal shell "${app}" is blocked.`
      };
    }
  }

  return { blocked: false };
}

module.exports = {
  checkCommand,
  checkStep,
  BLOCKED_CATEGORIES,
  COMMAND_PATTERNS
};
