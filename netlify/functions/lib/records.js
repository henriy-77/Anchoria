/**
 * Durable application storage.
 *
 * Netlify Blobs is the source of truth; Airtable is a best-effort mirror.
 * A submission is accepted as soon as it is safely in Blobs, so an Airtable
 * outage or plan-limit (HTTP 429) never loses an application. Records that
 * didn't reach Airtable stay flagged "pending" until sync-airtable replays them.
 */
const { getStore } = require("@netlify/blobs");

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
 * Save to Blobs first, then attempt Airtable. Returns { saved, airtable }.
 * `saved` is false only when the record could not be stored anywhere.
 */
async function saveApplication(kind, table, ref, fields) {
  const key = `${kind}/${ref}`;
  try { if (await store().get(key, { type: "json" })) return { saved: false, exists: true }; } catch (err) { console.error("existence check failed:", err.message); }
  const record = { kind, table, ref, fields, savedAt: new Date().toISOString(), airtable: "pending", airtableId: null, lastError: null };

  let blobOk = true;
  try {
    await store().setJSON(key, record);
  } catch (err) {
    blobOk = false;
    console.error("Blob save failed:", err.message);
  }

  const at = await pushToAirtable(table, fields);
  if (at.ok) {
    record.airtable = "synced";
    record.airtableId = at.id;
  } else {
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

module.exports = { store, saveApplication, loadFields, pushToAirtable };
