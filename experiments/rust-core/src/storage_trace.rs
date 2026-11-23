// Shared by the comparison binary and integration tests. Trace generation is
// outside the measured interval, and both implementations receive the same ops.
#[derive(Debug)]
pub struct Edit {
    pub at: usize,
    pub delete: usize,
    pub insert: Vec<u16>,
}

pub fn initial(len: usize) -> Vec<u16> {
    (0..len).map(|i| (i % 65_536) as u16).collect()
}

pub fn trace(kind: &str, len: usize, rounds: usize, seed: u32) -> Vec<Edit> {
    assert!(len >= 4);
    let mut state = seed;
    let mut current_len = len;
    let mut cursor = len / 2;
    (0..rounds)
        .map(|round| {
            state ^= state << 13;
            state ^= state >> 17;
            state ^= state << 5;
            let at = match kind {
                "cursor-local" => {
                    cursor = cursor
                        .saturating_add((state % 33) as usize)
                        .saturating_sub(16);
                    cursor.min(current_len - 3)
                }
                "far-jump" => state as usize % (current_len - 2),
                "alternating-ends" => {
                    if round % 2 == 0 {
                        0
                    } else {
                        current_len - 3
                    }
                }
                _ => panic!("unknown trace kind"),
            };
            let (delete, insert) = if round % 2 == 0 {
                (1, vec![state as u16, 0xd83d, 0xde00])
            } else {
                (3, vec![state as u16])
            };
            current_len = current_len - delete + insert.len();
            cursor = at + insert.len();
            Edit { at, delete, insert }
        })
        .collect()
}

pub fn checksum(units: &[u16]) -> u32 {
    units.iter().fold(2_166_136_261_u32, |hash, unit| {
        (hash ^ u32::from(*unit)).wrapping_mul(16_777_619)
    })
}
