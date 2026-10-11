# zerog Launch & Distribution Playbook

This kit contains copy-paste campaigns, SEO articles, and community posts designed to drive GitHub stars, npm downloads, and permanent high-authority backlinks for **`@adalenv/zerog`**.

---

## 1. Hacker News — Show HN Launch

> **Best Posting Window**: Tuesday or Wednesday at 7:00 AM – 9:00 AM PT (16:00 – 18:00 CET).  
> **Link**: [news.ycombinator.com/submit](https://news.ycombinator.com/submit)

### Title
```text
Show HN: Zerog – Transparent quota failover for Google Antigravity CLI (agy)
```

### URL
```text
https://github.com/adalenv/zerog
```

### Body (First Comment by Maker)
```markdown
Hey HN!

I’ve been using Google Antigravity (`agy`) extensively for coding workflows. If you use it heavily, you’ve likely experienced the frustration of hitting rate limits (HTTP 429 / `RESOURCE_EXHAUSTED`) right in the middle of a complex refactor or thought cycle.

To fix this, I built **zerog** – a lightweight, transparent quota manager and account rotator for `agy`.

### How it works:
1. You register backup accounts once (`zerog login personal`, `zerog login work`, or Gemini API keys).
2. Run `zerog` as a drop-in replacement for `agy` (all args, flags, and interactive keys pass through directly).
3. The moment `agy` hits quota exhaustion, `zerog` intercepts the exit, swaps the credentials, and resumes execution seamlessly with `--continue` using the next account in the pool.
4. If every account in your pool is fully exhausted, it calculates the earliest cooldown reset timestamp and exits cleanly without burning CPU cycles or entering infinite retry loops.

### Engineering details:
- **Zero External npm Dependencies**: Built entirely with Node.js built-in modules (`child_process`, `fs`, `path`, `os`, `http`, `events`). Instant installs and zero supply-chain risk.
- **Native TTY Stream Fidelity**: Uses direct stream inheritance (`stdio: 'inherit'`) so full-color TUIs, arrow key navigation, and interactive prompts work exactly like native `agy`.
- **Cross-Platform**: Uses OS keychain integration on macOS, Linux Secret Service with fallback, and Windows Credential Manager.

You can try it directly without installing:
```bash
npx @adalenv/zerog
```

Or install globally:
```bash
npm install -g @adalenv/zerog
```

Repository: https://github.com/adalenv/zerog  
npm: https://www.npmjs.com/package/@adalenv/zerog

I'd love feedback on your experience with quota handling and multi-account workflows in AI developer tools!
```

---

## 2. Reddit Community Posts

### A. r/GoogleGeminiAI & r/Bard
- **Title**: *I built an open-source tool that auto-rotates accounts when Google Antigravity (agy) hits quota limits*
- **Post Body**:
```markdown
If you code with the Google Antigravity CLI (`agy`), you probably know the pain of hitting daily rate limits / HTTP 429 errors mid-session.

I got tired of losing session context and having to wait hours or manually swap auth credentials, so I built **zerog** (`@adalenv/zerog`).

**What it does:**
- Maintains a pool of Google accounts or Gemini API keys.
- Transparently proxies commands to `agy` with full terminal fidelity.
- When an account hits quota exhaustion (`RESOURCE_EXHAUSTED`), it immediately swaps credentials and resumes the conversation with `--continue`.
- Has a local web dashboard (`zerog web`) to view pool quotas and cooldown timers.
- Built with 0 external dependencies (pure Node.js).

It's completely free and open source:
- GitHub: https://github.com/adalenv/zerog
- Run directly: `npx @adalenv/zerog`

Hope this helps anyone pushing Antigravity to its limits!
```

---

### B. r/LocalLLaMA & r/ArtificialIntelligence
- **Title**: *Tool: Zero-downtime quota auto-failover for Google Antigravity CLI*
- **Post Body**:
```markdown
For anyone using Google's Antigravity CLI (`agy`) for automated coding and agentic tasks:

One recurring bottleneck is the strict 5-hour / daily quota ceilings on accounts. I built **zerog**, an open-source CLI proxy that solves this:

1. Keeps a local pool of authorized accounts and API keys.
2. Intercepts `RESOURCE_EXHAUSTED` / 429 responses in real time.
3. Automatically triggers `--continue` using the next active account in priority or round-robin order.
4. Prevents infinite looping when all accounts are depleted and provides exact reset countdowns.

Install via npm: `npm install -g @adalenv/zerog`  
Or test on-demand: `npx @adalenv/zerog`  
GitHub repo: https://github.com/adalenv/zerog
```

---

### C. r/node & r/commandline
- **Title**: *Showcase: Building a zero-dependency CLI wrapper with native TTY stream passthrough and failover*
- **Post Body**:
```markdown
I recently released `zerog`, a CLI wrapper for Google Antigravity (`agy`) that handles multi-account rate-limit rotation.

Two architectural choices I prioritized:
1. **Zero External Dependencies**: In an ecosystem with frequent supply chain bloat, `zerog` runs on 100% native Node.js core modules (`node:child_process`, `node:fs`, `node:http`, etc.).
2. **TTY Stream Fidelity**: Rather than buffering stdin/stdout and corrupting curses/TUI escape sequences, it inherits stdio directly (`stdio: 'inherit'`) and watches the CLI event log asynchronously for rate-limit signals, keeping the interactive user experience 100% native.

Code & tests: https://github.com/adalenv/zerog  
npm package: https://www.npmjs.com/package/@adalenv/zerog
```

---

## 3. SEO Article (Publish on Dev.to, Hashnode & Medium)

**Target Google Queries**: `"Antigravity CLI rate limit"`, `"Google agy 429 quota bypass"`, `"How to use multiple accounts with Antigravity"`.

### Markdown Article:

```markdown
# How to Never Run Out of Quota with Google Antigravity CLI (agy)

Google's Antigravity CLI (`agy`) is one of the most powerful developer assistants available today, but heavy users frequently encounter the dreaded error:

```text
Error: RESOURCE_EXHAUSTED (HTTP 429)
Quota limit exceeded for current billing tier.
```

When this happens, your terminal session freezes and you are locked out until the 5-hour or daily quota resets.

In this guide, we'll walk through how to set up **zerog**, an open-source tool that provides transparent, zero-downtime account rotation and quota failover for `agy`.

---

## The Problem with Manual Switching

If you have multiple Google accounts or Gemini API keys, manually switching involves:
1. Losing your active session context and shell history.
2. Manually clearing cache tokens.
3. Re-authenticating via browser.
4. Manually re-prompting `agy` with `--continue`.

**zerog** automates this entire lifecycle transparently.

---

## Getting Started with zerog

`zerog` is an open-source, zero-dependency Node.js CLI that acts as a smart failover layer around `agy`.

### 1. Installation

Install globally via npm:

```bash
npm install -g @adalenv/zerog
```

Or run directly without installing:

```bash
npx @adalenv/zerog
```

### 2. Add Your Accounts

Register your personal and work accounts:

```bash
zerog login personal
zerog login work
```

Or add backup Gemini API keys:

```bash
zerog add-key dev-key AIzaSy...
```

### 3. Run agy Through zerog

Run `zerog` just as you normally run `agy`:

```bash
zerog                          # Interactive mode
zerog -p "refactor database"   # Single prompt
```

All arguments, terminal escape codes, and shortcuts pass through cleanly.

---

## How Transparent Failover Works

When Account A exhausts its token allowance:
1. `zerog` detects the 429 exhaustion code immediately.
2. It sets a cooldown timer on Account A based on Google's reset window.
3. It rotates the active credential to Account B.
4. It re-invokes `agy --continue`, seamlessly continuing your conversation without losing context.

If all accounts in your pool are exhausted, `zerog` displays a countdown timer showing exactly when the earliest account will be restored.

---

## Local Web Dashboard

You can also inspect your account pool, status, and cooldown timers via an integrated web UI:

```bash
zerog web
```

This launches a dashboard at `http://localhost:7890`.

---

## Conclusion

With `zerog`, you no longer have to interrupt your coding flow when you hit rate limits.

- **GitHub Repository**: [github.com/adalenv/zerog](https://github.com/adalenv/zerog)
- **npm Registry**: [npmjs.com/package/@adalenv/zerog](https://www.npmjs.com/package/@adalenv/zerog)
```

---

## 4. Product Hunt Launch Submission

- **Product Name**: `zerog`
- **Tagline**: `Zero-downtime quota manager for Google Antigravity CLI`
- **Short Description**: `Auto-failover account switcher for Google Antigravity (agy). Seamlessly rotates credentials and resumes sessions on HTTP 429 quota exhaustion.`
- **Primary Category**: Developer Tools, Artificial Intelligence, Open Source
- **Website URL**: `https://github.com/adalenv/zerog`

---

## 5. Backlink PRs (Curated GitHub Awesome-Lists)

Submit pull requests to the following repositories to secure high-authority backlinks:

1. **`awesome-developer-tools`**
   - Add under the **CLI Tools** section:
     ```markdown
     - [zerog](https://github.com/adalenv/zerog) - Multi-account quota manager and transparent auto-failover wrapper for Google Antigravity CLI.
     ```

2. **`awesome-nodejs`**
   - Add under the **Command-line utilities** section:
     ```markdown
     - [zerog](https://github.com/adalenv/zerog) - Zero-dependency quota auto-failover and account rotator for Google Antigravity (`agy`).
     ```

3. **`awesome-cli-apps`**
   - Add under **Development**:
     ```markdown
     - [zerog](https://github.com/adalenv/zerog) - Multi-account quota auto-switcher for Antigravity AI CLI with transparent session continuation.
     ```
