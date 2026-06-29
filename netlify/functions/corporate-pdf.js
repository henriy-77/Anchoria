/**
 * Anchoria Securities — Corporate Application PDF View
 * Returns a print-ready HTML page for a single corporate application.
 * Usage: /.netlify/functions/corporate-pdf?ref=CASL-XXXXX
 */

const AIRTABLE_TABLE = "Corporate Applications";

exports.handler = async (event) => {
  const { ref } = event.queryStringParameters || {};
  if (!ref) return { statusCode: 400, body: "Missing ref parameter" };

  const AIRTABLE_TOKEN   = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    return { statusCode: 500, body: "Server misconfiguration" };
  }

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE)}?filterByFormula=${encodeURIComponent(`{Reference}="${ref}"`)}`;
  let record;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
    const data = await res.json();
    if (data.error) return { statusCode: 502, body: `Airtable error: ${data.error.message}` };
    if (!data.records || data.records.length === 0) {
      return { statusCode: 404, body: `Application not found for reference: ${ref}` };
    }
    record = data.records[0].fields;
  } catch (err) {
    return { statusCode: 500, body: `Failed to fetch application: ${err.message}` };
  }

  const f = (v) => v || "—";

  const IMAGE_KEYS = ["passportPhoto", "signature", "photo", "image"];
  function buildDocLinks(docLinksField) {
    if (!docLinksField) return `<div class="field full"><label>Files</label><span>—</span></div>`;
    const lines = docLinksField.split("\n").filter(Boolean);
    return lines.map((line) => {
      const match = line.match(/^([^(]+)\(([^)]+)\):\s*(.+)$/);
      if (!match) return `<div class="field full"><span>${line}</span></div>`;
      const [, key, name, url] = match;
      const k = key.trim();
      const isImage = IMAGE_KEYS.some((ik) => k.toLowerCase().includes(ik));
      if (isImage) {
        return `<div class="field full">
          <label>${name}</label>
          <img src="${url.trim()}" alt="${name}" style="max-width:200px;max-height:200px;border:1px solid #E7E4DB;border-radius:4px;margin-top:4px;display:block"/>
          <a href="${url.trim()}" style="font-size:10px;color:#C2972B" target="_blank">Download</a>
        </div>`;
      }
      return `<div class="field full">
        <label>${name}</label>
        <a href="${url.trim()}" style="color:#C2972B;font-size:12px" target="_blank">Download ${name}</a>
      </div>`;
    }).join("");
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Corporate Application — ${f(record["Reference"])}</title>
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
  .print-btn{position:fixed;top:16px;right:16px;background:#C2972B;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit}
  @media print{.print-btn{display:none}body{padding:10px}}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="logo-text">ANCHORIA SECURITIES</div>
      <div class="logo-sub">Corporate Account Opening Application</div>
    </div>
    <div class="ref">
      <strong>${f(record["Reference"])}</strong>
      <div class="status">${f(record["Status"])}</div>
    </div>
  </div>

  <h2>Entity Details</h2>
  <div class="grid">
    <div class="field"><label>Entity Type</label><span>${f(record["Entity Type"])}</span></div>
    <div class="field"><label>Company Name</label><span>${f(record["Company Name"])}</span></div>
    <div class="field"><label>RC Number</label><span>${f(record["RC Number"])}</span></div>
    <div class="field"><label>Tax ID (TIN)</label><span>${f(record["Tax ID (TIN)"])}</span></div>
    <div class="field"><label>Date of Incorporation</label><span>${f(record["Date of Incorporation"])}</span></div>
    <div class="field"><label>Nature of Business</label><span>${f(record["Nature of Business"])}</span></div>
    <div class="field full"><label>Registered Address</label><span>${f(record["Registered Address"])}</span></div>
    <div class="field full"><label>Operating Address</label><span>${f(record["Operating Address"])}</span></div>
    <div class="field"><label>Email</label><span>${f(record["Email"])}</span></div>
    <div class="field"><label>Phone</label><span>${f(record["Phone"])}</span></div>
    <div class="field"><label>Website</label><span>${f(record["Website"])}</span></div>
  </div>

  <h2>Directors / Partners</h2>
  <div class="grid">
    <div class="field full"><span style="white-space:pre-line">${f(record["Directors"])}</span></div>
  </div>

  <h2>Authorized Signatories</h2>
  <div class="grid">
    <div class="field full"><span style="white-space:pre-line">${f(record["Authorized Signatories"])}</span></div>
  </div>

  <h2>Financial Information</h2>
  <div class="grid">
    <div class="field"><label>Bank Name</label><span>${f(record["Bank Name"])}</span></div>
    <div class="field"><label>Bank Branch</label><span>${f(record["Bank Branch"])}</span></div>
    <div class="field"><label>Account Number</label><span>${f(record["Bank Account Number"])}</span></div>
    <div class="field"><label>Account Name</label><span>${f(record["Bank Account Name"])}</span></div>
    <div class="field"><label>DCS / Settlement</label><span>${f(record["DCS / Settlement"])}</span></div>
    <div class="field"><label>Annual Turnover</label><span>${f(record["Annual Turnover"])}</span></div>
    <div class="field"><label>Source of Funds</label><span>${f(record["Source of Funds"])}</span></div>
    <div class="field"><label>Investment Options</label><span>${f(record["Investment Options"])}</span></div>
    <div class="field full"><label>Source Details</label><span>${f(record["Source of Funds Details"])}</span></div>
  </div>

  <h2>Declarations & Signature</h2>
  <div class="grid">
    <div class="field"><label>Signatory Name</label><span>${f(record["Signatory Name"])}</span></div>
    <div class="field"><label>Signature Date</label><span>${f(record["Signature Date"])}</span></div>
  </div>

  <h2>Documents Submitted</h2>
  <div class="grid">
    ${buildDocLinks(record["Document Links"])}
  </div>

  <div class="footer">
    Anchoria Securities Limited · SEC-Licensed Stockbroker · Generated ${new Date().toLocaleDateString("en-GB", {day:"2-digit",month:"long",year:"numeric"})}
  </div>
</div>
<button class="print-btn" onclick="window.print()">Print / Save PDF</button>
</body>
</html>`;

  return { statusCode: 200, headers: { "Content-Type": "text/html; charset=utf-8" }, body: html };
};
