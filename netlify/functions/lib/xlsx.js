/**
 * Minimal .xlsx (Excel / Google Sheets) writer, no dependencies.
 * xlsx({ sheet, columns:[name], rows:[[cell]], numeric:Map<columnName, 3|4> }) → Buffer   (3 = money, 4 = whole number)
 * A cell is a string, a number, or { link, text } (rendered as a clickable HYPERLINK).
 * Text is stored as inline strings, so values like BVNs or phone numbers keep their leading zeros
 * and nothing in a cell is ever treated as a formula.
 */
const { zip } = require("./zip");

const xml = (s) => String(s == null ? "" : s)
  .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function colName(i) { let s = ""; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; }

function xlsx({ sheet = "Applications", columns, rows, numeric = new Map() }) {
  const name = String(sheet).replace(/[\[\]:*?\/\\]/g, " ").slice(0, 31) || "Sheet1";

  const widths = columns.map((c, i) => {
    let w = String(c).length;
    for (const r of rows.slice(0, 200)) {
      const v = r[i]; const t = v && typeof v === "object" ? v.text : v;
      for (const line of String(t == null ? "" : t).split("\n")) w = Math.max(w, line.length);
    }
    return Math.min(60, Math.max(10, w + 2));
  });

  const cell = (v, ref, numStyle) => {
    if (v == null || v === "") return "";
    if (typeof v === "object" && v.link) return `<c r="${ref}" t="str" s="2"><f>HYPERLINK("${xml(v.link)}","${xml(v.text || "Open")}")</f><v>${xml(v.text || "Open")}</v></c>`;
    if (numStyle && isFinite(Number(v))) return `<c r="${ref}" s="${numStyle}"><v>${Number(v)}</v></c>`;
    return `<c r="${ref}" t="inlineStr" s="2"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  };

  const head = columns.map((c, i) => `<c r="${colName(i)}1" t="inlineStr" s="1"><is><t>${xml(c)}</t></is></c>`).join("");
  const body = rows.map((r, ri) => `<row r="${ri + 2}">${columns.map((c, i) => cell(r[i], colName(i) + (ri + 2), numeric.get(c))).join("")}</row>`).join("");
  const last = colName(Math.max(columns.length, 1) - 1) + (rows.length + 1);

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols><sheetData><row r="1">${head}</row>${body}</sheetData><autoFilter ref="A1:${last}"/></worksheet>`;

  const files = [
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(name)}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    // Styles: 0 default · 1 header (bold, gold fill) · 2 text (wrap, top) · 3 money (#,##0.00) · 4 whole number (#,##0)
    { name: "xl/styles.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF141312"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFC2972B"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
    { name: "xl/worksheets/sheet1.xml", data: sheetXml },
  ].map((f) => ({ name: f.name, data: Buffer.from(f.data, "utf8") }));
  return zip(files, { paths: true });
}

module.exports = { xlsx };
