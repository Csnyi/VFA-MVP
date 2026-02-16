// js/merchant.js (MVP)
// - Create handshake request -> show as QR (wallet scans)
// - Scan/paste visaToken from wallet -> verify via server
//
// Requires (recommended): QRious (same as you use in wallet.js)
// <script src="qrious.min.js"></script>
// <script src="js/merchant.js"></script>
//
// Minimal HTML ids this script expects:
// - requestCanvas (canvas)   : shows merchant request QR
// - requestJson  (textarea)  : shows the JSON that is encoded in QR (debug/copy)
// - btnNewRequest (button)   : create new request
// - visaInput (textarea/input): paste scanned visaToken ???
// - btnVerify (button)       : verify visaToken
// - merchantView (div)       : status/output

const API_BASE = "http://localhost:5000"; // change if needed

// --- Config (MVP) ---
const MERCHANT_ID = "lidl_001"; // set per merchant
const DEFAULT_SCOPE = ["age_over_18", "loyalty_id"]; // what you ask from the wallet
const DEFAULT_TTL_SEC = 60; // request lifetime

function $(id) { return document.getElementById(id); }
function esc(x) {
  return String(x)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(html) {
  const v = $("merchantView");
  if (v) v.innerHTML = html;
}

async function apiHandshakeRequest({ merchantId, scope, ttlSec }) {
  const res = await fetch(`${API_BASE}/handshake/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ merchantId, scope, ttlSec }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    throw new Error(body?.error || `HTTP_${res.status}`);
  }
  return body; // { ok, requestId, expMs, qrPayload }
}

async function apiHandshakeVerify(visaToken) {
  const res = await fetch(`${API_BASE}/handshake/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visaToken }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    throw new Error(body?.error || `HTTP_${res.status}`);
  }
  return body; // { ok, valid, payload }
}

function renderRequestQr(qrPayload) {
  const canvas = $("requestCanvas");
  const txt = $("requestJson");

  const json = JSON.stringify(qrPayload);

  if (txt) txt.value = json;

  if (!canvas) return;
  if (typeof QRious === "undefined") {
    console.warn("QRious not loaded; request JSON:", json);
    return;
  }

  new QRious({
    element: canvas,
    value: json,
    size: 180,
    background: "#ffffff",
    foreground: "#000000",
  });
}

async function newRequest() {
  try {
    setStatus(`<div class="card"><p>Request készül…</p></div>`);

    const resp = await apiHandshakeRequest({
      merchantId: MERCHANT_ID,
      scope: DEFAULT_SCOPE,
      ttlSec: DEFAULT_TTL_SEC,
    });

    renderRequestQr(resp.qrPayload);

    setStatus(`
      <div class="card">
        <h2>Merchant (Handshake MVP)</h2>
        <p><b>Merchant:</b> ${esc(MERCHANT_ID)}</p>
        <p><b>RequestId:</b> <code>${esc(resp.requestId)}</code></p>
        <p><b>Lejár:</b> ${new Date(resp.expMs).toLocaleString()}</p>
        <p>Mutasd a QR-t a walletnek beolvasásra.</p>
      </div>
    `);
  } catch (e) {
    setStatus(`
      <div class="card">
        <h2>Merchant (Handshake MVP)</h2>
        <p style="color:#b00"><b>Hiba:</b> ${esc(e.message)}</p>
      </div>
    `);
  }
}

async function verifyVisa() {
  const inp = $("visaInput");
  const visaToken = String(inp?.value || "").trim();

  if (!visaToken) {
    setStatus(`<div class="card"><p style="color:#b00"><b>Hiba:</b> visaToken üres</p></div>`);
    return;
  }

  try {
    setStatus(`<div class="card"><p>Ellenőrzés…</p></div>`);
    const resp = await apiHandshakeVerify(visaToken);

    const p = resp.payload || {};
    setStatus(`
      <div class="card">
        <h2>Visa OK ✅</h2>
        <p><b>MerchantId:</b> ${esc(p.merchantId || "")}</p>
        <p><b>VisaId:</b> <code>${esc(p.visaId || "")}</code></p>
        <p><b>RequestId:</b> <code>${esc(p.requestId || "")}</code></p>
        <p><b>ScopeHash:</b> <code>${esc(p.scopeHash || "")}</code></p>
        <p><b>IAT:</b> ${esc(String(p.iat || ""))}</p>
        <p><b>EXP:</b> ${esc(String(p.exp || ""))} (${new Date(Number(p.exp || 0)).toLocaleString()})</p>
      </div>
    `);
  } catch (e) {
    setStatus(`
      <div class="card">
        <h2>Visa HIBÁS ❌</h2>
        <p style="color:#b00"><b>Ok:</b> ${esc(e.message)}</p>
      </div>
    `);
  }
}

// Optional: if you have a scanner that calls a global callback with scanned text:
window.onVisaTokenScanned = (text) => {
  const inp = $("visaInput");
  if (inp) inp.value = String(text || "").trim();
  verifyVisa().catch(console.warn);
};

window.addEventListener("DOMContentLoaded", () => {
  // Wire buttons if present
  $("btnNewRequest")?.addEventListener("click", () => newRequest());
  $("btnVerify")?.addEventListener("click", () => verifyVisa());

  // Auto-create a request on load (nice for demos)
  newRequest().catch(console.warn);
});
