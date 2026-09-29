/**
 * Staff auth for the admin dashboard.
 * - Staff accounts live in Blobs store "staff" (key = lowercase email).
 * - Passwords: scrypt. Sessions: HMAC-signed cookie (12h), no server state.
 * - Bootstrap: ADMIN_EMAIL + ADMIN_PASSWORD env vars act as a built-in admin,
 *   so the first login works before any staff account exists.
 * Env: SESSION_SECRET (falls back to SHARED_SECRET), ADMIN_EMAIL, ADMIN_PASSWORD
 */
const crypto = require("crypto");
const { getStore } = require("@netlify/blobs");

const COOKIE = "anchoria_admin";
const TTL_MS = 12 * 60 * 60 * 1000;

const SITE_ID    = () => process.env.NETLIFY_SITE_ID || "eba96b4a-432f-4acb-932b-4fe80c961281";
const BLOB_TOKEN = () => process.env.NETLIFY_TOKEN   || process.env.NETLIFY_BLOBS_TOKEN;
const staffStore = () => getStore({ name: "staff", siteID: SITE_ID(), token: BLOB_TOKEN() });
const secret     = () => process.env.SESSION_SECRET || process.env.SHARED_SECRET || "";

const b64 = (b) => Buffer.from(b).toString("base64url");
const hmac = (s) => crypto.createHmac("sha256", secret()).update(s).digest("base64url");
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString("hex")}`;
}
function checkPassword(pw, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  return safeEq(crypto.scryptSync(pw, salt, 64).toString("hex"), hash);
}

/** Returns { email, name, role } on success, else null. */
async function verifyLogin(email, password) {
  email = String(email || "").trim().toLowerCase();
  password = String(password || "");
  if (!email || !password) return null;
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (ADMIN_EMAIL && ADMIN_PASSWORD && email === ADMIN_EMAIL.toLowerCase() && safeEq(password, ADMIN_PASSWORD)) {
    return { email, name: "Administrator", role: "admin" };
  }
  try {
    const u = await staffStore().get(email, { type: "json" });
    if (u && !u.disabled && checkPassword(password, u.hash)) return { email, name: u.name || email, role: u.role || "staff" };
  } catch (err) { console.error("staff lookup failed:", err.message); }
  return null;
}

function sessionCookie(user) {
  const body = b64(JSON.stringify({ ...user, exp: Date.now() + TTL_MS }));
  return `${COOKIE}=${body}.${hmac(body)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${TTL_MS / 1000}`;
}
const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

/** Reads the session cookie. Returns the user or null. */
function getUser(event) {
  if (!secret()) return null;
  const m = String((event.headers || {}).cookie || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [body, sig] = m[1].split(".");
  if (!body || !sig || !safeEq(sig, hmac(body))) return null;
  try {
    const u = JSON.parse(Buffer.from(body, "base64url").toString());
    return u.exp > Date.now() ? { email: u.email, name: u.name, role: u.role } : null;
  } catch { return null; }
}

module.exports = { staffStore, hashPassword, verifyLogin, sessionCookie, clearCookie, getUser };
