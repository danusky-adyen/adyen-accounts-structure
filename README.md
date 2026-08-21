# Adyen account structure

Interactive builder for Adyen account-structure diagrams. Draft a company's
accounts, stores, terminals, balance platforms and the links between them, add
the account settings, integrations and payment methods that belong to each
level, then share the result as a URL or export it as SVG, PNG, JPEG or PDF.

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
| `npm test` | Vitest (153 tests) |
| `node scripts/fetch-payment-logos.mjs` | Refresh the vendored payment-method artwork |

## Architecture

The previous version was a single 1,500-line HTML file that kept its state in
the DOM. This one is layered, and each layer only depends on the ones above it:

```
domain/     pure model and rules   — no DOM, no React
layout/     pure geometry          — depends on domain
share/      URL codec              — depends on domain
export/     SVG, PNG, JPEG, PDF    — depends on layout
state/      store, undo, storage   — depends on domain + share
components/ React views            — depends on everything
```

**`domain/`** holds the model. `kinds.ts` is the single registry of the 15 node
kinds: default name, caption, icon, colour, which children each kind accepts,
child limits, and which of terminals, integrations, payment methods and a logo
each kind supports. Adding a kind means one entry there, not edits in five
places. `LINK_RULES` decides which kinds may link and which end owns the link,
so a link can never be stored twice; `LINK_LIMITS` adds cardinality, which is
how a balance platform ends up serving many merchant accounts while each
merchant account points at exactly one. The balance platform is also the one
`detached` kind: it sits in the merchant row but draws no parent connector,
because it hangs off merchant accounts rather than the company account.

Three registries sit beside it: `settings.ts` resolves inherited account
settings, `integrations.ts` lists Adyen's integration options in five groups
with their usual versions, and `paymentMethods.ts` is generated alongside the
logo artwork.

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

**`export/`** renders the layout as real vector SVG, rasterises that for PNG,
JPEG and clipboard, and writes its own single-image PDF (`export/pdf.ts`, ~150
lines). Since the diagram is already rasterised in-app, a PDF library would only
be writing a container: dropping jsPDF removed 743 kB of lazily-loaded
dependencies (html2canvas and DOMPurify came along with it) and the app is now
one 273 kB file, 88 kB gzipped, plus the payment-logo artwork in a lazy 108 kB
chunk that is only fetched once a card or a picker needs it.

Every mark on a card has to be inlined before serialising: an SVG loaded *as an
image* cannot fetch anything, so `withBrandMarks()` resolves the payment logos
and any company logo to data URLs first, and the payment artwork is nested as
real SVG rather than an `<image>`, so it stays vector all the way into the PDF.

**`state/`** is a zustand store: undo/redo over whole documents (120 entries,
with 700 ms coalescing so typing a name is one entry), debounced write-through
to localStorage, theme, toasts, drag state and viewport.

## Share links

Links use `#d=` and a positional format: nodes are written pre-order as arrays
`[kind, name, children, note, terminals, settings, integrations, methods,
logoDomain]` with trailing defaults truncated, kinds as frozen integer codes, and
links as integer index pairs into the pre-order sequence. The result is
LZ-compressed.

Compared to the old `#cfg=` JSON payload:

| Document | v1 | v3 |
| --- | --- | --- |
| Default 3 nodes | 176 chars | 23 chars |
| 16-node sample | 880 chars | 358 chars |

The new fields are appended, never inserted, so v2 links decode as v3 documents
with those fields empty. Integration and method ids are written as strings rather
than registry indices on purpose: indices would silently rebind the day the
generated registry changes order, and LZ compression makes the repeated strings
nearly free.

Old links still open: `share/legacy.ts` decodes both `#cfg=` shapes and the
`adyen_v70` innerHTML that the previous version stored in localStorage. Kind
codes are frozen, so old links keep working as new kinds are added.

## Account settings and inheritance

Every account takes free-text parameter/value pairs — an ADP name, a TFM
setting, anything worth writing down — and they inherit downward exactly as they
do in the Customer Area: a value set on the company account applies to every
merchant account, store and terminal under it until one of them sets the same
key itself.

`resolveSettings(path)` walks the ancestor chain once and tags each key as `own`
or `inherited`, with where it came from, what the inherited value was, and which
descendants override it. The inspector shows that as *Set here*, *Overrides Acme
Group*, *From Acme Stores* or *Overridden in 2 accounts below*, and a card that
is overridden somewhere below gets an asterisk on its settings badge. So both
directions are visible: standing on a child you can see what it inherits, and
standing on a parent you can see where its value stops applying.

## Design system

The interface follows Bento, Adyen's design system:
its colour, spacing, radius, type, motion, elevation and z-index tokens, and its
component recipes for buttons, cards, tags, inputs, modals and toasts.

Two files hold every value. `design/palette.ts` carries colour for both themes,
with the Bento token each value implements named in a comment beside it
(`surface: '#ffffff', // background-primary`). `design/tokens.ts` carries
everything theme-independent and publishes it as CSS custom properties under
Bento's own names, so a stylesheet in this repo can be read against the design
system line by line:

```css
.card {
  border-radius: var(--b-radius-l);
  border: var(--b-border-width-s) solid var(--c-border);
  transition: background var(--b-duration-fast) var(--b-ease-linear);
}
```

Values are copied rather than imported. `@adyen/bento-design-tokens` lives on
Adyen's internal registry, and this tool has to build for anyone who clones it,
so the tokens are transcribed with their names attached instead of installed —
which also means the SVG exporter can read the same raw values, and an export
cannot drift from the screen. Three consequences worth knowing:

- **The type scale is Bento's; the font stack is not.** Bento ships the Adyen UI
  typeface from a CDN. Loading it would put a network request in front of the
  first paint and a woff2 subset inside every exported file, so the system stack
  stays and only the sizes, line heights and weights come from Bento: 14/20 body,
  12/18 caption, 16/26 titles. Bento text has no letter-spacing and no case
  transform, so the uppercase micro-labels are gone.
- **Cards are flat.** Bento gives a card `background-primary`, a 1 px
  `outline-primary` and radius `l`, and no shadow; shadows are for layers that
  genuinely float. So the canvas cards lost their drop shadows, hover raises the
  surface colour instead of the card, and selection reads as a ring.
- **Fifteen kinds share four tint families.** Bento's palette is deliberately
  narrow, so the eleven hand-picked tints collapsed onto four real weak-background
  and on-weak-label pairs: blue for the parties you sell with, orange for
  in-person hardware, green for anything holding money, grey for compliance and
  reference records.

`tests/design.test.ts` guards the parts a compiler cannot: every `--b-*` a
stylesheet references is one the token module actually emits (an unknown custom
property is silently dropped, not an error, which is how a camelCased z-index
token went unnoticed), no stylesheet reintroduces uppercasing, tracking or
frosted glass, and the canvas metrics stay on the spacer, radius and type ramps.

Icons are the one part of Bento not adopted: the 24×24 set exists only in Figma,
no published package ships the artwork, and the Figma seat available here is
rate-limited for asset export. The nineteen hand-drawn glyphs stay for now.

## Payment methods and logos

Payment methods come with Adyen's own artwork. `scripts/fetch-payment-logos.mjs`
pulls the SVGs from Adyen's public logo CDN once and writes them into
`src/design/paymentLogos.ts` plus the matching `domain/paymentMethods.ts`
registry, so the marks are versioned with the code, work offline, and survive an
export. Re-run the script to add a method or refresh the artwork; the picker, the
cards, the exporter and the LLM prompt all follow the generated registry.

Company logos work differently, because a diagram has to stay shareable through
a URL alone. The default is a monogram from the account name. Add a domain and
the logo is fetched from a public logo service ([unavatar.io](https://unavatar.io),
the one service tested that sends `access-control-allow-origin: *`, which the
canvas rasteriser needs), then inlined as a data URL for export. What the share
link carries is the fifteen characters of `acme.com`.

The alternatives were all worse for this tool: embedding a base64 image in the
fragment adds tens of kilobytes to every link and eventually exceeds what
browsers and chat clients will carry; keeping uploads in IndexedDB makes the
logo invisible to everyone you send the link to; and hosting uploads (Vercel
Blob, S3) means a server, a bucket, an upload endpoint and a retention policy for
customer artwork, which is a large amount of surface for a decoration. If a
logo really must be pixel-exact, exporting the SVG and swapping the `<image>`
href takes a few seconds.

## Build from notes

The *Build* button turns unstructured notes into a diagram without any AI
running in the tool. It hands you a prompt describing the whole model — kinds,
what nests inside what, which fields each kind accepts, the link rules and their
limits, terminal types, integration ids, method ids and a worked example — which
you give to any chat model together with your notes. Pasting the answer back
builds the diagram.

`share/prompt.ts` generates that text from the live registries, so it cannot
drift from what the tool actually accepts. The answer goes through the same
`normalizeDocument` trust boundary as a share link, so a model that invents a
kind or nests a terminal under a company account produces a clean diagram rather
than a broken one, and the paste box also accepts a full share URL.

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

Settings inheritance, link cardinality and v2-to-v3 share decoding are covered
too, since all three are easy to break from a distance, and the design layer is
checked against the Bento ramps as described above.

## Deployment

Vercel needs no configuration: it detects Vite, runs `npm run build` and serves
`dist/`. Any static host works the same way; the app is entirely client-side, so
there is nothing to configure beyond serving `index.html`.

## Keyboard

`?` lists every shortcut in the app. The essentials: arrow keys move through the
tree, `⇧↓` adds a child, `⇧←`/`⇧→` switch the selected card between the types
that fit in its place, `⌫` deletes, `⌘Z`/`⇧⌘Z` undo and redo, `⌘0` fits the
diagram to the screen.

Renaming needs no shortcut at all: with a card selected, start typing. A card
still holding its default name is replaced by what you type, a renamed one is
appended to, and `Enter` or a double-click opens the field explicitly. That is
also why single-letter shortcuts are gone — they would swallow the first
character of a name.

Dragging a card by its middle links it to another node, or moves it inside one;
dragging it by its left or right edge reorders it among its siblings.
