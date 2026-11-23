//! Stable row adjacency and explicit cell-body insertion targets.
use super::targeting::{LocatedBlock, TargetView};
use super::*;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GridRowTarget {
    pub grid: Key,
    pub row: Key,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GridCellTarget {
    pub grid: Key,
    pub row: Key,
    pub column: Key,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GridModelTarget {
    BeforeRow(GridRowTarget),
    AfterRow(GridRowTarget),
    InsideCellStart(GridCellTarget),
    InsideCellEnd(GridCellTarget),
}
#[derive(Debug, Clone, PartialEq)]
pub struct GridModelInsert {
    pub target: GridModelTarget,
    pub model: Value,
}

impl RuntimeDocument {
    /// Insert row models or cell-body children through existing immutable IDs.
    /// Targets resolve sequentially against one candidate and publish one Change.
    /// Cell targets must be currently uncovered. Row targets preserve the normal
    /// fixed-width row compiler, including merge growth and retained covered data.
    /// No cell wrapper ID, column insertion or axis movement is supplied here.
    pub fn insert_grid_models_relative(
        &mut self,
        base: &ModelEditBase,
        commands: &[GridModelInsert],
        options: EditOptions,
        now_ms: f64,
    ) -> Result<ModelInsertBatchResult> {
        self.check_model_base(base)?;
        if self.schema.domain() != "document" {
            return Err(Error("document grid insertion required".into()));
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
            let path = compiler.grid_target_path(&command.target)?;
            keys.push(compiler.compile_model_insert(&mut promoted, &path, &command.model)?);
        }
        let clock_after = compiler.clock;
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
    pub(super) fn locate_grid_in(
        &mut self,
        key: &Key,
        state: &Value,
        view: &TargetView,
    ) -> Result<LocatedBlock> {
        let located = self.locate_stored_block_in(key, state, view)?;
        if located.projection["kind"] != "grid"
            || self.spec(located.node["type"].as_str().unwrap_or(""))["shape"] != "grid"
        {
            return Err(Error("grid target requires a current stored grid".into()));
        }
        Ok(located)
    }

    fn grid_target_path(&mut self, target: &GridModelTarget) -> Result<Vec<usize>> {
        let (grid_key, row_key) = match target {
            GridModelTarget::BeforeRow(target) | GridModelTarget::AfterRow(target) => {
                (&target.grid, &target.row)
            }
            GridModelTarget::InsideCellStart(target) | GridModelTarget::InsideCellEnd(target) => {
                (&target.grid, &target.row)
            }
        };
        let state = self.doc.state()?;
        let view = TargetView::new(self, &state)?;
        let located = self.locate_grid_in(grid_key, &state, &view)?;
        let grid = &located.projection;
        let row_kind = self.spec(grid["type"].as_str().unwrap())["children"][0]
            .as_str()
            .unwrap();
        view.require_stored_kind(row_key, Some(row_kind))?;
        let row = grid["rows"]
            .as_array()
            .and_then(|rows| rows.iter().position(|key| key == row_key.as_str()))
            .ok_or_else(|| Error("row target does not belong to this current grid".into()))?;
        let mut path = located.path;
        match target {
            GridModelTarget::BeforeRow(_) => {
                path.push(row);
            }
            GridModelTarget::AfterRow(_) => {
                path.push(
                    row.checked_add(1)
                        .ok_or_else(|| Error("row index exhausted".into()))?,
                );
            }
            GridModelTarget::InsideCellStart(cell) | GridModelTarget::InsideCellEnd(cell) => {
                view.require_stored_kind(&cell.column, Some("col"))?;
                let col = grid["cols"]
                    .as_array()
                    .and_then(|cols| cols.iter().position(|key| key == cell.column.as_str()))
                    .ok_or_else(|| {
                        Error("column target does not belong to this current grid".into())
                    })?;
                if grid["covered"].get(format!("{row},{col}")).is_some() {
                    return Err(Error("covered cell is not an insertion target".into()));
                }
                let lines = TargetView::cell_lines(grid)?;
                let line = lines
                    .get(&(row_key.as_str(), cell.column.as_str()))
                    .ok_or_else(|| Error("target cell projection missing".into()))?;
                if *line != RuntimeDocument::cell_head(grid_key, row_key, &cell.column)?.as_str() {
                    return Err(Error("target cell body address mismatch".into()));
                }
                let children = located.node["children"][row]["children"][col]["children"][0]
                    ["children"]
                    .as_array()
                    .ok_or_else(|| Error("target cell model children missing".into()))?;
                path.extend([
                    row,
                    col,
                    0,
                    if matches!(target, GridModelTarget::InsideCellStart(_)) {
                        0
                    } else {
                        children.len()
                    },
                ]);
            }
        }
        Ok(path)
    }
}
