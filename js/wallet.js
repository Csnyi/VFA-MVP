// js/wallet.js
const API_BASE = "http://localhost:5050"; // állítsd be ha nem localhost

// -------------------------
// Minimal DOM helpers
// -------------------------
function $(id) { return document.getElementById(id); }
function esc(x) {
  return String(x)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function nowMs() { return Date.now(); }

// -------------------------
// QR payload parsing (JSON / base64url JSON)
// -------------------------
function b64urlToUtf8(b64url) {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array([...bin].map(c => c.charCodeAt(0)));
  return new TextDecoder("utf-8").decode(bytes);
}

function parseMerchantRequest(rawText) {
  const s = String(rawText || "").trim();
  if (!s) throw new Error("empty_scan");

  // 1) direct JSON
  if (s.startsWith("{") && s.endsWith("}")) {
    const obj = JSON.parse(s);
    return obj;
  }

  // 2) base64url(JSON) – ha később így kódolod QR-be
  if (/^[A-Za-z0-9\-_]+$/.test(s)) {
    const jsonText = b64urlToUtf8(s);
    if (jsonText.startsWith("{") && jsonText.endsWith("}")) {
      return JSON.parse(jsonText);
    }
  }

  throw new Error("unsupported_qr_format");
}

// -------------------------
// API calls
// -------------------------
async function apiHandshakeAccept(requestId, decision) {
  const res = await fetch(`${API_BASE}/handshake/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId, decision })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    const msg = body?.error || `HTTP_${res.status}`;
    throw new Error(msg);
  }
  return body;
}

// -------------------------
// State
// -------------------------
let currentReq = null;     // merchant request payload
let currentVisaToken = ""; // returned from server

// -------------------------
// UI
// -------------------------
function render() {
  const view = $("walletView");
  if (!view) return;

  if (!currentReq) {
    view.innerHTML = `
      <div class="card">
        <h2>Wallet (Handshake MVP)</h2>
        <p>Olvasd be / illeszd be a merchant request QR tartalmát.</p>
      </div>
    `;
    return;
  }

  const expMs = Number(currentReq.expMs || 0);
  const secLeft = Math.max(0, Math.floor((expMs - nowMs()) / 1000));
  const scopeList = Array.isArray(currentReq.scope) ? currentReq.scope : [];

  view.innerHTML = `
    <div class="card">
      <h2>Kézfogás kérés</h2>
      <p><b>Merchant:</b> ${esc(currentReq.merchantId || "")}</p>
      <p><b>RequestId:</b> <code>${esc(currentReq.requestId || "")}</code></p>
      <p><b>Lejárat:</b> ${esc(String(expMs))} <small>(${secLeft}s)</small></p>

      <p><b>Kért adatszint (scope):</b></p>
      <ul>${scopeList.map(x => `<li>${esc(x)}</li>`).join("")}</ul>

      <div style="display:flex; gap:8px; margin-top:12px;">
        <button id="btnAccept">Elfogadom</button>
        <button id="btnReject">Elutasítom</button>
      </div>

      <p id="hsMsg" style="margin-top:12px;"></p>
    </div>
  `;

  $("btnAccept").onclick = () => decide("ACCEPT");
  $("btnReject").onclick = () => decide("REJECT");
}

async function decide(decision) {
  const msgEl = $("hsMsg");
  if (!currentReq?.requestId) {
    if (msgEl) msgEl.textContent = "Hiányzik a requestId.";
    return;
  }

  try {
    if (msgEl) msgEl.textContent = "Küldés a szervernek…";
    const resp = await apiHandshakeAccept(currentReq.requestId, decision);

    if (decision === "REJECT") {
      currentVisaToken = "";
      if (msgEl) msgEl.textContent = "Elutasítva.";
      clearVisaQr();
      return;
    }

    currentVisaToken = resp.visaToken || "";
    if (msgEl) msgEl.textContent = "Elfogadva. Visa token elkészült.";
    renderVisaQr(currentVisaToken);

  } catch (e) {
    if (msgEl) msgEl.textContent = `Hiba: ${e.message}`;
    clearVisaQr();
  }
}

function clearVisaQr() {
  const c = $("visaCanvas");
  if (!c) return;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
}

function renderVisaQr(visaToken) {
  const c = $("visaCanvas");
  if (!c) return;

  // QRious legyen betöltve (mint nálad eddig)
  if (typeof QRious === "undefined") {
    console.warn("QRious nincs betöltve, visaToken kiírás:", visaToken);
    return;
  }

  new QRious({
    element: c,
    value: visaToken, // ezt fogja merchant beolvasni
    size: 180,
    background: "#ffffff",
    foreground: "#000000"
  });
  
  const ta = document.getElementById("visaTokenText");
  if (ta) ta.value = visaToken;

  const btn = document.getElementById("copyVisaBtn");
  if (btn) {
    btn.onclick = async () => {
      await navigator.clipboard.writeText(visaToken);
      alert("Visa token másolva!");
    };
  }

}

// -------------------------
// Scan handling (paste/scan)
// -------------------------
function onScan(rawText) {
  try {
    const obj = parseMerchantRequest(rawText);

    // Gyors validáció (a szerver /handshake/request qrPayload formátuma)
    if (obj.t !== "vfa_hs_req") throw new Error("not_handshake_request");
    if (!obj.requestId || !obj.merchantId) throw new Error("missing_fields");

    currentReq = obj;
    currentVisaToken = "";
    clearVisaQr();
    render();
  } catch (e) {
    const view = $("walletView");
    if (view) {
      view.innerHTML = `
        <div class="card">
          <h2>Wallet (Handshake MVP)</h2>
          <p style="color:#b00"><b>Scan hiba:</b> ${esc(e.message)}</p>
          <p>Ellenőrizd, hogy a merchant QR a <code>/handshake/request</code> <code>qrPayload</code>-ja.</p>
        </div>
      `;
    }
    currentReq = null;
    currentVisaToken = "";
    clearVisaQr();
  }
}

// -------------------------
// Wire up simple UI (paste + button)
// -------------------------
window.addEventListener("DOMContentLoaded", () => {
  render();

  const btn = $("scanBtn");
  const inp = $("scanInput");

  if (btn && inp) {
    btn.addEventListener("click", () => onScan(inp.value));
  }

  // opcionális: ha van scannered, hívd ezt:
  window.onMerchantQrScanned = onScan;
});
