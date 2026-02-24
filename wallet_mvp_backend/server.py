from __future__ import annotations

import os
import hmac
import hashlib
import base64
import sqlite3
import json
import secrets
from datetime import datetime, timezone
from flask import Flask, request, jsonify
from flask_cors import CORS

DB_PATH = os.environ.get("WALLET_DB", "wallet.db")
# FONTOS: MVP-hez jó, de ne commitold publikus repóba.
HMAC_SECRET = os.environ.get("WALLET_HMAC_SECRET", "CHANGE_ME_DEV_SECRET").encode("utf-8")

app = Flask(__name__)
CORS(app)

def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)

def init_db() -> None:
    with db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tokens (
                token_id TEXT PRIMARY KEY,
                created_ms INTEGER NOT NULL,
                exp_ms INTEGER NOT NULL,
                revoked INTEGER NOT NULL DEFAULT 0,
                revoked_ms INTEGER
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS handshake_requests (
                request_id TEXT PRIMARY KEY,
                merchant_id TEXT NOT NULL,
                scope_json TEXT NOT NULL,
                nonce TEXT NOT NULL,
                created_ms INTEGER NOT NULL,
                exp_ms INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'PENDING' -- PENDING|ACCEPTED|REJECTED|EXPIRED
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS visas (
                visa_id TEXT PRIMARY KEY,
                request_id TEXT NOT NULL,
                merchant_id TEXT NOT NULL,
                scope_hash TEXT NOT NULL,
                nonce TEXT NOT NULL,
                issued_ms INTEGER NOT NULL,
                exp_ms INTEGER NOT NULL,
                token TEXT NOT NULL,
                FOREIGN KEY(request_id) REFERENCES handshake_requests(request_id)
            );
        """)

        conn.execute("CREATE INDEX IF NOT EXISTS idx_handshake_exp ON handshake_requests(exp_ms);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_visas_token ON visas(token);")

        conn.commit()

def b64urlKeepsafe(b: bytes) -> str:
    # base64url, '=' padding nélkül
    return base64.urlsafe_b64encode(b).decode("ascii").rstrip("=")

def b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)

def sign_message(token_id: str, iat: int, exp: int) -> str:
    msg = f"{token_id}.{iat}.{exp}".encode("utf-8")
    mac = hmac.new(HMAC_SECRET, msg, hashlib.sha256).digest()
    return b64urlKeepsafe(mac)
 
def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def hmac_sig(payload_b64: str) -> str:
    mac = hmac.new(HMAC_SECRET, payload_b64.encode("utf-8"), hashlib.sha256).digest()
    return b64urlKeepsafe(mac)

def make_visa_token(payload: dict) -> str:
    # Stabil sorosítás: ugyanaz -> ugyanaz a signature
    payload_b = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    payload_b64 = b64urlKeepsafe(payload_b)
    sig_b64 = hmac_sig(payload_b64)
    return f"{payload_b64}.{sig_b64}"

def parse_and_verify_visa_token(token: str) -> dict:
    try:
        payload_b64, sig_b64 = token.split(".", 1)
    except ValueError:
        raise ValueError("bad_token_format")
    expected = hmac_sig(payload_b64)
    if not hmac.compare_digest(expected, sig_b64):
        raise ValueError("bad_signature")
    payload = json.loads(b64url_decode(payload_b64).decode("utf-8"))
    return payload

def is_expired(exp_ms: int) -> bool:
    return now_ms() > exp_ms

@app.get("/health")
def health():
    return jsonify(ok=True, now=datetime.now(timezone.utc).isoformat())

@app.post("/token")
def register_token():
    data = request.get_json(force=True, silent=True) or {}
    token_id = str(data.get("tokenId") or "").strip()
    created_ms = data.get("createdMs")
    exp_ms = data.get("expMs")

    if not token_id:
        return jsonify(ok=False, error="tokenId required"), 400
    if not isinstance(created_ms, int) or not isinstance(exp_ms, int):
        return jsonify(ok=False, error="createdMs and expMs must be int (ms)"), 400
    if exp_ms <= created_ms:
        return jsonify(ok=False, error="expMs must be > createdMs"), 400

    with db() as conn:
        conn.execute("""
            INSERT INTO tokens(token_id, created_ms, exp_ms, revoked, revoked_ms)
            VALUES (?, ?, ?, 0, NULL)
            ON CONFLICT(token_id) DO UPDATE SET
                created_ms=excluded.created_ms,
                exp_ms=excluded.exp_ms
        """, (token_id, created_ms, exp_ms))
        conn.commit()

    return jsonify(ok=True, tokenId=token_id)

@app.post("/revoke")
def revoke():
    data = request.get_json(force=True, silent=True) or {}
    token_id = str(data.get("tokenId") or "").strip()

    if not token_id:
        return jsonify(ok=False, error="tokenId required"), 400

    revoked_ms = now_ms()

    with db() as conn:
        row = conn.execute("SELECT token_id FROM tokens WHERE token_id=?", (token_id,)).fetchone()
        if row is None:
            return jsonify(ok=False, error="token not found", tokenId=token_id), 404

        conn.execute("""
            UPDATE tokens
            SET revoked=1, revoked_ms=?
            WHERE token_id=?
        """, (revoked_ms, token_id))
        conn.commit()

    return jsonify(ok=True, tokenId=token_id, revoked=True, revokedMs=revoked_ms)

@app.post("/check")
def check():
    """
    Merchant POST-ol: { tokenId, iat, exp, sig }
    Szerver:
      1) ellenőrzi az aláírást (HMAC)
      2) ellenőrzi a TTL-t (exp)
      3) megnézi DB-ben: ismert-e és nincs-e revoked
    """
    data = request.get_json(force=True, silent=True) or {}
    token_id = str(data.get("tokenId") or "").strip()
    iat = data.get("iat")
    exp = data.get("exp")
    sig = str(data.get("sig") or "").strip()

    if not token_id or not isinstance(iat, int) or not isinstance(exp, int) or not sig:
        return jsonify(ok=False, error="tokenId, iat, exp, sig required"), 400

    expected = sign_message(token_id, iat, exp)
    sig_ok = hmac.compare_digest(expected, sig)

    expired = is_expired(exp)

    with db() as conn:
        row = conn.execute("""
            SELECT token_id, created_ms, exp_ms, revoked, revoked_ms
            FROM tokens
            WHERE token_id=?
        """, (token_id,)).fetchone()

    found = row is not None
    revoked = bool(row["revoked"]) if found else False
    server_exp = row["exp_ms"] if found else None

    # Érvényesség: aláírás ok, nem járt le, ismert token, nincs visszavonva,
    # és (extra védelem) a QR exp egyezzen a szerverben tárolt exp-pel.
    exp_match = (found and server_exp == exp)

    valid = bool(sig_ok and (not expired) and found and (not revoked) and exp_match)

    return jsonify(
        ok=True,
        valid=valid,
        found=found,
        sigOk=sig_ok,
        expired=expired,
        expMatch=exp_match,
        tokenId=token_id,
        iat=iat,
        exp=exp,
        reminder="MVP: HMAC közös titok; élesben aszimmetrikus kulcs javasolt.",
        revoked=revoked,
        revokedMs=(row["revoked_ms"] if found else None),
    )

# -----------------------------
# Handshake (MVP) endpoints
# -----------------------------

@app.post("/handshake/request")
def handshake_request():
    """
    Merchant indítja:
      POST { merchantId, scope: [..], ttlSec? }
    Szerver létrehozza a requestet és visszaad egy QR-ba tehető payloadot.
    """
    data = request.get_json(force=True, silent=True) or {}
    merchant_id = str(data.get("merchantId") or "").strip()
    scope = data.get("scope") or []
    ttl_sec = int(data.get("ttlSec") or 60)

    if not merchant_id:
        return jsonify(ok=False, error="merchantId required"), 400
    if not isinstance(scope, list) or not all(isinstance(x, str) and x.strip() for x in scope):
        return jsonify(ok=False, error="scope must be list[str]"), 400
    if ttl_sec < 10 or ttl_sec > 600:
        return jsonify(ok=False, error="ttlSec must be between 10 and 600"), 400

    t0 = now_ms()
    exp_ms = t0 + ttl_sec * 1000
    request_id = secrets.token_urlsafe(16)
    nonce = secrets.token_urlsafe(16)
    scope_json = json.dumps(scope, separators=(",", ":"), ensure_ascii=False)

    with db() as conn:
        conn.execute(
            """INSERT INTO handshake_requests
               (request_id, merchant_id, scope_json, nonce, created_ms, exp_ms, status)
               VALUES (?, ?, ?, ?, ?, ?, 'PENDING')""",
            (request_id, merchant_id, scope_json, nonce, t0, exp_ms)
        )
        conn.commit()

    qr_payload = {
        "t": "vfa_hs_req",
        "requestId": request_id,
        "merchantId": merchant_id,
        "nonce": nonce,
        "expMs": exp_ms,
        "scope": scope,  # MVP: belefér; később lehet csak hash
    }
    return jsonify(ok=True, requestId=request_id, expMs=exp_ms, qrPayload=qr_payload)


@app.post("/handshake/accept")
def handshake_accept():
    """
    Wallet jóváhagy:
      POST { requestId, decision: "ACCEPT"|"REJECT" }
    ACCEPT esetén létrejön a visa token (szerver által HMAC-elve).
    """
    data = request.get_json(force=True, silent=True) or {}
    request_id = str(data.get("requestId") or "").strip()
    decision = str(data.get("decision") or "ACCEPT").upper()

    if not request_id:
        return jsonify(ok=False, error="requestId required"), 400
    if decision not in ("ACCEPT", "REJECT"):
        return jsonify(ok=False, error="decision must be ACCEPT or REJECT"), 400

    t = now_ms()
    with db() as conn:
        row = conn.execute(
            "SELECT * FROM handshake_requests WHERE request_id=?",
            (request_id,)
        ).fetchone()

        if row is None:
            return jsonify(ok=False, error="request not found"), 404

        if row["exp_ms"] <= t:
            conn.execute(
                "UPDATE handshake_requests SET status='EXPIRED' WHERE request_id=?",
                (request_id,)
            )
            conn.commit()
            return jsonify(ok=False, error="request expired"), 400

        if row["status"] != "PENDING":
            return jsonify(ok=False, error="request not pending", status=row["status"]), 400

        if decision == "REJECT":
            conn.execute(
                "UPDATE handshake_requests SET status='REJECTED' WHERE request_id=?",
                (request_id,)
            )
            conn.commit()
            return jsonify(ok=True, status="REJECTED", requestId=request_id)

        # ACCEPT:
        scope_json = row["scope_json"]
        scope_hash = sha256_hex(scope_json.encode("utf-8"))
        visa_id = secrets.token_urlsafe(16)

        # Visa TTL: MVP-ben rövid (pl. 5 perc). Igazodjon a requesthez is.
        visa_exp_ms = min(int(row["exp_ms"]), t + 5 * 60 * 1000)

        payload = {
            "v": 1,
            "visaId": visa_id,
            "requestId": request_id,
            "merchantId": row["merchant_id"],
            "scopeHash": scope_hash,
            "nonce": row["nonce"],
            "iat": t,
            "exp": visa_exp_ms,
        }
        token = make_visa_token(payload)

        conn.execute(
            "UPDATE handshake_requests SET status='ACCEPTED' WHERE request_id=?",
            (request_id,)
        )
        conn.execute(
            """INSERT INTO visas
               (visa_id, request_id, merchant_id, scope_hash, nonce, issued_ms, exp_ms, token)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (visa_id, request_id, row["merchant_id"], scope_hash, row["nonce"], t, visa_exp_ms, token)
        )
        conn.commit()

    return jsonify(ok=True, status="ACCEPTED", visaToken=token, expMs=visa_exp_ms)


@app.post("/handshake/verify")
def handshake_verify():
    """
    Merchant ellenőriztet:
      POST { visaToken }
    Szerver:
      1) HMAC signature ok?
      2) exp ok?
      3) token ismert DB-ben? (MVP: így lehet revokáció/nyilvántartás később)
    """
    data = request.get_json(force=True, silent=True) or {}
    token = str(data.get("visaToken") or "").strip()
    if not token:
        return jsonify(ok=False, error="visaToken required"), 400

    t = now_ms()
    try:
        payload = parse_and_verify_visa_token(token)
    except ValueError as e:
        return jsonify(ok=False, error=str(e)), 400

    exp = int(payload.get("exp") or 0)
    if exp <= t:
        return jsonify(ok=False, error="visa expired"), 400

    with db() as conn:
        row = conn.execute("SELECT * FROM visas WHERE token=?", (token,)).fetchone()

    if row is None:
        return jsonify(ok=False, error="unknown visa"), 400

    # extra konzisztencia (opcionális, de hasznos)
    if row["merchant_id"] != payload.get("merchantId"):
        return jsonify(ok=False, error="merchant mismatch"), 400

    return jsonify(ok=True, valid=True, payload=payload)

if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5050, debug=True)
