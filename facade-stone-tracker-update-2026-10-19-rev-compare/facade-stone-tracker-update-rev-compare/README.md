# Façade Stone Tracker — Vancouver Washington Temple (P23830)

A web dashboard built from the façade **IFC model**. It covers search by ticket, Issue Status,
T-31 hole counts or elevation; stones highlighted in 3D; an Overview page with charts; Fab Sheet
PDFs and STL files linked by ticket number; and import buttons for a new IFC model, STL files
and Fab Sheets.

**The IFC model is the only source of the dashboard's data.** The Excel control workbook is not
read, imported or merged. Changing the Excel file changes nothing on the dashboard.

It is a static website: it runs from **GitHub Pages** (a link anyone can open) or from this
folder on your own computer. Nothing is sent to any online service. The IFC import also
converts the file inside your own browser.

## วิธีใช้ (ภาษาไทย)

- **เปิดผ่านลิงก์:** ทำตาม `DEPLOY-GITHUB.md` ครั้งเดียว แล้วส่งลิงก์ให้ทีม ไม่ต้องติดตั้งอะไร
- **เปิดบนเครื่องตัวเอง:** แตก ZIP แล้วดับเบิลคลิก `start-dashboard.bat` (Windows) หรือ `start-dashboard.command` (Mac) ต้องมี Python 3
- **หน้า Overview:** สรุปภาพรวมเป็นกราฟ กดแท่งกราฟเพื่อไปดูชิ้นหินนั้นในโมเดล
- **ค้นหา:** พิมพ์เลข Ticket, ข้อความ Issue Status (เช่น `glued`), `T31=2` (จำนวนรู T-31-Count),
  `T31-30=3` (T-31(30mm.)-Count), Elevation, GlobalId หรือ Revit ID
- **ปุ่ม Import:** มี 3 แท็บ
  - **IFC model:** แปลงไฟล์ในเบราว์เซอร์และตรวจสอบก่อน แล้วกด *Replace the current model*
  - **STL files:** ไฟล์ต้องชื่อตรงกับเลข Ticket เช่น `18T-001.stl`
  - **Fab Sheets (PDF)**
- **บันทึกให้ทุกคนเห็น:**
  - ถ้าเปิดผ่าน `start-dashboard.bat` ไฟล์ที่ Import จะบันทึกลงเครื่องที่รันเซิร์ฟเวอร์
  - ถ้าเปิดผ่าน GitHub Pages และเชื่อม GitHub ไว้แล้ว (ดู `DEPLOY-GITHUB.md`) Import จะ commit ขึ้น repository ให้เองในขั้นตอนเดียว
  - ถ้ายังไม่ได้เชื่อม ไฟล์ใช้ได้เฉพาะในเบราว์เซอร์ของคุณ ให้กด *Download* แล้วอัปโหลดเอง
- **ปุ่ม Compare:** เลือก IFC ครั้งก่อน และ IFC ใหม่ (หรือโมเดลที่เปิดอยู่) แล้วกรอก Revision Number กับวันที่เอง (ไม่มีใน IFC)
  - ระบบแสดงรายการเพิ่ม (เขียว) ลด (แดง) แก้ไข (ส้ม) และจับคู่ไม่ได้ (ม่วง) ทั้งในรายการและในโมเดล 3D
  - แท็บ *Changes* แสดงค่าก่อนและหลัง ส่วนต่าง และ Fab Sheet ที่ได้รับผลกระทบ
  - กด *Export revision Excel* ได้ไฟล์ที่ไฮไลต์ช่องที่เปลี่ยน และสี Tab ที่มีข้อมูลเพิ่มหรือแก้ไข
- **ไม้บรรทัด (Measure):** คลิก 2 จุดบนโมเดล 3D หรือในหน้า Preview STL
  - จุดจะ snap เข้ามุมหรือขอบของชิ้นหิน
  - เลือกหน่วยได้ (mm, cm, m, in, ft) และจำนวนทศนิยมได้
  - ไฟล์ STL ไม่ได้ระบุหน่วยไว้ ต้องยืนยันหน่วยของไฟล์ก่อน
- **Section (Sectioning tools แบบ ACC):** มี 2 แท็บ
  - **Plane:** ใช้ระนาบตัดได้สูงสุด 6 ระนาบพร้อมกัน
    - *Add plane* แล้วคลิกผิวหินในโมเดล ระนาบจะวางทาบผิวนั้น
    - หรือเลือกชนิดระนาบ: แปลน, แกน X/Y, ขนาน Elevation (*along*), ตั้งฉาก Elevation (*across*, ดู profile ของหิน), ผ่าน 2 จุด
    - **ลากลูกศรสีน้ำเงินในโมเดลเพื่อเลื่อนระนาบเข้า-ออก** (กด Shift ค้างเพื่อเลื่อนละเอียด) หรือใช้แถบเลื่อน / พิมพ์ค่า mm
    - ปุ่มรูปตาเปิด-ปิดแต่ละระนาบ, Flip กลับด้าน, Clear all ลบทั้งหมด
  - **Box:** กล่องตัด 6 ด้าน ลากลูกศรที่แต่ละด้านเพื่อตัดเข้า เริ่มจากรอบชิ้นที่เลือก หรือชิ้นที่แสดงตาม filter
  - ตัวเลือก Show frame / Show gizmo; ลากแถบหัวเพื่อย้ายหน้าต่าง หรือกด – เพื่อย่อ
  - มีมุมมอง Plan / Front / Back / Left / Right / Section A–A / Iso และมุมมองตรงของแต่ละ Elevation
  - เป็นการซ่อนส่วนที่ถูกตัด (clipping) ไม่ได้เติมผิวหน้าตัดแบบแบบก่อสร้าง

## Pages

- **Overview**: KPI cards and charts, all from the IFC:
  - elements by elevation and by phase;
  - Issue Status values;
  - T-31-Count and T-31(30mm.)-Count (stones per holes-per-stone, with hole totals);
  - STL and Fab Sheet availability (each phase has its own colour in the phase chart);
  - which IFC properties are filled in.
  Clicking a bar or a card opens the Model page with that filter applied.
- **Model**:
  - **KPIs:** IFC elements, unique tickets, elements with Issue Status, T-31 hole totals (and the number of stones they are on), tickets with a Fab Sheet, and STL files for STL-status tickets.
  - **Filters:** phase (P1–P8; the Revit workset `P8-New` counts as P8, and the original value is still shown), Issue Status (any / none / group / exact IFC value), T-31 counts, files, finish and checks.
  - **3D:** click a stone to select it; Ctrl- or Shift-click adds stones. Drag orbits, right-drag pans and the wheel zooms.
  - **Properties panel:**
    - Issue Status exactly as written in the IFC, and both T-31 counts per stone. A missing value is shown as "not in IFC", never as 0.
    - Quantities: *Selected IFC elements* (1 / 1 for one stone), the ticket, the ticket on this elevation, the elevation total and the model total.
    - IFC dimensions, element identity and every IFC property set.
  - **Fab Sheet tab:** the ticket's PDF, loaded only when you open it.
  - **Preview STL:** opens the ticket's STL file in its own 3D viewer (orbit, pan, zoom, fit, views). It is not placed in the IFC model.
  - **Data quality tab:**
    - missing Fab Sheets, STL files expected but missing, STL files without an STL Issue Status, tickets with mixed Issue Status;
    - invalid T-31 values, and T-31 counts without a T-31 Issue Status;
    - suspect dimensions, repaired placements and isolated stones.

Project rule used for STL: a ticket whose IFC Issue Status mentions "STL" is cut from
`stl/<TICKET>.stl`. The Issue Status groups (STL file / Pin & glued / T-31 / T-31 (30 mm stone) /
Other) are derived from the text for filtering only. The IFC text is always shown as it is.

## Export to Excel

**Export** (top bar) builds an .xlsx file in the browser from the IFC data:
- **Internal standard:** the layout of the internal control workbook. It contains the Project Overall Tracker (quantity per elevation, SUM TOTAL as Excel formulas), one Elevation sheet per elevation, and a Generic Model Schedule per phase.
- **Custom list:** one row per IFC element, per ticket × elevation or per ticket, with the columns you choose.

Rows can be the current selection, the current filters and search, or the whole model. Every file has an *Export info* sheet that states the source IFC, the date and the scope. Dimensions that differ between the stones of a row are written as `MULTI`, as in the internal file.

## Comparing two IFC revisions

**Compare** (top bar) compares a previous IFC with a new IFC. Each side can be the model shown now, an `.ifc` / `.zip` file (converted in the browser), or a saved `data/elements.json`.

- **Revision Number and date:** not in the IFC, so you type them in. They are written into the revision Excel file.
- **Matching:** elements are matched by GlobalId first. If GlobalIds were regenerated, they are matched by ticket and elevation and then by the nearest position. An element that cannot be matched safely is marked *Requires review* (purple), never guessed.
- **What is compared:** the IFC property sets, a Length taken from the Revit Type name (`L=906`) when the IFC has no LENGTH value, the geometry size (> 1 mm) and the position (> 10 mm).
- **Changes tab:** shows counts by status and filters (status, property, Fab Sheet, text). Click a Type to select its stones in 3D. The properties panel shows the previous, new and difference values side by side.
- **3D colours:**
  - green: added;
  - red: removed (shown when you switch to *Previous*);
  - orange: modified;
  - purple: requires review;
  - default: unchanged.
- **Export revision Excel:** *Changed items only* or *Full comparison report*. It contains:
  - a summary with a colour legend, the Fab Sheets affected and a Changes sheet with one row per changed property;
  - optionally the internal standard sheets, with changed cells in yellow, rows coloured by status, and the Revision Number on changed rows only;
  - yellow tabs on the sheets that contain new or changed data.
- **Clear** returns to the normal view. The comparison stays in that browser tab only. It is not saved as a revision register.

## Measuring and sections

- **Measure** (ruler, on the model and in *Preview STL*): click two points to measure the distance. Points snap to the nearest corner or edge of the stone under the cursor. You can choose the unit (mm, cm, m, in, ft) and the number of decimals. Changing the unit only changes the display.
  - STL files do not store a unit, so the STL ruler shows *file units* until you confirm the unit of the file.
- **Section** opens *Sectioning tools*, which work like the ACC / Autodesk viewer:
  - **Plane tab:** up to 6 cutting planes at the same time (what remains is the part kept by every plane).
    - *Add plane*, then click a face in the model: the new plane lies on that face.
    - *+ Plan cut* adds a horizontal plane. The orientation list also offers the X or Y axis, along an elevation (parallel to its façade, starting through the middle of the stone layer), across an elevation (a wall section; *Section view* shows the stone profiles) and through two picked points.
    - **Drag the blue arrow in the model to move the active plane in or out.** Hold Shift for fine movement. When you look straight at the plane (*Section view*), the handle is a circle: drag up to move the cut towards you.
    - The slider and the mm box do the same.
    - The eye button switches a plane on or off. *Flip* keeps the other side, *Reset* returns the plane to its start, and *Clear all* removes every plane.
  - **Box tab:** a section box with an arrow on each of its six faces; drag one to cut from that side. The box starts around the selection, or else around the stones shown by the filters.
  - **Options:** *Show frame* (plane outlines or box edges) and *Show gizmo* (the arrows). Drag the panel by its title bar, or minimise it with –.
  - Selection, filters, revision colours and the ruler keep working. Close (×) removes the cut.
- **Views:** Plan, Front, Back, Left, Right, Iso, Section A–A and the straight-on view of each elevation use an orthographic camera. Home returns to the perspective view, and the *Ortho / Perspective* button switches between the two at any time. Nothing is reloaded.
- **Limitation:** the section is a clipping view. The cut faces are not filled (there is no capped section drawing), and stones are drawn from the IFC geometry, not from construction drawings.

## Publishing imports directly to GitHub

On GitHub Pages, someone who updates the project can connect the Import dialog to the repository with a fine-grained personal access token. The token is limited to this repository with *Contents: read and write* (steps in `DEPLOY-GITHUB.md`).
- Each import is then checked in the browser and committed straight to the repository: STL/PDF files, or `data/elements.json` + `geom/*.bin` for an IFC model. The Pages workflow republishes the site in 2–4 minutes.
- The token is kept only in that browser and sent only to api.github.com.
- Visitors without a token keep the read-only mode with the download fallback.

## Files linked by ticket number

```
fab-sheets/<TICKET>.pdf      Fab Sheets (extra sheets <TICKET>__2.pdf)
stl/<TICKET>.stl             STL files (binary or ASCII)
data/pdf_index.json, data/stl_index.json    rebuilt by server.py, by GitHub Actions and by
                             python tools/library.py index
```

The dashboard also looks for `<folder>/<TICKET>.<ext>` directly, so a newly uploaded file works
even before the index is rebuilt. The import accepts `TICKET.ext`, `TICKET - TICKET.ext` and ZIPs.
It rejects files whose ticket is not in the IFC model, as well as broken files. A replaced file
goes to `<folder>/_archive/<date-time>/` (server mode) or stays in the GitHub history.

## Updating the IFC model

Choose one of three equivalent ways (they produce the same data):

1. **Dashboard → Import → IFC model.** Choose the `.ifc` or a `.zip` containing it.
   - The file is checked, converted in the browser and summarised against the current model (stones, tickets and changed values).
   - Nothing changes until you press **Replace the current model**. If the file fails the check, the current model stays.
   - Then, in server mode, press **Save on the server for everyone** (the old model is archived in `_archive/model-<date-time>/`). On GitHub Pages, press **Download the model update** and upload its `data/` and `geom/` files.
   - A 1.4 GB IFC needs a computer with 8 GB of memory or more and takes several minutes.
2. `node --max-old-space-size=6144 tools/ifc-convert.mjs model.zip .` (Node 22+, the same code as the button).
3. `python tools/build_all.py --ifc model.zip` (Python 3.9+ with numpy). This also writes `reports/*.csv`.

## Folder structure

```
index.html                     page
assets/app.css, app.js         design and application logic
assets/viewer.js               WebGL2 model viewer (no external libraries)
assets/stl-viewer.js           STL reader and preview viewer
assets/xlsx.js, export.js      Excel (.xlsx) writer and the Export dialog (incl. revision report)
assets/compare.js, compare-ui.js   IFC revision comparison (engine and Compare dialog / Changes tab)
assets/tools3d.js              ruler, section tool, orthographic views, STL ruler
assets/ifc-core.js, ifc-worker.js   in-browser IFC converter used by Import → IFC model
data/elements.json             IFC elements: GlobalId, Revit ID, ticket, elevation, phase,
                               Issue Status, T-31 counts, dimensions, all property sets, bbox
data/pdf_index.json, stl_index.json   file indexes
geom/*.bin                     IFC geometry, one file per elevation (largest 17 MB)
fab-sheets/<TICKET>.pdf        1,288 Fab Sheets
stl/<TICKET>.stl               199 STL files
vendor/pdfjs/                  pdf.js 6.2.108 (Apache-2.0) for browsers without a PDF viewer
server.py, start-dashboard.*   local use; saves imports for everyone using this server
tools/                         rebuild pipeline (IFC parser, geometry, file library, reports)
reports/*.csv                  stone list, tickets, file matching and data checks
docs/REPORT-ROUND3.md          round 3: root causes, tests, open items
docs/REPORT-ROUND4.md          round 4: Compare, revision Excel, ruler, sections, tests
.github/workflows/pages.yml    GitHub Pages publishing
DEPLOY-GITHUB.md               publishing steps
```

## Confidentiality

The site contains project drawings, STL files and model data. On GitHub Free/Pro/Team, a GitHub
Pages site is visible to anyone who has the link. Only GitHub Enterprise Cloud can restrict Pages
to signed-in members. Read the warning in `DEPLOY-GITHUB.md` before publishing.
