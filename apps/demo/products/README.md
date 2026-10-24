# Product schema editor demo

This local demo connects Word-style, Notion-style and presentation schemas to the public Slate, Lexical and ProseMirror bindings. All three native editors share one document through the existing HTTP/SSE protocol. Each schema uses a separate backend and a fresh temporary data directory.

## Run

Use Node 22.18 or later and the repository dependencies. The browser bundle shares the comparison harness's dependency installation:

```sh
npm install
npm install --prefix apps/demo/compat --workspaces=false --package-lock=false --cache /tmp/doc-sync-compat-npm-cache
npm run dev:products
```

Open `http://127.0.0.1:5413/?profile=word`. Other profiles are `notion` and `presentation`. `size=large` adds exactly 100,000 generated UTF-16 text units in 625 paragraphs across 20 nested containers. The complete rich sample remains. Set `PRODUCT_PORT=0` for a random port; the server prints the URL and temporary data locations.

For an isolated validation build, set `PRODUCT_BUNDLE=output/playwright/my-check/bundle.js` for both the build and server. Relative paths resolve from the repository root. Each build output must belong to one server version; do not replace a bundle served by an active user session.

Use a new `doc` name for a fresh document. Reloading an existing document does not replace its content. Profile and document names are validated. All editor history buttons use the participant's CRDT history. The application supplies schema-aware Slate elements, ProseMirror DOM hints and a Lexical codec for safe inline/atom labels.

The views expose structure and editable text. They do not implement Word pagination, a Notion query engine, presentation canvas positioning or product file import/export. Slide objects use an outline. Stored media are labeled placeholders; arbitrary URLs/HTML are not loaded into native node views.

## Chrome checks

Use the Playwright CLI skill with Google Chrome. Open the printed URL in a dedicated session, then run:

```sh
playwright-cli -s=product-check open 'http://127.0.0.1:5413/?profile=word' --browser chrome
playwright-cli -s=product-check run-code --filename apps/demo/products/checks-native.js
playwright-cli -s=product-check run-code --filename apps/demo/products/checks-structure.js
playwright-cli -s=product-check run-code --filename apps/demo/products/checks-ui.js
playwright-cli -s=product-check run-code --filename apps/demo/products/checks-projection.js
```

Inspect every result and browser error. The native script checks 90 cases across all three schemas and all three editor sources. The structure script adds 39 cases for headers/footers/captions/cells, columns/database cells/callouts/tasks, notes/object groups/titles, and merged hidden content through native views and history. The projection script adds nine checks that a distant unchanged DOM paragraph stays attached after remote input in a 100k document, across all profiles and editors. Each operation checks native editor, client and server equality. A separate UI script adds 12 desktop/mobile, seed-retention and request-guard cases. Chrome input is not proof of actual OS IME behavior.

`checks-performance.js` is a template: replace `CONFIG` with a JSON object containing `profile`, `size`, `source`, `doc`, `setup`, `warmups` and `samples`. Use a fresh document per profile/size; set `setup: true` for the first source, then reuse that page for the other sources. Performance runs use actual keyboard input, timestamp-only commit/transport/receive hooks, a DOM observer and a second `requestAnimationFrame` per editor. Full model comparisons run before/after each batch, outside measured input intervals. The DOM/rAF endpoint is a rendering-opportunity proxy, not proof of physical display timing. Local localhost transport and three editors in one Chrome page differ from independent clients or a WAN deployment.
