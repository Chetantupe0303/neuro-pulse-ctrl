/**
 * Session Summarizer for PulseCtrl AI
 * Synthesizes chronological audit events into a concise, plain-language
 * operational summary with exact counts of safe, confirmed, and blocked actions.
 * Features deterministic local fallback if Gemini is offline or unconfigured.
 */

const defaultGeminiService = require('./gemini');
const auditLogger = require('./auditLog');

const SUMMARIZER_SYSTEM_PROMPT = `You are the operations report generator for PulseCtrl AI.
Your job is to read an audit log of laptop control actions and generate a concise, objective summary.

RULES:
1. Provide a clear, factual description of what actions were taken.
2. State the exact breakdown: Safe actions, Needs approval actions, Blocked actions.
3. If any actions were blocked or denied, mention them and the security reason.
4. Keep the tone calm, precise, professional, and operational (no hype, no emojis).
5. Output valid JSON matching this schema:
{
  "summaryText": "Concise paragraph summarizing session activity",
  "highlights": ["Key bullet 1", "Key bullet 2"]
}
`;

class SessionSummarizer {
  constructor(geminiService = defaultGeminiService) {
    this.gemini = geminiService;
  }

  /**
   * Deterministic local fallback summary
   */
  generateLocalFallback(events, stats) {
    if (events.length === 0) {
      return {
        summaryText: 'No remote control or AI actions were performed during this session.',
        stats,
        highlights: ['Session idle; 0 actions executed.'],
        generatedBy: 'local'
      };
    }

    const highlights = [];
    highlights.push(`Recorded ${stats.total} total events (${stats.safe} safe, ${stats.confirm} required confirmation, ${stats.blocked} blocked).`);

    const toolsUsed = [...new Set(events.filter(e => e.tool && e.tool !== '-').map(e => e.tool))];
    if (toolsUsed.length > 0) {
      highlights.push(`Tools exercised: ${toolsUsed.join(', ')}.`);
    }

    if (stats.blocked > 0) {
      const blockedEvents = events.filter(e => e.risk === 'blocked');
      const reasons = [...new Set(blockedEvents.map(e => e.reason || 'Security policy'))];
      highlights.push(`Safety blocks: ${reasons.join('; ')}.`);
    }

    const summaryText = `During this session, PulseCtrl processed ${stats.total} operation${stats.total === 1 ? '' : 's'}. ` +
      `${stats.safe} ran automatically under safe classification, ${stats.confirm} required owner approval, and ${stats.blocked} were intercepted by safety policies.`;

    return {
      summaryText,
      stats,
      highlights,
      generatedBy: 'local'
    };
  }

  /**
   * Generate session summary via Gemini with local fallback
   * @param {string} sessionId
   * @returns {Promise<Object>}
   */
  async generate(sessionId) {
    const events = auditLogger.getEvents(sessionId);
    const stats = auditLogger.getStats(sessionId);

    if (events.length === 0) {
      return this.generateLocalFallback(events, stats);
    }

    try {
      const logExcerpt = events.map(e => `[${e.timestamp}] Tool: ${e.tool} | Risk: ${e.risk} | Decision: ${e.decision} | ${e.description} ${e.reason ? `(${e.reason})` : ''}`).join('\n');
      const prompt = `Here is the audit log for the current session:\n\n${logExcerpt}\n\nStats:\nTotal: ${stats.total}, Safe: ${stats.safe}, Confirm: ${stats.confirm}, Blocked: ${stats.blocked}\n\nGenerate the operational summary.`;

      const result = await this.gemini.generateJson({
        prompt,
        systemInstruction: SUMMARIZER_SYSTEM_PROMPT,
        sessionId
      });

      if (result.success && result.data && result.data.summaryText) {
        return {
          summaryText: result.data.summaryText,
          stats,
          highlights: Array.isArray(result.data.highlights) ? result.data.highlights : [],
          generatedBy: 'gemini'
        };
      }
    } catch (_) {
      // Fall through to deterministic local fallback
    }

    return this.generateLocalFallback(events, stats);
  }
}

module.exports = new SessionSummarizer();
module.exports.SessionSummarizer = SessionSummarizer;
