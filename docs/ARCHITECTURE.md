# Architecture: VFA Handshake MVP

## Goal

Demonstrate a clean, minimal handshake flow where:
- the **merchant** requests a particular data access “scope”
- the **wallet** prompts the user
- the **server** issues a short-lived **visa token** on user acceptance
- the **merchant** verifies the visa token before proceeding

This MVP focuses on **clarity** and **auditability**.

---

## Entities

### Merchant
- Creates handshake requests (`merchantId`, `scope`, TTL)
- Displays request as QR payload
- Receives the visa token from the wallet
- Verifies visa token via server endpoint

### Wallet
- Scans/pastes merchant request payload
- Shows scope + request expiration to the user
- Accepts/rejects and sends decision to server
- Displays visa token as QR for the merchant

### Server
- Persists handshake requests in SQLite
- Issues signed visa tokens (HMAC-SHA256)
- Stores issued visa tokens in SQLite
- Verifies token integrity + expiration + DB membership

---

## Data model (SQLite)

### `handshake_requests`
- `request_id` (PK)
- `merchant_id`
- `scope_json` (JSON list)
- `nonce`
- `created_ms`
- `exp_ms`
- `status` (`PENDING|ACCEPTED|REJECTED|EXPIRED`)

### `visas`
- `visa_id` (PK)
- `request_id` (FK)
- `merchant_id`
- `scope_hash` (SHA-256 of scope_json)
- `nonce`
- `issued_ms`
- `exp_ms`
- `token` (full token string)

---

## Protocol flow

### 1) Create request (Merchant → Server)

`POST /handshake/request`

Request:
```json
{
  "merchantId": "Merch_001",
  "scope": ["age_over_18", "loyalty_id"],
  "ttlSec": 60
}
```

Response:
- server stores request as `PENDING`
- returns `qrPayload` for merchant to encode into QR

`qrPayload` shape (MVP):
```json
{
  "t": "vfa_hs_req",
  "requestId": "...",
  "merchantId": "...",
  "nonce": "...",
  "expMs": 1234567890,
  "scope": ["..."]
}
```

### 2) Accept/Reject (Wallet → Server)

`POST /handshake/accept`

Request:
```json
{ "requestId": "...", "decision": "ACCEPT" }
```

Behavior:
- if request expired → mark `EXPIRED`
- if rejected → mark `REJECTED`
- if accepted → issue visa token and store it

### 3) Verify visa (Merchant → Server)

`POST /handshake/verify`

Request:
```json
{ "visaToken": "payload_b64.sig_b64" }
```

Checks:
- signature valid?
- not expired?
- token exists in `visas` table?
- merchant consistency (optional check)

Response:
- `{ ok:true, valid:true, payload:{...} }`

---

## Visa token format

Token:
```
base64url(JSON payload) + "." + base64url(HMAC_SHA256(secret, payload_b64))
```

Payload fields (MVP):
- `v` (version)
- `visaId`
- `requestId`
- `merchantId`
- `scopeHash`
- `nonce`
- `iat` (issued time ms)
- `exp` (expiration time ms)

---

## Extension points (next steps)

Common next hardening steps:
- switch HMAC → asymmetric signatures (Ed25519/ECDSA)
- anti-replay store (one-time use / jti / nonce tracking)
- key rotation, multiple active keys, KID header
- device binding / attestation
- rate limiting and abuse protections
- revocation API / admin tooling
