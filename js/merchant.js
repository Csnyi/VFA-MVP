// js/merchant.js
const API_BASE = "http://localhost:5000";

async function checkOnServer(payload) {
  const r = await fetch(`${API_BASE}/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return await r.json();
}

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

const qr = new Html5Qrcode("reader");
const config = { fps: 10, qrbox: 220 };

let cameraId = null;
let inFlight = false;
let scanning = false;

const rescanBtn = document.getElementById("rescanBtn");
rescanBtn.onclick = () => startScan();

async function startScan() {
  if (scanning) return;

  rescanBtn.disabled = true;
  inFlight = false;

  try {
    if (!cameraId) {
      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || cameras.length === 0) {
        showBox(false, "Nincs kamera", {});
        return;
      }
      cameraId = cameras[0].id;
    }

    await qr.start(cameraId, config, onScanSuccess, () => {});
    scanning = true;

  } catch (err) {
    showBox(false, "Start hiba", { error: String(err) });
  }
}

async function stopScan() {
  if (!scanning) return;
  scanning = false;
  await qr.stop().catch(() => {});
  rescanBtn.disabled = false;
}

async function onScanSuccess(decodedText) {
  if (inFlight) return;
  inFlight = true;

  try {
    const tokenObj = tryParseToken(decodedText);
    if (!tokenObj) {
      showBox(false, "Nem token", { decodedText });
      inFlight = false; // engedjük tovább scannelni
      return;
    }

    const serverRes = await checkOnServer(tokenObj);
    const ok = serverRes.valid === true;

    showBox(ok, ok ? "ELFOGADVA" : "ELUTASÍTVA", serverRes);

  } catch (err) {
    showBox(false, "Szerver hiba", { error: String(err) });
  } finally {
    await stopScan();   // <-- itt áll meg
  }
}

// első indulás
startScan();
