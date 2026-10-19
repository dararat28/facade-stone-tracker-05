/* "Compare IFC Files": dialog, Changes tab, 3D change colours, previous/new switch and the
   side-by-side values in the Properties panel. Uses compare.js (the comparison itself),
   ifc-worker.js (IFC conversion) and app.js (model display). Nothing is published or saved:
   the comparison lives in this browser tab until it is cleared. */
"use strict";
// replaceChildren() would insert the text "null" for a null argument
const putKids = (el, ...kids) => el.replaceChildren(...kids.flat().filter(k => k != null && k !== false));
let CMP = null;   // { rev, date, notes, at, result, prev:{manifest, source, name}, next:{…}, showing, colors, filter, eidItem }
const CMP_COL = { added: [46, 158, 68], removed: [208, 59, 59], modified: [232, 130, 42], unmatched: [142, 68, 173] };
const CMP_TXT = { added: "Added", removed: "Removed", modified: "Modified", unchanged: "Unchanged", unmatched: "Unmatched / review" };

function cmpColor(e){
  if (!CMP || !CMP.colors || !CMP.eidItem) return null;
  const it = CMP.eidItem.get(e.eid); return it && CMP_COL[it.status] || null;
}

/* ---------- sources: IFC file (worker), saved dashboard model (elements.json / model ZIP) or the model shown now */
function convertIfcFile(file, label, onProgress){
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL("assets/ifc-worker.js", location.href), { type: "module" });
    w.onmessage = ev => {
      const m = ev.data;
      if (m.type === "progress") { onProgress(`${label}: ${m.text}`, m.frac); return; }
      w.terminate();
      if (m.type === "invalid") return reject(new Error(`${label}: ${m.validation.problems.join("; ")}`));
      if (m.type === "error") return reject(new Error(`${label}: ${m.message}`));
      const manifest = JSON.parse(new TextDecoder().decode(m.json)), map = new Map(m.chunks.map(c => [c.file, c.data]));
      resolve({ manifest, name: file.name, source: { kind: "imported", name: file.name, chunk: async c => { const d = map.get(c.file); if (!d) throw new Error("missing " + c.file); return d.slice().buffer; } } });
    };
    w.onerror = e => { w.terminate(); reject(new Error(`${label}: the converter stopped (${e.message || "out of memory?"})`)); };
    w.postMessage({ file });
  });
}
async function loadSavedModel(file, label){
  if (/\.json$/i.test(file.name)) {
    const manifest = JSON.parse(await file.text());
    if (!manifest.elements) throw new Error(`${label}: ${file.name} is not a dashboard model (data/elements.json)`);
    return { manifest, name: file.name, noGeometry: true, source: { kind: "imported", name: file.name, chunk: async () => { throw new Error("this saved model has no geometry"); } } };
  }
  const entries = await unzip(file), get = n => entries.find(e => e.name.replace(/^.*?(data\/|geom\/)/, "$1") === n);
  const ej = get("data/elements.json"); if (!ej) return null;   // not a model package: treat as IFC ZIP
  const manifest = JSON.parse(new TextDecoder().decode(await inflate(ej)));
  const geo = new Map(); for (const en of entries) { const m = /(geom\/[^/]+\.bin)$/.exec(en.name); if (m) geo.set(m[1], en); }
  return { manifest, name: file.name, source: { kind: "imported", name: file.name, chunk: async c => { const en = geo.get(c.file); if (!en) throw new Error("missing " + c.file); const d = await inflate(en); return d.slice().buffer; } } };
}
async function cmpSide(kind, file, label, onProgress){
  if (kind === "current") return { manifest: D.manifest, name: D.manifest.source + (D.source && D.source.kind === "imported" ? "" : " (published)"), source: D.source };
  if (!file) throw new Error(`${label}: choose a file`);
  if (/\.(json|zip)$/i.test(file.name)) { const saved = await loadSavedModel(file, label); if (saved) return saved; }
  if (!/\.(ifc|zip)$/i.test(file.name)) throw new Error(`${label}: choose an .ifc file, a .zip with an IFC, or a saved dashboard model`);
  return convertIfcFile(file, label, onProgress);
}

/* ---------- dialog */
function openCompare(){
  const body = $("#cmpBody"), F = { prevKind: "current", nextKind: "file", prevFile: null, nextFile: null };
  const today = new Date().toISOString().slice(0, 10);
  const side = (key, title) => {
    const kindKey = key + "Kind", fileKey = key + "File";
    const fileIn = h("input", { type: "file", accept: ".ifc,.zip,.json", hidden: true, onchange: e => { F[fileKey] = e.target.files[0] || null; F[kindKey] = "file"; draw(); } });
    const name = F[fileKey] ? `${F[fileKey].name} (${(F[fileKey].size / 1e6).toFixed(0)} MB)` : "no file chosen";
    return h("div", { class: "cmpside" }, h("h4", { text: title }),
      h("label", { class: "opt" }, h("input", { type: "radio", name: key, checked: F[kindKey] === "current" || null, onchange: () => { F[kindKey] = "current"; draw(); } }),
        h("span", null, h("b", { text: "Model shown now" }), h("small", { text: D.manifest.source }))),
      h("label", { class: "opt" }, h("input", { type: "radio", name: key, checked: F[kindKey] === "file" || null, onchange: () => { F[kindKey] = "file"; draw(); } }),
        h("span", null, h("b", { text: "IFC file or saved dashboard model" }), h("small", { text: ".ifc, .zip with an IFC, data/elements.json or model-update ZIP · " + name }))),
      h("label", { class: "btn" }, icon("i-upload"), "Choose file…", fileIn));
  };
  const status = h("div", { class: "prog" }), bar = h("div", { class: "pbar", hidden: true }, h("div", { class: "track" }, h("i")));
  let revIn, dateIn, notesIn;
  const draw = () => {
    putKids(body, 
      h("p", { class: "dh", text: "Compares two IFC models element by element (GlobalId, then Ticket + elevation + position). Files are read in this browser only; nothing is changed or uploaded. Each 1.4 GB IFC takes several minutes and needs 8 GB of memory." }),
      h("div", { class: "cmpgrid" }, side("prev", "Previous IFC"), side("next", "New IFC")),
      h("div", { class: "exrev" },
        h("label", { class: "f" }, "Revision Number (manual) *", revIn = h("input", { id: "cmpRev", value: (CMP && CMP.rev) || "", placeholder: "e.g. 21" })),
        h("label", { class: "f" }, "Revision date", dateIn = h("input", { id: "cmpDate", type: "date", value: (CMP && CMP.date) || today })),
        h("label", { class: "f wide" }, "Notes (optional)", notesIn = h("input", { id: "cmpNotes", value: (CMP && CMP.notes) || "" }))),
      h("p", { class: "dh", text: "The IFC has no reliable revision number, so it is entered here. It is used in the Changes tab and in the revision Excel export." }),
      h("div", { class: "exact" }, h("button", { class: "btn primary", type: "button", id: "cmpGo", onclick: () => run() }, icon("i-compare"), "Compare IFC Files"), bar, status));
  };
  const run = async () => {
    const rev = revIn.value.trim();
    if (!rev) { status.textContent = "Enter the Revision Number."; revIn.focus(); return; }
    if (F.prevKind === "current" && F.nextKind === "current") { status.textContent = "Choose a file for the previous or the new IFC."; return; }
    const btn = $("#cmpGo"); btn.disabled = true; bar.hidden = false; window.__cmp = { state: "running" };
    const prog = (t, f) => { status.textContent = t; bar.querySelector("i").style.width = Math.round((f || 0) * 100) + "%"; };
    try {
      const t0 = performance.now();
      const prev = await cmpSide(F.prevKind, F.prevFile, "Previous IFC", prog);
      const next = await cmpSide(F.nextKind, F.nextFile, "New IFC", prog);
      prog("Comparing…", 1); await new Promise(r => setTimeout(r, 20));
      const fabFile = k => { const f = D.idx.pdf.files[k] || (D.mem && D.mem.pdf.get(k)) || D.local.pdf.get(k); return f ? (f.path || f.name) : null; };
      const result = Compare.run(prev.manifest, next.manifest, { fabFile });
      CMP = { rev, date: dateIn.value, notes: notesIn.value.trim(), at: new Date().toLocaleString(), result, prev, next, showing: null, colors: true,
        filter: { status: "changes", prop: "", fab: "", q: "" }, secs: Math.round((performance.now() - t0) / 1000) };
      await cmpShow("next");
      setPage("model"); setLeftTab("cmp");
      const sm = result.summary;
      status.textContent = `Done in ${CMP.secs} s: ${sm.added} added, ${sm.removed} removed, ${sm.modified} modified, ${sm.unmatched} to review · ${sm.affectedSheets} affected Fab Sheets.`;
      window.__cmp = { state: "done", summary: sm, secs: CMP.secs };
      $("#cmpDlg").close();
      toast(`Revision ${rev}: ${sm.affectedSheets} affected Fab Sheets. See the Changes tab.`);
    } catch (e) {
      console.error(e); status.textContent = `Not compared: ${e.message}`; window.__cmp = { state: "error", error: e.message };
    } finally { btn.disabled = false; bar.hidden = true; }
  };
  draw();
  if (!$("#cmpDlg").open) $("#cmpDlg").showModal();
}

/* ---------- show the previous or the new model (geometry already in memory; no IFC parsing) */
async function cmpShow(which){
  if (!CMP) return;
  const side = CMP[which];
  if (side.noGeometry) { toast(`The ${which === "prev" ? "previous" : "new"} model was loaded from data/elements.json without geometry, so it cannot be shown in 3D.`); return; }
  const selG = S.sel ? S.sel.eids.map(id => D.els[id] && D.els[id].gid).filter(Boolean) : [];
  const fromSide = CMP.showing;
  if (CMP.showing !== which) {
    if (side.manifest !== D.manifest) {
      D.source = side.source; buildModel(side.manifest);
      S.sel = null; Object.assign(S, { elev: "", phase: "", issue: "", t31: "", files: "", finish: "", flag: "" });
      initUI(); CMP.showing = which; cmpIndex(); renderAll(); await startViewer(true);
    } else { CMP.showing = which; cmpIndex(); renderAll(); }
  }
  // keep the selection: same elements on the other side
  if (selG.length && fromSide && fromSide !== which) {
    const map = new Map(CMP.result.items.filter(i => i.a && i.b).map(i => fromSide === "next" ? [i.b.gid, i.a.gid] : [i.a.gid, i.b.gid]));
    const ids = selG.map(g => D.byGid.get(map.get(g) || g)).filter(Boolean);
    if (ids.length) selectElements(ids, "compare", false, false);
  }
  applyView(); renderCompareBar();
}
function cmpIndex(){
  CMP.eidItem = new Map();
  for (const it of CMP.result.items) {
    const e = CMP.showing === "next" ? it.b : it.a; if (!e) continue;
    const eid = D.byGid.get(e.gid); if (eid) CMP.eidItem.set(eid, it);
  }
}
function clearCompare(){
  if (!CMP) return;
  CMP = null; window.__cmp = { state: "cleared" };
  $("#tabCmp").hidden = true; if (S.tab === "cmp") setLeftTab("rec");
  applyView(); renderAll(); renderCompareBar();
  toast("Comparison cleared. The model shown stays loaded; the revision colours are removed.");
}

/* ---------- viewer bar (colours, previous/new) and legend */
function renderCompareBar(){
  const bar = $("#cmpBar"), leg = $("#cmpLegend");
  if (!CMP) { bar.hidden = true; leg.hidden = true; return; }
  bar.hidden = false;
  putKids(bar, 
    h("button", { class: "btn" + (CMP.colors ? " on" : ""), type: "button", "aria-pressed": CMP.colors, title: "Show the revision colours in the model", onclick: () => { CMP.colors = !CMP.colors; applyView(); renderCompareBar(); } }, icon("i-compare"), `Rev ${CMP.rev}`),
    h("button", { class: "btn" + (CMP.showing === "next" ? " on" : ""), type: "button", title: "New IFC (added and modified elements)", onclick: () => cmpShow("next") }, "New"),
    h("button", { class: "btn" + (CMP.showing === "prev" ? " on" : ""), type: "button", title: "Previous IFC (removed elements)", onclick: () => cmpShow("prev") }, "Previous"));
  leg.hidden = !CMP.colors;
  leg.replaceChildren(...["added", "modified", "removed", "unmatched"].map(s => h("span", { class: "lg" }, h("i", { style: `background:rgb(${CMP_COL[s].join(",")})` }), CMP_TXT[s])),
    h("span", { class: "lg muted", text: CMP.showing === "prev" ? "showing the previous IFC" : "showing the new IFC" }));
}

/* ---------- Changes tab */
function renderCompare(){
  const tab = $("#tabCmp"), wrap = $("#cmpWrap"); if (!tab || !wrap) return;
  if (!CMP) { tab.hidden = true; return; }
  tab.hidden = false;
  const R = CMP.result, sm = R.summary, f = CMP.filter;
  $("#nCmp").textContent = fmt(sm.affectedSheets);
  if (S.tab !== "cmp") return;
  const kpi = (label, v, status) => h(status ? "button" : "div", { class: "ck" + (status && f.status === status ? " act" : "") + (status ? " st-" + status : ""), type: status ? "button" : null, onclick: status ? () => { f.status = f.status === status ? "changes" : status; renderCompare(); } : null },
    h("b", { text: fmt(v) }), h("span", { text: label }));
  const props = [...new Set(R.types.flatMap(t => t.props.map(p => p.prop)))].sort();
  const list = R.types.filter(t =>
    (f.status === "all" || (f.status === "changes" ? t.status !== "unchanged" : f.status === "sheets" ? t.affected : t.status === f.status || t.counts[f.status] > 0)) &&
    (!f.prop || t.props.some(p => p.prop === f.prop)) && (!f.fab || (f.fab === "found" ? !!t.fabFile : !t.fabFile)) &&
    (!f.q || t.name.toUpperCase().includes(f.q.toUpperCase())));
  const rows = list.slice(0, 500).map(t => {
    const what = t.status === "added" ? `new Type · ${t.qtyNew} pcs` : t.status === "removed" ? `removed · was ${t.qtyPrev} pcs` :
      t.props.map(p => `${p.prop}: ${p.values.slice(0, 2).map(v => `${fmtV(v.prev)} → ${fmtV(v.next)}`).join(", ")}`).concat(t.qtyPrev !== t.qtyNew ? [`quantity ${t.qtyPrev} → ${t.qtyNew}`] : []).join(" · ") || "no change";
    return h("button", { class: "crow" + (CMP.sel === t.key ? " act" : ""), type: "button", onclick: () => cmpPick(t) },
      h("span", { class: "cst st-" + t.status, text: CMP_TXT[t.status] }), h("b", { text: t.name }), h("span", { class: "cel", text: t.elevs.join(", ") }),
      h("span", { class: "cwhat", text: what }),
      h("span", { class: "cfab" + (t.fabFile ? "" : " miss"), text: t.fabFile ? (t.affected ? "Fab Sheet: " + t.fabFile : "Fab Sheet not affected") : "Fab Sheet Not Found" }));
  });
  putKids(wrap, 
    h("div", { class: "chead" }, h("div", null, h("b", { text: `Revision ${CMP.rev}` }), CMP.date ? ` · ${CMP.date}` : "", h("small", { text: `${R.prevName} → ${R.nextName}` })),
      h("div", { class: "cacts" }, h("button", { class: "btn", type: "button", onclick: () => openExport({ format: "revision" }) }, icon("i-download"), "Export revision Excel"),
        h("button", { class: "btn", type: "button", onclick: clearCompare }, icon("i-x"), "Clear"))),
    h("div", { class: "ckpis" }, kpi("previous elements", sm.prevTotal), kpi("new elements", sm.newTotal), kpi("added", sm.added, "added"), kpi("removed", sm.removed, "removed"),
      kpi("modified", sm.modified, "modified"), kpi("unchanged", sm.unchanged, "unchanged"), kpi("to review", sm.unmatched, "unmatched"), kpi("affected Fab Sheets", sm.affectedSheets, "sheets"),
      kpi("affected Types", sm.affectedTypes), kpi("changed values", sm.changedProps)),
    h("div", { class: "cfilt" },
      h("select", { "aria-label": "Status", onchange: e => { f.status = e.target.value; renderCompare(); } }, ...[["changes", "All changes"], ["sheets", "Affected Fab Sheets"], ["added", "Added"], ["removed", "Removed"], ["modified", "Modified"], ["unmatched", "Unmatched / review"], ["unchanged", "Unchanged"], ["all", "All Types"]].map(([v, l]) => h("option", { value: v, text: l, selected: f.status === v || null }))),
      h("select", { "aria-label": "Property", onchange: e => { f.prop = e.target.value; renderCompare(); } }, h("option", { value: "", text: "Any property" }), ...props.map(p => h("option", { value: p, text: p, selected: f.prop === p || null }))),
      h("select", { "aria-label": "Fab Sheet", onchange: e => { f.fab = e.target.value; renderCompare(); } }, ...[["", "Any Fab Sheet"], ["found", "Fab Sheet found"], ["missing", "Fab Sheet Not Found"]].map(([v, l]) => h("option", { value: v, text: l, selected: f.fab === v || null }))),
      h("input", { type: "search", placeholder: "Type / Ticket", value: f.q, oninput: e => { f.q = e.target.value.trim(); clearTimeout(renderCompare.tm); renderCompare.tm = setTimeout(() => { renderCompare(); const i = $("#cmpWrap .cfilt input"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); } })),
    h("div", { class: "clist" }, rows.length ? rows : h("p", { class: "more", text: "No Types match these filters." }), list.length > 500 ? h("p", { class: "more", text: `First 500 of ${fmt(list.length)} Types.` }) : null),
    h("p", { class: "cnote", text: `Matched by GlobalId: ${fmt(sm.gidMatched)} (${Math.round(sm.gidShare * 100)} %), then Ticket + elevation + position. Click a Type to locate it; removed Types are shown in the previous IFC.` }));
}
const fmtV = v => v == null || v === "" ? "—" : typeof v === "number" ? +v.toFixed(4) : String(v).length > 40 ? String(v).slice(0, 38) + "…" : v;
async function cmpPick(t){
  CMP.sel = t.key;
  const its = CMP.result.items.filter(i => i.key === t.key);
  const onNew = its.some(i => i.b), onPrev = its.some(i => i.a);
  if (CMP.showing === "next" && !onNew && onPrev) await cmpShow("prev");
  else if (CMP.showing === "prev" && !onPrev && onNew) await cmpShow("next");
  const ids = its.map(i => CMP.showing === "next" ? i.b : i.a).filter(Boolean).map(e => D.byGid.get(e.gid)).filter(Boolean);
  if (ids.length) selectElements(ids, "compare"); else { renderProps(); msg(`${t.name} is not in the ${CMP.showing === "next" ? "new" : "previous"} IFC.`); }
  renderCompare();
}

/* ---------- Properties panel: previous and new values side by side */
function cmpPropsSection(sel){
  if (!CMP || !CMP.eidItem) return null;
  const its = [...new Set(sel.eids.map(id => CMP.eidItem.get(id)).filter(Boolean))];
  if (!its.length) return null;
  const keys = new Set(its.map(i => i.key)), types = CMP.result.types.filter(t => keys.has(t.key));
  const sec = h("div", { class: "sect cmpsec" }, h("h3", null, `Revision ${CMP.rev} comparison`, h("small", { text: `${CMP.showing === "next" ? "new" : "previous"} IFC shown` })));
  if (its.length === 1) {
    const it = its[0];
    sec.append(h("div", { class: "cmpst" }, h("span", { class: "cst st-" + it.status, text: CMP_TXT[it.status] }), it.how ? h("small", { text: `matched by ${it.how}` }) : null));
    if (it.changes.length) {
      const tb = h("tbody");
      for (const c of it.changes) tb.append(h("tr", null, h("td", { text: c.prop }), h("td", { text: fmtV(c.prev) + (c.unit && c.prev != null ? " " + c.unit : "") }), h("td", { class: "nv", text: fmtV(c.next) + (c.unit && c.next != null ? " " + c.unit : "") }),
        h("td", { class: "n", text: c.diff == null ? "" : (c.diff > 0 ? "+" : "") + fmtV(c.diff) + (c.unit ? " " + c.unit : "") })));
      sec.append(h("table", { class: "cmp ctab" }, h("thead", null, h("tr", null, h("th", { text: "Property" }), h("th", { text: "Previous" }), h("th", { text: "New" }), h("th", { class: "n", text: "Difference" }))), tb));
    } else sec.append(h("p", { class: "muted", text: it.status === "unchanged" ? "No property or geometry change." : it.status === "added" ? "Not in the previous IFC." : it.status === "removed" ? "Not in the new IFC." : "No reliable match in the other IFC: check manually." }));
  } else {
    const counts = countBy(its, i => i.status);
    sec.append(h("div", { class: "cmpst" }, ...[...counts].map(([s, n]) => h("span", { class: "cst st-" + s, text: `${CMP_TXT[s]} ${n}` }))));
  }
  for (const t of types) {
    if (t.qtyPrev !== t.qtyNew || t.qtyElev.some(q => q.prev !== q.next)) sec.append(h("p", { class: "cq", text: `${t.name} quantity: ${t.qtyElev.filter(q => q.prev !== q.next).map(q => `${q.elev} ${q.prev} → ${q.next}`).join(", ") || `${t.qtyPrev} → ${t.qtyNew}`}` }));
    if (its.length > 1 && t.props.length) {
      const tb = h("tbody");
      for (const p of t.props) for (const v of p.values.slice(0, 4)) tb.append(h("tr", null, h("td", { text: `${p.prop}${p.count > 1 ? ` (${p.count})` : ""}` }), h("td", { text: fmtV(v.prev) }), h("td", { class: "nv", text: fmtV(v.next) }), h("td", { class: "n", text: v.diff == null ? "" : (v.diff > 0 ? "+" : "") + fmtV(v.diff) })));
      sec.append(h("table", { class: "cmp ctab" }, h("thead", null, h("tr", null, h("th", { text: `${t.name}: property` }), h("th", { text: "Previous" }), h("th", { text: "New" }), h("th", { class: "n", text: "Diff." }))), tb));
    }
    sec.append(h("p", { class: "cq" }, `Fab Sheet: `, t.fabFile ? h("b", { text: t.fabFile }) : h("b", { class: "miss", text: "Fab Sheet Not Found" }), t.affected ? ` · needs revision (${t.reasons.join("; ")})` : " · not affected"));
  }
  return sec;
}

function initCompareUI(){
  if (initCompareUI.done) { renderCompareBar(); return; }
  initCompareUI.done = true;
  $("#btnCompare").onclick = openCompare;
  $("#cmpClose").onclick = () => $("#cmpDlg").close();
  renderCompareBar();
}
