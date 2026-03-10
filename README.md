# VFA Handshake MVP (Wallet ↔ Merchant ↔ Server)

> A minimal reference implementation of the **VFA Handshake protocol concept**.

![License](https://img.shields.io/badge/license-Apache--2.0-blue)

A minimal, end-to-end demo of the **VFA Handshake** concept:

1) **Merchant** creates a handshake request (scope + TTL)  
2) **Wallet** scans the request and the user accepts/rejects  
3) **Server** issues a short-lived signed **visa token** on ACCEPT  
4) **Merchant** verifies the visa token via the server

This repo is intentionally small and easy to understand. It is a **reference MVP**, not production software.

---

## Related repositories

Implementation and demonstration projects:

- **VFA-MVP** – this repository: wallet / merchant reference implementation 
- **VFA-Lab** – architecture, research, and gateway demo → https://github.com/Csnyi/VFA-Lab
- **VFA-cloud-PoC** — cloud operation PoC (deployment scenario) → https://github.com/Csnyi/VFA-cloud-PoC
- **VFA-Spec** - protocol specification → https://github.com/Csnyi/VFA-Spec

---

## Components

- `backend/server.py` — Flask + SQLite backend for:
  - handshake request creation
  - accept/reject decision handling
  - visa token issuing & verification

- `wallet/wallet.js` — demo wallet UI:
  - scans/pastes merchant request QR payload
  - sends ACCEPT/REJECT
  - shows visa token as QR

- `merchant/merchant.js` — demo merchant UI:
  - creates request and shows QR
  - scans/pastes visa token
  - verifies visa token

---

## Requirements

- Python 3.10+ (recommended)
- A modern browser
- A local static file server (e.g. `python3 -m http.server`)
- Python packages listed in `requirements.txt`

---

## Quick start

### 1) Run the server

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# Copy environment template
cp .env.example .env
# Edit the secret
nano .env
python3 backend/server.py
```

Server runs on: `http://localhost:5050`

Health check:

```bash
curl http://localhost:5050/health
```

### 2) Serve the static files (wallet + merchant)

Use any static server. For example:

```bash
python3 -m http.server 8000
```

Open in browser:

```
http://localhost:8000/wallet/wallet.html
http://localhost:8000/merchant/merchant.html
```

---

## Demo flow

1) Open Merchant UI → a request is created automatically (or click “New Request”)  
2) Merchant shows the request QR → Wallet scans or pastes the QR content 
3) Wallet shows scope + expiration → user clicks Accept  
4) Wallet shows visa token QR → Merchant scans or pastes it  
5) Merchant clicks Verify → server validates token and returns payload

---

## Configuration

### Server

Environment variables:

- `WALLET_DB` (default: `backend/wallet.db`)
- `WALLET_HMAC_SECRET` (required)  
  **Never commit real secrets to a public repo.**

### Wallet / Merchant

- `API_BASE` in `wallet.js` and `merchant.js` must point to the server (default `http://localhost:5050`)
- `MERCHANT_ID`, `DEFAULT_SCOPE`, `DEFAULT_TTL_SEC` are in `merchant.js`

---

## MVP limitations (important)

This demo intentionally keeps security simple:

- shared HMAC secret (server-side)
- no anti-replay protection
- no device binding / attestation
- no rate limiting
- no key rotation
- CORS is intentionally open in the demo server to simplify local development.
  Production deployments should restrict allowed origins.

See [SECURITY.md](docs/SECURITY.md "SECURITY.md") for details and recommended production hardening.

---

## License

Apache-2.0 — see `LICENSE`.
