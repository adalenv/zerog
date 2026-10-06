# frozen_string_literal: true

require "time"
require "json"

module ZeroG
  class Account
    ATTRS = %i[id name email type status exhausted_until priority last_used created_at data].freeze
    attr_accessor(*ATTRS)

    def initialize(attrs = {})
      @id = attrs[:id] || attrs["id"] || generate_id
      @name = attrs[:name] || attrs["name"] || @id
      @email = attrs[:email] || attrs["email"] || ""
      @type = (attrs[:type] || attrs["type"] || "google").to_s # "google" or "gemini-api-key"
      @status = (attrs[:status] || attrs["status"] || "ready").to_s
      @priority = (attrs[:priority] || attrs["priority"] || 10).to_i
      @created_at = parse_time(attrs[:created_at] || attrs["created_at"]) || Time.now.utc
      @last_used = parse_time(attrs[:last_used] || attrs["last_used"])
      @exhausted_until = parse_time(attrs[:exhausted_until] || attrs["exhausted_until"])
      @data = attrs[:data] || attrs["data"] || {}
    end

    def exhausted?
      return false unless @exhausted_until

      if Time.now.utc < @exhausted_until
        true
      else
        @exhausted_until = nil
        @status = "ready" if @status == "exhausted"
        false
      end
    end

    def mark_exhausted(minutes = 60)
      @exhausted_until = Time.now.utc + (minutes * 60)
      @status = "exhausted"
    end

    def reset_cooldown
      @exhausted_until = nil
      @status = "ready"
    end

    def remaining_cooldown_seconds
      return 0 unless @exhausted_until
      rem = @exhausted_until - Time.now.utc
      rem > 0 ? rem.to_i : 0
    end

    def remaining_cooldown_human
      secs = remaining_cooldown_seconds
      return "0s" if secs <= 0

      if secs >= 3600
        hours = secs / 3600
        mins = (secs % 3600) / 60
        "#{hours}h #{mins}m"
      elsif secs >= 60
        mins = secs / 60
        secs_rem = secs % 60
        "#{mins}m #{secs_rem}s"
      else
        "#{secs}s"
      end
    end

    def to_h
      {
        "id" => @id,
        "name" => @name,
        "email" => @email,
        "type" => @type,
        "status" => exhausted? ? "exhausted" : @status,
        "exhausted_until" => @exhausted_until ? @exhausted_until.iso8601 : nil,
        "priority" => @priority,
        "last_used" => @last_used ? @last_used.iso8601 : nil,
        "created_at" => @created_at ? @created_at.iso8601 : nil,
        "data" => @data
      }
    end

    def to_json(*args)
      to_h.to_json(*args)
    end

    def self.from_h(hash)
      new(hash)
    end

    private

    def generate_id
      "acc_#{Time.now.to_i}_#{rand(1000..9999)}"
    end

    def parse_time(val)
      return nil if val.nil? || val.to_s.strip.empty?
      return val if val.is_a?(Time)
      Time.parse(val.to_s).utc rescue nil
    end
  end
end
