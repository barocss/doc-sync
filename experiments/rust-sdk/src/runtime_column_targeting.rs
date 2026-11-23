//! One whole-column command with caller-ordered cell payloads.
use super::targeting::TargetView;
use super::*;
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ColumnBoundary {
    Start,
    End,
    Before(Key),
    After(Key),
}
#[derive(Debug, Clone, PartialEq)]
pub struct RowCellPayload {
    pub row: Key,
    pub model: Value,
}
#[derive(Debug, Clone, PartialEq)]
pub struct ColumnInsert {
    pub grid: Key,
    pub boundary: ColumnBoundary,
    pub cells: Vec<RowCellPayload>,
}

impl RuntimeDocument {
    /// Create exactly one column in a current visible stored grid. Unique row
    /// payloads fill that column in caller order. Omitted rows keep default cells;
    /// an empty payload still creates a column. Covered output remains retained.
    /// Success returns exactly keys=[Some(new_column)] and one aggregate Change.
    /// The unchanged local base guard applies; no multi-column atomic API or axis
    /// movement is supplied. Failures preserve the live checkpoint and base.
    pub fn insert_column_relative(
        &mut self,
        base: &ModelEditBase,
        command: &ColumnInsert,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<ModelInsertBatchResult> {
        self.check_model_base(base)?;
        if self.schema.domain() != "document" {
            return Err(Error("document column insertion required".into()));
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
        let column = compiler.compile_column(command)?;
        let clock_after = compiler.clock;
        let change = self.stage_change(
            "history_record",
            json!({"ops":compiler.ops,"options":options,"now":now_ms,"reservedClock":clock_after}),
        )?;
        Ok(ModelInsertBatchResult {
            keys: vec![Some(column)],
            change,
            clock_before,
            clock_after,
        })
    }
}

fn axis_keys(grid: &Value, field: &str) -> Result<Vec<String>> {
    grid[field]
        .as_array()
        .ok_or_else(|| Error("column target axes missing".into()))?
        .iter()
        .map(|key| {
            key.as_str()
                .map(str::to_owned)
                .ok_or_else(|| Error("column target axis key missing".into()))
        })
        .collect()
}
fn owned_axis_map(
    view: &TargetView,
    keys: &[String],
    kind: &str,
) -> Result<BTreeMap<String, usize>> {
    let mut index = BTreeMap::new();
    for (at, key) in keys.iter().enumerate() {
        view.require_stored_kind(&Key::parse(key)?, Some(kind))?;
        if index.insert(key.clone(), at).is_some() {
            return Err(Error("ambiguous column target axis".into()));
        }
    }
    Ok(index)
}

impl Compiler {
    fn compile_column(&mut self, command: &ColumnInsert) -> Result<Key> {
        let state = self.doc.state()?;
        let view = TargetView::new(self, &state)?;
        let located = self.locate_grid_in(&command.grid, &state, &view)?;
        let grid = &located.projection;
        let before_rows = axis_keys(grid, "rows")?;
        let before_cols = axis_keys(grid, "cols")?;
        if before_rows.is_empty() || before_cols.is_empty() {
            return Err(Error(
                "column target requires current live rows and columns".into(),
            ));
        }
        let row_kind = self.spec(grid["type"].as_str().unwrap())["children"][0]
            .as_str()
            .unwrap();
        let cell_kind = self.spec(row_kind)["children"][0]
            .as_str()
            .unwrap()
            .to_owned();
        let row_indexes = owned_axis_map(&view, &before_rows, row_kind)?;
        let col_indexes = owned_axis_map(&view, &before_cols, "col")?;
        let c = match &command.boundary {
            ColumnBoundary::Start => 0,
            ColumnBoundary::End => before_cols.len(),
            ColumnBoundary::Before(key) | ColumnBoundary::After(key) => {
                view.require_stored_kind(key, Some("col"))?;
                let index = *col_indexes.get(key.as_str()).ok_or_else(|| {
                    Error("column boundary does not belong to this current grid".into())
                })?;
                if matches!(&command.boundary, ColumnBoundary::After(_)) {
                    index
                        .checked_add(1)
                        .ok_or_else(|| Error("column index exhausted".into()))?
                } else {
                    index
                }
            }
        };
        let mut used = std::collections::BTreeSet::new();
        let empty_seed = json!({"type":cell_kind,"children":[]});
        let mut payloads = Vec::with_capacity(command.cells.len().max(1));
        for payload in &command.cells {
            view.require_stored_kind(&payload.row, Some(row_kind))?;
            let row = *row_indexes
                .get(payload.row.as_str())
                .ok_or_else(|| Error("payload row does not belong to this current grid".into()))?;
            if !used.insert(payload.row.as_str()) {
                return Err(Error("duplicate column payload row".into()));
            }
            if payload.model["type"] != cell_kind {
                return Err(Error("column payload requires grid cell type".into()));
            }
            self.validate_node(&payload.model, 0)?;
            payloads.push((row, &payload.model));
        }
        if payloads.is_empty() {
            payloads.push((0, &empty_seed));
        }
        let mut promoted = false;
        let mut column = None;
        for (row, model) in payloads {
            let mut path = located.path.clone();
            path.extend([row, c]);
            let key = self
                .compile_model_insert(&mut promoted, &path, model)?
                .ok_or_else(|| Error("column compiler returned no column key".into()))?;
            if key.ticket()?.lamport == 0 || column.as_ref().is_some_and(|first| first != &key) {
                return Err(Error(
                    "column compiler did not reuse one stored column".into(),
                ));
            }
            column = Some(key);
        }
        let column = column.ok_or_else(|| Error("column compiler produced no result".into()))?;
        if before_cols.iter().any(|key| key == column.as_str()) {
            return Err(Error("column compiler reused an existing axis".into()));
        }
        let state = self.doc.state()?;
        let view = TargetView::new(self, &state)?;
        let after = self.locate_grid_in(&command.grid, &state, &view)?;
        view.require_stored_kind(&column, Some("col"))?;
        let mut expected_cols = before_cols;
        expected_cols.insert(c, column.as_str().into());
        if axis_keys(&after.projection, "rows")? != before_rows
            || axis_keys(&after.projection, "cols")? != expected_cols
        {
            return Err(Error(
                "column compiler changed target axes outside one insertion".into(),
            ));
        }
        Ok(column)
    }
}
