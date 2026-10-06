# frozen_string_literal: true

module ZeroG
  class QuotaDetector
    QUOTA_PATTERNS = [
      /RESOURCE_EXHAUSTED/i,
      /Quota exhausted/i,
      /exhausted daily quota/i,
      /exhausted your quota/i,
      /exceeded your (?:current )?quota/i,
      /quota limit reached/i,
      /rate limit(?:ed)?(?: exceeded)?/i,
      /429 Too Many Requests/i,
      /credits? exhausted/i,
      /ai credits? (?:are )?exhausted/i,
      /plan (?:usage|limit) (?:is )?(?:over|exceeded|reached)/i,
      /monthly (?:credit|quota) limit/i,
      /billing account not active/i,
      /insufficient quota/i
    ].freeze

    LOG_PATTERNS = [
      /quota_manager\.go:.*(?:RESOURCE_EXHAUSTED|Quota exhausted)/i,
      /error getting token source/i,
      /status = ResourceExhausted/i
    ].freeze

    def self.match_text?(text)
      return false if text.nil? || text.to_s.empty?
      clean_text = text.to_s.gsub(/\e\[[0-9;]*[a-zA-Z]/, "")
      QUOTA_PATTERNS.any? { |pat| clean_text =~ pat }
    end

    def self.match_log_line?(line)
      return false if line.nil? || line.to_s.empty?
      LOG_PATTERNS.any? { |pat| line =~ pat } || match_text?(line)
    end

    def self.match_exit_code?(exit_code)
      exit_code.to_i == 3
    end

    def self.quota_exhausted?(text: nil, exit_code: nil)
      match_exit_code?(exit_code) || match_text?(text)
    end
  end
end
