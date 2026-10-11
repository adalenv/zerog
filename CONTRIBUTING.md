# Contributing to zerog

Thank you for contributing to **zerog**! We welcome bug reports, feature suggestions, and pull requests.

## Getting Started

1. **Fork and clone** the repository:
   ```bash
   git clone https://github.com/<your-username>/zerog.git
   cd zerog
   ```

2. **Run the test suite**:
   ```bash
   npm test
   ```

3. **Link locally for development**:
   ```bash
   npm link
   ```

## Core Design Principles

- **Zero External npm Dependencies**: `zerog` relies exclusively on Node.js built-in standard modules (`child_process`, `fs`, `path`, `os`, `http`, `events`). Do not add external npm packages.
- **Native TTY Stream Fidelity**: Never alter raw escape sequences or intercept keystrokes in interactive mode. Standard I/O streams are directly inherited (`stdio: 'inherit'`) to preserve full terminal fidelity with `agy`.
- **Cross-Platform Compatibility**: Supports macOS Keychain, Linux Secret Service (`secret-tool`) with local file fallback, and Windows Credential Manager.
- **Security First**: Credentials must never be written in world-readable locations. Account exports must strictly enforce `0600` POSIX file permissions.

## Running Tests

Tests use the native Node.js test runner (`node:test` and `node:assert`):

```bash
npm test
```

To run a specific test:
```bash
node --test --test-name-pattern="QuotaDetector" test/test_zerog.js
```

## Pull Request Process

1. Create a descriptive feature branch:
   ```bash
   git checkout -b feature/my-enhancement
   ```
2. Write clean, readable Node.js code matching existing code style (`'use strict'`, CommonJS modules, 2-space indentation).
3. Add unit test coverage in `test/test_zerog.js` for any new functionality or bug fixes.
4. Verify all tests pass (`npm test`).
5. Commit your changes with clear commit messages.
6. Submit a Pull Request targeting the `main` branch.

## Reporting Issues

If you find a bug or have a suggestion, please open an issue on GitHub:
- Include your OS and Node.js version (`node -v`).
- Include steps to reproduce and relevant terminal output.
- **Never include raw API keys, OAuth tokens, or sensitive account IDs in issues or logs.**

## License

By contributing to `zerog`, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
