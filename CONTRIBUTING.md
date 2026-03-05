# Contributing

Thanks for your interest in improving the VFA Handshake MVP.

This project values:
- clarity
- minimalism
- security-minded design (even in MVP form)
- readable code and documentation

## Ground rules

- Be respectful and constructive.
- Keep PRs focused: one feature/fix per PR where possible.
- Prefer small, reviewable changes over large rewrites.

## What to work on

Good contribution areas:
- better demo HTML pages (`demo/wallet.html`, `demo/merchant.html`)
- documentation improvements (README/ARCHITECTURE/SECURITY)
- unit tests for token parsing/signing
- adding optional replay protection (feature-flagged)
- adding structured logging (without leaking tokens)
- improving error handling and developer UX

Please avoid:
- adding heavy dependencies unless clearly justified
- production claims (this remains an MVP demo)

## Development setup

### Python server

```bash
python -m venv .venv
source .venv/bin/activate
pip install flask flask-cors
export WALLET_HMAC_SECRET="CHANGE_ME_DEV_SECRET"
python server.py
```

### Static client

```bash
python -m http.server 8000
```

## Code style

### Python
- Prefer explicit, readable code.
- Keep functions small and single-purpose.
- Add docstrings for public functions / endpoints.

### JavaScript
- Prefer JSDoc for public functions.
- Avoid global state unless necessary for the demo.
- Keep UI code simple and understandable.

## Security-sensitive changes

If your change touches:
- token formats
- signature logic
- secret handling
- authentication/authorization
- storage of security-relevant data

…please include:
- rationale (“why”)
- threat model implications
- update `SECURITY.md` if needed

## Submitting a PR

1) Fork the repo and create a branch:
   - `feature/<name>` or `fix/<name>`

2) Make changes with clear commits:
   - Good: `Fix visa verification error handling`
   - Avoid: `updates`

3) Ensure:
- docs are updated
- no secrets are committed
- demo still works end-to-end

4) Open a PR with:
- summary
- screenshots (if UI changes)
- testing notes
- any security considerations

## Reporting security issues

For now (MVP), please do not publish exploit details in public issues.
Instead, open a minimal issue describing the category of the issue and
mark it as security-sensitive, or contact the maintainer privately.
