# Round 4: IFC revision comparison, revision Excel, ruler and section tool

Date: 19 Oct 2026. Model: `INH_Vancouver_Washington_v24_FACADE_2.ifc` (13,703 elements, 1,288 tickets).

## 1. Summary

| Feature | What it does |
|---|---|
| **Compare IFC files** | Compares a previous model with a new one and shows the added, removed, modified, unchanged and requires-review elements in a list and in 3D. Each side can be the model shown now, an `.ifc` / `.zip` file or a saved `elements.json`. |
| **Revision Number (manual)** | The Revision Number and date are typed in, because the IFC does not contain them, and are written into the revision Excel file. |
| **Revision Excel** | Has a Revision Summary (with a colour legend), *Fab Sheets Rev N*, *Changes Rev N* (one row per property: previous / new / difference) and optionally the internal standard sheets. Changed cells are filled yellow, rows are coloured by status and tabs with new data are yellow. It can contain the changed items only or the full report. |
| **Ruler** | Measures between two points in the IFC viewer and the STL preview. Points snap to vertices and edges. Units: mm / cm / m / in / ft, with a choice of decimals. The STL unit must be confirmed first. |
| **Sectioning tools** (ACC-style) | **Plane** tab: up to 6 cutting planes, added on a clicked face or from a list (plan, X, Y, along / across an elevation, through two points). Each plane is moved by dragging the blue arrow gizmo in the model (Shift for fine movement), by the slider or by a value in mm, and can be switched on/off, flipped, reset or cleared. **Box** tab: a six-sided section box with a drag arrow on each face. Options: show frame, show gizmo; floating panel that can be moved and minimised. It can be moved (slider or mm), flipped, switched on or off, reset and closed. Views: Plan, Front, Back, Left, Right, Iso, Section A–A, each elevation (orthographic), with no reload. |

Example from the project (Rev 21, 19/10/26), checked with a constructed Rev 20 test IFC:
- **HT-011:** Length 905 → 906 mm (+1), shown as *Modified* with 1 Fab Sheet to revise.
- **HT-021 and HT-022:** *Added*, 2 new Fab Sheets.
- Result: 3 affected Fab Sheets.

## 2. How the comparison works

1. **Matching** (in this order):
   - by GlobalId (accepted when the ticket is the same or the element moved < 50 mm);
   - then by ticket + elevation + nearest centre (≤ 100 mm);
   - then by ticket + nearest centre (≤ 1 m).
   An element that is still not matched is *added* or *removed* when its ticket is new or gone. Otherwise it is *Requires review* (purple), because it is not guessed.
2. **What is compared:**
   - all IFC property sets (Text, Dimensions, Identity Data, Other);
   - `Length (from Revit Type name)`: read from `L=906` in the Revit Type when the IFC has no LENGTH value, as for HT-011;
   - the geometry size (> 1 mm);
   - the position (> 10 mm).
   Numbers are compared with a relative tolerance of 1e-6, and an empty value counts as equal to a missing one.
3. **Fab Sheet impact:** a Type is affected when an element is added or removed, or when a fabrication property changes (dimensions, Revit Type, Issue Status, T-31 counts, finish, size). Its Fab Sheet is listed as the PDF in `fab-sheets/` or as *Fab Sheet Not Found*.
4. **Speed and memory:**
   - The comparison itself takes about 0.3 s for 13,703 elements.
   - Converting a 1.4 GB IFC in the browser takes 35–40 s per file on this test machine.
   - Switching between *Previous* and *New* only rebuilds the scene from the data already in memory.

## 3. Files

New:
- `assets/compare.js`: comparison engine (no DOM; also runs in Node for tests).
- `assets/compare-ui.js`: Compare dialog, Changes tab, previous/new switch, colours, side-by-side properties.
- `assets/tools3d.js`: ruler, sectioning tools (planes, box, drag gizmo, floating panel), orthographic views, STL ruler, SVG overlay.
- `docs/REPORT-ROUND4.md`: this report.

Modified:
- `assets/viewer.js`:
  - up to 6 clipping planes in the shader (planes or section box);
  - the face normal at a picked point (for *Add plane* on a face);
  - CPU point picking with vertex/edge snapping;
  - `lookAlong` for orthographic views;
  - projection helpers.
- `assets/stl-viewer.js`: point picking, projection and hooks for the ruler.
- `assets/xlsx.js`: cell fills (green / orange / red / yellow / purple) and sheet tab colours.
- `assets/export.js`:
  - the third format, *Revision report*;
  - highlights in the internal standard sheets;
  - the Revision Number is entered manually;
  - Length from the Revit Type name when the IFC has none.
- `assets/app.js`: hooks for the tools, comparison colours and the properties section, Escape handling, and one-time UI listeners.
- `index.html`, `assets/app.css`: buttons, panels, dialogs and the legend.
- `README.md`: new sections.

**Dependencies:** none added. Everything is plain JavaScript with no build step, as before (the Excel writer, the comparison and the tools have no libraries).

## 4. How to run

- **On a computer:** double-click `start-dashboard.bat` (Windows) or `start-dashboard.command` (Mac), or run `python server.py`. The page opens at http://localhost:8000.
- **On GitHub Pages:** upload the changed files (section 3) to the repository, as in `DEPLOY-GITHUB.md`. The workflow republishes the site.

To compare two revisions:
1. Press **Compare**.
2. For *Previous*, choose the old `.ifc` / `.zip` (or a saved `elements.json`). For *New*, choose *Model shown now* or the new file.
3. Enter the Revision Number and date, then press **Compare**.
4. Use the *Changes* tab, the colours, and **Export revision Excel**.

## 5. Test results

Run in Chromium (Playwright) with a software GPU (SwiftShader), on the full model.

| Suite | Result | What it covers |
|---|---|---|
| A1–A9 Comparison | 9 / 9 PASS | Rev 20 test IFC vs current; both sides as IFC files (77 s); saved `elements.json` (< 1 s); HT-011 905 → 906 (+1), HT-021 / HT-022 added; 3D colours; previous/new switch; filters; clear |
| B1–B7 Revision Excel | 7 / 7 PASS | Revision 21 report; status fills; changed cells and tabs yellow; full report (1,288 Types); opens in LibreOffice; the existing export is unchanged |
| C1–C4 Ruler | 4 / 4 PASS | Vertex snapping gives the exact geometry distance (141.8 mm); unit changes; STL in file units until the unit is confirmed |
| D1–D9 Views / sections | 9 / 9 PASS | Plan/front ortho; plan cut through a stone; colours kept; along / across elevation; two-point plane; measuring while cut; no geometry reloaded |
| S1–S9 Sectioning tools (ACC-style) | 10 / 10 PASS | Mouse drag on the arrow moves the cut (camera does not orbit); opposite arrowhead; Shift = 10× finer; *Add plane* on a clicked face; drag into the stone; plane on/off and Clear all; box with 6 handles (top face dragged down); end-on handle in Section view; show gizmo off; panel drag and minimise; close |
| E0 / E0b / S23 | PASS | No page errors; no "null" / "undefined" / "NaN" text |
| Regression S1–S25 (static, GitHub-Pages-like) | 25 / 25 PASS | Re-run on the final code |
| Regression E1–E12 (Excel) | 12 / 12 PASS | Run after the comparison work. The later section changes do not touch the export code |
| Regression G1–G10 (publish to GitHub, mock API) | 10 / 10 PASS | as E |
| Regression V1–V10 (server.py, copy of the folder) | 10 / 10 PASS | as E; the original files were checked unchanged (sha256) |

## 6. Known limitations

- **Gizmo:** moves planes along their normal only. Planes cannot be rotated by dragging; use the orientation list, *Through two points* or *Add plane* on a face. The section box stays aligned with the model axes.
- **No capped sections:** the section is a clipping view. Cut faces are open and not hatched, so it is not a finished construction section drawing.
- **Snapping accuracy:** the ruler snaps to vertices and edges of the element under the cursor. Geometry is stored quantised per element (about 0.02 mm for a 1 m stone), so measurements carry that tolerance. Clicks on empty space are ignored.
- **STL units:** STL files carry no unit. The STL ruler shows *file units* until the unit is confirmed (the choice is remembered in that browser).
- **No revision register:** the comparison and the Revision Number live in the browser tab and in the exported Excel file. A register of past revisions is not stored, and the dashboard does not know the revision of unchanged Fab Sheets.
- **Converter versions:** comparing models converted by different converter versions can show position-only changes. For example, the 17 Oct vs 18 Oct data showed 2 such changes caused by the placement repair, not by the model. Comparing IFC files converted by the same version avoids this.
- **Test data:** no real Rev 20 IFC was available. Tests A and B used a copy of the current IFC with HT-011 set back to `L=905` and HT-021 / HT-022 removed.
- **Not verified here:**
  - opening the workbook in Microsoft Excel (it was checked with openpyxl and LibreOffice);
  - publishing to the real GitHub (tested against a mock of the GitHub API);
  - a hardware GPU (the tests used SwiftShader).
- **Memory:** each 1.4 GB IFC is converted in the browser one after the other, which needs a computer with 8 GB of memory or more. On smaller computers, use a saved `data/elements.json` for the previous side. It loads in under a second.
