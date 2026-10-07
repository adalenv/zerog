'use strict';

const QUOTA_TEXT_PATTERNS = [
  /RESOURCE_EXHAUSTED/i,
  /429\s+Too\s+Many\s+Requests/i,
  /Rate\s+limit\s+exceeded/i,
  /quota\s+exhausted/i,
  /exhausted\s+daily\s+quota/i,
  /exhausted\s+your\s+quota/i,
  /plan\s+usage\s+limit/i,
  /plan\s+limit\s+reached/i,
  /credit\s+limit\s+reached/i,
  /AI\s+credits\s+are\s+exhausted/i,
  /monthly\s+allowance\s+exceeded/i,
  /Individual\s+quota\s+reached/i,
  /5[- ]hour\s+(?:limit|quota)/i,
  /Five[- ]hour\s+(?:limit|quota)/i,
  /hourly\s+(?:limit|quota)/i,
  /rolling\s+(?:window|limit)/i
];

class QuotaDetector {
  static matchText(text) {
    if (!text || typeof text !== 'string') return false;
    return QUOTA_TEXT_PATTERNS.some(regex => regex.test(text));
  }

  static matchExitCode(code) {
    // agy returns exit code 3 on RESOURCE_EXHAUSTED / quota error
    return code === 3;
  }

  static matchLogLine(line) {
    if (!line || typeof line !== 'string') return false;
    return (
      (line.includes('quota_manager.go') && line.includes('RESOURCE_EXHAUSTED')) ||
      this.matchText(line)
    );
  }

  static isQuotaExhausted({ text = '', exitCode = null } = {}) {
    if (exitCode !== null && this.matchExitCode(exitCode)) return true;
    if (text && this.matchText(text)) return true;
    return false;
  }

  static parseResetMinutes(text) {
    if (!text || typeof text !== 'string') return null;

    // Pattern 1: Google's "Resets in [Xd] [Xh] [Xm] [Xs]"
    const match = text.match(/Resets\s+in\s+(?:(\d+)\s*d\s*)?(?:(\d+)\s*h\s*)?(?:(\d+)\s*m\s*)?(?:(\d+)\s*s)?/i);
    if (match && (match[1] || match[2] || match[3] || match[4])) {
      const days = parseInt(match[1] || 0, 10);
      const hours = parseInt(match[2] || 0, 10);
      const mins = parseInt(match[3] || 0, 10);
      const secs = parseInt(match[4] || 0, 10);
      const totalMinutes = Math.ceil(days * 24 * 60 + hours * 60 + mins + (secs > 0 ? 1 : 0));
      return totalMinutes > 0 ? totalMinutes : null;
    }

    // Pattern 2: "Try again in X hours / X minutes"
    const tryMatch = text.match(/try\s+again\s+in\s+(?:(\d+)\s*hours?)?(?:\s*and\s*)?(?:(\d+)\s*minutes?)?/i);
    if (tryMatch && (tryMatch[1] || tryMatch[2])) {
      const hours = parseInt(tryMatch[1] || 0, 10);
      const mins = parseInt(tryMatch[2] || 0, 10);
      return hours * 60 + mins;
    }

    return null;
  }

  static classifyQuota({ text = '', exitCode = null } = {}) {
    if (!this.isQuotaExhausted({ text, exitCode })) return null;

    const resetMinutes = this.parseResetMinutes(text);

    const buildResult = (type, label, minutes, reason) => ({
      type,
      quotaType: type,
      label,
      minutes,
      cooldownMinutes: minutes,
      reason
    });

    // 1. Explicit 5-hour limit indicator or reset time <= 300 minutes (5 hours)
    const isExplicit5h = /5[- ]hour|five[- ]hour|rolling\s+window|hourly/i.test(text);
    if (isExplicit5h || (resetMinutes !== null && resetMinutes <= 300)) {
      return buildResult('5_hour', '5-Hour Limit', resetMinutes || 300, '5-hour rolling quota limit reached');
    }

    // 2. Weekly limit: "individual quota", "weekly", 7 days, or reset > 24 hours (1440 mins)
    const isExplicitWeekly = /weekly|individual\s+quota|7[- ]day|subscription\s+limits/i.test(text);
    if (isExplicitWeekly || (resetMinutes !== null && resetMinutes > 1440)) {
      return buildResult('weekly', 'Weekly Limit', resetMinutes || (7 * 24 * 60), 'Weekly quota limit reached');
    }

    // 3. Total / Plan limit: monthly allowance, credits exhausted, plan limit reached, billing period
    const isExplicitTotal = /monthly|billing\s+period|credit\s+limit|AI\s+credits|allowance|plan\s+(limit|quota)|plan\s+exhausted/i.test(text);
    if (isExplicitTotal) {
      return buildResult('total', 'Total Plan Limit', resetMinutes || 1440, 'Total plan quota exhausted');
    }

    // Default rate limit fallback: treat as 5-hour rolling limit if <= 300m or no reset given
    if (!resetMinutes || resetMinutes <= 300) {
      return buildResult('5_hour', '5-Hour Limit', resetMinutes || 300, '5-hour rate limit reached');
    }

    return buildResult('weekly', 'Weekly Limit', resetMinutes, 'Quota limit reached');
  }
}

module.exports = QuotaDetector;
