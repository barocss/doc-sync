use doc_sync_rust_experiment::{GapTape, SpliceError, TextTape};
#[path = "../src/storage_trace.rs"]
mod storage_trace;

#[test]
fn differential_sequences_check_every_edit() {
    for len in [4, 65, 4096] {
        for kind in ["cursor-local", "far-jump", "alternating-ends"] {
            for seed in [1, 0x1234_5678, 0xffff_ffff] {
                let mut vec = TextTape::new(storage_trace::initial(len));
                let mut gap = GapTape::new(storage_trace::initial(len));
                for edit in storage_trace::trace(kind, len, 2000, seed) {
                    assert_eq!(
                        vec.splice(edit.at, edit.delete, &edit.insert),
                        gap.splice(edit.at, edit.delete, &edit.insert)
                    );
                    assert_eq!(gap.to_units(), vec.units(), "{kind}, seed {seed}");
                    assert_eq!(gap.len(), vec.units().len());
                    assert!(gap.storage_units() <= len + 66);
                }
                assert_eq!(
                    storage_trace::checksum(&gap.to_units()),
                    storage_trace::checksum(vec.units())
                );
            }
        }
    }
}

#[test]
fn invalid_ranges_preserve_full_gap_state() {
    let mut gap = GapTape::new(vec![65, 0xd83d, 0xde00, 66]);
    gap.splice(1, 0, &[0xd800]).unwrap();
    for (at, delete) in [
        (6, 0),
        (4, 2),
        (usize::MAX, 1),
        (1, usize::MAX),
        (usize::MAX, usize::MAX),
    ] {
        let before = gap.clone();
        assert_eq!(gap.splice(at, delete, &[99]), Err(SpliceError::OutOfBounds));
        assert_eq!(gap, before);
    }
}

#[test]
fn empty_boundaries_surrogates_and_gap_growth() {
    let mut gap = GapTape::new(vec![]);
    let mut vec = TextTape::new(vec![]);
    let large: Vec<u16> = (0..1000).map(|i| i as u16).collect();
    for (at, delete, insert) in [
        (0, 0, vec![0xd83d, 0xde00]),
        (1, 1, vec![0xd800]),
        (2, 0, large),
        (0, 1002, vec![]),
        (0, 0, vec![]),
    ] {
        assert_eq!(
            gap.splice(at, delete, &insert),
            vec.splice(at, delete, &insert)
        );
        assert_eq!(gap.to_units(), vec.units());
    }
    assert!(gap.is_empty());
}

#[test]
fn varying_growth_and_shrink_with_both_sides_populated() {
    let mut gap = GapTape::new(storage_trace::initial(80));
    let mut vec = TextTape::new(storage_trace::initial(80));
    let mut state = 0x9876_5432_u32;
    for round in 0..5000 {
        state ^= state << 13;
        state ^= state >> 17;
        state ^= state << 5;
        let at = state as usize % (gap.len() + 1);
        let delete = (state as usize / 13) % (gap.len() - at + 1);
        let insert: Vec<u16> = (0..round % 137)
            .map(|i| state.wrapping_add(i) as u16)
            .collect();
        assert_eq!(
            gap.splice(at, delete, &insert),
            vec.splice(at, delete, &insert)
        );
        assert_eq!(gap.to_units(), vec.units());
        let (left, right) = gap.as_slices();
        assert_eq!(left.len() + right.len(), gap.len());
    }
}
