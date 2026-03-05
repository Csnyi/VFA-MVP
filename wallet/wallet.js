/**
 * VFA Wallet (Handshake MVP)
 * ==========================
 *
 * Minimal wallet client for the VFA handshake demo.
 *
 * Responsibilities
 * ---------------
 * 1) Scan/paste a merchant handshake request (QR content)
 * 2) Show requested scope to the user
 * 3) Let the user ACCEPT or REJECT
 * 4) Send the decision to the server
 * 5) Receive a short-lived visa token
 * 6) Render visa token as QR code for the merchant to scan
 *
 * Flow (MVP)
 * ----------
 * Merchant -> (QR request) -> Wallet -> (decision) -> Server -> (visa token) -> Wallet -> (QR) -> Merchant
 *
 * Configuration
 * -------------
 * API_BASE
 *     Base URL for the server, e.g. "http://localhost:5050"
 *
 * Dependencies
 * ------------
 * - Optional (recommended): QRious (for QR rendering)
 *
 * Security / MVP limitations
 * --------------------------
 * - No secure key storage (wallet is just a demo UI)
 * - No replay protection
 * - Visa token can be copied to clipboard (demo convenience)
 * - Tokens are held in memory only in this file
 */

// js/wallet.js
const API_BASE = "http://localhost:5050"; // set it if not localhost

// ---------------------------------------------------------------------
// Minimal DOM + util helpers
// ---------------------------------------------------------------------

/**
 * Get element by id.
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

/** @returns {number} Current epoch time in ms. */
function nowMs() {
  return Date.now();
}

// ---------------------------------------------------------------------
// QR payload parsing (JSON / base64url JSON)
// ---------------------------------------------------------------------

/**
 * Decode a base64url string into UTF-8 text.
 * @param {string} b64url
 * @returns {string}
 */
function b64urlToUtf8(b64url) {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array([...bin].map((c) => c.charCodeAt(0)));
  return new TextDecoder("utf-8").decode(bytes);
}

/**
 * Parse the merchant request payload from a QR scan or pasted text.
 *
 * Supported formats:
 *  1) raw JSON (starts with "{" and ends with "}")
 *  2) base64url(JSON)
 *
 * @param {string} rawText
 * @returns {Object}
 * @throws {Error} if empty or unsupported format
 *
 * @example
 * parseMerchantRequest('{"t":"vfa_hs_req","requestId":"abc","merchantId":"Merch_001","expMs":0,"scope":[]}')
 *
 * @example
 * parseMerchantRequest('eyJ0IjoidmZhX2hzX3JlcSIsInJlcXVlc3RJZCI6ImFiYyJ9') // base64url(JSON)
 */
function parseMerchantRequest(rawText) {
  const s = String(rawText || "").trim();
  if (!s) throw new Error("empty_scan");

  // 1) direct JSON
  if (s.startsWith("{") && s.endsWith("}")) {
    return JSON.parse(s);
  }

  // 2) base64url(JSON)
  if (/^[A-Za-z0-9\-_]+$/.test(s)) {
    const jsonText = b64urlToUtf8(s);
    if (jsonText.startsWith("{") && jsonText.endsWith("}")) {
      return JSON.parse(jsonText);
    }
  }

  throw new Error("unsupported_qr_format");
}

// ---------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------

/**
 * Send wallet decision to server for the given requestId.
 *
 * @param {string} requestId
 * @param {"ACCEPT"|"REJECT"} decision
 * @returns {Promise<Object>} server response
 *
 * @example
 * const resp = await apiHandshakeAccept("req_123", "ACCEPT")
 */
async function apiHandshakeAccept(requestId, decision) {
  const res = await fetch(`${API_BASE}/handshake/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId, decision }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    const msg = body?.error || `HTTP_${res.status}`;
    throw new Error(msg);
  }
  return body;
}

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------
/** @type {Object|null} */
let currentReq = null; // merchant request payload
/** @type {string} */
let currentVisaToken = ""; // returned from server

// ---------------------------------------------------------------------
// UI rendering
// ---------------------------------------------------------------------

/**
 * Render the wallet view based on current state.
 */
function render() {
  const view = $("walletView");
  if (!view) return;

  if (!currentReq) {
    view.innerHTML = `
      <div class="card">
        <h2>Wallet (Handshake MVP)</h2>
        <p>Scan or paste the merchant request QR content.</p>
      </div>
    `;
    return;
  }

  const expMs = Number(currentReq.expMs || 0);
  const secLeft = Math.max(0, Math.floor((expMs - nowMs()) / 1000));
  const scopeList = Array.isArray(currentReq.scope) ? currentReq.scope : [];

  view.innerHTML = `
    <div class="card">
      <h2>Handshake request</h2>
      <p><b>Merchant:</b> ${esc(currentReq.merchantId || "")}</p>
      <p><b>Request ID:</b> <code>${esc(currentReq.requestId || "")}</code></p>
      <p><b>Expiration (ms):</b> ${esc(String(expMs))} <small>(${secLeft}s left)</small></p>

      <p><b>Requested scope:</b></p>
      <ul>${scopeList.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>

      <div style="display:flex; gap:8px; margin-top:12px;">
        <button id="btnAccept">Accept</button>
        <button id="btnReject">Reject</button>
      </div>

      <p id="hsMsg" style="margin-top:12px;"></p>
    </div>
  `;

  $("btnAccept").onclick = () => decide("ACCEPT");
  $("btnReject").onclick = () => decide("REJECT");
}

/**
 * Handle ACCEPT/REJECT decision: call server, update UI, render visa QR on ACCEPT.
 *
 * @param {"ACCEPT"|"REJECT"} decision
 */
async function decide(decision) {
  const msgEl = $("hsMsg");
  if (!currentReq?.requestId) {
    if (msgEl) msgEl.textContent = "The requestId is missing.";
    return;
  }

  try {
    if (msgEl) msgEl.textContent = "Sending to server…";
    const resp = await apiHandshakeAccept(currentReq.requestId, decision);

    if (decision === "REJECT") {
      currentVisaToken = "";
      if (msgEl) msgEl.textContent = "Rejected.";
      clearVisaQr();
      return;
    }

    currentVisaToken = resp.visaToken || "";
    if (msgEl) msgEl.textContent = "Accepted. Visa token created.";
    renderVisaQr(currentVisaToken);
  } catch (e) {
    if (msgEl) msgEl.textContent = `Error: ${e.message}`;
    clearVisaQr();
  }
}

/**
 * Clear visa QR canvas (if present).
 */
function clearVisaQr() {
  const c = $("visaCanvas");
  if (!c) return;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
}

/**
 * Render visa token as QR code using QRious (if loaded).
 *
 * Expected HTML elements:
 * - canvas#visaCanvas
 * - textarea/input#visaTokenText (optional)
 * - button#copyVisaBtn (optional)
 *
 * @param {string} visaToken
 */
function renderVisaQr(visaToken) {
  const c = $("visaCanvas");
  if (!c) return;

  // QRious should be loaded
  if (typeof QRious === "undefined") {
    console.warn("QRious is not loaded; visaToken:", visaToken);
    return;
  }

  new QRious({
    element: c,
    value: visaToken, // what the merchant will scan
    size: 180,
    background: "#ffffff",
    foreground: "#000000",
  });

  const ta = document.getElementById("visaTokenText");
  if (ta) ta.value = visaToken;

  const btn = document.getElementById("copyVisaBtn");
  if (btn) {
    btn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(visaToken);
        alert("Visa token copied!");
      } catch (err) {
        console.warn("Clipboard copy failed:", err);
        alert("Clipboard copy failed. You can still select and copy the token manually.");
      }
    };
  }
}

// ---------------------------------------------------------------------
// Scan handling (paste/scan)
// ---------------------------------------------------------------------

/**
 * Main entry point when a QR is scanned or a QR payload is pasted.
 *
 * @param {string} rawText
 */
function onScan(rawText) {
  try {
    const obj = parseMerchantRequest(rawText);

    // Fast validation (server /handshake/request qrPayload format)
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
          <p style="color:#b00"><b>Scan error:</b> ${esc(e.message)}</p>
          <p>Check that the merchant QR is the <code>/handshake/request</code> <code>qrPayload</code>.</p>
        </div>
      `;
    }
    currentReq = null;
    currentVisaToken = "";
    clearVisaQr();
  }
}

// ---------------------------------------------------------------------
// Wire up minimal UI (paste + button)
// ---------------------------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  render();

  const btn = $("scanBtn");
  const inp = $("scanInput");

  if (btn && inp) {
    btn.addEventListener("click", () => onScan(inp.value));
  }

  // Optional: if you have a scanner integration, call this global:
  window.onMerchantQrScanned = onScan;
});