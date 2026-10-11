# HoloMatrix PX

## Public HoloMatrix PX deployment

GitHub Pages opens HoloMatrix PX at the repository root. The permanent header
contains Design, 3D, Wiring, Print and File; the sidebar contains configuration.
Pages builds use `PAGES_BASE=/holomatrix-px/ VITE_PAGES=true npm run build`
(set environment variables using your shell). The deployment workflow builds
and publishes `dist`; future pushes to `master` redeploy automatically.

Saved projects remain in each browser's local storage: they do **not** sync
between devices. Use File → Save project, then Open project on another device.
Local show/network XML, user-supplied sprite packs and review artifacts are
excluded from the public repository and Pages build. Generated pumpkins and
local artwork imports remain available. Some optional artwork-fixture tests
run only in the original workspace; the public suite uses generated artwork.
The original supplied sprite library remains available locally. No license to
redistribute it is inferred. Printable mounts are prototypes: print one PETG
fit sample before production; geometry checks do not certify physical strength.

## HoloMatrix PX

### Sprite prop builder (current release)

Open `/designer` and choose **Props**. Generate an original pumpkin (plain,
happy, scary or goofy), import a local sprite/sprite sheet, or start a blank
canvas. Crop before applying; resizing uses nearest-neighbor sampling. Paint
changes LED colors; erasing also removes physical cells. Alpha is empty,
while black remains a real node unless explicitly removed as background.
Current grids are limited to 48 × 48 and use bullet pixels.

One grid drives artwork, tray sections, numbering and wiring. Routes avoid
open gaps and crossings; shapes without a continuous route get explicit
independent data strings. Export includes `.xmodel`, native-grid PNG/BMP,
node/string/wire maps, injection estimates, project JSON, STL parts and a
non-destructive Blender import script. The xLights format was checked against
upstream source; importing into the user's installed xLights is still needed.
The BMP is RGB24, not indexed 8-bit. Game art is imported locally, not bundled.

Printed parts keep protective walls and a flat 2.1 mm retention floor. Spaced
wall bridges and merged diffuser pairs align section seams. Pipe/conduit must
support every section independently. Conduit rails are planning guides only:
Maker Pipe fitting geometry and mounting shoes are not generated. Nominal
rail lengths exclude fitting allowances. Check tie access, wire clearance,
print orientation, fit and structural behavior on physical PETG samples.

The prop picker includes all 23 user-supplied Halloween PNGs at their original
pixel dimensions, with a thumbnail gallery. Source files remain unchanged;
transparent pixels are omitted and opaque black pixels remain lights. No
redistribution license is inferred from receiving these assets.

Sprite sections now use broad whole-cell puzzle tongues/recesses. Vertical,
horizontal or crossed frame axes guide the cuts; narrow two-cell poles remain
together. Tongue transfers retain every light coordinate and stay within the
selected bed. Seam bridges favor rail-aligned locations but are NOT conduit
mounting heads. Every section still needs independent frame support.

Joint-fit controls separate flank gap (0.10 mm per flank), tip gap (0.25 mm),
male corner chamfer (2 mm), 45-degree bed-edge relief (1.3 mm) and extra
upper-wall gap (0.15 mm total). These are starting values informed by the
supplied Snowman/Flag samples, not a proven printer calibration. Use the flat
floors as the glue-up datum rather than squeezing wall tops flush. Export >
Puzzle section fit sample provides two short full-scale trays and matching
sample parts; print at 100% before a complete prop. Layout changes may renumber
wiring, so regenerate the blueprint before building an already planned prop.

Props > Conduit clips offers direct wall ties or **My existing EMT clips ·
reserve space**. This enables frame guides and proposes amber mounting zones
only on sufficiently long, straight two-wall seams. Configure the existing
assembly's along-rail length, across-seam width, access allowance and target
spacing. Default 50 x 55 mm is a provisional conservative envelope informed
by the supplied six-model clip set, NOT a measured fit for every base/head.
Ordinary seam bridges and complete wall-tie reinforcement pads avoid the zones;
their associated holes move with them. Crossed-rail fitting regions stay clear.
Design and 3D views show reservations, not pretend installed hardware. Blueprint
and full STL ZIPs include CONDUIT_CLIP_PLAN.csv and CONDUIT_CLIPS.txt. Original
clip geometry is unchanged and not re-exported or rescaled. Sections without a
zone are reported and still need direct ties/additional framing. Actual glue
surfaces, pipe fit, head stand-off, assembly access and load capacity remain to
be verified. No curved-arch/swivel or 1/2-inch PVC adaptation is implied.

Verification: 162 tests pass; production build passes. All 23 supplied grids
retain their occupied coordinates and complete wiring coverage. A cross-frame
Jack o lantern 535 example has 254 lights and 14 sections. Blender 5.2.2
checked its 80 unique STL parts and the six-part fit coupon: after STL importer
cleanup of degenerate triangles, topology, positive volume and centered
274 mm circular envelopes passed. The example's trays and seam bridges also
passed solid-intersection tests. This is not a physical fit, strength or
weather-resistance certificate. Blender's thumbnail cache could not be
written in the sandbox; editable .blend files were saved successfully.
Earlier prototype notes below describe historical iterations.

Lighting now includes 12 mm bullets and prototype 30 LEDs/m strip mounts.
IP30/IP65/IP67 preset dimensions come from the user's product images (10 x
2.13 mm, 10 x 3 mm, 12.3 x 3.85 mm); these are not universal IP specifications.
An editable 0.4 mm TOTAL fit allowance is separate from the 0.1 mm joint fit.
Strip mode uses touching 33 mm House diffusers, front-side channels, no bullet
holes, and DERIVED cap STLs with enlarged strip/foot passages. Original cap
files are preserved. Nominal 33.333 mm LED pitch differs from diffuser pitch:
check real alignment and marked cut intervals/grouped addresses. Horizontal
runs require cut-and-wire routing at stair corners. Printed mounts do not
provide an IP-rated sealed enclosure. This mode needs a small physical test.

Stage 2 joint test ZIP also includes a broad 20 mm tongue, 16 mm half-lap
receiver and separate R2 6.8 x 5.3 mm CAD chamfered pin. Measured unscaled
print was 8.6 x 6.5 for an 8 x 6 shaft, with holes about 7.5 x 5.9. R2
compensation is local and provisional, aiming for .1 mm total printed fit.
Holes stay 8.1 x 6.1; female meeting edge recessed .5 mm, bodies shortened
without scaling fit features. Print male flat, female pocket
UP, pin head DOWN, then flip female and pin for assembly. Solid rigid features,
no spring catches. These pin joints remain standalone fit experiments.
Prop seams now use separate 3 mm rear backing plates, attached through
matching plate/wall zip-tie slots, with a bridgeable cable passage at the seam.
Plates rest on the 25.396 mm rear wall tops, not over the pixel mounting floor.
Both measured diffuser sizes are supported. Plates export flat as separate
STLs with section-pair names; matching engraved numbers are still pending.
Inaccessible rim attachments, plate collisions and bed violations stop export.
Some wider multi-row layouts need custom plates; physical fit and strength,
wire depth and the PVC-clip attachment remain unvalidated. Small two-tray
PETG samples are in rear-backing-plate-test; do not print a whole prop yet.

The separate `/designer` route is a local, procedural pixel-prop designer. Run
the same development server and open `http://localhost:4173/designer` (or the
port printed by Vite). The existing planner remains at `/`.

HoloMatrix PX includes arch and line presets, a freehand path canvas with
draggable points, target pixel-count resizing, 1–8 offset rows, the measured
25.08 mm Mario and 33 mm house diffuser presets, full-edge grid connectivity,
circle/rectangle printer-bed limits, connected section packing, wiring and
number overlays, local autosave, portable project JSON, dimensioned SVG, and a
ZIP of prototype carrier STLs generated entirely in the browser, plus the
selected original diffuser cap STL and its required print quantity.

The lazy-loaded 3D Preview shows those same carrier triangles and the original
diffuser STL (normalised orientation, not scaled). Rotate, zoom and pan with
mouse or touch; inspect the whole prop or one section, hide caps, switch to an
exploded view, and reset to front/back/angled views. Caps are displayed against
the front face, opposite the rear cable cavity. Matching foot pockets are
projected from the unchanged diffuser STLs: 0.9 mm insertion, 0.95 mm depth,
0.1 mm total XY clearance. The resulting friction fit needs a physical test.
WebGL is required. Backing plates can be selected, moved, hidden and lifted
in exploded view. The old floating joint-coupon overlays have been removed.
PVC clip mounting is not implemented yet; the rear plate is its intended
platform, but attachment hardware and pipe routing need confirming.

Export → Puzzle joint + PVC fit-test ZIP generates two flat PETG jigsaw-style
coupons with 0.1 mm total width clearance (0.05 per side), 0.6 mm XY corner
chamfers, and a 6 mm coupon thickness. The solid tab has a 12 mm root and
20 mm head, with two pairs of 4 mm zip-tie holes across the seam. Press the wide head into its matching
through-cutout from above, not sideways. Both parts print flat without roofs,
latches, flexures, bridges or supports. This joint aligns/resists in-plane
separation; rear mounts are still needed to support out-of-plane loading.
The ZIP also includes the
user's proven PVC House Clip STL byte-for-byte unchanged. The confirmed pipe
OD is 0.840 in / 21.336 mm. These are test pieces, not joints integrated into
prop sections. Clip-to-backer mounting and its screw specification still need
design/confirmation. Friction retention and fit require physical PETG testing.

The prototype STLs use the four-lobed opening traced from the supplied Koopa (2)
STL, symmetrised to remove export noise, without scaling between diffuser sizes.
The mounting floor is 2.1 mm thick, with low 4.198 mm mounting pads and an
18 mm relief above the gripping floor. A 2 mm perimeter-only cable wall extends
to 25.396 mm overall depth. Tall internal dividers are omitted. Flat floor down,
cavity up is the intended print orientation. Diffuser-foot pocket roofs use
short bridges (neighboring pockets may combine); inspect the slicer and test
bridge sag, seating and retention without supports. Actual tab clearance needs a test print.
Cap fits are provisional; joints, PVC clips, mounting strength and weather
protection are not implemented or validated yet. Bed packing reserves 6 mm
per side for future joints in addition to the selected edge margin. Diffusers
stay upright and retain their measured dimensions; count changes resize the
overall shape. The displayed actual count and finished size are authoritative.

Use `npm test` for geometry, shared-edge mesh and archive tests. A browser
download was also extracted and its four STLs imported into Blender 5.2 with
zero non-manifold edges and positive volumes. Test print one section before
printing a complete prop. The UI is responsive, but a localhost link only
works on the computer running the server; no public deployment is included.

A local-first visual holiday-lighting planner built with React, TypeScript, and tldraw.

## Run locally

```powershell
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" install
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run dev
```

The app saves the current project in browser local storage. Use **Export** to create a portable `.glowplan.json` snapshot.

## Included first vertical slice

## HoloMatrix PX prop workflow

`/designer` uses a contextual inspector: choose **Arch / Line / Draw / Props**, then configure the relevant dimensions, LEDs and diffuser. Adjacent **Design / 3D / Wiring / Print** views share the same work area; support controls appear in 3D rather than a separate Mount wizard step. Advanced fit, joint, and printer measurements are collapsed; Hide controls expands the work area. Wiring opens point-to-point navigation and power planning together. Projects retain local autosave and JSON import/export.

Conduit mounting footprints are reserved on the straight section walls before puzzle cells are exchanged. Continuous walls remain valid across changes in section ownership. Later seam clips and reinforced wall tie slots avoid those footprints. Seam bridges are now 20 mm along the seam (previously 10 mm), with unchanged 12 mm width, 10 mm engagement and 0.8 mm total wall-slot allowance. Print a PETG fit sample before the full build.

Conduit mounting now renders and exports **actual two-part hardware derived from Mitchell's six-model EMT STL**. Original files are unchanged. The medium head is quarter-turned to follow the seam, its receiving stem is relieved, and pipe bores have 0.6 mm diametral allowance for 23.5 mm pipe or 21.336 mm straight PVC. Bases seat on the actual 25.396 mm tray walls; pipe centers start at 68.52 mm behind the front. Larger stand-off extends only the stem. Local underside relief clears perpendicular tray seams. Numbered bases and rail-specific heads are exported SIDE_DOWN with quantities. Vertical and horizontal placement, actual tray collisions, head/base clearance and topology are regression-tested. Physical PETG fit, adhesive, tie access, retention and structural loads remain unverified. Unsupported pipe diameters need a matching head; fixed heads do not replace curved-arch swivels.

Permanent Design / 3D / Wiring / Print navigation and view controls live in the main header, alongside one File menu. The side rail contains configuration only; no bottom Next button or extra workspace toolbar. Purple, coral and cyan accents keep the canvas neutral.

Sprite wiring defaults to horizontal serpentine rows. Row changes follow the boundary behind occupied plastic, preserving separate strings when a gap cannot be crossed. Compact routing remains optional. Changing routing renumbers nodes; re-export the matching xLights model. An optional **Solid dark outer border** setting keeps plastic and opaque black caps but removes LED mounting holes and electrical nodes from outside-connected near-black cells (all RGB channels ≤32). Enclosed dark face cells remain lights for animation. Artwork is preserved. NODE_MAP, SOLID_BORDER, power planning and xLights exports follow the chosen occupancy; caps for solid borders are listed separately.

### Original planner features

- linked Yard and Blueprint views on tldraw
- Kulp K8-PB enclosure with draggable real port nubs
- props and PSUs
- xLights `xlights_rgbeffects.xml` and `xlights_networks.xml` import
- basic extracted FPP JSON backup review
- scale, routed distance, cable combination, current, voltage-drop, and PI calculations
- local autosave, wire list, validation, and printable setup guide
- one-click imports for the attached Halloween and Christmas shows
