/**
 * Durable application storage.
 *
 * Netlify Blobs is the source of truth; Airtable is a best-effort mirror.
 * A submission is accepted as soon as it is safely in Blobs, so an Airtable
 * outage or plan-limit (HTTP 429) never loses an application. Records that
 * didn't reach Airtable stay flagged "pending" until sync-airtable replays them.
 */
const { getStore } = require("./blobs");

const SITE_ID    = () => process.env.NETLIFY_SITE_ID || "eba96b4a-432f-4acb-932b-4fe80c961281";
const BLOB_TOKEN = () => process.env.NETLIFY_TOKEN   || process.env.NETLIFY_BLOBS_TOKEN;

const store = () => getStore({ name: "applications", siteID: SITE_ID(), token: BLOB_TOKEN() });

async function pushToAirtable(table, fields) {
  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) return { ok: false, status: 0, detail: "Airtable env vars missing" };
  try {
    const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) return { ok: false, status: res.status, detail: await res.text() };
    return { ok: true, id: (await res.json()).id };
  } catch (err) {
    return { ok: false, status: 0, detail: err.message };
  }
}

/**
 * Save to Blobs first, then attempt Airtable (skipped when opts.airtable === false). Returns { saved, airtable }.
 * `saved` is false only when the record could not be stored anywhere.
 */
async function saveApplication(kind, table, ref, fields, opts = {}) {
  const key = `${kind}/${ref}`;
  // No Airtable credentials (e.g. self-hosted without Airtable) behaves like a Blobs-only kind.
  if (!process.env.AIRTABLE_TOKEN || !process.env.AIRTABLE_BASE_ID) opts = { ...opts, airtable: false };
  try { if (await store().get(key, { type: "json" })) return { saved: false, exists: true }; } catch (err) { console.error("existence check failed:", err.message); }
  const record = { kind, table, ref, fields, savedAt: new Date().toISOString(), airtable: opts.airtable === false ? "disabled" : "pending", airtableId: null, lastError: null };

  let blobOk = true;
  try {
    await store().setJSON(key, record);
  } catch (err) {
    blobOk = false;
    console.error("Blob save failed:", err.message);
  }

  // Blobs-only kinds (airtable: false) never touch Airtable and are not replayed later.
  const at = opts.airtable === false ? { ok: false, skipped: true } : await pushToAirtable(table, fields);
  if (at.ok) {
    record.airtable = "synced";
    record.airtableId = at.id;
  } else if (!at.skipped) {
    record.lastError = `${at.status}: ${String(at.detail).slice(0, 500)}`;
    console.error(`Airtable write failed for ${ref} (${at.status}) — ${blobOk ? "kept in Blobs for later sync" : "NOT STORED"}:`, at.detail);
  }
  if (blobOk) {
    try { await store().setJSON(key, record); } catch (err) { console.error("Blob status update failed:", err.message); }
  }
  return { saved: blobOk || at.ok, airtable: record.airtable, airtableId: record.airtableId, detail: at.detail };
}

/** Field map for a saved application: Blobs first (no Airtable call), Airtable as fallback. */
async function loadFields(kind, table, ref) {
  try {
    const rec = await store().get(`${kind}/${ref}`, { type: "json" });
    if (rec && rec.fields) return { fields: rec.fields };
  } catch (err) {
    console.error("Blob read failed:", err.message);
  }
  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) return { error: { status: 500, body: "Server misconfiguration" } };
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}?filterByFormula=${encodeURIComponent(`{Reference}="${ref}"`)}`;
  try {
    const res  = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
    const data = await res.json();
    if (data.error) return { error: { status: 502, body: `Airtable error: ${data.error.message || data.error}` } };
    if (!data.records || !data.records.length) return { error: { status: 404, body: `Application not found for reference: ${ref}` } };
    return { fields: data.records[0].fields };
  } catch (err) {
    return { error: { status: 500, body: `Failed to fetch application: ${err.message}` } };
  }
}

const TABLES = { corporate: "Corporate Applications", joint: "Joint Applications", minor: "Minor Applications", individual: "Applications" };

/** Airtable values → plain field values the admin can show (arrays joined, objects dropped, blanks removed). */
function cleanFields(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw || {})) {
    let val = v;
    if (Array.isArray(val)) val = val.every((x) => typeof x === "string") ? val.join(", ") : "";
    else if (val && typeof val === "object") val = val.name || "";
    if (val === "" || val == null) continue;
    out[String(k).slice(0, 80)] = typeof val === "string" ? val.slice(0, 20000) : val;
  }
  return out;
}

/**
 * Bring existing applications (from Airtable) into Blobs.
 * rows: [{ id?, createdTime?, fields }]. Existing references are never overwritten.
 */
async function importRecords(kind, rows, { REF_RE }) {
  const table = TABLES[kind];
  const res = { imported: 0, skipped: 0, invalid: 0 };
  const st = store();
  for (const row of rows) {
    const fields = cleanFields(row.fields);
    const ref = String(fields.Reference || "").trim();
    if (!REF_RE.test(ref)) { res.invalid++; continue; }
    try {
      if (await st.get(`${kind}/${ref}`, { type: "json" })) { res.skipped++; continue; }
      const when = Date.parse(row.createdTime || fields["Submitted At"] || "");
      await st.setJSON(`${kind}/${ref}`, {
        kind, table, ref, fields,
        savedAt: new Date(isNaN(when) ? Date.now() : when).toISOString(),
        airtable: "synced", airtableId: row.id || null, imported: true, lastError: null,
      });
      res.imported++;
    } catch (err) {
      console.error("import failed for", ref, err.message);
      res.invalid++;
    }
  }
  return res;
}

/** Pull every record of a table from Airtable (paginated). Throws with Airtable's message on failure. */
async function fetchAllFromAirtable(table) {
  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) throw new Error("Airtable is not configured on the server");
  const all = []; let offset = "";
  do {
    const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}?pageSize=100${offset ? "&offset=" + encodeURIComponent(offset) : ""}`,
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(res.status === 429 ? "Airtable's monthly API limit is still exhausted. Use the CSV import, or try again after it resets." : (data.error && data.error.message) || `Airtable error ${res.status}`);
      e.status = res.status; throw e;
    }
    (data.records || []).forEach((r) => all.push({ id: r.id, createdTime: r.createdTime, fields: r.fields }));
    offset = data.offset || "";
  } while (offset);
  return all;
}

module.exports = { store, saveApplication, loadFields, pushToAirtable, importRecords, fetchAllFromAirtable, TABLES };
