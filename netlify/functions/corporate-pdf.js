/**
 * Anchoria Securities — Corporate Application PDF View
 * Returns a print-ready HTML page with all form data + embedded documents.
 * Usage: /.netlify/functions/corporate-pdf?ref=CASL-XXXXX
 */

const { getStore } = require("@netlify/blobs");

const AIRTABLE_TABLE = "Corporate Applications";

// Document keys and labels for corporate form
const DOC_DEFS = [
  { key: "cac",        label: "CAC Certificate of Incorporation" },
  { key: "memart",     label: "MEMART" },
  { key: "resolution", label: "Board Resolution / Mandate Letter" },
  { key: "address",    label: "Utility Bill / Tenancy Agreement" },
  { key: "id1",        label: "Director 1 – Government Issued ID" },
  { key: "id2",        label: "Director 2 – Government Issued ID" },
  { key: "signature",  label: "Authorised Signatory Signature" },
];

exports.handler = async (event) => {
  const { ref } = event.queryStringParameters || {};
  if (!ref) return { statusCode: 400, body: "Missing ref parameter" };

  const AIRTABLE_TOKEN   = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const SITE_ID          = process.env.NETLIFY_SITE_ID || "6527e150-8acb-473f-a3a2-84f159b37389";
  const BLOB_TOKEN       = process.env.NETLIFY_TOKEN   || process.env.NETLIFY_BLOBS_TOKEN;

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    return { statusCode: 500, body: "Server misconfiguration" };
  }

  // Fetch record from Airtable
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE)}?filterByFormula=${encodeURIComponent(`{Reference}="${ref}"`)}`;
  let record;
  try {
    const res  = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
    const data = await res.json();
    if (data.error) return { statusCode: 502, body: `Airtable error: ${data.error.message}` };
    if (!data.records || data.records.length === 0)
      return { statusCode: 404, body: `Application not found for reference: ${ref}` };
    record = data.records[0].fields;
  } catch (err) {
    return { statusCode: 500, body: `Failed to fetch application: ${err.message}` };
  }

  // Fetch all documents from Blobs and embed as base64 data URIs
  const embeddedDocs = [];
  if (SITE_ID && BLOB_TOKEN) {
    const store = getStore({ name: "documents", siteID: SITE_ID, token: BLOB_TOKEN });
    for (const def of DOC_DEFS) {
      try {
        const result = await store.getWithMetadata(`${ref}/${def.key}`, { type: "arrayBuffer" });
        if (result) {
          const mime    = result.metadata.mimeType || "application/octet-stream";
          const b64     = Buffer.from(result.data).toString("base64");
          const dataUri = `data:${mime};base64,${b64}`;
          embeddedDocs.push({ key: def.key, label: def.label, mime, dataUri, fileName: result.metadata.name || def.key });
        }
      } catch (_) { /* doc not uploaded — skip */ }
    }
  }

  const f   = (v) => (v != null && v !== "" ? String(v) : "—");
  const esc = (s) => String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  function renderDoc(doc) {
    const isImage = doc.mime.startsWith("image/");
    const isPdf   = doc.mime === "application/pdf";
    const dlBtn   = `<a href="${doc.dataUri}" download="${esc(doc.fileName)}" class="dl-btn">⬇ Download ${esc(doc.label)}</a>`;
    if (doc.key === "signature") {
      return `<div class="doc-block">
        <div class="doc-label">${esc(doc.label)}</div>
        <img src="${doc.dataUri}" alt="${esc(doc.label)}" class="sig-img"/>
        ${dlBtn}
      </div>`;
    }
    if (isImage) {
      return `<div class="doc-block">
        <div class="doc-label">${esc(doc.label)}</div>
        <img src="${doc.dataUri}" alt="${esc(doc.label)}" class="doc-img"/>
        ${dlBtn}
      </div>`;
    }
    if (isPdf) {
      return `<div class="doc-block">
        <div class="doc-label">${esc(doc.label)}</div>
        <object data="${doc.dataUri}" type="application/pdf" class="pdf-embed">
          <p>PDF cannot be displayed inline. ${dlBtn}</p>
        </object>
        ${dlBtn}
      </div>`;
    }
    return `<div class="doc-block">
      <div class="doc-label">${esc(doc.label)}</div>
      ${dlBtn}
    </div>`;
  }

  const docsHtml = embeddedDocs.length
    ? embeddedDocs.map(renderDoc).join("\n")
    : `<p style="color:#6B655A;font-size:12px">No documents on file.</p>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Corporate Application — ${esc(f(record["Reference"]))}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Georgia,"Times New Roman",serif;font-size:12px;color:#1C1A17;background:#fff;padding:20px}
  .page{max-width:800px;margin:0 auto}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #C2972B;padding-bottom:12px;margin-bottom:20px}
  .logo-text{font-size:18px;font-weight:bold;color:#C2972B;letter-spacing:1px}
  .logo-sub{font-size:10px;color:#6B655A;margin-top:2px}
  .ref{text-align:right;font-size:11px;color:#6B655A}
  .ref strong{display:block;font-size:14px;color:#1C1A17}
  h2{font-size:13px;color:#C2972B;border-bottom:1px solid #E7E4DB;padding-bottom:4px;margin:18px 0 10px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 20px}
  .field{padding:4px 0;border-bottom:1px dotted #E7E4DB}
  .field label{display:block;font-size:10px;color:#6B655A;text-transform:uppercase;letter-spacing:.5px;margin-bottom:1px}
  .field span{font-size:12px;color:#1C1A17;white-space:pre-line}
  .full{grid-column:1/-1}
  .status{display:inline-block;padding:2px 10px;background:#F7EFD6;color:#A47E1E;border-radius:20px;font-size:11px;font-weight:bold}
  .footer{margin-top:24px;border-top:1px solid #E7E4DB;padding-top:10px;font-size:10px;color:#6B655A;text-align:center}
  .print-btn{position:fixed;top:16px;right:16px;background:#C2972B;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit;z-index:100}
  .doc-block{margin:10px 0;padding:10px;border:1px solid #E7E4DB;border-radius:6px;background:#FAFAF8;page-break-inside:avoid}
  .doc-label{font-size:10px;color:#6B655A;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;font-weight:bold}
  .sig-img{max-width:300px;max-height:120px;border:1px solid #E7E4DB;border-radius:4px;display:block;background:#fff}
  .doc-img{max-width:100%;max-height:400px;border:1px solid #E7E4DB;border-radius:4px;display:block}
  .pdf-embed{width:100%;height:500px;border:1px solid #E7E4DB;border-radius:4px;display:block;margin-bottom:6px}
  .dl-btn{display:inline-block;margin-top:6px;padding:4px 12px;background:#C2972B;color:#fff;text-decoration:none;border-radius:4px;font-size:11px;font-family:Georgia,serif}
  .dl-btn:hover{background:#a57e20}
  @media print{
    .print-btn{display:none}
    body{padding:10px}
    .pdf-embed{height:700px}
    .dl-btn{display:none}
  }
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">Print / Save PDF</button>
<div class="page">
  <div class="header">
    <div>
      <div class="logo-text">ANCHORIA SECURITIES</div>
      <div class="logo-sub">Corporate Account Opening Application</div>
    </div>
    <div class="ref">
      <strong>${esc(f(record["Reference"]))}</strong>
      <div class="status">${esc(f(record["Status"]))}</div>
    </div>
  </div>

  <h2>Entity Details</h2>
  <div class="grid">
    <div class="field"><label>Entity Type</label><span>${esc(f(record["Entity Type"]))}</span></div>
    <div class="field"><label>Company Name</label><span>${esc(f(record["Company Name"]))}</span></div>
    <div class="field"><label>RC Number</label><span>${esc(f(record["RC Number"]))}</span></div>
    <div class="field"><label>Tax ID (TIN)</label><span>${esc(f(record["Tax ID (TIN)"]))}</span></div>
    <div class="field"><label>Date of Incorporation</label><span>${esc(f(record["Date of Incorporation"]))}</span></div>
    <div class="field"><label>Nature of Business</label><span>${esc(f(record["Nature of Business"]))}</span></div>
    <div class="field full"><label>Registered Address</label><span>${esc(f(record["Registered Address"]))}</span></div>
    <div class="field full"><label>Operating Address</label><span>${esc(f(record["Operating Address"]))}</span></div>
    <div class="field"><label>Email</label><span>${esc(f(record["Email"]))}</span></div>
    <div class="field"><label>Phone</label><span>${esc(f(record["Phone"]))}</span></div>
    <div class="field"><label>Website</label><span>${esc(f(record["Website"]))}</span></div>
  </div>

  <h2>Directors / Partners</h2>
  <div class="grid">
    <div class="field full"><span>${esc(f(record["Directors"]))}</span></div>
  </div>

  <h2>Authorised Signatories</h2>
  <div class="grid">
    <div class="field full"><span>${esc(f(record["Authorized Signatories"]))}</span></div>
  </div>

  <h2>Financial Information</h2>
  <div class="grid">
    <div class="field"><label>Bank Name</label><span>${esc(f(record["Bank Name"]))}</span></div>
    <div class="field"><label>Bank Branch</label><span>${esc(f(record["Bank Branch"]))}</span></div>
    <div class="field"><label>Account Number</label><span>${esc(f(record["Bank Account Number"]))}</span></div>
    <div class="field"><label>Account Name</label><span>${esc(f(record["Bank Account Name"]))}</span></div>
    <div class="field"><label>DCS / Settlement</label><span>${esc(f(record["DCS / Settlement"]))}</span></div>
    <div class="field"><label>Annual Turnover</label><span>${esc(f(record["Annual Turnover"]))}</span></div>
    <div class="field"><label>Source of Funds</label><span>${esc(f(record["Source of Funds"]))}</span></div>
    <div class="field"><label>Investment Options</label><span>${esc(f(record["Investment Options"]))}</span></div>
    <div class="field full"><label>Source Details</label><span>${esc(f(record["Source of Funds Details"]))}</span></div>
    <div class="field"><label>Referral Source</label><span>${esc(f(record["Referral Source"]))}</span></div>
  </div>

  <h2>Declarations & Signature</h2>
  <div class="grid">
    <div class="field"><label>Signatory Name</label><span>${esc(f(record["Signatory Name"]))}</span></div>
    <div class="field"><label>Signature Date</label><span>${esc(f(record["Signature Date"]))}</span></div>
  </div>

  <h2>Documents</h2>
  ${docsHtml}

  <div class="footer">
    Anchoria Securities Limited &nbsp;·&nbsp; SEC-Licensed Stockbroker &nbsp;·&nbsp; Generated ${new Date().toLocaleDateString("en-GB", {day:"2-digit",month:"long",year:"numeric"})}
  </div>
</div>
</body>
</html>`;

  return { statusCode: 200, headers: { "Content-Type": "text/html; charset=utf-8" }, body: html };
};
