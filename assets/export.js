/* Export to Excel (.xlsx), built in the browser from the loaded IFC model only.
   Formats:
   1. Internal standard: the layout of the project's internal control workbook
      ("Project Overall Tracker", one "Elevation ..." sheet per elevation, and a
      "Generic Model Schedule" per phase), filled with IFC values. When an IFC comparison
      is active, affected rows and changed cells are highlighted and the worksheet tabs
      of affected sheets are coloured.
   2. Custom list: chosen rows (selection / current filters and search / whole model),
      one row per IFC element, per ticket x elevation or per ticket, chosen columns.
   3. Revision report (after "Compare IFC Files"): summary with legend, affected Fab Sheets,
      every changed value (previous / new / difference); "Changed items only" or "Full".
   The Revision Number is entered by hand (Compare dialog): the IFC has no reliable value.
   Every file has an "Export info" sheet. Needs app.js (D, S, CMP, helpers), xlsx.js, compare.js. */
"use strict";

const EXP = {
  project: "Vancouver Washington Temple, USA", projectNo: "P23830",
  // elevation column order and sheet names of the internal workbook; elevations not listed are added after them
  elevOrder: ["E2100T", "E2101T", "E2102T", "E2200T", "E2201T", "E2202T", "E2300T", "E2301T", "E2302T", "E2303T", "E2304T", "E2400T", "E2401T", "E2402T", "E2403T", "E2404T",
    "E2700T", "E2701T", "E2702T", "E2703T", "E2500T", "E2502T", "E2504T", "E2505T", "E2506T", "E2507T", "E2508T", "E2600T", "E2601T", "E2602T", "E2603T", "E2801T", "E2802T", "E2803T", "E2804T"],
  sheetOrder: ["E2801T", "E2304T", "E2403T", "E2500T", "E2602T", "E2804T", "E2700T", "E2701T", "E2702T", "E2703T", "E2600T", "E2601T", "E2802T", "E2803T", "E2504T", "E2603T", "E2200T",
    "E2502T", "E2505T", "E2506T", "E2507T", "E2508T", "E2100T", "E2101T", "E2102T", "E2201T", "E2202T", "E2300T", "E2301T", "E2302T", "E2303T", "E2400T", "E2401T", "E2402T", "E2404T"],
  noE: new Set(["E2100T", "E2101T", "E2102T", "E2200T", "E2201T", "E2202T", "E2600T", "E2601T", "E2602T", "E2603T"]),   // sheet named "Elevation 2100T" (no E) in the internal file
  notes: ["All dimensions provided are for reference only at fabricator request. All dimensional information for stone fabrication is controlled by the fabrication template. ",
    'Dimensions are only provided for flat stones where feasible to do so. Any variable dimensions, multi-directional cuts, or specialty fabrications are listed as "MULTI".'],
  statusColor: { added: "green", modified: "orange", removed: "red", unmatched: "purple" },
  statusText: { added: "Added", modified: "Modified", removed: "Removed", unmatched: "Unmatched / requires review", unchanged: "Unchanged" },
};
const XS = () => XLSX.S;
const st = (base, color) => color ? XLSX.fill(base, color) : base;

/* ---------- values */
const uniq = a => [...new Set(a.filter(v => v != null && v !== ""))];
const joinU = (a, sep = " / ") => uniq(a.map(v => typeof v === "string" ? v.trim() : v)).join(sep);
// Length falls back to the Revit Type name "L=906" when the IFC has no Dimensions.LENGTH (HT/RT stones)
const dimVal = (e, k) => typeof e[k] === "number" ? e[k] : k === "L" ? Compare.typeLen(e) : null;
function dimOf(els, k){
  const vals = uniq(els.map(e => { const v = dimVal(e, k); return v == null ? null : Math.abs(v) < 1 ? +v.toFixed(4) : Math.round(v * 10) / 10; }));
  return vals.length === 0 ? "" : vals.length === 1 ? vals[0] : "MULTI";
}
function countOf(els, key){                       // per-stone count; "MULTI" when stones differ
  const v = uniq(els.map(e => e[key].s === "ok" ? e[key].n : e[key].s === "absent" ? null : String(e[key].raw)));
  return v.length === 0 ? "" : v.length === 1 ? v[0] : "MULTI";
}
const holes = (els, key) => { const ok = els.filter(e => e[key].s === "ok"); return ok.length ? ok.reduce((a, e) => a + e[key].n, 0) : ""; };
const yes = b => b ? "Yes" : "No";
const sortElev = list => { const o = new Map(EXP.elevOrder.map((e, i) => [e, i])); return [...list].sort((a, b) => (o.has(a) ? o.get(a) : 999) - (o.has(b) ? o.get(b) : 999) || byNum(a, b)); };
const today = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const fmtVal = v => v == null || v === "" ? "—" : v;

/* ---------- revision context (active comparison) */
function revCtx(){
  if (typeof CMP === "undefined" || !CMP || !CMP.result) return null;
  const types = new Map(CMP.result.types.map(t => [t.key, t]));
  const cols = t => {   // internal-standard columns whose value changed for this Type
    const k = new Set(t.props.map(p => p.key)), c = new Set();
    if (k.has("Dimensions.LENGTH") || k.has("Derived.Length")) c.add("L");
    if (k.has("Dimensions.WIDTH")) c.add("W"); if (k.has("Dimensions.HEIGHT")) c.add("H"); if (k.has("Dimensions.THICKNESS")) c.add("T");
    if (k.has("Text.Issue Status")) c.add("issue"); if (k.has("Text.Detail")) c.add("detail");
    return c;
  };
  const removedEls = new Map();
  for (const it of CMP.result.items) if (it.status === "removed") { const k = normKey(it.a.ticket); if (!removedEls.has(k)) removedEls.set(k, []); removedEls.get(k).push(it.a); }
  return { rev: CMP.rev, date: CMP.date, types, cols, removedEls, label: `Revision ${CMP.rev}${CMP.date ? " (" + CMP.date + ")" : ""}` };
}
const revOf = (RV, key) => { const t = RV && RV.types.get(key); return t && t.status !== "unchanged" ? RV.rev : ""; };

/* ---------- row scopes (IFC elements) */
function expScopes(){
  const sel = S.sel ? S.sel.eids.map(id => D.els[id]).filter(e => e && e.kind === "stone") : [];
  const seen = new Set(), view = [];
  for (const r of D.recList) if (recInScope(r) && matchesQuery(r)) for (const id of r.eids) { const e = D.els[id]; if (elInScope(e) && !seen.has(id)) { seen.add(id); view.push(e); } }
  return { sel, view, all: D.stones };
}
function scopeText(id, els){
  if (id === "all") return "Whole IFC model";
  if (id === "sel") return `Current selection (${fmt(els.length)} IFC elements)`;
  const parts = [S.elev && `elevation ${S.elev}`, S.phase && `phase ${S.phase}`];
  for (const [k, sel] of [["issue", "#fIssue"], ["t31", "#fT31"], ["files", "#fFiles"], ["finish", "#fFinish"], ["flag", "#fFlag"]]) if (S[k]) { const o = $(sel).selectedOptions[0]; parts.push(o ? o.text : S[k]); }
  if (S.q) parts.push(`search "${S.q}"`);
  return `Current filters: ${parts.filter(Boolean).join(", ") || "none"}`;
}

/* ---------- custom list columns */
const EXP_COLS = [
  { id: "ticket", label: "Ticket number", w: 13, el: e => e.ticket, ag: els => els[0].ticket },
  { id: "elev", label: "Elevation", w: 11, el: e => e.elev, ag: els => sortElev(uniq(els.map(e => e.elev))).join(", ") },
  { id: "count", label: "Quantity (IFC elements)", w: 11, agOnly: true, ag: els => els.length },
  { id: "qtyElev", label: "Quantity per elevation", w: 30, ticketOnly: true, ag: els => { const m = countBy(els, e => e.elev); return sortElev([...m.keys()]).map(k => `${k}: ${m.get(k)}`).join(", "); } },
  { id: "phase", label: "Phase", w: 8, el: e => e.phase, ag: els => joinU(els.map(e => e.phase), ", ") },
  { id: "workset", label: "Revit workset (original)", w: 12, el: e => e.workset, ag: els => joinU(els.map(e => e.workset), ", ") },
  { id: "issue", label: "Issue Status", w: 50, wrap: true, el: e => e.issue || "", ag: els => joinU(els.map(e => e.issue)) },
  { id: "issueGroup", label: "Issue Status group (derived)", w: 22, el: e => e.cats.map(catLabel).join(", "), ag: els => uniq(els.flatMap(e => e.cats)).map(catLabel).join(", ") },
  { id: "t31", label: "T-31-Count (holes per stone)", w: 13, el: e => countOf([e], "c31"), ag: els => countOf(els, "c31") },
  { id: "t31Total", label: "T-31-Count holes in total", w: 13, agOnly: true, ag: els => holes(els, "c31") },
  { id: "t30", label: "T-31(30mm.)-Count (holes per stone)", w: 15, el: e => countOf([e], "c30"), ag: els => countOf(els, "c30") },
  { id: "t30Total", label: "T-31(30mm.)-Count holes in total", w: 15, agOnly: true, ag: els => holes(els, "c30") },
  { id: "L", label: "Length [mm]", w: 10, el: e => dimOf([e], "L"), ag: els => dimOf(els, "L") },
  { id: "W", label: "Width [mm]", w: 10, el: e => dimOf([e], "W"), ag: els => dimOf(els, "W") },
  { id: "H", label: "Height [mm]", w: 10, el: e => dimOf([e], "H"), ag: els => dimOf(els, "H") },
  { id: "T", label: "Thickness [mm]", w: 10, el: e => dimOf([e], "T"), ag: els => dimOf(els, "T") },
  { id: "finish", label: "Finish", w: 10, el: e => e.finish || "", ag: els => joinU(els.map(e => e.finish), ", ") },
  { id: "detail", label: "Detail", w: 16, el: e => e.detail || "", ag: els => joinU(els.map(e => e.detail), ", ") },
  { id: "revType", label: "Revit Type name", w: 14, el: e => (e.ps && e.ps.Other && e.ps.Other.Type) || "", ag: els => joinU(els.map(e => e.ps && e.ps.Other && e.ps.Other.Type), ", ") },
  { id: "revManual", label: "Revision Number (manual)", w: 11, el: e => revOf(revCtx(), e.key), ag: els => revOf(revCtx(), els[0].key) },
  { id: "change", label: "Change status (comparison)", w: 14, el: e => { const R = revCtx(), t = R && R.types.get(e.key); return t ? EXP.statusText[t.status] : ""; }, ag: els => { const R = revCtx(), t = R && R.types.get(els[0].key); return t ? EXP.statusText[t.status] : ""; } },
  { id: "rev", label: "Revision Number (IFC property, as written)", w: 12, el: e => e.rev || "", ag: els => joinU(els.map(e => e.rev), ", ") },
  { id: "release", label: "Release date (IFC property)", w: 12, el: e => e.release || "", ag: els => joinU(els.map(e => e.release), ", ") },
  { id: "pdf", label: "Fab Sheet PDF", w: 9, el: e => yes(D.tickets.get(e.key).pdf), ag: els => yes(D.tickets.get(els[0].key).pdf) },
  { id: "stl", label: "STL file", w: 8, el: e => yes(D.tickets.get(e.key).stl), ag: els => yes(D.tickets.get(els[0].key).stl) },
  { id: "stlExpected", label: "STL expected (Issue Status)", w: 11, el: e => yes(needsStl(e)), ag: els => yes(els.some(needsStl)) },
  { id: "gid", label: "IFC GlobalId", w: 24, elOnly: true, el: e => e.gid },
  { id: "revitId", label: "Revit element ID", w: 12, elOnly: true, el: e => e.revitId ? Number(e.revitId) || e.revitId : "" },
  { id: "posFix", label: "Placement repaired", w: 10, elOnly: true, el: e => e.posFix ? "Yes" : "" },
];
const EXP_DEFAULT_COLS = ["ticket", "elev", "count", "phase", "issue", "t31", "t31Total", "t30", "t30Total", "L", "W", "H", "T"];
const colFits = (c, level) => level === "element" ? !c.agOnly && !c.ticketOnly : level === "record" ? !c.elOnly && !c.ticketOnly : !c.elOnly;

function groupRows(els, level){
  if (level === "element") return els.slice().sort((a, b) => byNum(a.key, b.key) || byNum(a.elev, b.elev)).map(e => [e]);
  const m = new Map();
  for (const e of els) { const k = level === "record" ? e.key + "|" + e.elev : e.key; if (!m.has(k)) m.set(k, []); m.get(k).push(e); }
  return [...m.values()].sort((a, b) => byNum(a[0].key, b[0].key) || byNum(a[0].elev, b[0].elev));
}
function customSheets(els, level, colIds, scopeLine, hl){
  const X = XS(), RV = hl ? revCtx() : null, cols = EXP_COLS.filter(c => colIds.includes(c.id) && colFits(c, level));
  const rows = [cols.map(c => ({ v: c.label, s: X.head }))];
  for (const g of groupRows(els, level)) {
    const t = RV && RV.types.get(g[0].key), color = t ? EXP.statusColor[t.status] : null;
    rows.push(cols.map(c => {
      const v = level === "element" ? c.el(g[0]) : c.ag(g);
      return { v, s: st(typeof v === "number" ? X.num : c.wrap ? X.textWrap : X.text, color) };
    }));
  }
  const last = XLSX.ref(rows.length - 1, cols.length - 1);
  const lvl = { element: "one row per IFC element (stone)", record: "one row per ticket and elevation", ticket: "one row per ticket" }[level];
  return [{ name: "Export", rows, cols: cols.map(c => c.w), freeze: "B2", autoFilter: `A1:${last}`, tab: RV && rows.some(r => r[0].s !== X.text && r[0].s !== X.head) ? "FFFF00" : null },
    infoSheet([["Rows", lvl], ["Selection", scopeLine], ["IFC elements in this export", els.length], ["Rows in the Export sheet", rows.length - 1], ...(RV ? [["Highlighted", `${RV.label}: green = added Type, orange = modified, purple = requires review`]] : [])])];
}

/* ---------- internal standard workbook (optionally with revision highlights) */
function trackerSheet(els, elevs, RV){
  const X = XS(), byT = new Map();
  for (const e of els) { if (!byT.has(e.key)) byT.set(e.key, []); byT.get(e.key).push(e); }
  if (RV) for (const [k, list] of RV.removedEls) if (!byT.has(k)) byT.set(k, null);   // removed Types are listed in red
  const keys = [...byT.keys()].sort(byNum), E0 = 7, nE = elevs.length, lastE = XLSX.colName(E0 + nE - 1), sumCol = E0 + nE + 2;
  const rows = [
    [{ v: "PROJECT:", s: X.bold }, null, EXP.project],
    [{ v: "PROJECT NO:", s: X.bold }, null, EXP.projectNo],
    [],
    [{ v: "GLOBAL STONE TRACKER", s: X.title }],
    [{ v: `Values from the IFC model ${D.manifest.source} (exported ${today()}). Quantities = number of IFC elements per ticket and elevation.` + (RV ? ` ${RV.label} highlighted: green = added Type, orange = modified, red = removed, yellow = new or changed value.` : ""), s: X.note }],
  ];
  const r6 = []; r6[E0] = { v: "Elevation:", s: X.bold }; rows.push(r6);
  const head = ["Fab Template", " (Lenght) [mm.]", "(Width) [mm.]", "(Height) [mm.]", " (Thickness) [mm.]", "Issue Status", "Revision Number", ...elevs].map(v => ({ v, s: X.head }));
  head[sumCol] = { v: "SUM TOTAL", s: X.head }; rows.push(head);
  let affected = 0;
  for (const k of keys) {
    const g = byT.get(k), t = RV && RV.types.get(k), stt = t ? t.status : "unchanged", color = EXP.statusColor[stt] || null, ch = t ? RV.cols(t) : new Set();
    if (color) affected++;
    const r = rows.length + 1;
    if (!g) {   // removed Type: previous values, no quantities
      const p = RV.removedEls.get(k);
      rows.push([{ v: p[0].ticket, s: st(X.text, "red") }, ...["L", "W", "H", "T"].map(d => { const v = dimOf(p, d); return { v, s: st(typeof v === "number" ? X.num : X.text, "red") }; }),
        { v: `Removed in ${RV.label}`, s: st(X.text, "red") }, { v: RV.rev, s: st(X.text, "yellow") }]);
      continue;
    }
    const byE = countBy(g, e => e.elev), qch = new Set(t ? t.qtyElev.filter(q => q.prev !== q.next).map(q => q.elev) : []);
    const cell = (v, base, col) => ({ v, s: st(base, stt === "added" ? (v === "" ? "green" : "yellow") : ch.has(col) ? "yellow" : color) });
    const row = [{ v: g[0].ticket, s: st(X.text, color) }, ...["L", "W", "H", "T"].map(d => { const v = dimOf(g, d); return cell(v, typeof v === "number" ? X.num : X.text, d); }),
      cell(joinU(g.map(e => e.issue)), X.text, "issue"), { v: revOf(RV, k), s: st(X.text, color ? "yellow" : null) },
      ...elevs.map(ev => ({ v: byE.get(ev) || "", s: st(X.num, stt === "added" && byE.get(ev) ? "yellow" : qch.has(ev) ? "yellow" : color) }))];
    row[sumCol] = { f: `SUM(${XLSX.colName(E0)}${r}:${lastE}${r})`, s: X.num };
    rows.push(row);
  }
  const first = 8, lastRow = rows.length, tot = [{ v: "SUM TOTAL", s: X.total }, ...Array(E0 - 1).fill({ v: "", s: X.total })];
  for (let c = 0; c < nE; c++) tot[E0 + c] = { f: `SUM(${XLSX.colName(E0 + c)}${first}:${XLSX.colName(E0 + c)}${lastRow})`, s: X.total };
  tot[sumCol] = { f: `SUM(${XLSX.colName(sumCol)}${first}:${XLSX.colName(sumCol)}${lastRow})`, s: X.total };
  rows.push(tot);
  const cols = [13, 15.6, 12, 12, 15, 60, 10, ...elevs.map(() => 8.5), 3, 3, 12];
  return { name: "Project Overall Tracker", rows, cols, freeze: "B8", tab: RV && affected ? "FFFF00" : null, merges: nE >= 2 ? [`${XLSX.colName(E0)}6:${XLSX.colName(E0 + Math.min(3, nE - 1))}6`] : [] };
}
function elevationSheet(ev, els, RV){
  const X = XS(), byT = new Map();
  for (const e of els) { if (!byT.has(e.key)) byT.set(e.key, []); byT.get(e.key).push(e); }
  if (RV) for (const [k, list] of RV.removedEls) { const here = list.filter(e => e.elev === ev); if (here.length && !byT.has(k)) byT.set(k, null); }
  const rows = [
    [{ v: "PROJECT:", s: X.bold }, EXP.project, null, null, null, null, null, null, { v: "NOTES:", s: X.bold }],
    [{ v: "PROJECT NO:", s: X.bold }, EXP.projectNo, null, null, null, null, null, null, { v: EXP.notes[0], s: X.note }],
    [null, null, null, null, null, null, null, null, { v: EXP.notes[1], s: X.note }],
    [],
    [{ v: "Elevation:", s: X.bold }, { v: ev, s: X.bold }],
    [],
    ["Fab Template", "Quantity", " (Lenght) [mm.]", "(Width) [mm.]", "(Height) [mm.]", " (Thickness) [mm.]", "Revision number", "Release date", "Issue Status"].map(v => ({ v, s: X.head })),
  ];
  let affected = 0;
  for (const k of [...byT.keys()].sort(byNum)) {
    const g = byT.get(k), t = RV && RV.types.get(k), stt = t ? t.status : "unchanged", ch = t ? RV.cols(t) : new Set();
    const q = t && t.qtyElev.find(x => x.elev === ev), here = !t ? null : stt === "added" ? "green" : (q && q.prev !== q.next) || ch.size || stt === "modified" || stt === "unmatched" ? EXP.statusColor[stt] || "orange" : null;
    if (!g) {
      const p = RV.removedEls.get(k).filter(e => e.elev === ev); affected++;
      rows.push([{ v: p[0].ticket, s: st(X.text, "red") }, { v: 0, s: st(X.num, "yellow") }, ...["L", "W", "H", "T"].map(d => { const v = dimOf(p, d); return { v, s: st(typeof v === "number" ? X.num : X.text, "red") }; }),
        { v: RV.rev, s: st(X.text, "yellow") }, { v: RV.date || "", s: st(X.text, "yellow") }, { v: `Removed in ${RV.label} (previously ${p.length})`, s: st(X.text, "red") }]);
      continue;
    }
    if (here) affected++;
    const cell = (v, base, col) => ({ v, s: st(base, stt === "added" ? (v === "" ? "green" : "yellow") : ch.has(col) ? "yellow" : here) });
    rows.push([{ v: g[0].ticket, s: st(X.text, here) }, { v: g.length, s: st(X.num, (q && q.prev !== q.next) || stt === "added" ? "yellow" : here) },
      ...["L", "W", "H", "T"].map(d => { const v = dimOf(g, d); return cell(v, typeof v === "number" ? X.num : X.text, d); }),
      { v: here ? RV.rev : "", s: st(X.text, here ? "yellow" : null) }, { v: here ? RV.date || "" : joinU(g.map(e => e.release), ", "), s: st(X.text, here ? "yellow" : null) },
      cell(joinU(g.map(e => e.issue)), X.text, "issue")]);
  }
  return { name: `Elevation ${EXP.noE.has(ev) ? ev.replace(/^E/, "") : ev}`, rows, cols: [13, 9.1, 18.7, 18.9, 18, 19.9, 16.1, 16, 73], freeze: "A8", tab: RV && affected ? "FFFF00" : null };
}
function scheduleSheet(phase, els, RV){
  const X = XS(), m = new Map();
  for (const e of els) { const k = e.elev + "|" + e.key; if (!m.has(k)) m.set(k, []); m.get(k).push(e); }
  const rows = [[{ v: `Generic Model Schedule ${phase}`, s: X.title }],
    ["Architect", "Type", "Count", "LENGTH", "WIDTH", "HEIGHT", "THICKNESS", "Revision number", "Release date", "Issue Status", "Detail", "Workset"].map(v => ({ v, s: X.head }))];
  const eo = new Map(sortElev(uniq(els.map(e => e.elev))).map((e, i) => [e, i]));
  const keys = [...m.keys()].sort((a, b) => { const [ea, ka] = a.split("|"), [eb, kb] = b.split("|"); return eo.get(ea) - eo.get(eb) || byNum(ka, kb); });
  let affected = 0;
  for (const k of keys) {
    const g = m.get(k), t = RV && RV.types.get(g[0].key), stt = t ? t.status : "unchanged", color = EXP.statusColor[stt] || null, ch = t ? RV.cols(t) : new Set();
    if (color) affected++;
    const cell = (v, base, col) => ({ v, s: st(base, stt === "added" ? (v === "" ? "green" : "yellow") : ch.has(col) ? "yellow" : color) });
    rows.push([{ v: g[0].elev, s: st(X.text, color) }, { v: g[0].ticket, s: st(X.text, color) }, { v: g.length, s: st(X.num, color) }, ...["L", "W", "H", "T"].map(d => { const v = dimOf(g, d); return cell(v, typeof v === "number" ? X.num : X.text, d); }),
      { v: color ? RV.rev : "", s: st(X.text, color ? "yellow" : null) }, { v: color ? RV.date || "" : joinU(g.map(e => e.release), ", "), s: st(X.text, color ? "yellow" : null) },
      cell(joinU(g.map(e => e.issue)), X.text, "issue"), cell(joinU(g.map(e => e.detail), ", "), X.text, "detail"), { v: joinU(g.map(e => e.workset), ", "), s: st(X.text, color) }]);
  }
  return { name: `Schedule ${phase}`, rows, cols: [10, 12, 7, 9, 9, 9, 11, 10, 12, 50, 18, 9], freeze: "C3", autoFilter: `A2:L${rows.length}`, tab: RV && affected ? "FFFF00" : null };
}
function internalSheets(els, opt, scopeLine){
  const RV = opt.highlight ? revCtx() : null;
  const elevs = sortElev(uniq(els.map(e => e.elev)));
  const sheets = [trackerSheet(els, elevs, RV)];
  if (opt.elevSheets) {
    const order = new Map(EXP.sheetOrder.map((e, i) => [e, i]));
    for (const ev of [...elevs].sort((a, b) => (order.has(a) ? order.get(a) : 999) - (order.has(b) ? order.get(b) : 999) || byNum(a, b)))
      sheets.push(elevationSheet(ev, els.filter(e => e.elev === ev), RV));
  }
  if (opt.schedules) for (const ph of uniq(els.map(e => e.phase)).sort(byNum)) sheets.push(scheduleSheet(ph, els.filter(e => e.phase === ph), RV));
  sheets.push(infoSheet([["Format", "Internal standard: Project Overall Tracker" + (opt.elevSheets ? ", Elevation sheets" : "") + (opt.schedules ? ", Generic Model Schedule per phase" : "")],
    ["Selection", scopeLine], ["IFC elements in this export", els.length], ["Tickets", uniq(els.map(e => e.key)).length], ["Elevations", elevs.join(", ")],
    ["Quantities", "Number of IFC elements (stones) per ticket and elevation. SUM TOTAL cells are Excel formulas."],
    ["Dimensions", 'IFC "Dimensions" property set, in mm. When the IFC has no LENGTH, the length is read from the Revit Type name ("L=906"). "MULTI" = the stones of the row have different values; empty = not in the IFC. Values below 1 mm are suspect IFC values (see the dashboard Data quality tab).'],
    ["Revision Number", RV ? `Entered by hand for this revision (${RV.label}); filled for the Types changed in this revision. Other rows: keep the value from your existing file.` : "Not in the IFC (no reliable value). It is entered by hand in Compare IFC Files and filled for the Types changed in that revision."],
    ["Release date", RV ? `Changed rows: the revision date. Other rows: the IFC "Release date" property as written.` : `The IFC "Release date" property as written.`],
    ["Issue Status", "Written exactly as in the IFC; several different values are joined with \" / \"."],
    ...(RV ? [["Highlights", "Green = added Type, orange = modified, red = removed (previous values), purple = requires review, yellow = new or changed value. Worksheet tabs with changes are yellow."]] : []),
    ["Phase schedules", 'Grouped by phase; Revit workset "P8-New" belongs to P8 and is shown in the Workset column.']]));
  return sheets;
}

/* ---------- revision report */
const MAIN_PROPS = ["Derived.Length", "Dimensions.LENGTH", "Dimensions.WIDTH", "Dimensions.HEIGHT", "Dimensions.THICKNESS", "Text.Issue Status", "Text.T-31-Count", "Text.T-31(30mm.)-Count", "Text.FINISH", "Text.Detail", "Other.Type", "Text.Architect"];
function revisionSheets(full, withInternal, els){
  const X = XS(), RV = revCtx(), R = CMP.result, sm = R.summary, rv = RV.rev, dt = RV.date || "";
  const fab = t => t.fabFile || "Fab Sheet Not Found";
  // 1. summary + legend
  const sum = [[{ v: `Revision ${rv} — IFC comparison report`, s: X.title }], [],
    [{ v: "Revision Number", s: X.label }, { v: rv, s: st(X.text, "yellow") }], [{ v: "Revision date", s: X.label }, dt],
    [{ v: "Previous IFC", s: X.label }, R.prevName], [{ v: "New IFC", s: X.label }, R.nextName], [{ v: "Compared", s: X.label }, CMP.at || ""],
    [{ v: "Notes", s: X.label }, CMP.notes || ""], [],
    [{ v: "Result", s: X.head }, { v: "Count", s: X.head }],
    ["Elements in the previous IFC", sm.prevTotal], ["Elements in the new IFC", sm.newTotal],
    [{ v: "Added elements", s: st(X.text, "green") }, sm.added], [{ v: "Removed elements", s: st(X.text, "red") }, sm.removed], [{ v: "Modified elements", s: st(X.text, "orange") }, sm.modified],
    ["Unchanged elements", sm.unchanged], [{ v: "Unmatched / requires review", s: st(X.text, "purple") }, sm.unmatched],
    ["Affected Types (tickets)", sm.affectedTypes], [{ v: "Affected Fab Sheets", s: X.bold }, sm.affectedSheets], ["Changed property values", sm.changedProps],
    ["Matching", `IFC GlobalId for ${fmt(sm.gidMatched)} elements (${Math.round(sm.gidShare * 100)} %), then ticket + elevation + position, then ticket + position; elements that cannot be matched reliably are marked for review.`], [],
    [{ v: "Colour legend", s: X.head }, { v: "Meaning", s: X.head }],
    [{ v: "Green", s: st(X.text, "green") }, "Added record / new Type"], [{ v: "Orange", s: st(X.text, "orange") }, "Modified record"], [{ v: "Red", s: st(X.text, "red") }, "Removed record (values from the previous IFC)"],
    [{ v: "Yellow", s: st(X.text, "yellow") }, "New information, changed value, or field to review / fill in by hand"], [{ v: "Purple", s: st(X.text, "purple") }, "Unmatched element: requires review"], [],
    [{ v: "The dashboard lists the Fab Sheets that need attention. It does not edit Fab Sheet drawings; revise them with the usual manual process.", s: X.note }]];
  // 2. Fab Sheet list
  const types = R.types.filter(t => full || t.status !== "unchanged");
  const fs = [["Revision Number", "Revision date", "Change status", "Type / Ticket Number", "Elevations", "Quantity previous", "Quantity new", "What changed", "Fab Sheet", "Notes / review status"].map(v => ({ v, s: X.head }))];
  for (const t of types) {
    const c = EXP.statusColor[t.status] || null, what = t.status === "added" ? "New Type" : t.status === "removed" ? "Type removed" : [...t.reasons, ...t.props.filter(p => !p.fab).map(p => p.prop)].filter((x, i, a) => a.indexOf(x) === i).join("; ") || "—";
    fs.push([{ v: t.status === "unchanged" ? "" : rv, s: st(X.text, t.status === "unchanged" ? null : "yellow") }, { v: t.status === "unchanged" ? "" : dt, s: X.text }, { v: EXP.statusText[t.status], s: st(X.text, c) },
      { v: t.name, s: st(X.text, c) }, { v: t.elevs.join(", "), s: X.text }, { v: t.qtyPrev, s: st(X.num, t.qtyPrev !== t.qtyNew ? "yellow" : null) }, { v: t.qtyNew, s: st(X.num, t.qtyPrev !== t.qtyNew ? "yellow" : null) },
      { v: what, s: st(X.textWrap, c) }, { v: fab(t), s: st(X.text, t.fabFile ? null : "yellow") },
      { v: t.status === "unmatched" ? "Check manually: elements could not be matched reliably" : t.affected ? "" : t.status === "modified" ? "Position or non-fabrication data only" : "", s: st(X.textWrap, t.status === "unmatched" ? "yellow" : null) }]);
  }
  // 3. every changed value
  const ch = [["Revision Number", "Revision date", "Change status", "Type / Ticket Number", "Elevation", "IFC GlobalId (new)", "IFC GlobalId (previous)", "Revit element ID", "Property", "Previous value", "New value", "Difference", "Unit", "Fab Sheet", "Notes / review status"].map(v => ({ v, s: X.head }))];
  const tmap = new Map(R.types.map(t => [t.key, t]));
  const items = R.items.filter(i => full || i.status !== "unchanged").sort((a, b) => byNum(a.key, b.key) || byNum((a.b || a.a).elev, (b.b || b.a).elev));
  for (const it of items) {
    const e = it.b || it.a, t = tmap.get(it.key), c = EXP.statusColor[it.status] || null;
    const base = [{ v: rv, s: X.text }, { v: dt, s: X.text }, { v: EXP.statusText[it.status], s: st(X.text, c) }, { v: e.ticket, s: st(X.text, c) }, { v: e.elev, s: X.text },
      { v: it.b ? it.b.gid : "", s: X.text }, { v: it.a ? it.a.gid : "", s: X.text }, { v: e.revitId ? Number(e.revitId) || e.revitId : "", s: X.num }];
    const tail = [{ v: t ? fab(t) : "", s: st(X.text, t && !t.fabFile ? "yellow" : null) }];
    if (it.status === "modified") for (const d of it.changes) ch.push([...base, { v: d.prop, s: st(X.text, c) }, { v: fmtVal(d.prev), s: X.text }, { v: fmtVal(d.next), s: st(X.text, "yellow") }, { v: d.diff == null ? "" : d.diff, s: X.num }, { v: d.unit, s: X.text }, ...tail, { v: d.fab ? "" : "Not a fabrication property", s: X.text }]);
    else if (it.status === "added" || it.status === "removed") {
      const vals = Compare.values(e), side = it.status === "added";
      const keys = MAIN_PROPS.filter(k => vals.has(k) && vals.get(k) !== "");
      if (!keys.length) keys.push("Text.TICKET NUMBER");
      for (const k of keys) ch.push([...base, { v: Compare.label(k), s: st(X.text, c) }, { v: side ? "—" : vals.get(k), s: st(X.text, side ? null : "red") }, { v: side ? vals.get(k) : "—", s: st(X.text, side ? "yellow" : null) }, { v: "", s: X.num }, { v: /Length|LENGTH|WIDTH|HEIGHT|THICKNESS/.test(k) ? "mm" : "", s: X.text }, ...tail, { v: side ? "New information" : "Removed in the new IFC", s: X.text }]);
    } else if (it.status === "unmatched") ch.push([...base, { v: "Element", s: st(X.text, c) }, { v: it.side === "previous" ? "present" : "—", s: X.text }, { v: it.side === "new" ? "present" : "—", s: X.text }, { v: "", s: X.num }, { v: "", s: X.text }, ...tail, { v: "Requires review: no reliable match", s: st(X.text, "yellow") }]);
    else ch.push([...base, { v: "—", s: X.text }, { v: "", s: X.text }, { v: "", s: X.text }, { v: "", s: X.num }, { v: "", s: X.text }, ...tail, { v: "", s: X.text }]);
  }
  for (const t of R.types) for (const q of t.qtyElev) if (q.prev !== q.next && t.status === "modified")
    ch.push([{ v: rv, s: X.text }, { v: dt, s: X.text }, { v: "Modified", s: st(X.text, "orange") }, { v: t.name, s: st(X.text, "orange") }, { v: q.elev, s: X.text }, { v: "", s: X.text }, { v: "", s: X.text }, { v: "", s: X.num },
      { v: `Quantity on ${q.elev}`, s: st(X.text, "orange") }, { v: q.prev, s: X.num }, { v: q.next, s: st(X.num, "yellow") }, { v: q.next - q.prev, s: X.num }, { v: "pcs", s: X.text }, { v: fab(t), s: st(X.text, t.fabFile ? null : "yellow") }, { v: "", s: X.text }]);
  const sheets = [
    { name: "Revision Summary", rows: sum, cols: [34, 110], tab: "FFFF00" },
    { name: `Fab Sheets Rev ${rv}`.slice(0, 31), rows: fs, cols: [10, 12, 22, 16, 22, 10, 10, 60, 18, 40], freeze: "E2", autoFilter: `A1:J${fs.length}`, tab: "FFFF00" },
    { name: `Changes Rev ${rv}`.slice(0, 31), rows: ch, cols: [10, 12, 18, 14, 10, 24, 24, 12, 26, 28, 28, 10, 6, 18, 28], freeze: "E2", autoFilter: `A1:O${ch.length}`, tab: "FFFF00" },
  ];
  if (withInternal) sheets.push(...internalSheets(els, { elevSheets: true, schedules: false, highlight: true }, "Whole IFC model").filter(s => s.name !== "Export info"));
  sheets.push(infoSheet([["Format", `Revision report, ${full ? "full comparison (all elements and Types)" : "changed items only"}${withInternal ? ", with the internal standard sheets highlighted" : ""}`],
    ["Revision Number", `${rv} (entered by hand; the IFC has no reliable revision number)`], ["Revision date", dt], ["Previous IFC", R.prevName], ["New IFC", R.nextName]]));
  return sheets;
}
function infoSheet(extra){
  const X = XS();
  const rows = [[{ v: "Export info", s: X.title }], [],
    [{ v: "Project", s: X.label }, `${EXP.project} (${EXP.projectNo})`],
    [{ v: "Source of all values", s: X.label }, `IFC model ${D.manifest.source}${D.source && D.source.kind === "imported" ? " (imported in this browser, not yet published)" : ""}`],
    [{ v: "Exported", s: X.label }, new Date().toLocaleString()],
    [{ v: "Exported from", s: X.label }, location.href.split("?")[0]],
    ...extra.map(([k, v]) => [{ v: k, s: X.label }, typeof v === "number" ? v : { v, s: X.textWrap }]),
    [],
    [{ v: "The Excel control workbook is not used by the dashboard; this file is generated from the IFC model only.", s: X.note }]];
  return { name: "Export info", rows, cols: [30, 110] };
}

/* ---------- dialog */
const EXP_PREF = "fst.export";
function expPrefs(){ try { return JSON.parse(localStorage.getItem(EXP_PREF) || "{}"); } catch (e) { return {}; } }
function expSavePrefs(p){ try { localStorage.setItem(EXP_PREF, JSON.stringify(p)); } catch (e) { /* not stored */ } }
function openExport(preset){
  const sc = expScopes(), hasCmp = !!revCtx();
  const P = Object.assign({ format: "internal", scope: S.sel ? "sel" : anyFilter() || S.q ? "view" : "all", level: "record", cols: EXP_DEFAULT_COLS, elevSheets: true, schedules: true, highlight: true, revFull: false, revInternal: true }, expPrefs(), preset || {});
  if (P.format === "revision" && !hasCmp) P.format = "internal";
  if (P.scope === "sel" && !sc.sel.length) P.scope = sc.view.length !== sc.all.length ? "view" : "all";
  const body = $("#expBody"); body.replaceChildren();
  const radio = (name, value, label, sub, disabled) => h("label", { class: "opt" + (disabled ? " dis" : "") },
    h("input", { type: "radio", name, value, checked: P[name] === value || null, disabled: disabled || null, onchange: () => { P[name] = value; draw(); } }),
    h("span", null, h("b", { text: label }), sub ? h("small", { text: sub }) : null));
  const chk = (key, label, disabled) => h("label", { class: "chk" }, h("input", { type: "checkbox", checked: P[key] || null, disabled: disabled || null, onchange: e => { P[key] = e.target.checked; } }), label);
  const tk = els => uniq(els.map(e => e.key)).length;
  const status = h("div", { class: "prog" });
  const draw = () => {
    const R = revCtx();
    body.replaceChildren(
      h("div", { class: "exsec" }, h("h4", { text: "1. Format" }),
        radio("format", "internal", "Internal standard", "Project Overall Tracker + one sheet per elevation + Generic Model Schedule per phase (layout of the internal control file)"),
        radio("format", "custom", "Custom list", "Choose the row level and the columns"),
        radio("format", "revision", R ? `Revision report — ${R.label}` : "Revision report", R ? `${CMP.result.summary.affectedSheets} affected Fab Sheets · summary, legend, Fab Sheet list, every changed value` : "Run Compare IFC Files first", !R)),
      P.format === "revision" ? null : h("div", { class: "exsec" }, h("h4", { text: "2. Rows" }),
        radio("scope", "sel", "Current selection", sc.sel.length ? `${fmt(sc.sel.length)} IFC elements · ${fmt(tk(sc.sel))} tickets` : "Nothing selected in the model", !sc.sel.length),
        radio("scope", "view", "Current filters and search", `${fmt(sc.view.length)} IFC elements · ${fmt(tk(sc.view))} tickets · ${scopeText("view", sc.view).replace("Current filters: ", "")}`),
        radio("scope", "all", "Whole IFC model", `${fmt(sc.all.length)} IFC elements · ${fmt(tk(sc.all))} tickets`)),
      P.format === "internal"
        ? h("div", { class: "exsec" }, h("h4", { text: "3. Sheets" }),
          h("label", { class: "chk" }, h("input", { type: "checkbox", checked: true, disabled: true }), "Project Overall Tracker (always)"),
          chk("elevSheets", "One sheet per elevation (Elevation …)"), chk("schedules", "Generic Model Schedule per phase"),
          chk("highlight", R ? `Highlight ${R.label} changes (cells, rows and worksheet tabs)` : "Highlight revision changes (run Compare IFC Files first)", !R))
        : P.format === "custom" ? h("div", { class: "exsec" }, h("h4", { text: "3. Row level and columns" }),
          h("div", { class: "seg" }, ...[["element", "Per IFC element"], ["record", "Per ticket × elevation"], ["ticket", "Per ticket"]].map(([v, l]) =>
            h("button", { class: "btn" + (P.level === v ? " on" : ""), type: "button", onclick: () => { P.level = v; draw(); } }, l))),
          h("div", { class: "excols" }, ...EXP_COLS.filter(c => colFits(c, P.level)).map(c => h("label", { class: "chk" },
            h("input", { type: "checkbox", checked: P.cols.includes(c.id) || null, onchange: e => { P.cols = e.target.checked ? [...new Set([...P.cols, c.id])] : P.cols.filter(x => x !== c.id); } }), c.label))),
          h("div", { class: "exlinks" }, h("button", { class: "linkbtn", type: "button", onclick: () => { P.cols = EXP_COLS.map(c => c.id); draw(); } }, "Select all"), " · ",
            h("button", { class: "linkbtn", type: "button", onclick: () => { P.cols = EXP_DEFAULT_COLS.slice(); draw(); } }, "Default columns")),
          R ? chk("highlight", `Colour rows by ${R.label} change status`) : null)
        : h("div", { class: "exsec" }, h("h4", { text: "2. Revision" }),
          h("div", { class: "exrev" },
            h("label", { class: "f" }, "Revision Number", h("input", { id: "expRev", value: CMP.rev, oninput: e => { CMP.rev = e.target.value.trim(); } })),
            h("label", { class: "f" }, "Revision date", h("input", { id: "expRevDate", type: "date", value: CMP.date || "", oninput: e => { CMP.date = e.target.value; } }))),
          radio("revFull", false, "Changed items only", "Added, removed, modified and review items; the affected Fab Sheets"),
          radio("revFull", true, "Full comparison report", "Also every unchanged element and Type"),
          chk("revInternal", "Add the internal standard sheets (tracker + elevations) with the changes highlighted")),
      h("div", { class: "exact" }, h("button", { class: "btn primary", type: "button", id: "expGo", onclick: () => runExport(P, sc, status) }, icon("i-download"), "Download Excel (.xlsx)"), status));
    for (const r of body.querySelectorAll("input[name=revFull]")) { r.checked = String(P.revFull) === r.value; r.onchange = () => { P.revFull = r.value === "true"; }; }
  };
  draw();
  if (!$("#expDlg").open) $("#expDlg").showModal();
}
async function runExport(P, sc, status){
  const els = P.format === "revision" ? sc.all : sc[P.scope] || [], btn = $("#expGo");
  if (!els.length && P.format !== "revision") { status.textContent = "There are no IFC elements in this choice."; return; }
  if (P.format === "custom" && !EXP_COLS.some(c => P.cols.includes(c.id) && colFits(c, P.level))) { status.textContent = "Choose at least one column."; return; }
  if (P.format === "revision" && !String(CMP.rev || "").trim()) { status.textContent = "Enter the Revision Number."; $("#expRev").focus(); return; }
  btn.disabled = true; status.textContent = "Building the Excel file…";
  await new Promise(r => setTimeout(r, 30));
  try {
    const line = scopeText(P.scope, els);
    const sheets = P.format === "internal" ? internalSheets(els, P, line) : P.format === "custom" ? customSheets(els, P.level, P.cols, line, P.highlight) : revisionSheets(P.revFull, P.revInternal, els);
    const blob = await XLSX.write(sheets, { title: `${EXP.projectNo} stone export` });
    const tag = P.scope === "sel" ? "Selection" : P.scope === "view" ? "Filtered" : "All";
    const name = P.format === "internal" ? `${EXP.projectNo}_Stone_Tracker_${tag}${revCtx() && P.highlight ? "_Rev" + CMP.rev : ""}_${today()}.xlsx`
      : P.format === "custom" ? `${EXP.projectNo}_Export_${{ element: "Elements", record: "Records", ticket: "Tickets" }[P.level]}_${tag}_${today()}.xlsx`
      : `${EXP.projectNo}_Revision_${String(CMP.rev).replace(/[^\w.-]+/g, "_")}_${P.revFull ? "Full" : "Changes"}_${today()}.xlsx`;
    download(blob, name);
    expSavePrefs({ format: P.format, level: P.level, cols: P.cols, elevSheets: P.elevSheets, schedules: P.schedules, highlight: P.highlight, revFull: P.revFull, revInternal: P.revInternal });
    status.textContent = `Downloaded ${name} (${sheets.length} sheet${sheets.length === 1 ? "" : "s"}, ${(blob.size / 1e6).toFixed(1)} MB).`;
    window.__export = { name, sheets: sheets.map(s => s.name), elements: els.length, bytes: blob.size };
  } catch (e) {
    console.error(e); status.textContent = `The Excel file could not be built: ${e.message}`;
    window.__export = { error: e.message };
  } finally { btn.disabled = false; }
}
