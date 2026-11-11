<img
  src="https://raw.githubusercontent.com/draftswithea/draftswithea/main/assets/draftswithea-indicator.png"
  alt="dataform"
  style="display: block; margin: 0 auto;"
  width="300"
/>

A React app that turns a numbered sequence of **frame images (SVG or PNG,
in a zip) into a Lottie animation** — entirely in the browser, no server or
native binaries involved.

- **SVG frames** are parsed directly into native Lottie vector shapes
  (`<path>` elements using `M/L/C/Z` commands), so they stay crisp at any
  render size — nothing is rasterized.
- **PNG frames** become embedded image layers, same as a traditional
  raster flipbook.
- You can mix both types in one project if you want, though a real sequence
  is normally all one or the other.
- Frames land on a drag-to-reorder **timeline** before you export, so you can
  fix export order, drop a bad frame, etc. without re-exporting from your
  animation tool.
- Exports both a plain `.json` (single-file, portable) and a `.lottie`
  (dotLottie zip container — smaller, since PNG assets are stored as real
  files instead of base64 text).

## Getting started

```bash
npm install
npm run dev       # local dev server
npm run build     # production build -> dist/
```

Open the printed local URL, drop in a `.zip` of numbered frames, drag to
reorder if needed, then export.

## Project structure

```
src/
  lib/
    svgPath.js         # SVG <path> d-string -> Lottie bezier vertices/tangents
    lottieBuilder.js    # assembles the opacity-toggle "flipbook" Lottie doc
    zipIngest.js         # reads a zip, classifies/sorts svg+png frames
  components/
    Dropzone.jsx         # drag/drop or click-to-browse zip upload
    OptionsPanel.jsx      # size / fps / hold-per-frame controls
    Timeline.jsx           # drag-to-reorder frame strip (native HTML5 DnD)
    JobCard.jsx              # one sequence: timeline + live preview + export
    LottiePreview.jsx         # lottie-web powered live preview
  App.jsx                      # wires it all together
```

The conversion logic (`src/lib/*.js`) has no React or DOM-framework
dependency beyond browser APIs (`DOMParser`, `createImageBitmap`) — it can be
lifted into any other frontend (Vue, Svelte, vanilla JS) or even run under
Node with a DOM shim (e.g. `jsdom`) for a CLI/batch tool.

## How the timeline works

Each ingested zip becomes a "job" with its own ordered frame list. Dragging a
thumbnail on the timeline reorders that array; a short delay after any
change rebuilds the live preview so scrubbing through several drag
positions doesn't trigger a rebuild on every intermediate frame. Export
always uses the current on-screen order, not the original zip order.

## Known limits

Only `<path>` elements are parsed from SVG frames (`fill`, `stroke`,
`stroke-width`, `fill-rule`). Gradients, filters, clip-paths, embedded
raster images inside an SVG, text, and transforms on groups are not
converted — if your source relies on those, expect partial fidelity for
that frame. Arcs (`A`) and quadratic curves (`Q`/`T`) in path data aren't
supported either; convert to cubics upstream if needed.

PNG frames are embedded as full-resolution image layers with no
compression beyond PNG's own — large sequences at large sizes can produce
sizeable `.lottie`/`.json` files.

## License

[MIT LICENSE](./LICENSE.md)
