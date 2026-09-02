/**
 * Anchoria Securities — Joint Application PDF View
 * Print-ready HTML page for a Joint Applications record.
 * Usage: /.netlify/functions/joint-pdf?ref=JOINT-XXXXX
 */

const { getStore } = require("@netlify/blobs");

const AIRTABLE_TABLE = "Joint Applications";

const DOC_DEFS = [
  { key: "passportPhoto",       label: "Primary Holder's Passport Photograph" },
  { key: "validId",             label: "Primary Holder's Valid ID" },
  { key: "proofOfAddress",      label: "Primary Holder's Proof of Address" },
  { key: "residencePermit",     label: "Primary Holder's Residence Permit" },
  { key: "partnerPassportPhoto",label: "Joint Partner's Passport Photograph" },
  { key: "partnerValidId",      label: "Joint Partner's Valid ID" },
  { key: "signature",           label: "Primary Holder's Signature" },
  { key: "partnerSignature",    label: "Joint Partner's Signature" },
];

exports.handler = async (event) => {
  const { ref } = event.queryStringParameters || {};
  if (!ref) return { statusCode: 400, body: "Missing ref parameter" };

  const AIRTABLE_TOKEN   = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const SITE_ID          = process.env.NETLIFY_SITE_ID || "6527e150-8acb-473f-a3a2-84f159b37389";
  const BLOB_TOKEN       = process.env.NETLIFY_TOKEN   || process.env.NETLIFY_BLOBS_TOKEN;
  const SITE_URL         = "https://signup.anchoriaonline.com";

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) return { statusCode: 500, body: "Server misconfiguration" };

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

  const existingDocs = [];
  if (SITE_ID && BLOB_TOKEN) {
    const store = getStore({ name: "documents", siteID: SITE_ID, token: BLOB_TOKEN });
    for (const def of DOC_DEFS) {
      try {
        const meta = await store.getMetadata(`${ref}/${def.key}`);
        if (meta) {
          const mime   = meta.mimeType || "application/octet-stream";
          const docUrl = `${SITE_URL}/.netlify/functions/get-document?ref=${encodeURIComponent(ref)}&doc=${encodeURIComponent(def.key)}`;
          existingDocs.push({ key: def.key, label: def.label, mime, url: docUrl, fileName: meta.name || def.key });
        }
      } catch (_) { /* not uploaded */ }
    }
  }

  const f   = (v) => (v != null && v !== "" ? String(v) : "—");
  const esc = (s) => String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  function renderDoc(doc) {
    const isImage = doc.mime.startsWith("image/");
    const isPdf   = doc.mime === "application/pdf";
    const dlBtn   = `<a href="${doc.url}" download="${esc(doc.fileName)}" class="dl-btn" target="_blank">⬇ Download ${esc(doc.label)}</a>`;
    if (isImage) {
      return `<div class="doc-block"><div class="doc-label">${esc(doc.label)}</div>
        <img src="${doc.url}" alt="${esc(doc.label)}" class="doc-img" crossorigin="anonymous"/>${dlBtn}</div>`;
    }
    if (isPdf) {
      return `<div class="doc-block"><div class="doc-label">${esc(doc.label)}</div>
        <iframe src="${doc.url}" class="pdf-embed" title="${esc(doc.label)}"></iframe>${dlBtn}</div>`;
    }
    return `<div class="doc-block"><div class="doc-label">${esc(doc.label)}</div>${dlBtn}</div>`;
  }

  const primarySigDoc = existingDocs.find(d => d.key === "signature");
  const partnerSigDoc = existingDocs.find(d => d.key === "partnerSignature");
  const otherDocs     = existingDocs.filter(d => d.key !== "signature" && d.key !== "partnerSignature");

  const sigSlot = (doc, name, caption) => `<div class="sig-slot">
      ${doc ? `<img src="${doc.url}" alt="Signature" class="sig-draw" crossorigin="anonymous"/>`
            : `<span class="sig-missing">No signature on file</span>`}
      <div class="sig-caption">${esc(caption)}${name && name !== "—" ? " — " + esc(name) : ""}</div>
    </div>`;

  const sigBlock = `<div class="sig-block">
    ${sigSlot(primarySigDoc, f(record["Signatory Name"]), "Primary Holder's Signature")}
    ${sigSlot(partnerSigDoc, f(record["Partner Signatory Name"]), "Joint Partner's Signature")}
    <div class="sig-details">
      <div class="field"><label>Signature Date</label><span>${esc(f(record["Signature Date"]))}</span></div>
    </div>
  </div>`;

  const docsHtml = otherDocs.length
    ? otherDocs.map(renderDoc).join("\n")
    : `<p style="color:#6B655A;font-size:12px">No documents on file.</p>`;

  const row = (label, val) => `<div class="field"><label>${label}</label><span>${esc(f(val))}</span></div>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Joint Application — ${esc(f(record["Reference"]))}</title>
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
  .doc-img{max-width:100%;max-height:400px;border:1px solid #E7E4DB;border-radius:4px;display:block}
  .pdf-embed{width:100%;height:500px;border:1px solid #E7E4DB;border-radius:4px;display:block;margin-bottom:6px}
  .dl-btn{display:inline-block;margin-top:6px;padding:4px 12px;background:#C2972B;color:#fff;text-decoration:none;border-radius:4px;font-size:11px;font-family:Georgia,serif}
  .sig-block{display:flex;gap:34px;align-items:flex-end;margin:14px 0 4px;flex-wrap:wrap;page-break-inside:avoid}
  .sig-slot{min-width:240px}
  .sig-draw{max-width:240px;max-height:110px;display:block;background:transparent}
  .sig-slot .sig-caption{border-top:1px solid #1C1A17;padding-top:4px;margin-top:2px;font-size:10px;color:#6B655A;text-transform:uppercase;letter-spacing:.5px}
  .sig-missing{display:block;color:#B23A3A;font-size:11px;padding:26px 0 6px}
  .sig-details{flex:1;min-width:160px}
  @media print{.print-btn{display:none}body{padding:10px}.pdf-embed{height:700px}}
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">Print / Save PDF</button>
<div class="page">
  <div class="header">
    <div>
      <div class="logo-text">ANCHORIA SECURITIES</div>
      <div class="logo-sub">Individual/Joint Account Opening Application</div>
    </div>
    <div class="ref">
      <strong>${esc(f(record["Reference"]))}</strong>
      <div class="status">${esc(f(record["Status"]))}</div>
    </div>
  </div>

  <h2>Primary Holder's Details</h2>
  <div class="grid">
    ${row("Surname", record["Surname"])}
    ${row("First Name", record["First Name"])}
    ${row("Middle Name", record["Middle Name"])}
    ${row("Title", record["Title"])}
    ${row("Gender", record["Sex"])}
    ${row("Date of Birth", record["Date of Birth"])}
    ${row("Nationality", record["Nationality"])}
    ${row("Marital Status", record["Marital Status"])}
    ${row("State of Origin", record["State of Origin"])}
    ${row("LGA", record["LGA"])}
    ${row("Mother's Maiden Name", record["Mother's Maiden Name"])}
    ${row("BVN", record["BVN"])}
    ${row("NIN", record["NIN"])}
    ${row("Tax ID", record["Tax ID (TIN)"])}
    ${row("Anchoria Tag", record["Anchoria Tag"])}
    ${row("ID Type", record["ID Type"])}
    ${row("ID Number", record["ID Number"])}
    ${row("ID Issue Date", record["ID Issue Date"])}
    ${row("ID Expiry Date", record["ID Expiry Date"])}
  </div>

  <h2>Joint Partner's Details</h2>
  <div class="grid">
    ${row("Full Name", record["Partner Name"])}
    ${row("Relationship to Primary Holder", record["Partner Relationship"])}
    ${row("Date of Birth", record["Partner Date of Birth"])}
    ${row("Nationality", record["Partner Nationality"])}
    ${row("State of Origin", record["Partner State of Origin"])}
    ${row("LGA", record["Partner LGA"])}
    ${row("Phone", record["Partner Phone"])}
    ${row("Email", record["Partner Email"])}
    <div class="field full"><label>Postal Address</label><span>${esc(f(record["Partner Postal Address"]))}</span></div>
    <div class="field full"><label>Residential Address</label><span>${esc(f(record["Partner Residential Address"]))}</span></div>
    ${row("ID Type", record["Partner ID Type"])}
    ${row("ID Number", record["Partner ID Number"])}
    ${row("ID Expiry Date", record["Partner ID Expiry Date"])}
    <div class="field full"><label>Mandate Signing Instruction</label><span>${esc(f(record["Partner Mandate Instruction"]))}</span></div>
  </div>

  <h2>Contact & Next of Kin</h2>
  <div class="grid">
    <div class="field full"><label>Residential Address</label><span>${esc(f(record["Residential Address"]))}</span></div>
    <div class="field full"><label>Mailing Address</label><span>${esc(f(record["Mailing Address"]))}</span></div>
    ${row("Email", record["Email"])}
    ${row("Mobile", record["Mobile"])}
    ${row("Mobile 2", record["Mobile 2"])}
    ${row("Next of Kin Name", record["Next of Kin Name"])}
    ${row("Relationship", record["Next of Kin Relationship"])}
    ${row("NOK Email", record["Next of Kin Email"])}
    ${row("NOK Phone", record["Next of Kin Phone"])}
    <div class="field full"><label>NOK Address</label><span>${esc(f(record["Next of Kin Address"]))}</span></div>
  </div>

  <h2>Financial & Bank</h2>
  <div class="grid">
    ${row("Occupation", record["Occupation"])}
    ${row("Nature of Business", record["Nature of Business"])}
    ${row("Employer", record["Employer"])}
    ${row("Annual Income", record["Annual Income"])}
    ${row("Bank Name", record["Bank Name"])}
    ${row("Bank Branch", record["Bank Branch"])}
    ${row("Account Number", record["Bank Account Number"])}
    ${row("Account Name", record["Bank Account Name"])}
    ${row("Settlement Mode", record["Settlement Mode"])}
    ${row("CSCS Number", record["CSCS Number"])}
    ${row("CHN", record["CHN"])}
    ${row("Mode of Communication", record["Mode of Communication"])}
    ${row("Instruction Channel", record["Instruction Channel"])}
    ${row("Politically Exposed Person", record["PEP"])}
    <div class="field full"><label>PEP Details</label><span>${esc(f(record["PEP Details"]))}</span></div>
    ${row("Relative/Associate PEP", record["PEP Associate"])}
    <div class="field full"><label>PEP Associate Details</label><span>${esc(f(record["PEP Associate Details"]))}</span></div>
  </div>

  <h2>Declarations &amp; Signatures</h2>
  <div class="grid">
    <div class="field"><label>True Information</label><span>${record["Declaration: True Info"] ? "✓ Agreed" : "—"}</span></div>
    <div class="field"><label>Terms &amp; Conditions</label><span>${record["Declaration: Terms"] ? "✓ Agreed" : "—"}</span></div>
    <div class="field"><label>Indemnity</label><span>${record["Declaration: Indemnity"] ? "✓ Agreed" : "—"}</span></div>
    <div class="field"><label>Risk Disclosure</label><span>${record["Declaration: Risk"] ? "✓ Agreed" : "—"}</span></div>
    <div class="field"><label>Privacy Policy</label><span>${record["Declaration: Privacy"] ? "✓ Agreed" : "—"}</span></div>
  </div>
  ${sigBlock}

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
