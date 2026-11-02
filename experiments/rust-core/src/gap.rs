use crate::SpliceError;

/// UTF-16 tape with an initialized gap. No unsafe code or Unicode conversion.
/// Reads expose two slices; `to_units` explicitly allocates a contiguous copy.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GapTape {
    buffer: Vec<u16>,
    start: usize,
    end: usize,
}

impl GapTape {
    pub fn new(mut units: Vec<u16>) -> Self {
        let start = units.len();
        units.resize(start.checked_add(64).expect("tape length overflow"), 0);
        let end = units.len();
        Self {
            buffer: units,
            start,
            end,
        }
    }

    pub fn len(&self) -> usize {
        self.buffer.len() - (self.end - self.start)
    }
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
    /// Initialized storage length, including the gap (allocator capacity may differ).
    pub fn storage_units(&self) -> usize {
        self.buffer.len()
    }
    pub fn as_slices(&self) -> (&[u16], &[u16]) {
        (&self.buffer[..self.start], &self.buffer[self.end..])
    }
    pub fn to_units(&self) -> Vec<u16> {
        let (left, right) = self.as_slices();
        let mut units = Vec::with_capacity(self.len());
        units.extend_from_slice(left);
        units.extend_from_slice(right);
        units
    }

    fn move_gap(&mut self, at: usize) {
        if at < self.start {
            let distance = self.start - at;
            self.buffer.copy_within(at..self.start, self.end - distance);
            self.end -= distance;
        } else {
            let distance = at - self.start;
            self.buffer
                .copy_within(self.end..self.end + distance, self.start);
            self.end += distance;
        }
        self.start = at;
    }

    fn ensure_gap(&mut self, required: usize) {
        let gap = self.end - self.start;
        if required <= gap {
            return;
        }
        let extra = (required - gap).max(self.len() / 2).max(64);
        let old_len = self.buffer.len();
        self.buffer
            .resize(old_len.checked_add(extra).expect("tape length overflow"), 0);
        self.buffer.copy_within(self.end..old_len, self.end + extra);
        self.end += extra;
    }

    /// Invalid ranges, including overflowing offsets, return before any mutation.
    /// Isolated surrogate units are preserved. Allocation failure follows Vec.
    pub fn splice(&mut self, at: usize, delete: usize, insert: &[u16]) -> Result<(), SpliceError> {
        let len = self.len();
        if at > len || delete > len - at {
            return Err(SpliceError::OutOfBounds);
        }
        self.move_gap(at);
        self.end += delete;
        self.ensure_gap(insert.len());
        self.buffer[self.start..self.start + insert.len()].copy_from_slice(insert);
        self.start += insert.len();
        Ok(())
    }
}
