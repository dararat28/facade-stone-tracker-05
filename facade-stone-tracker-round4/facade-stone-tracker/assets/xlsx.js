/* Minimal XLSX (Office Open XML) writer for the browser. No external libraries.
   XLSX.write(sheets, {title}) -> Promise<Blob>
   sheet = { name, rows: [[cell, ...], ...], cols: [width, ...], merges: ["H6:K6"],
             freeze: "A8", autoFilter: "A7:I90" }
   cell  = null | string | number | { v, s, f }   (s = style id from XLSX.S, f = formula without "=")
   Strings are written as shared strings; numbers as numbers. The ZIP is deflated with
   CompressionStream when the browser has it, otherwise stored. */
"use strict";
const XLSX = (() => {
  const S = { normal: 0, bold: 6, head: 12, title: 18, num: 24, text: 30, total: 36, note: 42, label: 48, warn: 54, textWrap: 60 };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "");
  const colName = n => { let s = ""; n++; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const ref = (r, c) => colName(c) + (r + 1);
  // Cell styles: 11 base styles x 6 fills. Style id = base * 6 + fill; S.* are the base ids (no fill).
  // XLSX.fill(styleId, "green" | "orange" | "red" | "yellow" | "purple") returns the same style with that fill.
  const FILLS = ["", "FFC6EFCE", "FFF8CBAD", "FFFFC7CE", "FFFFFF00", "FFE4DFEC"], FILL_IX = { none: 0, green: 1, orange: 2, red: 3, yellow: 4, purple: 5 };
  // [numFmtId, fontId, own fillId, borderId, alignment]
  const BASE = [
    [0, 0, 0, 0, ""], [0, 1, 0, 0, ""], [0, 1, 2, 1, '<alignment horizontal="center" vertical="center" wrapText="1"/>'], [0, 2, 0, 0, ""],
    [0, 0, 0, 1, '<alignment horizontal="right"/>'], [49, 0, 0, 1, ""], [0, 1, 2, 1, ""], [0, 3, 0, 0, '<alignment vertical="top" wrapText="1"/>'],
    [0, 1, 0, 0, '<alignment vertical="top"/>'], [0, 4, 3, 1, ""], [49, 0, 0, 1, '<alignment vertical="top" wrapText="1"/>']];
  const xfs = [];
  for (const [nf, fo, fi, bo, al] of BASE) for (let f = 0; f < FILLS.length; f++) {
    const fill = f ? 3 + f : fi;   // fills 0..3 are fixed (none, gray125, header blue, warn red); 4.. are FILLS[1..]
    xfs.push(`<xf numFmtId="${nf}" fontId="${fo}" fillId="${fill}" borderId="${bo}" xfId="0"${nf ? ' applyNumberFormat="1"' : ""} applyFont="1"${fill ? ' applyFill="1"' : ""}${bo ? ' applyBorder="1"' : ""}${al ? ' applyAlignment="1">' + al + "</xf>" : "/>"}`);
  }
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF595959"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF9C0006"/><name val="Calibri"/></font></fonts>
<fills count="${4 + FILLS.length - 1}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFC7CE"/><bgColor indexed="64"/></patternFill></fill>${FILLS.slice(1).map(c => `<fill><patternFill patternType="solid"><fgColor rgb="${c}"/><bgColor indexed="64"/></patternFill></fill>`).join("")}</fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  const fill = (s, color) => (s - s % 6) + (FILL_IX[color] || 0);
  const COLORS = { green: "FFC6EFCE", orange: "FFF8CBAD", red: "FFFFC7CE", yellow: "FFFFFF00", purple: "FFE4DFEC" };

  function sheetXml(sh, sst){
    const out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'];
    if (sh.tab) out.push(`<sheetPr><tabColor rgb="${sh.tab.length === 6 ? "FF" + sh.tab : sh.tab}"/></sheetPr>`);
    if (sh.freeze) {
      const m = /^([A-Z]+)(\d+)$/.exec(sh.freeze), col = m[1].split("").reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1, row = +m[2] - 1;
      out.push(`<sheetViews><sheetView workbookViewId="0"><pane${col ? ` xSplit="${col}"` : ""}${row ? ` ySplit="${row}"` : ""} topLeftCell="${sh.freeze}" activePane="${col && row ? "bottomRight" : row ? "bottomLeft" : "topRight"}" state="frozen"/></sheetView></sheetViews>`);
    }
    if (sh.cols && sh.cols.length) out.push("<cols>" + sh.cols.map((w, i) => w ? `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>` : "").join("") + "</cols>");
    out.push("<sheetData>");
    sh.rows.forEach((row, r) => {
      if (!row) return;
      const cells = [];
      row.forEach((c, ci) => {
        if (c == null || c === "") return;
        const o = typeof c === "object" ? c : { v: c };
        const s = o.s ? ` s="${o.s}"` : "";
        if (o.f) cells.push(`<c r="${ref(r, ci)}"${s}><f>${esc(o.f)}</f></c>`);
        else if (typeof o.v === "number" && isFinite(o.v)) cells.push(`<c r="${ref(r, ci)}"${s}><v>${o.v}</v></c>`);
        else if (o.v == null || o.v === "") { if (o.s) cells.push(`<c r="${ref(r, ci)}"${s}/>`); }
        else {
          const str = String(o.v); let k = sst.map.get(str);
          if (k === undefined) { k = sst.list.length; sst.list.push(str); sst.map.set(str, k); }
          sst.count++;
          cells.push(`<c r="${ref(r, ci)}"${s} t="s"><v>${k}</v></c>`);
        }
      });
      if (cells.length) out.push(`<row r="${r + 1}">${cells.join("")}</row>`);
    });
    out.push("</sheetData>");
    if (sh.autoFilter) out.push(`<autoFilter ref="${sh.autoFilter}"/>`);
    if (sh.merges && sh.merges.length) out.push(`<mergeCells count="${sh.merges.length}">${sh.merges.map(m => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`);
    out.push('<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/></worksheet>');
    return out.join("");
  }
  const sheetName = (n, used) => { let s = String(n).replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || "Sheet"; let k = s, i = 2; while (used.has(k.toLowerCase())) k = s.slice(0, 28) + " " + i++; used.add(k.toLowerCase()); return k; };

  // ---- ZIP (deflate when available)
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = d => { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  async function deflate(d){
    if (typeof CompressionStream === "undefined") return null;
    try { return new Uint8Array(await new Response(new Blob([d]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer()); } catch (e) { return null; }
  }
  async function zip(files){
    const parts = [], cd = []; let off = 0;
    for (const f of files) {
      const nm = new TextEncoder().encode(f.name), raw = f.data, crc = crc32(raw), z = await deflate(raw), data = z || raw, method = z ? 8 : 0;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x800, true); lh.setUint16(8, method, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, raw.length, true); lh.setUint16(26, nm.length, true);
      parts.push(lh.buffer, nm, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint16(10, method, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, raw.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
      cd.push(c.buffer, nm);
      off += 30 + nm.length + data.length;
    }
    const cdSize = cd.reduce((a, b) => a + b.byteLength, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...cd, e.buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  async function write(sheets, opts = {}){
    const enc = s => new TextEncoder().encode(s), sst = { list: [], map: new Map(), count: 0 }, used = new Set();
    const names = sheets.map(s => sheetName(s.name, used));
    const xmls = sheets.map(s => sheetXml(s, sst));
    const files = [
      { name: "[Content_Types].xml", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`) },
      { name: "_rels/.rels", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`) },
      { name: "docProps/core.xml", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(opts.title || "")}</dc:title><dc:creator>Facade Stone Tracker</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</dcterms:created></cp:coreProperties>`) },
      { name: "xl/workbook.xml", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>${sheets.some(s => s.autoFilter) ? `<definedNames>${sheets.map((s, i) => s.autoFilter ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(names[i].replace(/'/g, "''"))}'!${s.autoFilter.replace(/([A-Z]+)(\d+)/g, "$$$1$$$2")}</definedName>` : "").join("")}</definedNames>` : ""}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`) },
      { name: "xl/_rels/workbook.xml.rels", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId${sheets.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`) },
      { name: "xl/styles.xml", data: enc(STYLES) },
      ...xmls.map((x, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc(x) })),
      { name: "xl/sharedStrings.xml", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sst.count}" uniqueCount="${sst.list.length}">${sst.list.map(s => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join("")}</sst>`) },
    ];
    return zip(files);
  }
  return { write, S, colName, ref, fill, COLORS };
})();
