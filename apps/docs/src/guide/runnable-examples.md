# Run the editor examples

These examples use the same local product demo. It opens **Slate, Lexical and ProseMirror as three independent participants** on one document. Follow a separate example for each editor to see its selection survive a compatible schema change. The demo supplies the host implementation; you can inspect its [source](https://github.com/barocss/doc-sync/blob/main/apps/demo/products/main.jsx).

The package is a private TypeScript workspace, not an npm release. These commands run from a repository checkout with Node 22.18 or later. The demo server has no authentication; keep it on your own machine.

## Start the demo

```sh
npm install
npm install --prefix apps/demo/compat --workspaces=false --package-lock=false
npm run dev:products
```

Keep the server running. Its default address is `http://127.0.0.1:5413`; use the printed address if you set `PRODUCT_PORT=0`. It starts separate backends and temporary data directories for the Word-style, Notion-style and presentation profiles. These examples use the Word-style profile.

## Slate

1. Open `http://127.0.0.1:5413/?profile=word&doc=slate-walkthrough`.
2. In the **Slate** panel, select a range in `Opening text`. Keep that selection.
3. In another terminal, run the command below from the checkout root.
4. In the page, select **Load server schema**. The panel should retain its selection. Type, then use **Undo** and **Redo** to check the participant's history.

```sh
node apps/demo/products/transition-example.mjs http://127.0.0.1:5413 word slate-walkthrough
```

The command reads the server's current version and proposes one compatible boolean mark, `exampleReview`. It prints `accepted` and the new schema version. The page's button fetches the accepted schema and rebuilds all three panels. It does not submit a transition itself.

## Lexical

Open a fresh document at `http://127.0.0.1:5413/?profile=word&doc=lexical-walkthrough`. Select text in the **Lexical** panel, run this command, and then select **Load server schema**. Check the selection and type in that panel.

```sh
node apps/demo/products/transition-example.mjs http://127.0.0.1:5413 word lexical-walkthrough
```

## ProseMirror

Open `http://127.0.0.1:5413/?profile=word&doc=prosemirror-walkthrough`. Select text in the **ProseMirror** panel, run this command, and then select **Load server schema**. Check the selection and type in that panel.

```sh
node apps/demo/products/transition-example.mjs http://127.0.0.1:5413 word prosemirror-walkthrough
```

Use a new document ID to repeat an example from its original schema. If `exampleReview` is already present, the command reports `already-present` and does not submit another change. If the command reports an unconfirmed or stale result, inspect the server schema and document before deciding whether to retry. A response lost in transit does not prove the transition failed.

The examples exercise the current sample UI and compatible additions. They do not provide full Word, Notion or presentation product behavior. Application-specific plugins and codecs must be rebuilt by their owner. See [change an open editor's schema](./schema-transition) for the lifecycle and failure cases.

## Run the browser checks

With the demo running, use a dedicated Chrome session and the repository's Playwright CLI workflow:

```sh
playwright-cli -s=product-check open 'http://127.0.0.1:5413/?profile=word' --browser chrome
playwright-cli -s=product-check run-code --filename apps/demo/products/checks-schema-transition.js
```

Inspect every result and browser error. The script creates separate documents and tests all three profiles and editors. It uses automated input and synthetic composition; it does not establish real OS IME behavior.

[Try AI and user editing →](./ai-walkthrough) · [Troubleshoot a transition →](./troubleshooting)
