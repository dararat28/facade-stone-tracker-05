/* IFC revision comparison (no DOM; also runs in Node for tests).
   Compare.run(prev, next, {fabFile}) compares two dashboard models (manifests produced from IFC
   files by assets/ifc-core.js or tools/export_geom.py) and returns element and Type (ticket)
   level results. Nothing is modified; the manifests are only read.

   Matching, in this order (an element is matched once):
     1. IFC GlobalId, accepted when the ticket is the same or the element stayed in place (< 50 mm);
        a GlobalId that now belongs to another ticket somewhere else is not trusted.
     2. Ticket + elevation + position: nearest centre within 100 mm.
     3. Ticket + position: nearest centre within 1,000 mm (element moved or changed elevation).
     4. Left over: only in the previous model -> Removed; only in the new model -> Added;
        the same ticket left over in both -> "Unmatched / requires review" on both sides.
   Compared values: the IFC properties of the Text, Dimensions, Identity Data and Other property sets
   (except Revit's internal Type Id and Category), Length derived from the Revit Type name "L=…"
   when Dimensions.LENGTH is missing, and geometry (size > 1 mm, position > 10 mm).
   Formatting-only differences (spaces, "" vs missing, number formatting) are ignored. */
"use strict";
const Compare = (() => {
  const PSETS = new Set(["Text", "Dimensions", "Identity Data", "Other"]);
  const SKIP = new Set(["Other.Type Id", "Other.Category"]);
  const FAB = /^(Dimensions\.|Derived\.Length$|Other\.(Type|Family|Family and Type)$|Text\.(FINISH|Detail|Issue Status|T-31-Count|T-31\(30mm\.\)-Count)$|Geometry\.Size$)/;
  const LABEL = { "Text.TICKET NUMBER": "Ticket Number", "Text.Architect": "Elevation (Architect)", "Identity Data.Workset": "Workset / Phase", "Dimensions.LENGTH": "Length", "Dimensions.WIDTH": "Width",
    "Dimensions.HEIGHT": "Height", "Dimensions.THICKNESS": "Thickness", "Derived.Length": "Length (from Revit Type name)", "Other.Type": "Revit Type", "Text.FINISH": "Finish", "Text.Detail": "Detail",
    "Geometry.Size": "Geometry size (mm)", "Geometry.Position": "Position (mm)", "Dimensions.Area": "Area (m²)", "Dimensions.Volume": "Volume (m³)" };
  const UNIT = { "Dimensions.LENGTH": "mm", "Dimensions.WIDTH": "mm", "Dimensions.HEIGHT": "mm", "Dimensions.THICKNESS": "mm", "Derived.Length": "mm", "Dimensions.Area": "m²", "Dimensions.Volume": "m³" };
  const label = k => LABEL[k] || k.replace(/^(Text|Dimensions|Identity Data|Other)\./, "");
  const normT = t => (t == null ? "" : String(t)).replace(/\s+/g, "").toUpperCase();
  const typeLen = e => { const t = e.ps && e.ps.Other && e.ps.Other.Type; const m = typeof t === "string" && /^\s*L\s*=\s*(\d+(?:\.\d+)?)\s*$/i.exec(t); return m ? +m[1] : null; };
  function values(e){
    const out = new Map();
    for (const [ps, props] of Object.entries(e.ps || {})) {
      if (!PSETS.has(ps)) continue;
      for (const [k, v] of Object.entries(props)) { const key = ps + "." + k; if (!SKIP.has(key)) out.set(key, v); }
    }
    if (!out.has("Dimensions.LENGTH")) { const l = typeLen(e); if (l != null) out.set("Derived.Length", l); }
    return out;
  }
  const norm = v => v == null ? "" : typeof v === "number" ? v : String(v).trim().replace(/\s+/g, " ");
  function same(a, b){
    a = norm(a); b = norm(b);
    const na = typeof a === "number" ? a : a !== "" && isFinite(+a) ? +a : null, nb = typeof b === "number" ? b : b !== "" && isFinite(+b) ? +b : null;
    if (na != null && nb != null) return Math.abs(na - nb) <= Math.max(1e-9, 1e-6 * Math.max(Math.abs(na), Math.abs(nb)));
    return String(a) === String(b);
  }
  const geo = (e, origin) => { const b = e.bb; if (!b) return null; return { c: [0, 1, 2].map(i => origin[i] + (b[i] + b[i + 3]) / 2 * 1000), s: [0, 1, 2].map(i => (b[i + 3] - b[i]) * 1000).sort((x, y) => y - x) }; };
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const r1 = v => Math.round(v * 10) / 10;

  function diff(a, b, ga, gb){
    const va = values(a), vb = values(b), out = [];
    for (const k of new Set([...va.keys(), ...vb.keys()])) {
      const p = va.get(k), n = vb.get(k);
      if (same(p, n)) continue;
      const pn = typeof norm(p) === "number" || (norm(p) !== "" && isFinite(+p)), nn = typeof norm(n) === "number" || (norm(n) !== "" && isFinite(+n));
      out.push({ key: k, prop: label(k), prev: p == null || p === "" ? null : p, next: n == null || n === "" ? null : n,
        diff: pn && nn ? +((+n) - (+p)).toPrecision(10) : null, unit: UNIT[k] || "", fab: FAB.test(k) });
    }
    if (ga && gb) {
      if (ga.s.some((x, i) => Math.abs(x - gb.s[i]) > 1)) out.push({ key: "Geometry.Size", prop: label("Geometry.Size"), prev: ga.s.map(r1).join(" × "), next: gb.s.map(r1).join(" × "), diff: null, unit: "mm", fab: true });
      const d = dist(ga.c, gb.c);
      if (d > 10) out.push({ key: "Geometry.Position", prop: label("Geometry.Position"), prev: ga.c.map(Math.round).join(", "), next: gb.c.map(Math.round).join(", "), diff: Math.round(d), unit: "mm", fab: false, note: "moved" });
    }
    return out;
  }

  function pairNearest(as, bs, limit, how, pairs, usedA, usedB, G){
    const cand = [];
    for (const a of as) if (!usedA.has(a)) for (const b of bs) if (!usedB.has(b)) {
      const ga = G.a.get(a), gb = G.b.get(b); if (!ga || !gb) continue;
      const d = dist(ga.c, gb.c); if (d <= limit) cand.push([d, a, b]);
    }
    cand.sort((x, y) => x[0] - y[0]);
    for (const [, a, b] of cand) if (!usedA.has(a) && !usedB.has(b)) { usedA.add(a); usedB.add(b); pairs.push([a, b, how]); }
  }
  const groupBy = (list, fn) => { const m = new Map(); for (const x of list) { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };

  function run(prev, next, opt = {}){
    const t0 = Date.now();
    const A = prev.elements.filter(e => e.kind === "stone"), B = next.elements.filter(e => e.kind === "stone");
    const G = { a: new Map(A.map(e => [e, geo(e, prev.origin_mm)])), b: new Map(B.map(e => [e, geo(e, next.origin_mm)])) };
    const pairs = [], usedA = new Set(), usedB = new Set();
    // 1. GlobalId
    const bByGid = new Map(B.map(e => [e.gid, e]));
    let gidHit = 0, gidRejected = 0;
    for (const a of A) {
      const b = bByGid.get(a.gid); if (!b) continue;
      gidHit++;
      const ga = G.a.get(a), gb = G.b.get(b);
      if (normT(a.ticket) === normT(b.ticket) || (ga && gb && dist(ga.c, gb.c) < 50)) { usedA.add(a); usedB.add(b); pairs.push([a, b, "GlobalId"]); }
      else gidRejected++;
    }
    // 2. ticket + elevation + position, 3. ticket + position
    const restA = () => A.filter(a => !usedA.has(a)), restB = () => B.filter(b => !usedB.has(b));
    let ga2 = groupBy(restA(), e => normT(e.ticket) + "|" + e.elev), gb2 = groupBy(restB(), e => normT(e.ticket) + "|" + e.elev);
    for (const [k, as] of ga2) if (gb2.has(k)) pairNearest(as, gb2.get(k), 100, "Ticket + elevation + position", pairs, usedA, usedB, G);
    ga2 = groupBy(restA(), e => normT(e.ticket)); gb2 = groupBy(restB(), e => normT(e.ticket));
    for (const [k, as] of ga2) if (gb2.has(k)) pairNearest(as, gb2.get(k), 1000, "Ticket + position", pairs, usedA, usedB, G);
    // 4. left over
    const la = groupBy(restA(), e => normT(e.ticket)), lb = groupBy(restB(), e => normT(e.ticket));
    const items = [];
    for (const [a, b, how] of pairs) {
      const ch = diff(a, b, G.a.get(a), G.b.get(b));
      items.push({ status: ch.length ? "modified" : "unchanged", a, b, how, changes: ch, key: normT(b.ticket) });
    }
    for (const [k, as] of la) for (const a of as) items.push(lb.has(k) ? { status: "unmatched", a, b: null, how: "no reliable match", changes: [], key: k, side: "previous" } : { status: "removed", a, b: null, how: "", changes: [], key: k });
    for (const [k, bs] of lb) for (const b of bs) items.push(la.has(k) ? { status: "unmatched", a: null, b, how: "no reliable match", changes: [], key: k, side: "new" } : { status: "added", a: null, b, how: "", changes: [], key: k });

    // Types (tickets) and the Fab Sheet list
    const qty = (list, k) => list.filter(e => normT(e.ticket) === k).length;
    const byT = groupBy(items, it => it.key);
    const ticketsA = new Set(A.map(e => normT(e.ticket))), ticketsB = new Set(B.map(e => normT(e.ticket)));
    const qA = groupBy(A, e => normT(e.ticket)), qB = groupBy(B, e => normT(e.ticket));
    const types = [];
    for (const [k, its] of byT) {
      const inA = ticketsA.has(k), inB = ticketsB.has(k);
      const eA = qA.get(k) || [], eB = qB.get(k) || [];
      const elevA = groupBy(eA, e => e.elev), elevB = groupBy(eB, e => e.elev);
      const qtyElev = [...new Set([...elevA.keys(), ...elevB.keys()])].sort().map(ev => ({ elev: ev, prev: (elevA.get(ev) || []).length, next: (elevB.get(ev) || []).length }));
      const n = s => its.filter(i => i.status === s).length;
      const props = new Map();
      for (const it of its) for (const c of it.changes) { const p = props.get(c.key) || { key: c.key, prop: c.prop, fab: c.fab, unit: c.unit, values: new Map(), count: 0 }; p.count++; const vk = `${c.prev}→${c.next}`; if (!p.values.has(vk)) p.values.set(vk, { prev: c.prev, next: c.next, diff: c.diff }); props.set(c.key, p); }
      const status = !inA ? "added" : !inB ? "removed" : n("unmatched") ? "unmatched" : (n("added") || n("removed") || n("modified") || qtyElev.some(q => q.prev !== q.next)) ? "modified" : "unchanged";
      const reasons = [];
      if (status === "added") reasons.push("new Type");
      if (status === "removed") reasons.push("Type removed");
      if (inA && inB && eA.length !== eB.length) reasons.push(`quantity ${eA.length} → ${eB.length}`);
      if (inA && inB && eA.length === eB.length && qtyElev.some(q => q.prev !== q.next)) reasons.push("quantity per elevation changed");
      const fabProps = [...props.values()].filter(p => p.fab);
      if (fabProps.length) reasons.push("changed: " + fabProps.map(p => p.prop).join(", "));
      if (n("unmatched")) reasons.push("elements could not be matched reliably: review");
      const nameB = eB[0] && eB[0].ticket, nameA = eA[0] && eA[0].ticket;
      types.push({ key: k, name: nameB || nameA || k, status, qtyPrev: eA.length, qtyNew: eB.length, qtyElev, counts: { added: n("added"), removed: n("removed"), modified: n("modified"), unchanged: n("unchanged"), unmatched: n("unmatched") },
        props: [...props.values()].map(p => ({ ...p, values: [...p.values.values()] })), affected: reasons.length > 0 && status !== "unchanged", reasons,
        fabFile: opt.fabFile ? opt.fabFile(k) : null, elevs: [...new Set([...eA, ...eB].map(e => e.elev))].sort() });
    }
    types.sort((x, y) => String(x.name).localeCompare(String(y.name), "en", { numeric: true }));
    const cnt = s => items.filter(i => i.status === s).length;
    return {
      prevName: prev.source, nextName: next.source, items, types,
      summary: { prevTotal: A.length, newTotal: B.length, added: cnt("added"), removed: cnt("removed"), modified: cnt("modified"), unchanged: cnt("unchanged"), unmatched: cnt("unmatched"),
        affectedTypes: types.filter(t => t.status !== "unchanged").length, affectedSheets: types.filter(t => t.affected).length,
        changedProps: items.reduce((s, i) => s + i.changes.length, 0), gidMatched: gidHit, gidRejected,
        gidShare: Math.min(A.length, B.length) ? gidHit / Math.min(A.length, B.length) : 0, ms: Date.now() - t0 },
    };
  }
  return { run, values, typeLen, label, same };
})();
if (typeof module !== "undefined") module.exports = Compare;
