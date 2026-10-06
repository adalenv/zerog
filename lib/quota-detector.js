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
  /quota_manager\.go/i
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
}

module.exports = QuotaDetector;
