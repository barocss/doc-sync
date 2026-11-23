# Bot document examples

These files contain the complete server models from three separate Codex bot missions using the product sample schemas. Each mission started with the existing rich sample document and used the bot's ephemeral MCP session. The files are JSON document models, not Word, Notion or PowerPoint files.

| Model | Requested change | Observed structure |
| --- | --- | --- |
| [word.json](word.json) | Add a Project plan heading and a 2 × 2 Phase/Owner table. | A `heading2` and a two-row `table` were inserted inside the first `section`; its required `header` and `footer` remain. |
| [notion.json](notion.json) | Add a Launch checklist heading and a Review the draft task. | A `heading2` and unchecked `task` were inserted into the `notion-page`. |
| [presentation.json](presentation.json) | Set the first slide title to Project overview and add a Next steps text box. | The first `slide` contains the changed `title` and a new `text-box` with a `paragraph`; its `notes` remain. |

All three runners reported completion. The models were inspected for the requested nodes and text. These examples do not establish broad layout quality, factual accuracy, autonomous recovery, or support for every operation or schema. They are not a replacement for review of AI-generated content. Raw mission and server output are under `output/validation/bot-samples-20261029/` when available in the local workspace.
