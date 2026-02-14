// js/wallet.js
const API_BASE = "http://localhost:5000";
const TTL_MS = 5 * 60 * 1000; // 5 perc

// FONTOS: MVP-hez jó, de ne commitold publikus repóba.
// Egyezzen a szerver WALLET_HMAC_SECRET-jével!
const HMAC_SECRET = "valami_hosszabb_titok_legalabb_32_karakter";

function b64urlFromBytes(bytes) {
    let binary = "";
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
    const b64 = btoa(binary);
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacSign(message) {
    const enc = new TextEncoder();
    const keyData = enc.encode(HMAC_SECRET);
    const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
    return b64urlFromBytes(new Uint8Array(sig));
}

async function apiRegisterToken(t) {
    try {
        await fetch(`${API_BASE}/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tokenId: t.id, createdMs: t.created, expMs: t.exp })
        });
    } catch (e) {
        console.warn("Szerver nem elérhető (register):", e);
    }
}

async function apiRevokeToken(tokenId) {
    try {
        await fetch(`${API_BASE}/revoke`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tokenId })
        });
    } catch (e) {
        console.warn("Szerver nem elérhető (revoke):", e);
    }
}

// eleje
function loadTokens() {
    return JSON.parse(localStorage.getItem("tokens") || "[]");
}

function saveTokens(tokens) {
    localStorage.setItem("tokens", JSON.stringify(tokens));
}

function uuid() {
    return crypto.randomUUID();
}

async function createToken() {
    const tokens = loadTokens();

    const created = Date.now();
    const exp = created + TTL_MS;

    const token = {
        id: uuid(),
        created,
        exp,
        revoked: false
    };

    tokens.push(token);
    saveTokens(tokens);

    await apiRegisterToken(token);
    render();
}

async function revokeToken(id) {
    const tokens = loadTokens();
    const t = tokens.find(x => x.id === id);
    if (t) t.revoked = true;
    saveTokens(tokens);

    await apiRevokeToken(id);
    render();
}

async function render() {
    const list = document.getElementById("tokenList");
    const tokens = loadTokens();

    list.innerHTML = "";

    for (const t of tokens) {
        const div = document.createElement("div");
        div.className = "token " + (t.revoked ? "revoked" : "");

        const canvasId = "qr_" + t.id;

        div.innerHTML = `
        <b>ID:</b> ${t.id}<br>
        <b>Állapot:</b> ${t.revoked ? "VISSZAVONVA" : "AKTÍV"}<br>
        <b>Lejár:</b> ${new Date(t.exp).toLocaleString()}<br>
        ${!t.revoked ? `<button onclick="revokeToken('${t.id}')">Visszavon</button>` : ""}
        <br>
        <canvas id="${canvasId}"></canvas>
      `;

        list.appendChild(div);

        const iat = t.created;
        const exp = t.exp;
        const message = `${t.id}.${iat}.${exp}`;
        const sig = await hmacSign(message);

        const payload = {
            v: 1,
            tokenId: t.id,
            iat,
            exp,
            sig
        };

        new QRious({
            element: document.getElementById(canvasId),
            value: JSON.stringify(payload),
            size: 140,
            background: "#ffffff",
            foreground: "#000000"
        });
    }
}

window.addEventListener("DOMContentLoaded", () => {
    render();
});
