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

Html5Qrcode.getCameras().then(cameras => {
    if (!cameras || cameras.length === 0) {
        showBox(false, "Nincs kamera", { error: "A böngésző nem lát kamerát." });
        return;
    }

    // első kamerát próbáljuk (telefonon általában működik)
    const cameraId = cameras[0].id;
    // hátsó kamera telefonon
    // const cameraId = cameras[1].id;

    qr.start(
        cameraId,
        config,
        async (decodedText) => {
            const tokenObj = tryParseToken(decodedText);
            
            if (!tokenObj ||
                typeof tokenObj.tokenId !== "string" ||
                typeof tokenObj.iat !== "number" ||
                typeof tokenObj.exp !== "number" ||
                typeof tokenObj.sig !== "string") {
                    showBox(false, "Nem aláírt token QR", { decodedText });
                    return;
            }
            
            try {
                const serverRes = await checkOnServer(tokenObj);
                const ok = serverRes.valid === true;
                showBox(
                    ok,
                    ok ? "ELFOGADVA (szerver)" : "ELUTASÍTVA (TTL/SIG/REVOKE)",
                    {
                        scanned: tokenObj,
                        server: serverRes
                    }
                );
                // hogy ne pörögjön folyamatosan:
                await qr.stop();
            } catch (err) {
                showBox(false, "Szerver hiba", { error: String(err) });
            }
        },
        (err) => { /* scan error spamet nem írunk ki */ }
    );    
}).catch(err => {
    showBox(false, "Kamera hiba", { error: String(err) });
});