from __future__ import annotations

import os
import hmac
import hashlib
import base64
import sqlite3
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
        conn.commit()

def b64urlKeepsafe(b: bytes) -> str:
    # base64url, '=' padding nélkül
    return base64.urlsafe_b64encode(b).decode("ascii").rstrip("=")

def sign_message(token_id: str, iat: int, exp: int) -> str:
    msg = f"{token_id}.{iat}.{exp}".encode("utf-8")
    mac = hmac.new(HMAC_SECRET, msg, hashlib.sha256).digest()
    return b64urlKeepsafe(mac)

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

if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=True)
