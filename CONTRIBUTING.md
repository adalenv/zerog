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
   ruby -Ilib test/test_zerog.rb
   ```

3. **Install locally for development**:
   ```bash
   ./install.sh
   ```

## Design Principles

- **Zero External Dependencies**: `zerog` runs on standard pure Ruby standard library (JSON, Open3, WEBrick, Minitest). Do not introduce heavy external gems.
- **Native TTY Fidelity**: Do not intercept raw keystrokes or alter escape codes. Interactive mode must directly inherit standard I/O streams for full terminal fidelity with `agy`.
- **Cross-Platform**: Support macOS Keychain, Linux Secret Service (`secret-tool`) with fallback, and Windows Credential Manager.
- **Security First**: Never store unencrypted credentials in world-readable files. Account exports must enforce `0600` permissions.

## Running Tests

All unit tests use Ruby's built-in `Minitest`:
```bash
ruby -Ilib test/test_zerog.rb
```

## Pull Request Guidelines

1. Create a feature branch: `git checkout -b feature/my-new-feature`
2. Commit your changes with descriptive commit messages.
3. Add tests in `test/test_zerog.rb` for new functionality.
4. Ensure all tests pass.
5. Push to your branch and open a Pull Request.
