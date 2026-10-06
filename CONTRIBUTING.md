# Contributing to zerog

Thank you for your interest in contributing to **zerog**!

## Getting Started

1. **Fork and clone** the repository:
   ```bash
   git clone https://github.com/<your-username>/zerog.git
   cd zerog
   ```

2. **Verify tests pass**:
   ```bash
   npm test
   ```

3. **Install locally for development**:
   ```bash
   npm link
   # or
   ./install.sh
   ```

## Design Principles

- **Zero External npm Dependencies**: `zerog` runs on standard pure Node.js standard libraries (`child_process`, `fs`, `path`, `os`, `http`, `events`). Do not introduce external dependencies so `npx zerog` remains instant and secure.
- **Native TTY Fidelity**: Do not intercept raw keystrokes or alter escape codes. Interactive mode must directly inherit standard I/O streams (`stdio: 'inherit'`) for full terminal fidelity with `agy`.
- **Cross-Platform**: Support macOS Keychain, Linux Secret Service (`secret-tool`) with fallback, and Windows Credential Manager.
- **Security First**: Never store unencrypted credentials in world-readable files. Account exports must enforce `0600` permissions.

## Running Tests

All unit tests use Node.js built-in test runner (`node:test` and `node:assert`):
```bash
npm test
```

## Pull Request Guidelines

1. Create a feature branch: `git checkout -b feature/my-new-feature`
2. Commit your changes with descriptive commit messages.
3. Add tests in `test/test_zerog.js` for new functionality.
4. Ensure all tests pass.
5. Push to your branch and open a Pull Request.
