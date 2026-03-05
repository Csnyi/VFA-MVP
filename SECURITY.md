# Security notes (VFA Handshake MVP)

This repo is an **MVP demo**. It is designed for clarity, not for production security.

## Threat model (very simplified)

Potential attackers might:
- steal a visa token (screenshot, clipboard, logs)
- replay a token within its validity window
- brute-force endpoints (no rate limits)
- try to forge tokens (should fail if secret is safe)
- attempt MITM if TLS is not used in deployment

## What this MVP does

- **Integrity**: visa tokens are signed (HMAC-SHA256).
- **Short lifetime**: visa tokens are short-lived (default max ~5 minutes).
- **DB membership check**: server verifies that a token exists in DB.

## Known limitations

1) **Shared secret (HMAC)**
- Using HMAC means the signer and verifier share one secret.
- Production should use **asymmetric keys** (Ed25519/ECDSA) to avoid secret-sharing.

2) **No replay protection**
- A valid token can be replayed until it expires.
- Production should add:
  - `jti` (unique token id)
  - one-time-use tracking
  - nonce store per merchant/session
  - binding to a TLS session or device key (advanced)

3) **No device binding**
- Token is not tied to a specific wallet device.
- Production could add:
  - device public key in payload
  - proof-of-possession signatures (DPoP-style)

4) **No rate limiting**
- Production should add:
  - IP rate limiting
  - per-merchant quotas
  - abuse detection

5) **No key rotation**
- Production should support:
  - multiple active keys
  - key IDs (kid)
  - automated rotation

## Operational recommendations (even for demos)

- Never commit real secrets (use environment variables).
- Use TLS when running outside localhost.
- Avoid logging tokens or secrets.
- Keep tokens short-lived.
- Consider segregating demo DB files per environment.

## Safe scope usage

Scope should be treated as “requested permissions”.
In production:
- scope should be validated/normalized
- scope should be auditable and explainable to users
- scope should map to explicit data release rules
