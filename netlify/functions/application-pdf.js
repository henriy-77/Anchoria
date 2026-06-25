/**
 * Anchoria Securities — Application PDF View
 * Returns a print-ready HTML page for a single application.
 * Usage: /.netlify/functions/application-pdf?ref=ASL-XXXXX
 */

const AIRTABLE_TABLE = "Applications";

exports.handler = async (event) => {
  const { ref } = event.queryStringParameters || {};
  if (!ref) return { statusCode: 400, body: "Missing ref parameter" };

  const AIRTABLE_TOKEN   = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    return { statusCode: 500, body: "Server misconfiguration" };
  }

  // Fetch from Airtable by Reference field
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE)}?filterByFormula=${encodeURIComponent(`{Reference}="${ref}"`)}`;
  let record;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    });
    const data = await res.json();
    if (data.error) {
      console.error("Airtable error:", JSON.stringify(data));
      return { statusCode: 502, body: `Airtable error: ${data.error.message || JSON.stringify(data.error)}` };
    }
    if (!data.records || data.records.length === 0) {
      console.error("No records found for ref:", ref, "URL:", url);
      return { statusCode: 404, body: `Application not found for reference: ${ref}` };
    }
    record = data.records[0].fields;
  } catch (err) {
    console.error("Fetch error:", err);
    return { statusCode: 500, body: `Failed to fetch application: ${err.message}` };
  }

  const f = (v) => v || "—";
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Application — ${f(record["Reference"])}</title>
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
  @media print{.print-btn{display:none}body{padding:10px}}.
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="logo-text">ANCHORIA SECURITIES</div>
      <div class="logo-sub">Account Opening Application</div>
    </div>
    <div class="ref">
      <strong>${f(record["Reference"])}</strong>
      ${f(record["Submission Date"] || record["Submitted At"] || "")}
      <div class="status">${f(record["Status"])}</div>
    </div>
  </div>

  <h2>Personal Details</h2>
  <div class="grid">
    <div class="field"><label>Surname</label><span>${f(record["Surname"])}</span></div>
    <div class="field"><label>First Name</label><span>${f(record["First Name"])}</span></div>
    <div class="field"><label>Middle Name</label><span>${f(record["Middle Name"])}</span></div>
    <div class="field"><label>Title</label><span>${f(record["Title"])}</span></div>
    <div class="field"><label>Sex</label><span>${f(record["Sex"])}</span></div>
    <div class="field"><label>Date of Birth</label><span>${f(record["Date of Birth"])}</span></div>
    <div class="field"><label>Nationality</label><span>${f(record["Nationality"])}</span></div>
    <div class="field"><label>Marital Status</label><span>${f(record["Marital Status"])}</span></div>
    <div class="field"><label>State of Origin</label><span>${f(record["State of Origin"])}</span></div>
    <div class="field"><label>LGA</label><span>${f(record["LGA"])}</span></div>
    <div class="field"><label>Mother's Maiden Name</label><span>${f(record["Mother's Maiden Name"])}</span></div>
    <div class="field"><label>BVN</label><span>${f(record["BVN"])}</span></div>
    <div class="field"><label>NIN</label><span>${f(record["NIN"])}</span></div>
    <div class="field"><label>Tax ID (TIN)</label><span>${f(record["Tax ID (TIN)"])}</span></div>
  </div>

  <h2>Contact Details</h2>
  <div class="grid">
    <div class="field full"><label>Residential Address</label><span>${f(record["Residential Address"])}</span></div>
    <div class="field full"><label>Mailing Address</label><span>${f(record["Mailing Address"])}</span></div>
    <div class="field"><label>Email</label><span>${f(record["Email"])}</span></div>
    <div class="field"><label>Mobile</label><span>${f(record["Mobile"])}</span></div>
    <div class="field"><label>Mobile 2</label><span>${f(record["Mobile 2"])}</span></div>
  </div>

  <h2>Next of Kin</h2>
  <div class="grid">
    <div class="field"><label>Name</label><span>${f(record["Next of Kin Name"])}</span></div>
    <div class="field"><label>Relationship</label><span>${f(record["Next of Kin Relationship"])}</span></div>
    <div class="field"><label>Email</label><span>${f(record["Next of Kin Email"])}</span></div>
    <div class="field"><label>Phone</label><span>${f(record["Next of Kin Phone"])}</span></div>
    <div class="field full"><label>Address</label><span>${f(record["Next of Kin Address"])}</span></div>
  </div>

  <h2>Identification</h2>
  <div class="grid">
    <div class="field"><label>ID Type</label><span>${f(record["ID Type"])}</span></div>
    <div class="field"><label>ID Number</label><span>${f(record["ID Number"])}</span></div>
    <div class="field"><label>Issue Date</label><span>${f(record["ID Issue Date"])}</span></div>
    <div class="field"><label>Expiry Date</label><span>${f(record["ID Expiry Date"])}</span></div>
  </div>

  <h2>Financial Information</h2>
  <div class="grid">
    <div class="field"><label>Occupation</label><span>${f(record["Occupation"])}</span></div>
    <div class="field"><label>Nature of Business</label><span>${f(record["Nature of Business"])}</span></div>
    <div class="field"><label>Employer</label><span>${f(record["Employer"])}</span></div>
    <div class="field"><label>Annual Income</label><span>${f(record["Annual Income"])}</span></div>
    <div class="field"><label>Bank Name</label><span>${f(record["Bank Name"])}</span></div>
    <div class="field"><label>Bank Branch</label><span>${f(record["Bank Branch"])}</span></div>
    <div class="field"><label>Account Number</label><span>${f(record["Bank Account Number"])}</span></div>
    <div class="field"><label>Account Name</label><span>${f(record["Bank Account Name"])}</span></div>
    <div class="field"><label>DCS Settlement</label><span>${f(record["DCS (Settlement)"])}</span></div>
    <div class="field"><label>Source of Funds</label><span>${f(record["Source of Funds"])}</span></div>
    <div class="field"><label>Country of Funds</label><span>${f(record["Country of Funds"])}</span></div>
    <div class="field"><label>CSCS Number</label><span>${f(record["CSCS Number"])}</span></div>
    <div class="field"><label>CHN</label><span>${f(record["CHN"])}</span></div>
  </div>

  <h2>Declarations & Signature</h2>
  <div class="grid">
    <div class="field"><label>PEP</label><span>${f(record["PEP"])}</span></div>
    <div class="field"><label>PEP Details</label><span>${f(record["PEP Details"])}</span></div>
    <div class="field"><label>Signatory Name</label><span>${f(record["Signatory Name"])}</span></div>
    <div class="field"><label>Signature Date</label><span>${f(record["Signature Date"])}</span></div>
  </div>

  <h2>Documents Submitted</h2>
  <div class="grid">
    <div class="field full"><label>Files</label><span style="white-space:pre-line">${f(record["Documents Submitted"])}</span></div>
  </div>

  <div class="footer">
    Anchoria Securities Limited · SEC-Licensed Stockbroker · Generated ${new Date().toLocaleDateString("en-GB", {day:"2-digit",month:"long",year:"numeric"})}
  </div>
</div>
<button class="print-btn" onclick="window.print()">Print / Save PDF</button>
</body>
</html>`;

  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
    body: html,
  };
};
