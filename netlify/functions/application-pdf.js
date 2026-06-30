/**
 * Anchoria Securities — Individual Application PDF View
 * Returns a print-ready HTML page with all form data + embedded documents.
 * Usage: /.netlify/functions/application-pdf?ref=ASL-XXXXX
 */

const { getStore } = require("@netlify/blobs");

const AIRTABLE_TABLE = "Applications";

// Document keys and labels for individual form
const DOC_DEFS = [
  { key: "passportPhoto",   label: "Passport Photograph" },
  { key: "validId",         label: "Government-Issued ID" },
  { key: "proofOfAddress",  label: "Proof of Address" },
  { key: "residencePermit", label: "Residence Permit" },
  { key: "signature",       label: "Signature" },
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

  const f = (v) => (v != null && v !== "" ? String(v) : "—");
  const esc = (s) => String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  function renderDoc(doc) {
    const isImage = doc.mime.startsWith("image/");
    const isPdf   = doc.mime === "application/pdf";
    const dlBtn   = `<a href="${doc.dataUri}" download="${esc(doc.fileName)}" class="dl-btn">⬇ Download ${esc(doc.label)}</a>`;
    if (doc.key === "signature" || (isImage && doc.key === "passportPhoto")) {
      return `<div class="doc-block">
        <div class="doc-label">${esc(doc.label)}</div>
        <img src="${doc.dataUri}" alt="${esc(doc.label)}" class="${doc.key === "signature" ? "sig-img" : "passport-img"}"/>
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
<title>Application — ${esc(f(record["Reference"]))}</title>
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
  .field span{font-size:12px;color:#1C1A17}
  .full{grid-column:1/-1}
  .status{display:inline-block;padding:2px 10px;background:#F7EFD6;color:#A47E1E;border-radius:20px;font-size:11px;font-weight:bold}
  .footer{margin-top:24px;border-top:1px solid #E7E4DB;padding-top:10px;font-size:10px;color:#6B655A;text-align:center}
  .print-btn{position:fixed;top:16px;right:16px;background:#C2972B;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit;z-index:100}
  .doc-block{margin:10px 0;padding:10px;border:1px solid #E7E4DB;border-radius:6px;background:#FAFAF8;page-break-inside:avoid}
  .doc-label{font-size:10px;color:#6B655A;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;font-weight:bold}
  .passport-img{max-width:160px;max-height:200px;border:1px solid #E7E4DB;border-radius:4px;display:block}
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
      <div class="logo-sub">Individual Account Opening Application</div>
    </div>
    <div class="ref">
      <strong>${esc(f(record["Reference"]))}</strong>
      <div>${esc(f(record["Submission Date"] || ""))}</div>
      <div class="status">${esc(f(record["Status"]))}</div>
    </div>
  </div>

  <h2>Personal Details</h2>
  <div class="grid">
    <div class="field"><label>Surname</label><span>${esc(f(record["Surname"]))}</span></div>
    <div class="field"><label>First Name</label><span>${esc(f(record["First Name"]))}</span></div>
    <div class="field"><label>Middle Name</label><span>${esc(f(record["Middle Name"]))}</span></div>
    <div class="field"><label>Title</label><span>${esc(f(record["Title"]))}</span></div>
    <div class="field"><label>Sex</label><span>${esc(f(record["Sex"]))}</span></div>
    <div class="field"><label>Date of Birth</label><span>${esc(f(record["Date of Birth"]))}</span></div>
    <div class="field"><label>Nationality</label><span>${esc(f(record["Nationality"]))}</span></div>
    <div class="field"><label>Marital Status</label><span>${esc(f(record["Marital Status"]))}</span></div>
    <div class="field"><label>State of Origin</label><span>${esc(f(record["State of Origin"]))}</span></div>
    <div class="field"><label>LGA</label><span>${esc(f(record["LGA"]))}</span></div>
    <div class="field"><label>Mother's Maiden Name</label><span>${esc(f(record["Mother's Maiden Name"]))}</span></div>
    <div class="field"><label>BVN</label><span>${esc(f(record["BVN"]))}</span></div>
    <div class="field"><label>NIN</label><span>${esc(f(record["NIN"]))}</span></div>
    <div class="field"><label>Tax ID (TIN)</label><span>${esc(f(record["Tax ID (TIN)"]))}</span></div>
  </div>

  <h2>Contact Details</h2>
  <div class="grid">
    <div class="field full"><label>Residential Address</label><span>${esc(f(record["Residential Address"]))}</span></div>
    <div class="field full"><label>Mailing Address</label><span>${esc(f(record["Mailing Address"]))}</span></div>
    <div class="field"><label>Email</label><span>${esc(f(record["Email"]))}</span></div>
    <div class="field"><label>Mobile</label><span>${esc(f(record["Mobile"]))}</span></div>
    <div class="field"><label>Mobile 2</label><span>${esc(f(record["Mobile 2"]))}</span></div>
  </div>

  <h2>Next of Kin</h2>
  <div class="grid">
    <div class="field"><label>Name</label><span>${esc(f(record["Next of Kin Name"]))}</span></div>
    <div class="field"><label>Relationship</label><span>${esc(f(record["Next of Kin Relationship"]))}</span></div>
    <div class="field"><label>Email</label><span>${esc(f(record["Next of Kin Email"]))}</span></div>
    <div class="field"><label>Phone</label><span>${esc(f(record["Next of Kin Phone"]))}</span></div>
    <div class="field full"><label>Address</label><span>${esc(f(record["Next of Kin Address"]))}</span></div>
  </div>

  <h2>Identification</h2>
  <div class="grid">
    <div class="field"><label>ID Type</label><span>${esc(f(record["ID Type"]))}</span></div>
    <div class="field"><label>ID Number</label><span>${esc(f(record["ID Number"]))}</span></div>
    <div class="field"><label>Issue Date</label><span>${esc(f(record["ID Issue Date"]))}</span></div>
    <div class="field"><label>Expiry Date</label><span>${esc(f(record["ID Expiry Date"]))}</span></div>
  </div>

  <h2>Employment & Financial Information</h2>
  <div class="grid">
    <div class="field"><label>Occupation</label><span>${esc(f(record["Occupation"]))}</span></div>
    <div class="field"><label>Nature of Business</label><span>${esc(f(record["Nature of Business"]))}</span></div>
    <div class="field"><label>Employer</label><span>${esc(f(record["Employer"]))}</span></div>
    <div class="field"><label>Annual Income</label><span>${esc(f(record["Annual Income"]))}</span></div>
    <div class="field"><label>Bank Name</label><span>${esc(f(record["Bank Name"]))}</span></div>
    <div class="field"><label>Bank Branch</label><span>${esc(f(record["Bank Branch"]))}</span></div>
    <div class="field"><label>Account Number</label><span>${esc(f(record["Bank Account Number"]))}</span></div>
    <div class="field"><label>Account Name</label><span>${esc(f(record["Bank Account Name"]))}</span></div>
    <div class="field"><label>DCS Settlement</label><span>${esc(f(record["DCS (Settlement)"]))}</span></div>
    <div class="field"><label>Source of Funds</label><span>${esc(f(record["Source of Funds"]))}</span></div>
    <div class="field"><label>Country of Funds</label><span>${esc(f(record["Country of Funds"]))}</span></div>
    <div class="field full"><label>Source Details</label><span>${esc(f(record["Source of Funds Details"]))}</span></div>
    <div class="field"><label>CSCS Number</label><span>${esc(f(record["CSCS Number"]))}</span></div>
    <div class="field"><label>CHN</label><span>${esc(f(record["CHN"]))}</span></div>
    <div class="field"><label>Investor Category</label><span>${esc(f(record["Investor Category"]))}</span></div>
    <div class="field"><label>Investment Option</label><span>${esc(f(record["Investment Option"]))}</span></div>
    <div class="field full"><label>Products Selected</label><span>${esc(f(record["Products Selected"]))}</span></div>
    <div class="field"><label>Referral Source</label><span>${esc(f(record["Referral Source"]))}</span></div>
  </div>

  <h2>PEP Declaration</h2>
  <div class="grid">
    <div class="field"><label>Politically Exposed Person</label><span>${esc(f(record["PEP"]))}</span></div>
    <div class="field full"><label>PEP Details</label><span>${esc(f(record["PEP Details"]))}</span></div>
  </div>

  <h2>Declarations</h2>
  <div class="grid">
    <div class="field"><label>True Information</label><span>${record["Declaration: True Info"] ? "✓ Agreed" : "—"}</span></div>
    <div class="field"><label>Terms & Conditions</label><span>${record["Declaration: Terms"] ? "✓ Agreed" : "—"}</span></div>
    <div class="field"><label>Indemnity</label><span>${record["Declaration: Indemnity"] ? "✓ Agreed" : "—"}</span></div>
    <div class="field"><label>Risk Disclosure</label><span>${record["Declaration: Risk"] ? "✓ Agreed" : "—"}</span></div>
    <div class="field"><label>Privacy Policy</label><span>${record["Declaration: Privacy"] ? "✓ Agreed" : "—"}</span></div>
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
