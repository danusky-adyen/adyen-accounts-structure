# Adyen account structure

Interactive builder for Adyen account-structure diagrams. Draft a company's
accounts, stores, terminals, balance platforms and the links between them, then
share the result as a URL or export it as SVG, PNG or PDF.

Everything runs in the browser: no server, no account, no data leaving the tab.

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Typecheck, then build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | `tsc --build` across app and node configs |
| `npm run lint` | ESLint, type-aware |
| `npm test` | Vitest (99 tests) |

## Architecture

The previous version was a single 1,500-line HTML file that kept its state in
the DOM. This one is layered, and each layer only depends on the ones above it:

```
domain/     pure model and rules   — no DOM, no React
layout/     pure geometry          — depends on domain
share/      URL codec              — depends on domain
export/     SVG, PNG, PDF          — depends on layout
state/      store, undo, storage   — depends on domain + share
components/ React views            — depends on everything
```

**`domain/`** holds the model. `kinds.ts` is the single registry of the 15 node
kinds: default name, caption, icon, colour, which children each kind accepts,
child limits, whether it supports terminals. Adding a kind means one entry
there, not edits in five places. `LINK_RULES` decides which kinds may link and
which end owns the link, so a link can never be stored twice.

Documents are immutable and share structure: `mapNode` rebuilds only the path to
the node it changes, and returns the *same* document when a transform is a no-op,
so no-op edits cannot invalidate the layout or pollute the undo history.

**`layout/`** is one pure function: `layoutDocument(doc, { measure })` returns
card rectangles, slot geometry, rounded orthogonal tree edges and lane-packed
cross-link channels, plus the content bounds. Text is measured up front and the
resulting line breaks are what both the DOM and the SVG exporter render, so the
export always matches the screen. Nothing reads element sizes back from the DOM.

**`share/`** encodes documents into the URL fragment. `normalize.ts` in the
domain layer is the only trust boundary: every external document — share link,
localStorage, legacy import — passes through it, and it drops unknown kinds,
illegal nesting, over-limit children, dangling links and control characters.

**`export/`** renders the layout as real vector SVG, rasterises that for PNG and
clipboard, and writes its own single-image PDF (`export/pdf.ts`, ~150 lines).
Since the diagram is already rasterised in-app, a PDF library would only be
writing a container: dropping jsPDF removed 743 kB of lazily-loaded dependencies
(html2canvas and DOMPurify came along with it) and the entire bundle is now one
232 kB file, 75 kB gzipped.

**`state/`** is a zustand store: undo/redo over whole documents (120 entries,
with 700 ms coalescing so typing a name is one entry), debounced write-through
to localStorage, theme, toasts, drag state and viewport.

## Share links

Links use `#d=` and a positional format: nodes are written pre-order as arrays
`[kind, name, children, note, terminals]` with trailing defaults truncated,
kinds as frozen integer codes, and links as integer index pairs into the
pre-order sequence. The result is LZ-compressed.

Compared to the old `#cfg=` JSON payload:

| Document | v1 | v2 |
| --- | --- | --- |
| Default 3 nodes | 176 chars | 23 chars |
| 16-node sample | 880 chars | 358 chars |

Old links still open: `share/legacy.ts` decodes both `#cfg=` shapes and the
`adyen_v70` innerHTML that the previous version stored in localStorage. Kind
codes are frozen, so v2 links keep working as new kinds are added.

## Testing

`npm test` covers the layers that can be reasoned about without a browser:
domain rules and structural sharing, the normalizer against hostile input, the
layout engine, share round-trips (including legacy payloads and the size
comparison above), SVG well-formedness, the PDF byte layout and the store's
history semantics.

Two tests exist because of bugs they now prevent: an SVG scan that catches an
attribute value ending its own quoting (a quoted font name once broke every
PNG/PDF/clipboard export), and a `mapNode` identity check (a no-op edit used to
create a new document).

## Deployment

Vercel needs no configuration: it detects Vite, runs `npm run build` and serves
`dist/`. Any static host works the same way; the app is entirely client-side, so
there is nothing to configure beyond serving `index.html`.

## Keyboard

`?` lists every shortcut in the app. The essentials: arrow keys move through the
tree, `N` adds a child, `T` changes the selected node's type, `Enter` (or a
double-click) renames, `⌫` deletes, `⌘Z`/`⇧⌘Z` undo and redo, `⌘0` fits the
diagram to the screen.

Dragging a card by its middle links it to another node, or moves it inside one;
dragging it by its left or right edge reorders it among its siblings.
