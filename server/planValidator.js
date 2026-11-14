/**
 * Strict Plan Validator for PulseCtrl AI
 * Enforces allowed tools, allowlisted apps, argument sanitization,
 * maximum 15 steps limit, and object immutability (deep freeze).
 */

const ALLOWED_TOOLS = new Set([
  'move_mouse',
  'click',
  'type_text',
  'press_key',
  'open_app',
  'wait'
]);

const ALLOWED_APPS = new Set([
  'chrome',
  'edge',
  'notepad',
  'calculator',
  'explorer',
  'finder',
  'vscode'
]);

const VALID_MODIFIERS = new Set([
  'ctrl',
  'control',
  'alt',
  'shift',
  'meta',
  'cmd',
  'command',
  'win'
]);

const VALID_BUTTONS = new Set(['left', 'right', 'middle']);

/**
 * Deep freeze an object so its properties and steps cannot be mutated
 */
function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    deepFreeze(obj[key]);
  }
  return obj;
}

/**
 * Validate and sanitize an AI-generated action plan
 * @param {Object} rawPlan
 * @returns {{ valid: boolean, plan?: Object, error?: string }}
 */
function validatePlan(rawPlan) {
  if (!rawPlan || typeof rawPlan !== 'object') {
    return { valid: false, error: 'Plan must be a non-null object.' };
  }

  const steps = rawPlan.steps;
  if (!Array.isArray(steps)) {
    return { valid: false, error: 'Plan must contain a "steps" array.' };
  }

  if (steps.length > 15) {
    return { valid: false, error: `Plan exceeds maximum limit of 15 steps (received ${steps.length}).` };
  }

  const validatedSteps = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step || typeof step !== 'object') {
      return { valid: false, error: `Step ${i + 1} is not a valid object.` };
    }

    const tool = String(step.tool || '').toLowerCase().trim();
    if (!ALLOWED_TOOLS.has(tool)) {
      return { valid: false, error: `Step ${i + 1} uses forbidden or unknown tool: "${tool}".` };
    }

    const args = step.args || {};
    const validatedStep = {
      id: step.id || `step-${i + 1}`,
      tool,
      args: {},
      description: String(step.description || '').trim() || `${tool}`
    };

    switch (tool) {
      case 'open_app': {
        const app = String(args.app || '').toLowerCase().trim();
        if (!ALLOWED_APPS.has(app)) {
          return {
            valid: false,
            error: `Step ${i + 1} requests unauthorized app "${app}". Allowed apps: ${Array.from(ALLOWED_APPS).join(', ')}`
          };
        }
        validatedStep.args.app = app;
        if (!step.description) validatedStep.description = `Open ${app}`;
        break;
      }

      case 'wait': {
        const duration = Number(args.durationMs);
        if (isNaN(duration) || duration < 50 || duration > 10000) {
          return {
            valid: false,
            error: `Step ${i + 1} wait duration (${args.durationMs}ms) must be an integer between 50ms and 10000ms.`
          };
        }
        validatedStep.args.durationMs = Math.round(duration);
        if (!step.description) validatedStep.description = `Wait ${validatedStep.args.durationMs}ms`;
        break;
      }

      case 'type_text': {
        if (typeof args.text !== 'string') {
          return { valid: false, error: `Step ${i + 1} type_text requires string argument "text".` };
        }
        if (args.text.length > 1000) {
          return { valid: false, error: `Step ${i + 1} type_text exceeds 1000 characters limit.` };
        }
        validatedStep.args.text = args.text;
        if (!step.description) validatedStep.description = `Type: "${args.text.slice(0, 30)}${args.text.length > 30 ? '...' : ''}"`;
        break;
      }

      case 'press_key': {
        const key = String(args.key || '').trim();
        if (!key) {
          return { valid: false, error: `Step ${i + 1} press_key requires non-empty "key".` };
        }
        validatedStep.args.key = key;

        if (args.modifiers) {
          if (!Array.isArray(args.modifiers)) {
            return { valid: false, error: `Step ${i + 1} press_key modifiers must be an array.` };
          }
          const validMods = [];
          for (const mod of args.modifiers) {
            const m = String(mod).toLowerCase().trim();
            if (VALID_MODIFIERS.has(m)) {
              validMods.push(m);
            }
          }
          validatedStep.args.modifiers = validMods;
        } else {
          validatedStep.args.modifiers = [];
        }
        if (!step.description) {
          const modStr = validatedStep.args.modifiers.length > 0 ? `${validatedStep.args.modifiers.join('+')}+` : '';
          validatedStep.description = `Press ${modStr}${key}`;
        }
        break;
      }

      case 'click': {
        const button = String(args.button || 'left').toLowerCase().trim();
        if (!VALID_BUTTONS.has(button)) {
          return { valid: false, error: `Step ${i + 1} click button must be left, right, or middle.` };
        }
        validatedStep.args.button = button;
        validatedStep.args.double = Boolean(args.double);
        if (!step.description) validatedStep.description = `${validatedStep.args.double ? 'Double ' : ''}Click ${button}`;
        break;
      }

      case 'move_mouse': {
        const x = Number(args.x);
        const y = Number(args.y);
        if (isNaN(x) || isNaN(y)) {
          return { valid: false, error: `Step ${i + 1} move_mouse requires numeric x and y coordinates.` };
        }
        validatedStep.args.x = Math.round(x);
        validatedStep.args.y = Math.round(y);
        if (!step.description) validatedStep.description = `Move mouse to (${validatedStep.args.x}, ${validatedStep.args.y})`;
        break;
      }
    }

    validatedSteps.push(validatedStep);
  }

  const cleanPlan = {
    summary: String(rawPlan.summary || '').trim() || 'Executed actions',
    steps: validatedSteps,
    reason: rawPlan.reason ? String(rawPlan.reason).trim() : null
  };

  // Deep freeze to prevent any step modification before or during execution
  deepFreeze(cleanPlan);

  return {
    valid: true,
    plan: cleanPlan
  };
}

module.exports = {
  validatePlan,
  deepFreeze,
  ALLOWED_TOOLS,
  ALLOWED_APPS
};
