//! Read-time discovery for the existing strict stable-ID editing APIs.
use super::targeting::TargetView;
use super::*;
use std::collections::BTreeSet;

/// A model, discoverable targets and one opaque process-local edit base.
#[derive(Debug, Clone)]
pub struct ModelCatalogRead {
    pub model: Value,
    pub base: ModelEditBase,
    pub catalog: ModelTargetCatalog,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelTargetCatalog {
    pub blocks: Vec<StoredModelTarget>,
    pub grids: Vec<GridTargetCatalog>,
}
/// A stored primary block. The path is diagnostic and valid only at this base.
/// Virtual defaults and synthetic group wrappers have no entries.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredModelTarget {
    pub key: Key,
    pub path: Vec<usize>,
    pub node_type: String,
    pub inside_flow: bool,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GridTargetCatalog {
    pub grid: Key,
    pub rows: Vec<Key>,
    pub columns: Vec<Key>,
    pub cells: Vec<CatalogCell>,
}
/// An uncovered cell body addressed by its owning grid and axes, not a fake ID.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CatalogCell {
    pub target: GridCellTarget,
    pub body_path: Vec<usize>,
}

impl RuntimeDocument {
    /// Discover current strict edit targets without changing history or the base.
    /// Covered descendants, aliases and synthetic wrappers are not targets.
    /// This is not a server revision, authorization, or a retained-ID catalog.
    pub fn read_model_with_catalog(&mut self) -> Result<ModelCatalogRead> {
        if self.schema.domain() != "document" {
            return Err(Error("document target catalog required".into()));
        }
        let state = self.state()?;
        let base = self.current_model_base();
        // &mut self prevents intervening edits. Use the original document base,
        // never the helper's new incarnation. No publication is performed.
        let mut compiler = Compiler {
            doc: Self::restore(&self.checkpoint()?)?,
            clock: self.observed_clock()?,
            ops: vec![],
            batch: false,
            column: None,
        };
        let view = TargetView::new(&compiler, &state)?;
        let located = compiler.catalog_blocks_in(&state, &view)?;
        let mut seen = BTreeSet::new();
        let mut blocks = vec![];
        let mut grids = vec![];
        for block in located {
            let marker = block.projection["marker"]
                .as_str()
                .ok_or_else(|| Error("catalog block marker missing".into()))?;
            let key = Key::parse(marker)?;
            // Required/default synthetic projections must not become stored IDs.
            if view.require_stored_kind(&key, None).is_err() {
                continue;
            }
            if !seen.insert(marker.to_owned()) {
                return Err(Error("ambiguous catalog primary block".into()));
            }
            let node_type = block.node["type"]
                .as_str()
                .ok_or_else(|| Error("catalog node type missing".into()))?
                .to_owned();
            blocks.push(StoredModelTarget {
                key: key.clone(),
                path: block.path.clone(),
                inside_flow: compiler.spec(&node_type)["shape"] == "flow",
                node_type,
            });
            if block.projection["kind"] != "grid" {
                continue;
            }
            let grid = &block.projection;
            let row_kind = compiler.spec(grid["type"].as_str().unwrap())["children"][0]
                .as_str()
                .unwrap()
                .to_owned();
            let axes = |field: &str, kind: &str| -> Result<Vec<Key>> {
                let mut seen = BTreeSet::new();
                grid[field]
                    .as_array()
                    .ok_or_else(|| Error("catalog grid axes missing".into()))?
                    .iter()
                    .map(|value| {
                        let id = Key::parse(
                            value
                                .as_str()
                                .ok_or_else(|| Error("catalog axis ID missing".into()))?,
                        )?;
                        view.require_stored_kind(&id, Some(kind))?;
                        if !seen.insert(id.as_str().to_owned()) {
                            return Err(Error("duplicate catalog grid axis".into()));
                        }
                        Ok(id)
                    })
                    .collect()
            };
            let rows = axes("rows", &row_kind)?;
            let columns = axes("cols", "col")?;
            let lines = TargetView::cell_lines(grid)?;
            let mut cells = vec![];
            for (r, row) in rows.iter().enumerate() {
                for (c, column) in columns.iter().enumerate() {
                    if grid["covered"].get(format!("{r},{c}")).is_some() {
                        continue;
                    }
                    let line = lines
                        .get(&(row.as_str(), column.as_str()))
                        .ok_or_else(|| Error("catalog cell body missing".into()))?;
                    if *line != Self::cell_head(&key, row, column)?.as_str() {
                        return Err(Error("catalog cell body address mismatch".into()));
                    }
                    let mut body_path = block.path.clone();
                    body_path.extend([r, c, 0]);
                    cells.push(CatalogCell {
                        target: GridCellTarget {
                            grid: key.clone(),
                            row: row.clone(),
                            column: column.clone(),
                        },
                        body_path,
                    });
                }
            }
            grids.push(GridTargetCatalog {
                grid: key,
                rows,
                columns,
                cells,
            });
        }
        Ok(ModelCatalogRead {
            model: state["model"].clone(),
            base,
            catalog: ModelTargetCatalog { blocks, grids },
        })
    }
}
