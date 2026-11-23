# Q1.3.3 one explicit column per call

The TS driver strictly locates the current grid and owned axes, resolves one
numeric boundary c, preserves unique caller row order and calls live Doc.edit
once with the same c for every payload. Empty payload uses the first live row's
empty cell. The invariant concerns the target grid, excluding nested axes.

The independent full-model oracle inserts a rectangular column, fills supplied
cells, then projects an independently retained LWW span-writer catalog. Latent
older writers remain in the catalog. Incoming span endpoints/order are checked
against semantic payload requests; engine normalization is closure only.

Old sources/reports/targets remain unchanged. Root owns Cargo. Use COLUMN_TS_ONLY=1
for preparation and COLUMN_SKIP_BUILD=1 after the new frozen binary is ready.
