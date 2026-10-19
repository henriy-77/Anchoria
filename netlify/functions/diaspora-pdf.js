/**
 * Anchoria Securities — Nominee Structure Application PDF View
 * (individual diaspora investors and NGN corporates — record kind "diaspora").
 * Returns a print-ready HTML page; staff use "Print / Save PDF". Documents are loaded by
 * the browser from get-document (not embedded) to stay under the response size limit.
 * Usage: /.netlify/functions/diaspora-pdf?ref=DIA-XXXXXXX
 */

const { getStore } = require("./lib/blobs");
const { getUser } = require("./lib/auth");
const { REF_RE } = require("./lib/guard");
const { logAccess } = require("./lib/audit");
const { store: appStore } = require("./lib/records");

const DOC_DEFS = [
  { key: "passportPhoto",   label: "Passport Photograph" },
  { key: "governmentId",    label: "Government-Issued ID" },
  { key: "proofOfAddress",  label: "Proof of Address" },
  { key: "paymentEvidence", label: "Evidence of Payment" },
  { key: "signature",       label: "Signature" },
];

exports.handler = async (event) => {
  const user = await getUser(event);
  if (!user) return { statusCode: 302, headers: { Location: "/admin.html?next=" + encodeURIComponent(event.path + (event.rawQuery ? "?" + event.rawQuery : "")) }, body: "" };
  const { ref } = event.queryStringParameters || {};
  if (!REF_RE.test(String(ref || ""))) return { statusCode: 400, body: "Invalid ref parameter" };
  await logAccess(event, user, "view_printable", { kind: "diaspora", ref });

  const SITE_ID    = process.env.NETLIFY_SITE_ID || "eba96b4a-432f-4acb-932b-4fe80c961281";
  const BLOB_TOKEN = process.env.NETLIFY_TOKEN   || process.env.NETLIFY_BLOBS_TOKEN;

  // Diaspora records live in Blobs only (never Airtable), so read them directly.
  let rec = null;
  try { rec = await appStore().get(`diaspora/${ref}`, { type: "json" }); } catch (err) { console.error("diaspora record read failed:", err.message); return { statusCode: 500, body: "Failed to load application" }; }
  if (!rec || !rec.fields) return { statusCode: 404, body: `Application not found for reference: ${ref}` };
  const record = rec.fields;
  const corp = record["Investor Category"] === "Corporate (NGN)";

  // Which documents exist (metadata only); the signature is embedded so it always prints.
  const docs = [];
  {
    const store = getStore({ name: "documents", siteID: SITE_ID, token: BLOB_TOKEN });
    for (const def of DOC_DEFS) {
      try {
        const meta = await store.getMetadata(`${ref}/${def.key}`);
        if (!meta) continue;
        const mime = meta.mimeType || "application/octet-stream";
        const url = `/.netlify/functions/get-document?ref=${encodeURIComponent(ref)}&doc=${encodeURIComponent(def.key)}`;
        let dataUrl = null;
        if (def.key === "signature" && mime.startsWith("image/")) {
          try {
            const buf = await store.get(`${ref}/${def.key}`, { type: "arrayBuffer" });
            if (buf) dataUrl = `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
          } catch (_) { /* fall back to URL */ }
        }
        docs.push({ ...def, mime, url, dataUrl, fileName: meta.name || def.key });
      } catch (_) { /* not uploaded */ }
    }
  }

  const f   = (v) => (v != null && v !== "" ? String(v) : "—");
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const yn  = (v) => (v === true || v === "true" ? "Yes" : v === false || v === "false" ? "No" : "—");
  const money = (n) => (n == null || n === "" || isNaN(Number(n)) ? "—" : "₦" + Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const row = (label, value, full) => `<div class="field${full ? " full" : ""}"><label>${esc(label)}</label><span>${esc(value)}</span></div>`;
  const fr  = (label, key, full) => row(label, f(record[key]), full);

  function renderDoc(d) {
    const dl = `<a href="${d.url}&download=1" class="dl-btn" target="_blank">⬇ Download ${esc(d.label)}</a>`;
    if (d.mime.startsWith("image/")) return `<div class="doc-block"><div class="doc-label">${esc(d.label)}</div><img src="${d.url}" alt="${esc(d.label)}" class="doc-img"/>${dl}</div>`;
    if (d.mime === "application/pdf") return `<div class="doc-block"><div class="doc-label">${esc(d.label)}</div><iframe src="${d.url}" class="pdf-embed" title="${esc(d.label)}"></iframe>${dl}</div>`;
    return `<div class="doc-block"><div class="doc-label">${esc(d.label)}</div>${dl}</div>`;
  }

  const sig       = docs.find((d) => d.key === "signature");
  const otherDocs = docs.filter((d) => d.key !== "signature");

  const sigBlock = `<div class="sig-block">
    <div class="sig-slot">
      ${sig ? `<img src="${sig.dataUrl || sig.url}" alt="Signature" class="sig-draw"/>` : `<span class="sig-missing">No signature on file</span>`}
      <div class="sig-caption">${corp ? "Authorised Signatory Signature" : "Signature"}</div>
    </div>
    <div class="sig-details">
      ${fr("Signatory Name", "Signatory Name")}
      ${fr("Date", "Signature Date")}
    </div>
  </div>`;

  const applicant = corp
    ? `<h2>Corporate Details</h2>
  <div class="grid">
    ${fr("Company Name", "Company Name", true)}
    ${fr("RC Number", "RC Number")}
    ${fr("TIN", "TIN")}
    ${fr("Contact Person", "Contact Person Name")}
    ${fr("Designation", "Contact Person Designation")}
    ${fr("Contact Person Phone", "Contact Person Phone")}
  </div>`
    : `<h2>Investor Details</h2>
  <div class="grid">
    ${row("Diaspora Investor", yn(record["Diaspora Investor"]))}
    ${row("Holds Nigerian KYC", yn(record["Holds Nigerian KYC"]))}
    ${fr("Country of Residence", "Country of Residence")}
    ${fr("Title", "Title")}
    ${fr("Surname", "Surname")}
    ${fr("First Name", "First Name")}
    ${fr("Other Names", "Other Names")}
    ${fr("Date of Birth", "Date of Birth")}
  </div>`;

  const kyc = corp ? "" : `<h2>KYC</h2>
  <div class="grid">
    ${fr("BVN", "BVN")}
    ${fr("Government ID Number", "Government ID Number")}
    ${fr("Source of Funds Declaration", "Source of Funds", true)}
  </div>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Nominee Structure Application — ${esc(f(record["Reference"]))}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Georgia,"Times New Roman",serif;font-size:12px;color:#1C1A17;background:#fff;padding:20px}
  .page{max-width:800px;margin:0 auto}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #C2972B;padding-bottom:12px;margin-bottom:20px;gap:16px}
  .brand{display:flex;align-items:center;gap:12px}
  .brand img{width:42px;height:42px;border-radius:50%}
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
  .status{display:inline-block;padding:2px 10px;background:#F7EFD6;color:#A47E1E;border-radius:20px;font-size:11px;font-weight:bold;margin-top:4px}
  .footer{margin-top:24px;border-top:1px solid #E7E4DB;padding-top:10px;font-size:10px;color:#6B655A;text-align:center}
  .print-btn{position:fixed;top:16px;right:16px;background:#C2972B;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit;z-index:100}
  .doc-block{margin:10px 0;padding:10px;border:1px solid #E7E4DB;border-radius:6px;background:#FAFAF8;page-break-inside:avoid}
  .doc-label{font-size:10px;color:#6B655A;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;font-weight:bold}
  .sig-block{display:flex;gap:34px;align-items:flex-end;margin:14px 0 4px;flex-wrap:wrap;page-break-inside:avoid}
  .sig-slot{min-width:280px}
  .sig-draw{max-width:280px;max-height:110px;display:block;background:transparent}
  .sig-slot .sig-caption{border-top:1px solid #1C1A17;padding-top:4px;margin-top:2px;font-size:10px;color:#6B655A;text-transform:uppercase;letter-spacing:.5px}
  .sig-missing{display:block;color:#B23A3A;font-size:11px;padding:26px 0 6px}
  .sig-details{flex:1;min-width:200px}
  .doc-img{max-width:100%;max-height:400px;border:1px solid #E7E4DB;border-radius:4px;display:block}
  .pdf-embed{width:100%;height:500px;border:1px solid #E7E4DB;border-radius:4px;display:block;margin-bottom:6px}
  .dl-btn{display:inline-block;margin-top:6px;padding:4px 12px;background:#C2972B;color:#fff;text-decoration:none;border-radius:4px;font-size:11px;font-family:Georgia,serif}
  @media print{.print-btn,.dl-btn{display:none}body{padding:10px}.pdf-embed{height:700px}}
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">Print / Save PDF</button>
<div class="page">
  <div class="header">
    <div class="brand">
      <img src="/anchoria-emblem.png" alt=""/>
      <div>
        <div class="logo-text">ANCHORIA SECURITIES</div>
        <div class="logo-sub">Dangote IPO — Nominee Structure Application · ${corp ? "Corporate (NGN)" : "Individual (Diaspora)"}</div>
      </div>
    </div>
    <div class="ref">
      <strong>${esc(f(record["Reference"]))}</strong>
      <div class="status">${esc(f(record["Status"]))}</div>
    </div>
  </div>

  <h2>Participation</h2>
  <div class="grid">
    ${fr("Investor Category", "Investor Category")}
    ${fr("Units Applied For", "Units")}
    ${row("Offer Price", money(record["Offer Price (NGN)"]))}
    ${row("Amount Payable", money(record["Amount Payable (NGN)"]))}
    ${fr("Amount In Words", "Amount In Words", true)}
    ${row("Payment Sent to ASL's Account", yn(record["Payment Sent to ASL"]))}
  </div>

  ${applicant}

  <h2>Contact</h2>
  <div class="grid">
    ${row(corp ? "Company Address" : "Postal Address", f(record["Postal Address"]), true)}
    ${fr("City / Town", "City")}
    ${fr("Country", "Country")}
    ${fr("Phone", "Phone")}
    ${fr("E-mail", "Email")}
  </div>

  ${kyc}

  <h2>Refund / Payout Account</h2>
  <div class="grid">
    ${fr("Bank Name", "Refund Bank Name")}
    ${fr("Account Number", "Refund Account Number")}
    ${fr("Account Name", "Refund Account Name", true)}
  </div>

  <h2>Declarations</h2>
  <div class="grid">
    ${row("Read and understood the Risk Disclosure & Terms", yn(record["Declaration: Risk & Terms"]), true)}
    ${row("Agrees to be bound by the terms of the Offer", yn(record["Declaration: Bound by Offer"]), true)}
    ${row("Understands shares are held on its/their behalf until eligible for transfer", yn(record["Declaration: Shares Held"]), true)}
    ${row("Understands allotment is at the Issuer's discretion and may be scaled back", yn(record["Declaration: Allotment"]), true)}
    ${row("All information provided is true and accurate", yn(record["Declaration: True Info"]), true)}
  </div>

  <h2>Signature</h2>
  ${sigBlock}

  <h2>Documents</h2>
  ${otherDocs.length ? otherDocs.map(renderDoc).join("\n") : `<p style="color:#6B655A;font-size:12px">No documents on file.</p>`}

  ${record["Notes"] ? `<h2>Internal Notes</h2><div class="grid"><div class="field full"><span>${esc(record["Notes"])}</span></div></div>` : ""}

  <div class="footer">
    Anchoria Securities Limited &nbsp;·&nbsp; Licensed by the NGX &nbsp;·&nbsp; Regulated by the SEC, Nigeria &nbsp;·&nbsp; Generated ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}
  </div>
</div>
</body>
</html>`;

  return { statusCode: 200, headers: { "Content-Type": "text/html; charset=utf-8" }, body: html };
};
