/**
 * VFA Merchant Client (Handshake MVP)
 * ===================================
 *
 * Demonstration merchant-side client for the VFA handshake flow.
 *
 * Responsibilities
 * ---------------
 * 1) Create a handshake request -> show as QR (wallet scans)
 * 2) Receive a visa token from wallet (scan/paste)
 * 3) Verify the visa token via server
 *
 * Dependencies
 * ------------
 * - Optional (recommended): QRious (for QR generation)
 * - Optional: Html5Qrcode (for scanning; this file supports it *if present*)
 *
 * Expected HTML element IDs
 * -------------------------
 * - requestCanvas (canvas)    : shows merchant request QR
 * - requestJson   (textarea)  : shows the JSON encoded in QR (debug/copy)
 * - btnNewRequest (button)    : create new request
 * - visaInput     (textarea/input): paste scanned visaToken
 * - btnVerify     (button)    : verify visaToken
 * - merchantView  (div)       : status/output
 *
 * Optional scanner IDs
 * --------------------
 * - reader (div) : Html5Qrcode target container (if you use scanning)
 *
 * Security / MVP limitations
 * --------------------------
 * - This is a demo merchant UI; do not treat it as production code.
 * - The server uses shared HMAC secret in MVP; production should use asymmetric keys.
 * - Visa validation in production should consider replay protection, rate limits, etc.
 */

// js/merchant.js (MVP)
const API_BASE = "http://localhost:5050"; // change if needed

// --- Config (MVP) ---
const MERCHANT_ID = "Merch_001"; // set per merchant
const DEFAULT_SCOPE = ["age_over_18", "loyalty_id"]; // what you ask from the wallet
const DEFAULT_TTL_SEC = 60; // request lifetime (seconds)

/**
 * @param {string} id
 * @returns {HTMLElement|null}
 */
function $(id) {
  return document.getElementById(id);
}

/**
 * Escape text for safe HTML insertion.
 * @param {any} x
 * @returns {string}
 */
function esc(x) {
  return String(x)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Set status HTML in #merchantView.
 * @param {string} html
 */
function setStatus(html) {
  const v = $("merchantView");
  if (v) v.innerHTML = html;
}

/**
 * Create a handshake request on the server.
 *
 * @param {{merchantId:string, scope:string[], ttlSec:number}} params
 * @returns {Promise<{ok:boolean, requestId:string, expMs:number, qrPayload:Object}>}
 *
 * @example
 * const resp = await apiHandshakeRequest({ merchantId:"Merch_001", scope:["age_over_18"], ttlSec:60 })
 */
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

/**
 * Verify a visa token on the server.
 *
 * @param {string} visaToken
 * @returns {Promise<{ok:boolean, valid:boolean, payload:Object}>}
 *
 * @example
 * const r = await apiHandshakeVerify("payload.sig")
 */
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

/**
 * Render the handshake request payload as QR code.
 *
 * @param {Object} qrPayload
 */
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

/**
 * Create a new request and show it as a QR code.
 *
 * @returns {Promise<void>}
 *
 * @example
 * await newRequest()
 */
async function newRequest() {
  try {
    setStatus(`<div class="card"><p>The request is being prepared…</p></div>`);

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
        <p><b>Request ID:</b> <code>${esc(resp.requestId)}</code></p>
        <p><b>Expiration:</b> ${new Date(resp.expMs).toLocaleString()}</p>
        <p>Show the QR code to the wallet to scan.</p>
      </div>
    `);
  } catch (e) {
    setStatus(`
      <div class="card">
        <h2>Merchant (Handshake MVP)</h2>
        <p style="color:#b00"><b>Error:</b> ${esc(e.message)}</p>
      </div>
    `);
  }
}

/**
 * Verify the visa token currently present in #visaInput.
 *
 * @returns {Promise<void>}
 */
async function verifyVisa() {
  const inp = $("visaInput");
  const visaToken = String(inp?.value || "").trim();

  if (!visaToken) {
    setStatus(`<div class="card"><p style="color:#b00"><b>Error:</b> visaToken is empty</p></div>`);
    return;
  }

  try {
    setStatus(`<div class="card"><p>Checking…</p></div>`);
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
        <h2>Visa FAILED ❌</h2>
        <p style="color:#b00"><b>Reason:</b> ${esc(e.message)}</p>
      </div>
    `);
  }
}

/**
 * Optional: If you use a scanner integration that calls a global callback
 * with scanned text, this handler can populate #visaInput and auto-verify.
 *
 * @param {string} text
 */
window.onVisaTokenScanned = (text) => {
  const inp = $("visaInput");
  if (inp) inp.value = String(text || "").trim();
  verifyVisa().catch(console.warn);
};

/**
 * Optional Html5Qrcode wiring:
 * - only starts if Html5Qrcode exists AND #reader element exists
 * - writes scanned text into #visaInput
 *
 * This avoids runtime errors when Html5Qrcode is not used on the page.
 */
function initHtml5QrcodeScanner() {
  const reader = $("reader");
  if (!reader) return;

  if (typeof Html5Qrcode === "undefined") {
    console.warn("Html5Qrcode is not available; scanner will not start.");
    return;
  }

  try {
    const qr = new Html5Qrcode("reader");
    qr.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 200 },
      (decodedText) => {
        const inp = $("visaInput");
        if (inp) inp.value = String(decodedText || "").trim();
        // You can auto-verify on scan, or leave it manual:
        // verifyVisa().catch(console.warn);
      }
    ).catch((err) => {
      console.warn("Html5Qrcode start failed:", err);
    });
  } catch (err) {
    console.warn("Html5Qrcode init error:", err);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  // Wire buttons if present
  $("btnNewRequest")?.addEventListener("click", () => newRequest());
  $("btnVerify")?.addEventListener("click", () => verifyVisa());

  // Auto-create a request on load (nice for demos)
  newRequest().catch(console.warn);

  // Optional scanner
  initHtml5QrcodeScanner();
});