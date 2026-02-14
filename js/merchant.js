// js/merchant.js
// Merchant oldal: QR beolvasás → /check ellenőrzés → megáll → "Új beolvasás" gombbal újraindítható.

const API_BASE = "http://localhost:5000";

async function checkOnServer(payload) {
  const r = await fetch(`${API_BASE}/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  // Ha a szerver nem 2xx-et ad, akkor is legyen értelmes hiba
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status} ${r.statusText}${txt ? " - " + txt : ""}`);
  }

  return await r.json();
}

// Később Revocation cache-hez kellhet
function loadTokens() {
  return JSON.parse(localStorage.getItem("tokens") || "[]");
}

function showBox(ok, title, obj) {
  const el = document.getElementById("result");
  el.className = ok ? "ok" : "bad";
  el.innerHTML = `<b>${title}</b><pre>${JSON.stringify(obj, null, 2)}</pre>`;
}

function tryParseToken(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isSignedTokenShape(tokenObj) {
  // Minimális forma-ellenőrzés (az igazi validálás a szerveren történik)
  return !!tokenObj &&
    typeof tokenObj.tokenId === "string" &&
    typeof tokenObj.iat === "number" &&
    typeof tokenObj.exp === "number" &&
    typeof tokenObj.sig === "string";
}

// --- Html5Qrcode setup ---
const qr = new Html5Qrcode("reader");
const config = { fps: 10, qrbox: 220 };

// Állapotok
let cameraId = null;
let scanning = false;     // ténylegesen fut-e a scanner
let inFlight = false;     // épp ellenőrzünk-e (hogy ne legyen több POST)
let lastText = null;      // duplázás ellen (ugyanaz a QR több frame-ben)
let lastAt = 0;

// UI
const rescanBtn = document.getElementById("rescanBtn");
if (rescanBtn) {
  rescanBtn.disabled = true; // induláskor úgyis scannelünk
  rescanBtn.addEventListener("click", () => startScan(), { passive: true });
}

function ignoreDuplicate(decodedText, windowMs = 1500) {
  const now = Date.now();
  if (decodedText === lastText && (now - lastAt) < windowMs) return true;
  lastText = decodedText;
  lastAt = now;
  return false;
}

async function ensureCameraId() {
  if (cameraId) return cameraId;

  const cameras = await Html5Qrcode.getCameras();
  if (!cameras || cameras.length === 0) {
    throw new Error("A böngésző nem lát kamerát.");
  }

  // 1. kamera (telefonon gyakran működik); ha kell, cseréld a 2. kamerára
  cameraId = cameras[0].id;
  return cameraId;
}

async function startScan() {
  if (scanning) return;

  // UI/állapot reset
  if (rescanBtn) rescanBtn.disabled = true;
  inFlight = false;
  lastText = null;
  lastAt = 0;

  try {
    const camId = await ensureCameraId();

    // start előtt jelöljük "scanning" true-ra, hogy azonnal blokkolja a duplázást
    // (ha a callback gyorsan tüzel)
    scanning = true;

    await qr.start(
      camId,
      config,
      onScanSuccess,
      () => {
        // scan error spamet nem írunk ki
      }
    );
  } catch (err) {
    scanning = false;
    if (rescanBtn) rescanBtn.disabled = false;
    showBox(false, "Start hiba", { error: String(err) });
  }
}

async function stopScan() {
  // Idempotens stop: ha már nem fut, akkor se omoljon össze
  if (!scanning) {
    if (rescanBtn) rescanBtn.disabled = false;
    return;
  }

  scanning = false;

  // Html5Qrcode stop néha dob, ha már áll -> elnyeljük
  await qr.stop().catch(() => {});

  if (rescanBtn) rescanBtn.disabled = false;
}

async function onScanSuccess(decodedText) {
  // 1) Ha már megálltunk / fut a kérés -> ignore
  if (!scanning) return;
  if (inFlight) return;

  // 2) Ugyanaz a QR több frame-ben -> ignore
  if (ignoreDuplicate(decodedText)) return;

  // 3) Lockolunk, hogy csak 1 POST legyen
  inFlight = true;

  try {
    const tokenObj = tryParseToken(decodedText);

    if (!isSignedTokenShape(tokenObj)) {
      showBox(false, "Nem aláírt token QR", { decodedText });
      // Érvénytelen QR esetén engedjük tovább scannelni
      inFlight = false;
      return;
    }

    // Ellenőrzés a szerveren
    const serverRes = await checkOnServer(tokenObj);
    const ok = serverRes?.valid === true;

    showBox(
      ok,
      ok ? "ELFOGADVA (szerver)" : "ELUTASÍTVA (TTL/SIG/REVOKE)",
      {
        scanned: tokenObj,
        server: serverRes,
      }
    );

    // Sikeres (vagy sikertelen, de értelmezhető) ellenőrzés után megállunk,
    // és a felhasználó a gombbal indíthat újra.
    await stopScan();
  } catch (err) {
    // Ha szerver hiba volt, itt is megállhatunk, hogy látszódjon az üzenet,
    // és a "Új beolvasás" gombbal újra próbálható.
    showBox(false, "Szerver hiba", { error: String(err) });
    await stopScan();
  } finally {
    // Ha stopScan nem futott le valamiért, inFlight akkor se maradjon örökre true.
    // Ha scanning true maradt (pl. invalid QR-nél), akkor engedjük a következő próbát.
    if (scanning) inFlight = false;
  }
}

// első indulás
startScan();
