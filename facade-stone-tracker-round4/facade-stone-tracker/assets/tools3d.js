/* Measurement, section plane and plan / elevation / section views for the main IFC viewer.
   Everything works on the geometry already loaded (viewer.js): no IFC is reloaded or re-parsed.
   - Measure: click two points; points snap to element vertices, then edges, else the face hit.
     Coordinates are metres (the converter's output); only the displayed value is converted.
   - Section (like the ACC viewer): up to 6 clipping planes (plan, X, Y, along / across an elevation,
     through two picked points, or on a clicked face) or a section box, moved by dragging the arrow
     gizmo, the slider or a value in mm. It is a clipping view: cut solids are open, no section caps.
   - Views: Top/Plan, Front/Back/Left/Right, per-facade elevation views, Section A–A (perpendicular
     to the section plane), all orthographic. */
"use strict";
const UNITS = { mm: 1000, cm: 100, m: 1, in: 1 / 0.0254, ft: 1 / 0.3048 };
const UNIT_DEC = { mm: 1, cm: 2, m: 3, in: 2, ft: 3 };   // default decimals per unit (can be changed)
const MEAS = { active: false, list: [], pending: null, hover: null, unit: "mm", dec: 1, seq: 0, hoverAt: 0 };
try { const p = JSON.parse(localStorage.getItem("fst.measure") || "{}"); if (UNITS[p.unit]) MEAS.unit = p.unit; if (p.dec >= 0 && p.dec <= 4) MEAS.dec = p.dec; } catch (e) { /* defaults */ }
const fmtLen = m => `${(m * UNITS[MEAS.unit]).toLocaleString("en-US", { minimumFractionDigits: MEAS.dec, maximumFractionDigits: MEAS.dec })} ${MEAS.unit}`;
const SVGN = "http://www.w3.org/2000/svg";
const sv = (tag, a) => { const e = document.createElementNS(SVGN, tag); for (const [k, v] of Object.entries(a || {})) e.setAttribute(k, v); return e; };

/* ---------- overlay (dimension lines, snap marker, section plane outline) */
function drawOverlay(){
  const svg = $("#ovl"); if (!svg || !V) return;
  svg.replaceChildren();
  const vp = V.vpNow(), P = p => V.project(p, vp);
  const dot = (p, cls) => { const s = P(p); if (s[2]) svg.append(sv("circle", { cx: s[0], cy: s[1], r: 4, class: cls })); };
  MEAS.list.forEach((m, i) => {
    const a = P(m.a), b = P(m.b); if (!a[2] || !b[2]) return;
    svg.append(sv("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "mline" }));
    dot(m.a, "mpt"); dot(m.b, "mpt");
    const t = sv("text", { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 - 7, class: "mlab", "text-anchor": "middle" });
    t.textContent = `${i + 1}: ${fmtLen(m.d)}`; svg.append(t);
  });
  if (MEAS.pending) { dot(MEAS.pending.p, "mpt"); if (MEAS.hover) { const a = P(MEAS.pending.p), b = P(MEAS.hover.p); if (a[2] && b[2]) svg.append(sv("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "mline pend" })); } }
  if (MEAS.hover && (MEAS.active || SEC.picking)) { const s = P(MEAS.hover.p); if (s[2]) svg.append(sv(MEAS.hover.kind === "vertex" ? "rect" : "circle", MEAS.hover.kind === "vertex" ? { x: s[0] - 5, y: s[1] - 5, width: 10, height: 10, class: "msnap v" } : { cx: s[0], cy: s[1], r: 5, class: "msnap " + MEAS.hover.kind })); }
  if (SEC.picking && SEC.picking.a) dot(SEC.picking.a, "mpt sec");
  drawSection(svg);   // on top: the gizmo must stay grabbable
}

/* ---------- measurement */
function setMeasure(on){
  MEAS.active = on; V.measuring = on; MEAS.pending = null; MEAS.hover = null;
  if (on && SEC.picking) SEC.picking = null;
  $("#gl").classList.toggle("measuring", on); $("#vMeasure").classList.toggle("on", on); $("#vMeasure").setAttribute("aria-pressed", on);
  renderMeasPanel(); drawOverlay();
}
function renderMeasPanel(){
  const p = $("#measPanel"); p.hidden = !MEAS.active && !MEAS.list.length; if (p.hidden) return;
  const unitSel = h("select", { "aria-label": "Unit", onchange: e => { MEAS.unit = e.target.value; MEAS.dec = UNIT_DEC[MEAS.unit]; saveMeasPrefs(); renderMeasPanel(); drawOverlay(); } }, ...Object.keys(UNITS).map(u => h("option", { value: u, text: u, selected: MEAS.unit === u || null })));
  const decSel = h("select", { "aria-label": "Decimals", onchange: e => { MEAS.dec = +e.target.value; saveMeasPrefs(); renderMeasPanel(); drawOverlay(); } }, ...[0, 1, 2, 3, 4].map(d => h("option", { value: d, text: d + " dec.", selected: MEAS.dec === d || null })));
  const status = MEAS.active ? (MEAS.pending ? "Click the second point" : "Click the first point") + (MEAS.hover ? ` · snap: ${MEAS.hover.kind}` : "") : "Measuring is off";
  putKids(p, 
    h("div", { class: "mph" }, icon("i-ruler"), h("b", { text: "Measure" }), unitSel, decSel),
    h("div", { class: "mst" + (MEAS.active ? " on" : ""), text: status }),
    h("ol", { class: "mlist" }, ...MEAS.list.map((m, i) => h("li", null,
      h("span", null, h("b", { text: fmtLen(m.d) }), h("small", { text: ` Δx ${fmtLen(Math.abs(m.b[0] - m.a[0]))} · Δy ${fmtLen(Math.abs(m.b[1] - m.a[1]))} · Δz ${fmtLen(Math.abs(m.b[2] - m.a[2]))}` })),
      h("button", { class: "btn icon", type: "button", title: "Delete this measurement", "aria-label": `Delete measurement ${i + 1}`, onclick: () => { MEAS.list.splice(i, 1); renderMeasPanel(); drawOverlay(); } }, icon("i-x"))))),
    h("div", { class: "mbtns" },
      h("button", { class: "btn", type: "button", disabled: !MEAS.list.length || null, onclick: () => { MEAS.list = []; MEAS.pending = null; renderMeasPanel(); drawOverlay(); } }, "Clear all"),
      h("button", { class: "btn" + (MEAS.active ? " primary" : ""), type: "button", onclick: () => setMeasure(!MEAS.active) }, MEAS.active ? "Done" : "Measure again")),
    h("p", { class: "mnote", text: "Snaps to vertices, then edges, of the visible element (10 px). Accuracy: the stored geometry (≤ 0.02 mm per metre of stone)." }));
  window.__meas = { list: MEAS.list.map(m => ({ d: m.d, a: m.a, b: m.b, text: fmtLen(m.d), kind: m.kinds })), unit: MEAS.unit };
}
function saveMeasPrefs(){ try { localStorage.setItem("fst.measure", JSON.stringify({ unit: MEAS.unit, dec: MEAS.dec })); } catch (e) { /* not stored */ } }
function measureClick(x, y){
  const hit = V.pickPoint(x, y);
  if (!hit) { msg("No model surface under the cursor."); return; }
  if (!MEAS.pending) MEAS.pending = hit;
  else {
    const a = MEAS.pending.p, b = hit.p;
    MEAS.list.push({ a, b, d: Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), kinds: [MEAS.pending.kind, hit.kind], id: ++MEAS.seq });
    MEAS.pending = null;
  }
  renderMeasPanel(); drawOverlay();
}

/* ---------- section tools (like the ACC viewer): several cutting planes or a section box,
   moved by dragging the arrow gizmo in the model, by the slider or by a value in mm.
   A plane keeps the side dot(n,p)+d >= 0; every active plane cuts (their kept parts intersect). */
const SEC = { on: false, tab: "plane", planes: [], active: -1, seq: 0, picking: null, box: null, frame: true, gizmo: true, min: false, drag: null, ui: null };
try { const o = JSON.parse(localStorage.getItem("fst.section") || "{}"); if (typeof o.frame === "boolean") SEC.frame = o.frame; if (typeof o.gizmo === "boolean") SEC.gizmo = o.gizmo; } catch (e) { /* defaults */ }
const MAXPL = 6;
const actPlane = () => SEC.planes[SEC.active] || null;
// SEC.mode / flip / offset / n / ... read and write the active plane (older code and tests use them)
for (const k of ["mode", "flip", "offset", "n", "base", "range", "axis", "label", "facade", "def", "twoPts"])
  Object.defineProperty(SEC, k, { get(){ const p = actPlane(); return p ? p[k] : undefined; }, set(v){ const p = actPlane(); if (p) p[k] = v; } });
Object.defineProperty(SEC, "enabled", { get(){ return SEC.tab === "box" ? !!SEC.box : SEC.planes.some(p => p.on); } });
function saveSecPrefs(){ try { localStorage.setItem("fst.section", JSON.stringify({ frame: SEC.frame, gizmo: SEC.gizmo })); } catch (e) { /* session only */ } }

function modelBox(){ return V.bbox(V.allStones && V.allStones.length ? V.allStones : D.stones.map(e => e.eid)); }
function facadePlane(elev){  // vertical plane fitted to the stones of one elevation; n points outside the building
  const pts = D.stones.filter(e => e.elev === elev && e.bb && !e.away).map(e => [(e.bb[0] + e.bb[3]) / 2, (e.bb[1] + e.bb[4]) / 2, (e.bb[2] + e.bb[5]) / 2]);
  if (pts.length < 3) return null;
  const c = [0, 1, 2].map(i => pts.reduce((s, p) => s + p[i], 0) / pts.length);
  let sxx = 0, sxy = 0, syy = 0; for (const p of pts) { const dx = p[0] - c[0], dy = p[1] - c[1]; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);          // direction of largest spread
  let n = [-Math.sin(ang), Math.cos(ang), 0];                  // horizontal normal
  const mc = V.modelCentre || [0, 0, 0];
  if (n[0] * (c[0] - mc[0]) + n[1] * (c[1] - mc[1]) < 0) n = [-n[0], -n[1], 0];
  const zs = pts.map(p => p[2]), t = [Math.cos(ang), Math.sin(ang), 0];
  const along = pts.map(p => (p[0] - c[0]) * t[0] + (p[1] - c[1]) * t[1]);
  const depth = pts.map(p => (p[0] - c[0]) * n[0] + (p[1] - c[1]) * n[1]).sort((a, b) => a - b);
  // depth: signed distance outwards; the median runs through the main stone layer (the mean is pulled in by returns)
  return { c, n, t, zmin: Math.min(...zs), zmax: Math.max(...zs), tmin: Math.min(...along), tmax: Math.max(...along), median: depth[depth.length >> 1], count: pts.length };
}
function newPlane(){
  if (SEC.planes.length >= MAXPL) { msg(`Up to ${MAXPL} section planes can be used at the same time.`); return null; }
  const p = { id: ++SEC.seq, name: "Plane " + SEC.seq, on: true, flip: false, offset: 0, mode: "z" };
  SEC.planes.push(p); SEC.active = SEC.planes.length - 1; return p;
}
function secSetup(mode, keepOffset, quiet){   // (re)defines the active plane; creates one when there is none
  const bb = modelBox(); if (!bb) return;
  if (!actPlane() && !newPlane()) return;
  const [mn, mx] = bb, ctr = [0, 1, 2].map(i => (mn[i] + mx[i]) / 2), diag = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  const P = actPlane(); P.mode = mode; P.def = 0;
  if (mode === "z") { P.base = [ctr[0], ctr[1], 0]; P.n = [0, 0, -1]; P.range = [mn[2], mx[2]]; P.label = "Plan cut (horizontal)"; P.axis = 2; }
  else if (mode === "x") { P.base = [0, ctr[1], ctr[2]]; P.n = [-1, 0, 0]; P.range = [mn[0], mx[0]]; P.label = "Section across X (east–west)"; P.axis = 0; }
  else if (mode === "y") { P.base = [ctr[0], 0, ctr[2]]; P.n = [0, -1, 0]; P.range = [mn[1], mx[1]]; P.label = "Section across Y (north–south)"; P.axis = 1; }
  else if (mode.startsWith("elev:")) {
    const fp = facadePlane(mode.slice(5)); if (!fp) { msg("Not enough stones on this elevation to define its plane."); return; }
    P.base = fp.c; P.n = [-fp.n[0], -fp.n[1], 0]; P.range = [-diag / 2, diag / 2]; P.label = `Along elevation ${mode.slice(5)}`; P.axis = -1; P.facade = fp;
    P.def = -fp.median;   // offset is measured along n (inwards), so the median outward depth is negated
  } else if (mode.startsWith("across:")) {
    const fp = facadePlane(mode.slice(7)); if (!fp) { msg("Not enough stones on this elevation to define its plane."); return; }
    P.base = fp.c; P.n = fp.t.slice(); P.range = [fp.tmin - 0.5, fp.tmax + 0.5]; P.label = `Across elevation ${mode.slice(7)} (wall section)`; P.axis = -1; P.facade = fp;
  } else if (mode === "pts" && P.twoPts) {
    const [a, b] = P.twoPts, d = V3.norm([b[0] - a[0], b[1] - a[1], 0]);
    P.base = a; P.n = [-d[1], d[0], 0]; P.range = [-diag / 2, diag / 2]; P.label = "Through two points (vertical)"; P.axis = -1;
  } else if (mode === "face" && P.faceN) {
    P.base = P.faceBase; P.n = P.faceN.slice(); P.range = [-diag, diag]; P.label = "On a picked face"; P.axis = -1;
    P.def = -0.001;   // 1 mm in front of the face, so the clicked face itself stays visible
  }
  if (!keepOffset) P.offset = P.axis >= 0 ? (P.range[0] + P.range[1]) / 2 : P.def;
  P.offset = Math.min(P.range[1], Math.max(P.range[0], P.offset));
  if (!quiet) applySection();
}
function planeEq(P){  // keep side: dot(nk, p) + d >= 0
  if (!P || !P.n) return null;
  const nk = P.flip ? P.n.map(v => -v) : P.n.slice();
  // axis planes: offset = coordinate on the axis; other planes: offset in metres along n
  const p0 = P.axis >= 0 ? P.base.map((v, i) => i === P.axis ? P.offset : v) : P.base.map((v, i) => v + P.n[i] * P.offset);
  return { n: nk, d: -V3.dot(nk, p0), p0 };
}
function secPlane(){ return planeEq(actPlane()); }
function boxPlanes(){
  const b = SEC.box; if (!b) return [];
  const out = [];
  for (let a = 0; a < 3; a++) { const lo = [0, 0, 0], hi = [0, 0, 0]; lo[a] = 1; hi[a] = -1; out.push({ n: lo, d: -b.mn[a] }, { n: hi, d: b.mx[a] }); }
  return out;
}
function boxScope(){   // the default box: the selection, else the stones in the current filters, else what is loaded
  if (S.sel && S.sel.eids.length) return { ids: S.sel.eids, pad: 0.3 };
  const sc = anyFilter(), loaded = V.elIdx && V.elIdx.size ? V.elIdx : null;
  const ids = D.stones.filter(e => !e.away && (!sc || elInScope(e)) && (!loaded || loaded.has(e.eid))).map(e => e.eid);
  return { ids, pad: 0.5 };
}
function boxDefault(){ const b = boxScope(); return boxFrom(b.ids, b.pad); }
function boxFrom(eids, pad){
  const bb = eids && eids.length ? V.bbox(eids) : modelBox(); if (!bb) return null;
  return { mn: bb[0].map(v => v - pad), mx: bb[1].map(v => v + pad) };
}
function activeClips(){
  if (!SEC.on) return [];
  if (SEC.tab === "box") return boxPlanes();
  return SEC.planes.filter(p => p.on).map(planeEq).filter(Boolean).map(q => ({ n: q.n, d: q.d }));
}
function secCorners(P){
  const pl = planeEq(P), bb = modelBox(); if (!pl || !bb) return null;
  const [mn, mx] = bb, n = pl.n, ax = Math.abs(n[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1], u = V3.norm(V3.cross(n, ax)), w = V3.cross(n, u);
  const ext = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2 * 0.75, c = pl.p0;
  const ctr = [0, 1, 2].map(i => (mn[i] + mx[i]) / 2), cc = V3.sub(ctr, V3.sc(n, V3.dot(n, V3.sub(ctr, c))));   // model centre projected on the plane
  return [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([a, b]) => V3.add(cc, V3.add(V3.sc(u, a * ext), V3.sc(w, b * ext))));
}
function applySection(light){
  const cl = activeClips();
  V.setClip(cl.length ? cl : null);
  if (light) syncSecInputs(); else renderSecPanel();
  drawOverlay();
  const pl = SEC.tab === "plane" && actPlane() && actPlane().on ? secPlane() : null;
  window.__sec = { on: SEC.on, tab: SEC.tab, enabled: SEC.enabled, mode: SEC.mode, offset: SEC.offset, flip: SEC.flip, plane: pl && { n: pl.n, d: pl.d }, clips: cl.length,
    planes: SEC.planes.map(p => ({ name: p.name, on: p.on, mode: p.mode, offset: p.offset })), active: SEC.active, box: SEC.box && { mn: SEC.box.mn.slice(), mx: SEC.box.mx.slice() } };
}
const projMmAxis = (axis, v) => D.manifest.origin_mm[axis] + v * 1000;
const shownOffset = P => Math.round(P.axis >= 0 ? projMmAxis(P.axis, P.offset) : P.offset * 1000);
function syncSecInputs(){   // light update while dragging (no panel rebuild)
  const P = actPlane(), u = SEC.ui; if (!u || !P) return;
  if (u.sl) u.sl.value = P.offset; if (u.num && document.activeElement !== u.num) u.num.value = shownOffset(P);
  if (u.box) u.box.textContent = boxText();
}
function boxText(){ const b = SEC.box; if (!b) return ""; return "Box " + [0, 1, 2].map(i => Math.round((b.mx[i] - b.mn[i]) * 1000).toLocaleString("en-US")).join(" × ") + " mm"; }
function secModeSelect(P){
  return h("select", { class: "secmode", "aria-label": "Section plane orientation", onchange: e => {
      const v = e.target.value;
      if (v === "pts") { setMeasure(false); SEC.picking = { kind: "pts", a: null }; msg("Click the first point of the section line."); renderSecPanel(); return; }
      if (v === "face") { setMeasure(false); SEC.picking = { kind: "face", add: false }; msg("Click a face in the model: the plane is placed on it."); renderSecPanel(); return; }
      secSetup(v); } },
    h("option", { value: "z", text: "Plan cut (horizontal)", selected: P.mode === "z" || null }), h("option", { value: "x", text: "Section across X (east–west)", selected: P.mode === "x" || null }),
    h("option", { value: "y", text: "Section across Y (north–south)", selected: P.mode === "y" || null }),
    h("optgroup", { label: "Along an elevation (parallel to the facade)" }, ...D.elevs.map(ev => h("option", { value: "elev:" + ev, text: ev + " · along", selected: P.mode === "elev:" + ev || null }))),
    h("optgroup", { label: "Across an elevation (wall section, profile)" }, ...D.elevs.map(ev => h("option", { value: "across:" + ev, text: ev + " · across", selected: P.mode === "across:" + ev || null }))),
    h("option", { value: "pts", text: "Through two points…", selected: P.mode === "pts" || null }),
    h("option", { value: "face", text: "On a face (click in the model)…", selected: P.mode === "face" || null }));
}
function renderSecPanel(){
  const p = $("#secPanel"); p.hidden = !SEC.on; $("#vSection").classList.toggle("on", SEC.on); $("#vSection").setAttribute("aria-pressed", SEC.on);
  SEC.ui = null;
  if (!SEC.on) return;
  p.classList.toggle("min", SEC.min);
  const head = h("div", { class: "sech", title: "Drag to move this panel" }, icon("i-section"), h("b", { text: "Sectioning tools" }),
    h("button", { class: "btn icon", type: "button", "aria-label": SEC.min ? "Expand" : "Minimise", title: SEC.min ? "Expand" : "Minimise", onclick: () => { SEC.min = !SEC.min; renderSecPanel(); } }, SEC.min ? "+" : "–"),
    h("button", { class: "btn icon", id: "secClose", type: "button", "aria-label": "Close sectioning tools", title: "Close (the cut is removed)", onclick: () => setSection(false) }, icon("i-x")));
  panelDrag(p, head);
  if (SEC.min) { putKids(p, head); return; }
  const tab = (k, label) => h("button", { class: "sectab" + (SEC.tab === k ? " on" : ""), type: "button", role: "tab", "aria-selected": SEC.tab === k, onclick: () => {
    SEC.tab = k; SEC.picking = null;
    if (k === "box" && !SEC.box) SEC.box = boxDefault();
    if (k === "plane" && !SEC.planes.length) secSetup("z"); else applySection(); } }, label);
  const kids = [head, h("div", { class: "sectabs", role: "tablist" }, tab("plane", "Plane"), tab("box", "Box"))];
  if (SEC.tab === "plane") {
    kids.push(h("div", { class: "mbtns" },
      h("button", { class: "btn" + (SEC.picking && SEC.picking.kind === "face" && SEC.picking.add ? " primary" : ""), type: "button", disabled: SEC.planes.length >= MAXPL || null, title: "Click a face in the model to place a new plane on it", onclick: () => { setMeasure(false); SEC.picking = { kind: "face", add: true }; msg("Click a face in the model: a new plane is placed on it. Esc cancels."); renderSecPanel(); } }, "Add plane"),
      h("button", { class: "btn", type: "button", title: "New horizontal plane", disabled: SEC.planes.length >= MAXPL || null, onclick: () => { if (newPlane()) secSetup("z"); } }, "+ Plan cut"),
      h("button", { class: "btn", type: "button", disabled: !SEC.planes.length || null, onclick: () => { SEC.planes = []; SEC.active = -1; SEC.picking = null; applySection(); } }, "Clear all")));
    if (SEC.picking) kids.push(h("div", { class: "mst on", text: SEC.picking.kind === "face" ? "Click a face in the model (Esc cancels)" : SEC.picking.a ? "Click the second point" : "Click the first point (section line in plan)" }));
    kids.push(h("ul", { class: "seclist", "aria-label": "Planes" }, ...SEC.planes.map((P, i) => h("li", { class: i === SEC.active ? "act" : "" },
      h("button", { class: "btn icon eye" + (P.on ? " on" : ""), type: "button", "aria-pressed": P.on, title: P.on ? "Cutting (click to switch this plane off)" : "Off (click to cut with this plane)", "aria-label": `${P.name} on/off`, onclick: () => { P.on = !P.on; applySection(); } }, P.on ? "◉" : "○"),
      h("button", { class: "secname", type: "button", onclick: () => { SEC.active = i; applySection(); } }, h("b", { text: P.name }), h("small", { text: P.label || "" })),
      h("button", { class: "btn icon", type: "button", "aria-label": `Delete ${P.name}`, title: "Delete this plane", onclick: () => { SEC.planes.splice(i, 1); SEC.active = Math.min(SEC.active, SEC.planes.length - 1); applySection(); } }, icon("i-x"))))));
    const P = actPlane();
    if (P && P.n) {
      const step = (P.range[1] - P.range[0]) / 1000;
      const num = h("input", { type: "number", step: 10, value: shownOffset(P), "aria-label": "Position in mm", onchange: e => {
        const v = +e.target.value; if (!isFinite(v)) return;
        P.offset = P.axis >= 0 ? (v - D.manifest.origin_mm[P.axis]) / 1000 : v / 1000; P.offset = Math.min(P.range[1], Math.max(P.range[0], P.offset)); applySection(); } });
      const sl = h("input", { type: "range", min: P.range[0], max: P.range[1], step, value: P.offset, "aria-label": "Section position", oninput: e => { P.offset = +e.target.value; applySection(true); } });
      SEC.ui = { sl, num };
      kids.push(h("div", { class: "secact", text: `${P.name}: drag the blue arrow in the model, or:` }), secModeSelect(P),
        h("div", { class: "secpos" }, sl, h("label", null, num, h("span", { text: P.axis >= 0 ? ["X", "Y", "Z"][P.axis] + " mm" : (P.mode || "").startsWith("across:") ? "mm along facade" : (P.mode || "").startsWith("elev:") ? "mm into facade" : "mm from plane" }))),
        h("div", { class: "mbtns" },
          h("button", { class: "btn", type: "button", title: "Keep the other side", onclick: () => { P.flip = !P.flip; applySection(); } }, "Flip"),
          h("button", { class: "btn", type: "button", title: "Look perpendicular at the cut (Section A–A)", onclick: sectionView }, "Section view"),
          h("button", { class: "btn", type: "button", title: "Back to the starting position of this plane", onclick: () => { P.flip = false; secSetup(P.mode === "pts" && !P.twoPts || P.mode === "face" && !P.faceN ? "z" : P.mode); } }, "Reset")));
    } else kids.push(h("p", { class: "mnote", text: "No plane. Use Add plane (click a face) or + Plan cut." }));
  } else {
    const bx = h("div", { class: "secact", text: boxText() });
    SEC.ui = { box: bx };
    kids.push(h("p", { class: "mnote", text: "Drag the arrows on the six faces of the box to cut the model from each side. Only what is inside the box is shown." }), bx,
      h("div", { class: "mbtns" },
        h("button", { class: "btn", type: "button", disabled: !(S.sel && S.sel.eids.length) || null, onclick: () => { SEC.box = boxFrom(S.sel.eids, 0.3); applySection(); } }, "Fit to selection"),
        h("button", { class: "btn", type: "button", title: "Box around the selection, else the stones shown by the filters", onclick: () => { SEC.box = boxDefault(); applySection(); } }, "Reset box")));
  }
  kids.push(h("div", { class: "secopts" },
    h("label", { class: "chk" }, h("input", { type: "checkbox", checked: SEC.frame || null, onchange: e => { SEC.frame = e.target.checked; saveSecPrefs(); drawOverlay(); } }), "Show frame"),
    h("label", { class: "chk" }, h("input", { type: "checkbox", checked: SEC.gizmo || null, onchange: e => { SEC.gizmo = e.target.checked; saveSecPrefs(); drawOverlay(); } }), "Show gizmo")),
    h("p", { class: "mnote", text: "Clipping view for inspection: cut stones are shown open, without filled section faces. It is not a finished section drawing." }));
  putKids(p, ...kids);
}
function panelDrag(panel, handle){   // move the floating panel by its title bar
  handle.addEventListener("pointerdown", e => {
    if (e.target.closest("button")) return;
    const box = panel.getBoundingClientRect(), host = panel.offsetParent.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
    const mv = ev => {
      const x = Math.max(0, Math.min(host.width - box.width, box.left - host.left + ev.clientX - sx)), y = Math.max(0, Math.min(host.height - 40, box.top - host.top + ev.clientY - sy));
      Object.assign(panel.style, { left: x + "px", top: y + "px", right: "auto", bottom: "auto" });
    };
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); e.preventDefault();
  });
}
function setSection(on){
  SEC.on = on; SEC.picking = null; SEC.drag = null;
  if (on) { if (SEC.tab === "plane" && !SEC.planes.length) secSetup("z"); else { if (SEC.tab === "box" && !SEC.box) SEC.box = boxDefault(); applySection(); } }
  else { V.setClip(null); renderSecPanel(); drawOverlay(); window.__sec = { on: false }; }
}

/* ---------- gizmo: arrows drawn in the overlay, dragged with the mouse (or a finger) */
function placeHandle(p, du, used){   // first free spot near p: inside the view, off the floating panels, apart from other handles
  const W = V.c.clientWidth, H = V.c.clientHeight, cr = V.c.getBoundingClientRect();
  const avoid = ["#secPanel", "#measPanel"].map(q => $(q)).filter(e => e && !e.hidden).map(e => { const r = e.getBoundingClientRect(); return [r.left - cr.left - 22, r.top - cr.top - 22, r.right - cr.left + 22, r.bottom - cr.top + 22]; });
  const free = q => q[0] >= GZ_MARGIN.l && q[0] <= W - GZ_MARGIN.r && q[1] >= GZ_MARGIN.t && q[1] <= H - GZ_MARGIN.b
    && !avoid.some(r => q[0] > r[0] && q[0] < r[2] && q[1] > r[1] && q[1] < r[3]) && !used.some(u => Math.hypot(u[0] - q[0], u[1] - q[1]) < 64);
  if (free(p)) return p;
  const pv = [-du[1], du[0]];
  for (let k = 1; k <= 12; k++) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const q = [p[0] + (du[0] * a + pv[0] * b) * 44 * k, p[1] + (du[1] * a + pv[1] * b) * 44 * k];
    if (free(q)) return q;
  }
  return p;
}
function gizmo(svg, g, n, opt){
  const vp = V.vpNow(), s0 = V.project(g, vp); if (!s0[2]) return;
  const k = Math.max(0.05, V.cam.d * 0.02), s1 = V.project(V3.add(g, V3.sc(n, k)), vp);
  const r = V3.norm(V3.cross(n, Math.abs(n[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1])), sr = V.project(V3.add(g, V3.sc(r, k)), vp);
  const ppScreen = Math.hypot(sr[0] - s0[0], sr[1] - s0[1]) / k;                  // pixels per metre across the view
  let ux = s1[0] - s0[0], uy = s1[1] - s0[1]; const len = Math.hypot(ux, uy), ppm = len / k;
  const endOn = !s1[2] || ppm < ppScreen * 0.25;                                   // arrow points (almost) at the viewer
  const ce = Math.cos(V.cam.el), toCam = [ce * Math.cos(V.cam.az), ce * Math.sin(V.cam.az), Math.sin(V.cam.el)];
  // drawn position: clamped into the view (the drag still acts on the real plane) and apart from other handles
  const W = V.c.clientWidth, H = V.c.clientHeight, pinned = !onScreen(g);
  const dp = placeHandle([Math.min(W - GZ_MARGIN.r, Math.max(GZ_MARGIN.l, s0[0])), Math.min(H - GZ_MARGIN.b, Math.max(GZ_MARGIN.t, s0[1]))],
    len > 1e-9 ? [ux / len, uy / len] : [0, 1], opt.used || []);
  if (opt.used) opt.used.push(dp);
  s0[0] = dp[0]; s0[1] = dp[1];
  const grp = sv("g", { class: "gz" + (SEC.drag && SEC.drag.key === opt.key ? " drag" : "") + (pinned ? " pinned" : ""), "data-gz": opt.key });
  const ttl = sv("title", {}); ttl.textContent = opt.title; grp.append(ttl);
  const L = opt.len || 56;
  if (endOn) {
    grp.append(sv("circle", { cx: s0[0], cy: s0[1], r: 16, class: "gzhit" }), sv("circle", { cx: s0[0], cy: s0[1], r: 11, class: "gzring" }), sv("circle", { cx: s0[0], cy: s0[1], r: 3.5, class: "gzdot" }));
    const t1 = sv("text", { x: s0[0] + 16, y: s0[1] - 12, class: "gzlab" }); t1.textContent = "↕ drag"; grp.append(t1);
  } else {
    ux /= len; uy /= len;
    const A = opt.double ? [s0[0] - ux * L, s0[1] - uy * L] : [s0[0], s0[1]], B = [s0[0] + ux * L, s0[1] + uy * L];
    const head = (P, sx, sy) => sv("polygon", { class: "gzhead", points: [[P[0] + sx * 12, P[1] + sy * 12], [P[0] - uy * 7, P[1] + ux * 7], [P[0] + uy * 7, P[1] - ux * 7]].map(q => q.join(",")).join(" ") });
    grp.append(sv("line", { x1: A[0], y1: A[1], x2: B[0] + ux * 12, y2: B[1] + uy * 12, class: "gzhit" }), sv("line", { x1: A[0], y1: A[1], x2: B[0], y2: B[1], class: "gzline" }), head(B, ux, uy));
    if (opt.double) grp.append(head(A, -ux, -uy));
    grp.append(sv("circle", { cx: s0[0], cy: s0[1], r: 5, class: "gzdot" }));
  }
  grp.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const st = { x: e.clientX, y: e.clientY, v0: opt.get() };
    SEC.drag = { key: opt.key }; V.anim = null;
    const mv = ev => {
      const dx = ev.clientX - st.x, dy = ev.clientY - st.y;
      // metres along n: projected on the arrow on screen; end-on: dragging up moves the plane towards the viewer
      let t = endOn ? -dy / ppScreen * Math.sign(V3.dot(n, toCam) || 1) : (dx * ux + dy * uy) / ppm;
      if (ev.shiftKey) t *= 0.1;   // Shift: fine movement
      opt.set(st.v0, t); applySection(true);
    };
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); SEC.drag = null; applySection(); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  });
  svg.append(grp);
}
const GZ_MARGIN = { l: 30, r: 30, t: 95, b: 40 };   // keep handles clear of the viewer toolbar and the edges
function onScreen(p){
  const s = V.project(p), w = V.c.clientWidth, hh = V.c.clientHeight;
  return s[2] && s[0] > GZ_MARGIN.l && s[0] < w - GZ_MARGIN.r && s[1] > GZ_MARGIN.t && s[1] < hh - GZ_MARGIN.b;
}
// Where to draw a handle: the plane's own point, or else where the view centre meets the plane,
// so the handle can be reached. For a box face: the visible point of the face nearest the view centre.
function gizmoAnchor(pl){
  if (onScreen(pl.p0)) return pl.p0;
  const w = V.c.clientWidth, hh = V.c.clientHeight, { o, d } = V.ray(w / 2, (hh + GZ_MARGIN.t) / 2), den = V3.dot(pl.n, d);
  if (Math.abs(den) < 1e-6) return pl.p0;
  const t = -(V3.dot(pl.n, o) + pl.d) / den;
  return t > 0 ? V3.add(o, V3.sc(d, t)) : pl.p0;
}
function faceAnchor(fc, a, mn, mx){
  if (onScreen(fc)) return fc;
  const w = V.c.clientWidth, hh = V.c.clientHeight, cx = w / 2, cy = (hh + GZ_MARGIN.t) / 2, vp = V.vpNow();
  const [i, j] = [0, 1, 2].filter(k => k !== a);
  let best = null, bd = Infinity;
  for (let u = 0; u <= 12; u++) for (let v = 0; v <= 12; v++) {
    const q = fc.slice(); q[i] = mn[i] + (mx[i] - mn[i]) * (0.08 + 0.84 * u / 12); q[j] = mn[j] + (mx[j] - mn[j]) * (0.08 + 0.84 * v / 12);
    if (!onScreen(q)) continue;
    const s = V.project(q, vp), dd = Math.hypot(s[0] - cx, s[1] - cy); if (dd < bd) { bd = dd; best = q; }
  }
  return best || fc;   // nothing of the face is in view: the handle is pinned to the edge of the view
}
function drawSection(svg){
  if (!SEC.on) return;
  const vp = V.vpNow(), P = p => V.project(p, vp);
  const ce = Math.cos(V.cam.el), look = [-ce * Math.cos(V.cam.az), -ce * Math.sin(V.cam.az), -Math.sin(V.cam.el)];
  if (SEC.tab === "plane") {
    if (SEC.frame) SEC.planes.forEach((Q, i) => {
      if (!Q.n || !Q.on) return;
      // the outline is not drawn when looking straight at the cut (Section view): it would only frame the screen
      const c = secCorners(Q); if (!c || Math.abs(V3.dot(look, Q.n)) > 0.98) return;
      const pts = c.map(P); if (pts.every(p => p[2])) svg.append(sv("polygon", { points: pts.map(p => p[0] + "," + p[1]).join(" "), class: "secpl" + (i === SEC.active ? " act" : "") }));
    });
    const A = actPlane();
    if (SEC.gizmo && A && A.n && A.on) {
      const pl = planeEq(A), g = gizmoAnchor(pl), sgn = A.axis >= 0 ? A.n[A.axis] : 1;
      gizmo(svg, g, A.n, { key: "pl" + A.id, double: true, title: `${A.name}: drag the arrow to move the cut in or out (hold Shift for fine movement)`,
        get: () => A.offset, set: (v0, t) => { A.offset = Math.min(A.range[1], Math.max(A.range[0], v0 + t * sgn)); } });
    }
  } else if (SEC.box) {
    const b = SEC.box, cn = [0, 1, 2, 3, 4, 5, 6, 7].map(i => [i & 1 ? b.mx[0] : b.mn[0], i & 2 ? b.mx[1] : b.mn[1], i & 4 ? b.mx[2] : b.mn[2]]);
    if (SEC.frame) for (const [i, j] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) {
      const a = P(cn[i]), c = P(cn[j]); if (a[2] && c[2]) svg.append(sv("line", { x1: a[0], y1: a[1], x2: c[0], y2: c[1], class: "secbox" }));
    }
    const used = [];
    if (SEC.gizmo) for (let a = 0; a < 3; a++) for (const hi of [false, true]) {
      const fc = [0, 1, 2].map(i => i === a ? (hi ? b.mx[i] : b.mn[i]) : (b.mn[i] + b.mx[i]) / 2), n = [0, 0, 0]; n[a] = hi ? 1 : -1;
      gizmo(svg, faceAnchor(fc, a, b.mn, b.mx), n, { used, key: `bx${a}${hi ? 1 : 0}`, len: 44, title: "Drag to move this face of the section box (hold Shift for fine movement)",
        get: () => hi ? b.mx[a] : b.mn[a],
        set: (v0, t) => { if (hi) b.mx[a] = Math.max(b.mn[a] + 0.05, v0 + t); else b.mn[a] = Math.min(b.mx[a] - 0.05, v0 - t); } });
    }
  }
}
function sectionView(){
  const pl = secPlane(); if (!pl) return;
  const bb = modelBox(), [mn, mx] = bb, diag = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  let ctr = [0, 1, 2].map(i => (mn[i] + mx[i]) / 2), dist = diag * 0.9;
  const ev = /^(elev|across):/.test(SEC.mode || "") ? SEC.mode.split(":")[1] : null;
  if (ev) {   // centre on that elevation's stones (it may sit at the edge of the building), sized to the facade
    const ids = D.stones.filter(e => e.elev === ev).map(e => e.eid), fb = V.bbox(ids);
    if (fb) { const [a, b] = fb; ctr = [0, 1, 2].map(i => (a[i] + b[i]) / 2); dist = Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), b[2] - a[2]) * 1.25 + 3; }
  }
  const cc = V3.sub(ctr, V3.sc(pl.n, V3.dot(pl.n, ctr) + pl.d));   // centre projected onto the cut
  V.lookAlong(pl.n, cc, dist, true); syncOrtho();
}
function elevationView(ev){
  const fp = facadePlane(ev); if (!fp) { msg("Not enough stones on this elevation."); return; }
  const ids = D.stones.filter(e => e.elev === ev).map(e => e.eid), bb = V.bbox(ids), [mn, mx] = bb;
  const ext = Math.max(Math.hypot(mx[0] - mn[0], mx[1] - mn[1]), mx[2] - mn[2]);
  V.lookAlong([-fp.n[0], -fp.n[1], 0], fp.c, ext * 1.25 + 3, true); syncOrtho();
  msg(`Elevation ${ev}: looking at the facade from outside (orthographic). ${SEC.on ? "" : "Use Section › Along an elevation to cut along it."}`);
}
function syncOrtho(){ const b = $("#vOrtho"); if (!b || !V) return; b.classList.toggle("on", V.cam.ortho); b.setAttribute("aria-pressed", V.cam.ortho); b.textContent = V.cam.ortho ? "Ortho" : "Perspective"; }

/* ---------- viewer hooks */
function toolsClick(x, y){
  if (SEC.picking) {
    const hit = V.pickPoint(x, y, SEC.picking.kind === "face" ? 0 : 10); if (!hit) { msg("No model surface under the cursor."); return true; }
    if (SEC.picking.kind === "face") {
      const add = SEC.picking.add; SEC.picking = null;
      if (add && !newPlane()) { renderSecPanel(); return true; }
      if (!actPlane()) newPlane();
      const P = actPlane(); P.faceBase = hit.p; P.faceN = V3.sc(hit.fn, -1); P.flip = false;
      secSetup("face"); msg(`${P.name} placed on the face. Drag its arrow to move the cut.`); return true;
    }
    if (!SEC.picking.a) { SEC.picking.a = hit.p; renderSecPanel(); drawOverlay(); return true; }
    const a = SEC.picking.a, b = hit.p; SEC.picking = null;
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.05) { msg("The two points are too close in plan; choose points further apart."); renderSecPanel(); return true; }
    SEC.twoPts = [a, b]; secSetup("pts"); return true;
  }
  if (MEAS.active) { measureClick(x, y); return true; }
  return false;
}
function toolsHover(x, y){
  if (!MEAS.active && !SEC.picking) return;
  const now = performance.now(); if (now - MEAS.hoverAt < 70) return; MEAS.hoverAt = now;
  MEAS.hover = V.pickPoint(x, y); drawOverlay();
  const st = $("#measPanel .mst"); if (st && MEAS.active) st.textContent = (MEAS.pending ? "Click the second point" : "Click the first point") + (MEAS.hover ? ` · snap: ${MEAS.hover.kind}` : "");
}
function toolsEscape(){
  if (SEC.picking) { SEC.picking = null; renderSecPanel(); drawOverlay(); return true; }
  if (MEAS.active && MEAS.pending) { MEAS.pending = null; renderMeasPanel(); drawOverlay(); return true; }
  if (MEAS.active) { setMeasure(false); return true; }
  return false;
}
function initTools3d(){
  // per model (re)load: elevation list and viewer hooks
  const sel = $("#vElev");
  if (sel) sel.replaceChildren(h("option", { value: "", text: "Elevation view…" }), ...D.elevs.map(ev => h("option", { value: ev, text: ev })));
  if (V) { V.onClickPoint = toolsClick; V.onHover = toolsHover; }
  if (SEC.planes.length) {   // a new model: recompute the planes that depend on it (positions kept)
    const keep = SEC.active;
    SEC.planes.forEach((P, i) => { SEC.active = i; if (P.mode !== "pts" && P.mode !== "face") secSetup(P.mode, true, true); });
    SEC.active = keep;
  }
  if (SEC.on) applySection();
  if (initTools3d.done) return;
  initTools3d.done = true;
  $("#vMeasure").onclick = () => setMeasure(!MEAS.active);
  $("#vSection").onclick = () => setSection(!SEC.on);
  sel.onchange = e => { if (e.target.value) elevationView(e.target.value); e.target.value = ""; };
}

/* ---------- STL preview: measurement with an explicit file unit (STL files carry no unit) */
const STLM = { active: false, list: [], pending: null, hover: null, fileUnit: "", viewer: null, stl: null, onInfo: null, hoverAt: 0 };
try { const u = localStorage.getItem("fst.stlunit"); if (UNITS[u]) STLM.fileUnit = u; } catch (e) { /* not confirmed */ }
const stlToM = () => STLM.fileUnit ? 1 / UNITS[STLM.fileUnit] : null;
const stlLen = d => STLM.fileUnit ? fmtLen(d * stlToM()) : `${d.toLocaleString("en-US", { minimumFractionDigits: MEAS.dec, maximumFractionDigits: MEAS.dec })} file units`;
function stlSizeText(stl){ return stl.size.map(v => STLM.fileUnit ? (v * stlToM() * UNITS[MEAS.unit]).toLocaleString("en-US", { maximumFractionDigits: MEAS.dec }) : (Math.round(v * 10) / 10).toLocaleString("en-US")).join(" × ") + (STLM.fileUnit ? ` ${MEAS.unit} (file unit ${STLM.fileUnit}, confirmed)` : " file units (unit not confirmed)"); }
function stlMeasureAttach(viewer, stl, onInfo){
  Object.assign(STLM, { active: false, list: [], pending: null, hover: null, viewer, stl, onInfo });
  viewer.onDraw = stlDraw;
  viewer.onClickPoint = (x, y) => {
    if (!STLM.active) return;
    const hit = viewer.pickPoint(x, y); if (!hit) return;
    if (!STLM.pending) STLM.pending = hit;
    else { const a = STLM.pending.p, b = hit.p; STLM.list.push({ a, b, d: Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), kinds: [STLM.pending.kind, hit.kind] }); STLM.pending = null; }
    stlPanel(); stlDraw();
  };
  viewer.onHover = (x, y) => { if (!STLM.active) return; const now = performance.now(); if (now - STLM.hoverAt < 40) return; STLM.hoverAt = now; STLM.hover = viewer.pickPoint(x, y); stlDraw(); };
  onInfo(); stlPanel();
}
function stlMeasureToggle(){ STLM.active = !STLM.active; STLM.pending = null; STLM.hover = null; if (STLM.viewer) STLM.viewer.measuring = STLM.active; const b = $("#stlMeasure"); b.classList.toggle("on", STLM.active); b.setAttribute("aria-pressed", STLM.active); stlPanel(); stlDraw(); }
function stlDraw(){
  const svg = $("#stlOvl"), v = STLM.viewer; if (!svg || !v || !v.lastVP) return;
  svg.replaceChildren();
  const P = p => v.project(p), dot = p => { const s = P(p); if (s[2]) svg.append(sv("circle", { cx: s[0], cy: s[1], r: 4, class: "mpt" })); };
  STLM.list.forEach((m, i) => { const a = P(m.a), b = P(m.b); if (!a[2] || !b[2]) return; svg.append(sv("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "mline" })); dot(m.a); dot(m.b);
    const t = sv("text", { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 - 7, class: "mlab", "text-anchor": "middle" }); t.textContent = `${i + 1}: ${stlLen(m.d)}`; svg.append(t); });
  if (STLM.pending) { dot(STLM.pending.p); if (STLM.hover) { const a = P(STLM.pending.p), b = P(STLM.hover.p); svg.append(sv("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "mline pend" })); } }
  if (STLM.active && STLM.hover) { const s = P(STLM.hover.p); svg.append(sv(STLM.hover.kind === "vertex" ? "rect" : "circle", STLM.hover.kind === "vertex" ? { x: s[0] - 5, y: s[1] - 5, width: 10, height: 10, class: "msnap v" } : { cx: s[0], cy: s[1], r: 5, class: "msnap " + STLM.hover.kind })); }
}
function stlPanel(){
  const p = $("#stlMeasPanel"); if (!p) return;
  p.hidden = !STLM.active && !STLM.list.length; if (p.hidden) return;
  const fu = h("select", { "aria-label": "STL file unit", class: STLM.fileUnit ? "" : "need", onchange: e => { STLM.fileUnit = e.target.value; try { if (STLM.fileUnit) localStorage.setItem("fst.stlunit", STLM.fileUnit); else localStorage.removeItem("fst.stlunit"); } catch (x) { /* session only */ } stlPanel(); stlDraw(); STLM.onInfo && STLM.onInfo(); } },
    h("option", { value: "", text: "File unit: not confirmed", selected: !STLM.fileUnit || null }), ...Object.keys(UNITS).map(u => h("option", { value: u, text: `File unit: ${u}`, selected: STLM.fileUnit === u || null })));
  const du = h("select", { "aria-label": "Display unit", disabled: !STLM.fileUnit || null, onchange: e => { MEAS.unit = e.target.value; MEAS.dec = UNIT_DEC[MEAS.unit]; saveMeasPrefs(); stlPanel(); stlDraw(); STLM.onInfo && STLM.onInfo(); renderMeasPanel(); } }, ...Object.keys(UNITS).map(u => h("option", { value: u, text: u, selected: MEAS.unit === u || null })));
  putKids(p, h("div", { class: "mph" }, icon("i-ruler"), h("b", { text: "Measure STL" }), du),
    fu, STLM.fileUnit ? null : h("p", { class: "mnote warn", text: "STL files do not store a unit. Choose the unit the file was made in to see real dimensions; until then values are in file units." }),
    h("div", { class: "mst" + (STLM.active ? " on" : ""), text: STLM.active ? (STLM.pending ? "Click the second point" : "Click the first point") : "Measuring is off" }),
    h("ol", { class: "mlist" }, ...STLM.list.map((m, i) => h("li", null, h("span", null, h("b", { text: stlLen(m.d) })), h("button", { class: "btn icon", type: "button", "aria-label": `Delete measurement ${i + 1}`, onclick: () => { STLM.list.splice(i, 1); stlPanel(); stlDraw(); } }, icon("i-x"))))),
    h("div", { class: "mbtns" }, h("button", { class: "btn", type: "button", disabled: !STLM.list.length || null, onclick: () => { STLM.list = []; STLM.pending = null; stlPanel(); stlDraw(); } }, "Clear all"),
      h("button", { class: "btn" + (STLM.active ? " primary" : ""), type: "button", onclick: stlMeasureToggle }, STLM.active ? "Done" : "Measure again")));
  window.__stlMeas = { fileUnit: STLM.fileUnit, unit: MEAS.unit, list: STLM.list.map(m => ({ d: m.d, text: stlLen(m.d), kinds: m.kinds })) };
}
