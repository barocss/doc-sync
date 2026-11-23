//! Isolated UTF-16 splice experiment. This is not a CRDT implementation.

mod gap;
pub use gap::GapTape;
pub mod storage_wasm;

#[derive(Debug, PartialEq, Eq)]
pub enum SpliceError {
    OutOfBounds,
}

/// Text offsets count UTF-16 code units, as JavaScript string offsets do.
/// Surrogates are preserved verbatim, including isolated surrogate code units.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TextTape {
    units: Vec<u16>,
}

impl TextTape {
    pub fn new(units: Vec<u16>) -> Self {
        Self { units }
    }

    pub fn units(&self) -> &[u16] {
        &self.units
    }

    /// Delete `delete` units at `at`, then insert `insert` at the same offset.
    /// Invalid ranges return an error before mutation. Deletion is not clamped.
    pub fn splice(&mut self, at: usize, delete: usize, insert: &[u16]) -> Result<(), SpliceError> {
        if at > self.units.len() || delete > self.units.len() - at {
            return Err(SpliceError::OutOfBounds);
        }
        self.units.splice(at..at + delete, insert.iter().copied());
        Ok(())
    }
}

pub const INITIAL_UNITS: usize = 100_000;
pub const MAX_ROUNDS: u32 = 100_000;

fn next(state: &mut u32) -> u32 {
    *state ^= *state << 13;
    *state ^= *state >> 17;
    *state ^= *state << 5;
    *state
}

/// Deterministic workload with paired growth/shrink edits. Length stays bounded
/// to INITIAL_UNITS + 2. Hash uses wrapping 32-bit FNV-1a over code units.
pub fn workload(rounds: u32) -> u32 {
    assert!(rounds <= MAX_ROUNDS);
    let mut tape = TextTape::new((0..INITIAL_UNITS).map(|i| (i % 65_536) as u16).collect());
    let mut state = 0x1234_5678;
    for round in 0..rounds {
        let at = next(&mut state) as usize % (tape.units.len() - 2);
        let unit = (next(&mut state) & 0xffff) as u16;
        if round % 2 == 0 {
            tape.splice(at, 1, &[unit, 0xd83d, 0xde00]).unwrap();
        } else {
            tape.splice(at, 3, &[unit]).unwrap();
        }
    }
    tape.units.iter().fold(2_166_136_261_u32, |hash, unit| {
        (hash ^ u32::from(*unit)).wrapping_mul(16_777_619)
    })
}

/// Raw WebAssembly ABI: runs the full deterministic workload, returns its hash.
/// Returns zero for an invalid round count. No text buffers cross the ABI.
#[no_mangle]
pub extern "C" fn benchmark_checksum(rounds: u32) -> u32 {
    if rounds > MAX_ROUNDS {
        return 0;
    }
    workload(rounds)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn insert_delete_replace_and_end_boundary() {
        let mut tape = TextTape::new(vec![65, 66]);
        tape.splice(2, 0, &[67]).unwrap();
        tape.splice(0, 1, &[68, 69]).unwrap();
        tape.splice(1, 2, &[]).unwrap();
        assert_eq!(tape.units(), &[68, 67]);
        tape.splice(2, 0, &[]).unwrap();
        tape.splice(0, 2, &[]).unwrap();
        assert!(tape.units().is_empty());
    }

    #[test]
    fn invalid_ranges_are_atomic_even_for_overflow() {
        let mut tape = TextTape::new(vec![65, 66]);
        for (at, delete) in [(3, 0), (1, 2), (usize::MAX, 1), (1, usize::MAX)] {
            assert_eq!(
                tape.splice(at, delete, &[67]),
                Err(SpliceError::OutOfBounds)
            );
            assert_eq!(tape.units(), &[65, 66]);
        }
    }

    #[test]
    fn utf16_offsets_can_split_a_surrogate_pair() {
        let mut tape = TextTape::new(vec![0xac00, 0xd83d, 0xde00, 0x0061, 0x0301]);
        tape.splice(2, 1, &[]).unwrap();
        assert_eq!(tape.units(), &[0xac00, 0xd83d, 0x0061, 0x0301]);
    }

    #[test]
    fn exported_workload_is_deterministic_and_rejects_large_input() {
        assert_eq!(benchmark_checksum(32), workload(32));
        assert_eq!(workload(32), workload(32));
        assert_ne!(workload(31), workload(32));
        assert_eq!(benchmark_checksum(MAX_ROUNDS + 1), 0);
    }
}
