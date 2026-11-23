//! Atomic, insert-only model commands. This is not the general EditOp surface.
use super::*;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ModelInsert {
    pub at: Vec<usize>,
    pub model: Value,
}

/// Model batches return one key per requested model. A whole-column command
/// returns exactly one Some column key. Normalized-empty models have no stored key.
/// Empty operations with equal clocks are a no-op. Empty operations with a
/// larger final clock reserve tickets only; they create no pending change or
/// History action. Nonempty operations form one pending change and at most one
/// History action, subject to the supplied History typing options.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ModelInsertBatchResult {
    pub keys: Vec<Option<Key>>,
    pub change: Change,
    pub clock_before: u64,
    pub clock_after: u64,
}

impl RuntimeDocument {
    /// Compile supported model child insertions against one evolving candidate.
    /// A later failure preserves the entire live checkpoint. Empty groups and
    /// grids follow the TS insertion compiler, including preparation operations
    /// and fragment ticket reservations. Row insertions keep the existing width.
    /// Cell insertions in different rows share the most recent column boundary.
    /// Offset paths and the other EditOp commands are outside this API.
    pub fn insert_models_batch(
        &mut self,
        commands: &[ModelInsert],
        options: EditOptions,
        now_ms: f64,
    ) -> Result<ModelInsertBatchResult> {
        if self.schema.domain() != "document" {
            return Err(Error("document model child path required".into()));
        }
        if !now_ms.is_finite() {
            return Err(Error("now_ms must be finite".into()));
        }
        let clock_before = self.observed_clock()?;
        let mut compiler = Compiler {
            doc: Self::restore(&self.checkpoint()?)?,
            clock: clock_before,
            ops: vec![],
            batch: true,
            column: None,
        };
        let mut keys = Vec::with_capacity(commands.len());
        let mut promoted = false;
        for command in commands {
            keys.push(compiler.compile_model_insert(&mut promoted, &command.at, &command.model)?);
        }
        let clock_after = compiler.clock;
        // stage_change records on a restored candidate and swaps only on success.
        // It adds pending work only when the compiled operations are nonempty.
        let change = self.stage_change(
            "history_record",
            json!({"ops":compiler.ops,"options":options,"now":now_ms,"reservedClock":clock_after}),
        )?;
        Ok(ModelInsertBatchResult {
            keys,
            change,
            clock_before,
            clock_after,
        })
    }
}

impl Compiler {
    pub(super) fn compile_model_insert(
        &mut self,
        promoted: &mut bool,
        at: &[usize],
        model: &Value,
    ) -> Result<Option<Key>> {
        if !*promoted && self.uses_projection()? {
            self.promote_virtual_text()?;
            *promoted = true;
        }
        if at.is_empty() {
            return Err(Error("document model child path required".into()));
        }
        self.validate_node(model, 0)?;
        self.insert_at(at, model)
    }
    pub(super) fn empty_grid(&self, node: &Value) -> bool {
        self.spec(node["type"].as_str().unwrap_or(""))["shape"] == "grid"
            && node["children"].as_array().is_none_or(|rows| {
                rows.iter()
                    .all(|row| row["children"].as_array().is_none_or(Vec::is_empty))
            })
    }
}
