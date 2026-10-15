"use strict";
/*
  El Sonlatino Colombia: servidor de la radio.
  - Sirve la página pública (carpeta /public).
  - Guarda las emisoras en un archivo JSON (DATA_DIR/stations.json).
  - Solo quien conoce ADMIN_PASSWORD puede agregar, editar o borrar emisoras.
  Sin dependencias: solo necesita Node.js 18 o superior.
*/
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = parseInt(process.env.PORT, 10) || 3000;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "stations.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const SECRET = process.env.SESSION_SECRET || crypto.createHash("sha256").update("esl-session|" + ADMIN_PASSWORD).digest("hex");
const TOKEN_DAYS = 30;

if (!ADMIN_PASSWORD){
  console.warn("AVISO: falta la variable ADMIN_PASSWORD. Nadie podrá iniciar sesión como administrador hasta que la definas.");
} else if (ADMIN_PASSWORD.length < 8){
  console.warn("AVISO: usa una contraseña de al menos 8 caracteres.");
}

/* ---------- Datos ---------- */
const SEED = [
  { id: "principal", name: "El Sonlatino Colombia", region: "Nacional", city: "Colombia", genre: "Salsa, son y ritmos latinos", url: "", logo: "app" }
];
let db = { version: 1, updated: new Date().toISOString(), stations: [] };

function loadDb(){
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try{
    const d = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (d && Array.isArray(d.stations)){ db = d; return; }
  }catch(e){ if (e.code !== "ENOENT") console.error("No se pudo leer", DATA_FILE, e.message); }
  db.stations = SEED.map(s => ({ ...s }));
  persist();
}
function persist(){
  db.updated = new Date().toISOString();
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);   // escritura atómica: nunca queda un archivo a medias
}

/* ---------- Validación ---------- */
const str = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
function httpUrl(v){
  const s = str(v, 500); if (!s) return "";
  try{ const u = new URL(s); return (u.protocol === "http:" || u.protocol === "https:") ? u.href : null; }catch(e){ return null; }
}
function cleanLogo(v){
  if (!v) return "";
  if (v === "app") return "app";
  if (typeof v !== "string") return null;
  if (/^data:image\/(webp|png|jpeg|gif);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= 300000) return v;
  return httpUrl(v);
}
function cleanId(v){ const s = String(v || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40); return s || null; }
function cleanStation(b, id){
  if (!b || typeof b !== "object") return { error: "Datos inválidos." };
  const name = str(b.name, 60); if (!name) return { error: "Escribe el nombre de la emisora." };
  const url = httpUrl(b.url); if (url === null) return { error: "La URL del streaming debe empezar por http:// o https://" };
  const logo = cleanLogo(b.logo); if (logo === null) return { error: "El logo no es válido o pesa demasiado." };
  return { station: { id, name, region: str(b.region, 30), city: str(b.city, 40), genre: str(b.genre, 40), url, logo } };
}
const newId = () => "e" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex");

/* ---------- Sesión de administrador ---------- */
const b64 = b => Buffer.from(b).toString("base64url");
function makeToken(){
  const body = b64(JSON.stringify({ exp: Date.now() + TOKEN_DAYS * 864e5 }));
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return body + "." + sig;
}
function validToken(t){
  if (!ADMIN_PASSWORD || typeof t !== "string") return false;
  const [body, sig] = t.split(".");
  if (!body || !sig) return false;
  const good = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  const a = Buffer.from(sig), c = Buffer.from(good);
  if (a.length !== c.length || !crypto.timingSafeEqual(a, c)) return false;
  try{ return JSON.parse(Buffer.from(body, "base64url").toString()).exp > Date.now(); }catch(e){ return false; }
}
function isAdmin(req){
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") && validToken(h.slice(7));
}
function samePassword(input){
  const a = crypto.createHash("sha256").update(String(input)).digest();
  const b = crypto.createHash("sha256").update(ADMIN_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}
/* Freno a quien intenta adivinar la contraseña: 5 fallos = 15 minutos de espera. */
const fails = new Map();
const ipOf = req => String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
function locked(ip){ const f = fails.get(ip); return f && f.until > Date.now(); }
function registerFail(ip){
  const f = fails.get(ip) || { n: 0, until: 0 };
  f.n++; if (f.n >= 5){ f.until = Date.now() + 15 * 60000; f.n = 0; }
  fails.set(ip, f);
}

/* ---------- HTTP ---------- */
const MIME = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8",
  ".webp":"image/webp", ".png":"image/png", ".jpg":"image/jpeg", ".svg":"image/svg+xml", ".json":"application/json", ".ico":"image/x-icon", ".webmanifest":"application/manifest+json" };

function send(res, code, obj){
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}
function readBody(req, limit){
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > limit){ reject(Object.assign(new Error("big"), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try{ resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); }catch(e){ reject(Object.assign(new Error("json"), { code: 400 })); } });
    req.on("error", reject);
  });
}

async function api(req, res, url){
  const p = url.pathname.replace(/\/+$/, "");
  const m = req.method;

  if (p === "/api/stations" && m === "GET") return send(res, 200, { stations: db.stations, updated: db.updated });

  if (p === "/api/login" && m === "POST"){
    const ip = ipOf(req);
    if (locked(ip)) return send(res, 429, { error: "Demasiados intentos. Espera 15 minutos." });
    if (!ADMIN_PASSWORD) return send(res, 503, { error: "El servidor no tiene contraseña de administrador configurada." });
    const b = await readBody(req, 4096);
    if (!samePassword(b.password)){ registerFail(ip); return send(res, 401, { error: "Contraseña incorrecta." }); }
    fails.delete(ip);
    return send(res, 200, { token: makeToken() });
  }

  // Todo lo que sigue exige ser administrador
  if (!isAdmin(req)) return send(res, 401, { error: "Inicia sesión como administrador." });

  if (p === "/api/me" && m === "GET") return send(res, 200, { ok: true });

  if (p === "/api/stations" && m === "POST"){
    const r = cleanStation(await readBody(req, 1e6), newId());
    if (r.error) return send(res, 400, { error: r.error });
    if (db.stations.length >= 500) return send(res, 400, { error: "Llegaste al máximo de 500 emisoras." });
    db.stations.push(r.station); persist();
    return send(res, 201, { station: r.station, updated: db.updated });
  }

  if (p === "/api/import" && m === "POST"){
    const b = await readBody(req, 25e6);
    const arr = Array.isArray(b) ? b : b.stations;
    if (!Array.isArray(arr) || !arr.length || arr.length > 500) return send(res, 400, { error: "El archivo no tiene emisoras válidas." });
    const out = [], seen = new Set();
    for (const raw of arr){
      let id = cleanId(raw && raw.id); if (!id || seen.has(id)) id = newId();
      const r = cleanStation(raw, id);
      if (r.station){ seen.add(id); out.push(r.station); }
    }
    if (!out.length) return send(res, 400, { error: "El archivo no tiene emisoras válidas." });
    db.stations = out; persist();
    return send(res, 200, { stations: db.stations, updated: db.updated });
  }

  const one = p.match(/^\/api\/stations\/([A-Za-z0-9_-]{1,40})$/);
  if (one){
    const i = db.stations.findIndex(s => s.id === one[1]);
    if (i < 0) return send(res, 404, { error: "Esa emisora ya no existe." });
    if (m === "PUT"){
      const r = cleanStation(await readBody(req, 1e6), one[1]);
      if (r.error) return send(res, 400, { error: r.error });
      db.stations[i] = r.station; persist();
      return send(res, 200, { station: r.station, updated: db.updated });
    }
    if (m === "DELETE"){
      db.stations.splice(i, 1); persist();
      return send(res, 200, { ok: true, updated: db.updated });
    }
  }
  return send(res, 404, { error: "No encontrado." });
}

function serveStatic(req, res, url){
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)){ res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err){ res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("No encontrado"); }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": (ext === ".html" || ext === ".webmanifest" || path.basename(file) === "sw.js") ? "no-cache" : "public, max-age=86400" });
    res.end(req.method === "HEAD" ? undefined : data);
  });
}

const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src https://fonts.gstatic.com; img-src 'self' data: https: http:; media-src *; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'";

const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", CSP);
  try{
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (req.method !== "GET" && req.method !== "HEAD"){ res.writeHead(405); return res.end(); }
    return serveStatic(req, res, url);
  }catch(e){
    if (res.headersSent) return res.end();
    send(res, e.code === 413 ? 413 : e.code === 400 ? 400 : 500, { error: e.code === 413 ? "El archivo es demasiado grande." : e.code === 400 ? "Datos inválidos." : "Error del servidor." });
    if (!e.code) console.error(e);
  }
});

loadDb();
server.listen(PORT, () => console.log("El Sonlatino Colombia escuchando en el puerto " + PORT + " · datos en " + DATA_FILE));
