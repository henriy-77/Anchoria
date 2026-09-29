/**
 * Admin dashboard API. Route with ?action=…  All actions except login require a staff session.
 *   login (POST), logout (POST), me, list, get, update (POST), export (CSV),
 *   users, user-save (POST), user-delete (POST)   ← last three: admin role only
 */
const { store } = require("./lib/records");
const { staffStore, hashPassword, checkPassword, verifyLogin, sessionCookie, clearCookie, getUser, lockedFor, recordFailure, clearFailures, tkey } = require("./lib/auth");
const { clientIp } = require("./lib/guard");
const { logAccess, readLog } = require("./lib/audit");

const STATUSES = ["New", "In review", "Approved", "Rejected"];
const KINDS    = ["corporate", "joint", "minor"];

exports.handler = async (event) => {
  const action = (event.queryStringParameters || {}).action || "";
  const q = event.queryStringParameters || {};
  let body = {};
  if (event.httpMethod === "POST") { try { body = JSON.parse(event.body || "{}"); } catch { return out(400, { error: "Invalid JSON" }); } }

  if (action === "login") {
    if (event.httpMethod !== "POST") return out(405, { error: "POST only" });
    const email = String(body.email || "").trim().toLowerCase();
    const keys  = [tkey("email", email), tkey("ip", clientIp(event))];
    const wait  = await lockedFor(keys);
    if (wait) return out(429, { error: `Too many attempts. Try again in ${Math.ceil(wait / 60000)} minute(s).` });
    await new Promise((r) => setTimeout(r, 400)); // slow down password guessing
    const user = await verifyLogin(email, body.password);
    if (!user) { await recordFailure(keys); await logAccess(event, null, "login_failed", { email }); return out(401, { error: "Incorrect email or password" }); }
    await clearFailures(keys);
    await logAccess(event, user, "login");
    const { builtin, ...pub } = user;
    return out(200, { user: pub }, { "Set-Cookie": sessionCookie(user) });
  }
  if (action === "logout") { await logAccess(event, await getUser(event), "logout"); return out(200, { ok: true }, { "Set-Cookie": clearCookie() }); }

  const user = await getUser(event);
  if (!user) return out(401, { error: "Not signed in" });
  if (action === "me") return out(200, { user });

  const s = store();

  if (action === "list") {
    const { blobs } = await s.list();
    const rows = [];
    for (const b of blobs) {
      const r = await s.get(b.key, { type: "json" });
      if (r) rows.push(summary(r));
    }
    rows.sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
    return out(200, { rows, statuses: STATUSES });
  }

  if (action === "get") {
    const r = await loadRec(s, q.kind, q.ref);
    if (!r) return out(404, { error: "Not found" });
    await logAccess(event, user, "view_application", { kind: r.kind, ref: r.ref });
    return out(200, { record: r });
  }

  if (action === "update") {
    const r = await loadRec(s, body.kind, body.ref);
    if (!r) return out(404, { error: "Not found" });
    const now = new Date().toISOString();
    r.audit = r.audit || [];
    if (body.status && body.status !== status(r)) {
      if (!STATUSES.includes(body.status)) return out(400, { error: "Invalid status" });
      r.audit.push({ at: now, by: user.email, change: `Status: ${status(r)} → ${body.status}` });
      r.fields.Status = body.status;
    }
    if (typeof body.notes === "string" && body.notes !== (r.fields.Notes || "")) {
      r.audit.push({ at: now, by: user.email, change: "Notes updated" });
      r.fields.Notes = body.notes;
    }
    await s.setJSON(`${r.kind}/${r.ref}`, r);
    const changes = r.audit.filter((a) => a.at === now).map((a) => a.change).join("; ");
    if (changes) await logAccess(event, user, "update_application", { kind: r.kind, ref: r.ref, detail: changes });
    return out(200, { record: r });
  }

  if (action === "export") {
    await logAccess(event, user, "export_csv", { detail: KINDS.includes(q.kind) ? q.kind : "all" });
    const { blobs } = await s.list();
    const recs = [];
    for (const b of blobs) { const r = await s.get(b.key, { type: "json" }); if (r) recs.push(r); }
    const kind = KINDS.includes(q.kind) ? q.kind : null;
    const list = recs.filter((r) => !kind || r.kind === kind).sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
    const cols = ["Type", "Saved At", ...Array.from(new Set(list.flatMap((r) => Object.keys(r.fields || {}))))];
    const esc = (v) => { let t = String(v == null ? "" : v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; };
    const lines = [cols.map(esc).join(",")].concat(list.map((r) => cols.map((c) => esc(c === "Type" ? r.kind : c === "Saved At" ? r.savedAt : r.fields[c])).join(",")));
    return { statusCode: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="applications${kind ? "-" + kind : ""}.csv"`, "Cache-Control": "no-store" }, body: "﻿" + lines.join("\n") };
  }

  if (action === "change-password") {
    const np = String(body.newPassword || "");
    if (np.length < 10) return out(400, { error: "New password must be at least 10 characters" });
    const ss = staffStore();
    const rec = await ss.get(user.email, { type: "json" }).catch(() => null);
    if (!rec) return out(400, { error: "This built-in admin password is set in Netlify (ADMIN_PASSWORD), not here." });
    if (!checkPassword(String(body.currentPassword || ""), rec.hash)) return out(401, { error: "Current password is incorrect" });
    rec.hash = hashPassword(np);
    await ss.setJSON(user.email, rec);
    await logAccess(event, user, "password_change");
    return out(200, { ok: true });
  }

  /* ── Staff management (admin only) ── */
  if (["users", "user-save", "user-delete"].includes(action)) {
    if (user.role !== "admin") return out(403, { error: "Admins only" });
    const ss = staffStore();
    if (action === "users") {
      const { blobs } = await ss.list();
      const users = [];
      for (const b of blobs) { const u = await ss.get(b.key, { type: "json" }); if (u) users.push({ email: b.key, name: u.name, role: u.role, disabled: !!u.disabled }); }
      return out(200, { users });
    }
    const email = String(body.email || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return out(400, { error: "Valid email required" });
    if (action === "user-delete") { await ss.delete(email); await logAccess(event, user, "staff_removed", { detail: email }); return out(200, { ok: true }); }
    const existing = await ss.get(email, { type: "json" }).catch(() => null);
    if (!existing && String(body.password || "").length < 10) return out(400, { error: "Password must be at least 10 characters" });
    if (body.password && String(body.password).length < 10) return out(400, { error: "Password must be at least 10 characters" });
    await ss.setJSON(email, {
      name: body.name || (existing && existing.name) || email,
      role: body.role === "admin" ? "admin" : "staff",
      disabled: !!body.disabled,
      hash: body.password ? hashPassword(String(body.password)) : existing.hash,
    });
    await logAccess(event, user, existing ? "staff_updated" : "staff_created", { detail: `${email} (${body.role === "admin" ? "admin" : "staff"})` });
    return out(200, { ok: true });
  }

  if (action === "activity") {
    if (user.role !== "admin") return out(403, { error: "Admins only" });
    const ref = String(q.ref || "");
    const prefix = ref ? (/^[\w-]+$/.test(ref) ? `by-ref/${ref}/` : null) : "all/";
    if (!prefix) return out(400, { error: "Invalid ref" });
    return out(200, { entries: await readLog(prefix, ref ? 100 : 400) });
  }

  return out(400, { error: "Unknown action" });
};

const status = (r) => (r.fields && r.fields.Status) || "New";

async function loadRec(s, kind, ref) {
  if (!KINDS.includes(kind) || !/^[\w-]+$/.test(String(ref || ""))) return null;
  return s.get(`${kind}/${ref}`, { type: "json" });
}

function summary(r) {
  const f = r.fields || {};
  const name = f["Company Name"] ||
    [f["Minor First Name"], f["Minor Surname"]].filter(Boolean).join(" ") ||
    [f["First Name"], f["Surname"]].filter(Boolean).join(" ") || f["Signatory Name"] || "—";
  return { kind: r.kind, ref: r.ref, name, email: f.Email || "", phone: f.Phone || f.Mobile || "", status: status(r), savedAt: r.savedAt, airtable: r.airtable };
}

function out(statusCode, body, headers) {
  return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...(headers || {}) }, body: JSON.stringify(body) };
}
