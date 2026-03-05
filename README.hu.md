# VFA-MVP
**Virtual Flow Agreement – Minimum Viable Prototype**

Ez a repo egy kísérleti **Identity Wallet / Virtual Bodyguard** koncepció működő prototípusa.
Cél: egy **QR-alapú kézfogás (handshake)** bemutatása, ahol a *Wallet* jóváhagyása után egy rövid élettartamú, **szerver által HMAC-aláírt “visa token”** jön létre, amit a *Merchant* ellenőriztet.

> MVP: HMAC = “biztonság jelzése”. Élesben javasolt aszimmetrikus (pl. ECDSA) modell.

---

## Fő flow (Handshake)

**1) Merchant → Request (QR)**
- Merchant meghívja: `POST /handshake/request`
- Visszakap egy `qrPayload` JSON-t → ezt QR-ként mutatja a walletnek

**2) Wallet → Accept / Reject**
- Wallet beolvassa a `qrPayload`-ot, megmutatja a kért scope-ot
- Wallet meghívja: `POST /handshake/accept` (`ACCEPT` vagy `REJECT`)
- ACCEPT esetén visszakapja a **`visaToken`**-t → ezt QR-ként mutatja a merchantnak

**3) Merchant → Verify**
- Merchant beolvassa a `visaToken`-t
- Merchant meghívja: `POST /handshake/verify`
- Szerver ellenőrzi: HMAC aláírás + TTL + DB-nyilvántartás

---

## Endpointok

### `POST /handshake/request`
Bemenet:
```json
{ "merchantId": "lidl_001", "scope": ["age_over_18","loyalty_id"], "ttlSec": 60 }
```

Kimenet (részlet):
```json
{ "ok": true, "qrPayload": { "t":"vfa_hs_req", "requestId":"...", "merchantId":"...", "expMs": 123, "scope":[...] } }
```

### `POST /handshake/accept`
Bemenet:
```json
{ "requestId": "...", "decision": "ACCEPT" }
```

Kimenet (ACCEPT):
```json
{ "ok": true, "visaToken": "payload_b64.sig_b64", "expMs": 123 }
```

### `POST /handshake/verify`
Bemenet:
```json
{ "visaToken": "..." }
```

Kimenet:
```json
{ "ok": true, "valid": true, "payload": { "merchantId":"...", "scopeHash":"...", "exp": 123, ... } }
```

---

## Frontend

- `merchant.html` + `js/merchant.js`:
  - új handshake request QR generálás
  - visa token ellenőrzés (verify)
- `wallet.html` + `js/wallet.js`:
  - merchant request QR (payload) beolvasás (MVP-ben paste)
  - ACCEPT/REJECT
  - visa token QR megjelenítés

---

## Backend (Flask + SQLite)

### Futtatás
```bash
cd wallet_mvp_backend
python3 -m venv .venv
source .venv/bin/activate
pip install flask flask-cors
python server.py
```

Alapértelmezett: `http://localhost:5000`

### Adatbázis
A `wallet.db` automatikusan létrejön. Táblák:
- `handshake_requests`
- `visas`

---

## Legacy (opcionális)
A repóban megmaradhat a korábbi `/token`, `/revoke`, `/check` demo (közös titkos HMAC-sig a kliens oldalon),
de a **handshake flow** célja pont az, hogy a titok **ne** kerüljön a wallet kliensbe.
