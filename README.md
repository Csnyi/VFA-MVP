# VFA-MVP  
**Virtual Flow Agreement – Minimum Viable Prototype**

A VFA-MVP egy kísérleti Identity Wallet / Virtual Bodyguard koncepció működő prototípusa.  
Célja egy visszavonható, időkorlátos (TTL) és aláírt digitális token rendszer bemutatása QR-alapú adatmegosztással.

Ez **nem kész termék**, hanem egy technikai és koncepcionális MVP.

---

## Fő funkciók

- Lokális Wallet token generálás
- QR kód előállítás
- Token visszavonás (revoke)
- Szerver oldali érvényesség ellenőrzés
- TTL (lejárati idő)
- HMAC aláírás a hamisítás ellen
- Merchant (ellenőrző) oldal QR beolvasással

---

## Architektúra (MVP)

Wallet (Browser / PWA)   
↓ QR   
Merchant (Browser / Camera)   
↓ API check   
Flask Backend + SQLite

### Wallet oldal
- Token létrehozás
- QR generálás
- Visszavonás
- Lokális tárolás (localStorage)

### Merchant oldal
- QR beolvasás
- Payload ellenőrzés
- API kérés a szerverhez

### Backend
- Flask REST API
- SQLite adatbázis
- Token regisztráció
- Revoke kezelés
- TTL + HMAC validáció

---

## Token Payload (QR)

```json
{
  "v": 1,
  "tokenId": "uuid",
  "iat": 1730000000000,
  "exp": 1730000300000,
  "sig": "base64url"
}
````

---

## Telepítés – Backend

### Követelmények

* Python 3.10+
* pip

### Lépések

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install flask flask-cors
export WALLET_HMAC_SECRET="valami_hosszabb_titok"
python server.py
```

Backend alapértelmezett port: `5000`

Egészség ellenőrzés:

```
http://localhost:5000/health
```

---

## Frontend futtatás

Nincs build rendszer.
Egyszerűen nyisd meg:

```
wallet.html
merchant.html
```

Fejlesztéshez ajánlott egy lokális HTTP szerver:

```bash
python -m http.server
```

---

## Biztonsági megjegyzések (MVP)

Ez a projekt **demó és prototípus célú**.

Jelenlegi korlátok:

* Közös titok (HMAC) a kliensben
* Nincs HTTPS
* Nincs eszköz-szintű védelem
* Nincs kulcsrotáció
* Nincs rate limit

Tervezett fejlesztések:

* Aszimmetrikus aláírás (ECDSA)
* Public key infrastruktúra
* Scope / jogosultsági szintek
* Kulcsrotáció
* HTTPS kötelező
* Több eszköz szinkron

---

## Lehetséges Use Case-ek

* Digitális hűségkártya
* Beléptető token
* Kedvezmény igazolás
* Rövid életű azonosítás
* Adatmegosztási “vízum” modell

---

## Projekt státusz

**MVP – Aktív prototípus**
Nem production ready.

---

## License

Apache License 2.0
Lásd: `LICENSE`

---

## Cél

A projekt célja egy olyan koncepció bemutatása, ahol:

* az adatmegosztás visszavonható
* a tokenek időkorlátosak
* a felhasználó kontrollálja a jogosultságot
* a rendszer egyszerűen demózható

---

## Megjegyzés

A VFA-MVP oktatási, kísérleti és koncepcionális célokra készült.
