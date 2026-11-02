//! Bounded, synchronous UTF-16 transfer experiment. Not a CRDT or editor engine.
//! Scratch buffers live for the instance lifetime. Handles never recycle.
use doc_sync_rust_experiment::TextTape;
use std::sync::{Mutex, OnceLock};

pub const CAPACITY: usize = 1_048_576;
pub const MAX_HANDLES: usize = 8;
pub const INVALID_HANDLE: i32 = -1;
pub const INVALID_RANGE: i32 = -2;
pub const TOO_LARGE: i32 = -3;
pub const HANDLE_LIMIT: i32 = -4;

struct State {
    input: Box<[u16]>,
    output: Box<[u16]>,
    tapes: Vec<(u32, TextTape)>,
    next_handle: u32,
}

impl State {
    fn new() -> Self {
        Self {
            input: vec![0; CAPACITY].into_boxed_slice(),
            output: vec![0; CAPACITY].into_boxed_slice(),
            tapes: Vec::new(),
            next_handle: 1,
        }
    }

    fn create(&mut self, len: u32) -> i32 {
        if len as usize > CAPACITY {
            return TOO_LARGE;
        }
        if self.tapes.len() >= MAX_HANDLES || self.next_handle > i32::MAX as u32 {
            return HANDLE_LIMIT;
        }
        let id = self.next_handle;
        self.next_handle += 1;
        self.tapes
            .push((id, TextTape::new(self.input[..len as usize].to_vec())));
        id as i32
    }

    fn splice(&mut self, handle: u32, at: u32, delete: u32, insert_len: u32) -> i32 {
        let Some((_, tape)) = self.tapes.iter_mut().find(|(id, _)| *id == handle) else {
            return INVALID_HANDLE;
        };
        let len = tape.units().len();
        let (at, delete, insert_len) = (at as usize, delete as usize, insert_len as usize);
        // Subtraction is guarded. No addition or allocation occurs before all checks pass.
        if at > len || delete > len - at {
            return INVALID_RANGE;
        }
        if insert_len > CAPACITY || insert_len > CAPACITY - (len - delete) {
            return TOO_LARGE;
        }
        tape.splice(at, delete, &self.input[..insert_len]).unwrap();
        0
    }

    fn read(&mut self, handle: u32) -> i32 {
        let Some((_, tape)) = self.tapes.iter().find(|(id, _)| *id == handle) else {
            return INVALID_HANDLE;
        };
        let len = tape.units().len();
        self.output[..len].copy_from_slice(tape.units());
        len as i32
    }

    fn close(&mut self, handle: u32) -> i32 {
        let Some(index) = self.tapes.iter().position(|(id, _)| *id == handle) else {
            return INVALID_HANDLE;
        };
        self.tapes.swap_remove(index);
        0
    }

    fn live_units(&self) -> u32 {
        self.tapes
            .iter()
            .map(|(_, tape)| tape.units().len() as u32)
            .sum()
    }
}

fn state() -> &'static Mutex<State> {
    static STATE: OnceLock<Mutex<State>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(State::new()))
}

#[no_mangle]
pub extern "C" fn bridge_capacity() -> u32 {
    CAPACITY as u32
}
#[no_mangle]
pub extern "C" fn bridge_max_handles() -> u32 {
    MAX_HANDLES as u32
}

/// Diagnostics count live documents and logical units, not retained allocator bytes.
#[no_mangle]
pub extern "C" fn bridge_live_handles() -> u32 {
    state().lock().unwrap().tapes.len() as u32
}
#[no_mangle]
pub extern "C" fn bridge_live_units() -> u32 {
    state().lock().unwrap().live_units()
}

/// Cost probes do not create or edit documents.
#[no_mangle]
pub extern "C" fn bridge_scalar_echo(value: u32) -> u32 {
    value
}
#[no_mangle]
pub extern "C" fn bridge_probe(len: u32) -> i32 {
    if len as usize > CAPACITY {
        TOO_LARGE
    } else {
        len as i32
    }
}
#[no_mangle]
pub extern "C" fn bridge_transfer(len: u32) -> i32 {
    let result = bridge_probe(len);
    if result < 0 {
        return result;
    }
    let mut s = state().lock().unwrap();
    let State { input, output, .. } = &mut *s;
    output[..len as usize].copy_from_slice(&input[..len as usize]);
    result
}

// Returning an address does not dereference a raw pointer. Buffers never resize.
// The host may access only [ptr, ptr + capacity * 2), with no concurrent calls.
#[no_mangle]
pub extern "C" fn bridge_input_ptr() -> usize {
    state().lock().unwrap().input.as_mut_ptr() as usize
}
#[no_mangle]
pub extern "C" fn bridge_output_ptr() -> usize {
    state().lock().unwrap().output.as_ptr() as usize
}
#[no_mangle]
pub extern "C" fn bridge_create(len: u32) -> i32 {
    state().lock().unwrap().create(len)
}
#[no_mangle]
pub extern "C" fn bridge_splice(handle: u32, at: u32, delete: u32, insert_len: u32) -> i32 {
    state()
        .lock()
        .unwrap()
        .splice(handle, at, delete, insert_len)
}
#[no_mangle]
pub extern "C" fn bridge_read(handle: u32) -> i32 {
    state().lock().unwrap().read(handle)
}
#[no_mangle]
pub extern "C" fn bridge_close(handle: u32) -> i32 {
    state().lock().unwrap().close(handle)
}
#[no_mangle]
pub extern "C" fn bridge_checksum(handle: u32) -> i64 {
    let state = state().lock().unwrap();
    let Some((_, tape)) = state.tapes.iter().find(|(id, _)| *id == handle) else {
        return -1;
    };
    i64::from(tape.units().iter().fold(2_166_136_261_u32, |hash, unit| {
        (hash ^ u32::from(*unit)).wrapping_mul(16_777_619)
    }))
}

/// Comparator only: the original experiment runs all operations inside WASM.
#[no_mangle]
pub extern "C" fn bridge_batch_checksum(rounds: u32) -> i64 {
    if rounds > doc_sync_rust_experiment::MAX_ROUNDS {
        return -1;
    }
    i64::from(doc_sync_rust_experiment::workload(rounds))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn invalid_operations_do_not_change_document_or_output() {
        let mut s = State::new();
        s.input[..3].copy_from_slice(&[65, 0xd800, 0xdc00]);
        let id = s.create(3) as u32;
        assert_eq!(s.read(id), 3);
        let output = s.output.clone();
        for (at, delete, count, error) in [
            (4, 0, 1, INVALID_RANGE),
            (2, u32::MAX, 1, INVALID_RANGE),
            (u32::MAX, 0, 0, INVALID_RANGE),
            (0, 0, u32::MAX, TOO_LARGE),
        ] {
            assert_eq!(s.splice(id, at, delete, count), error);
            assert_eq!(s.tapes[0].1.units(), &[65, 0xd800, 0xdc00]);
            assert_eq!(s.output, output);
        }
        assert_eq!(s.read(u32::MAX), INVALID_HANDLE);
        assert_eq!(s.output, output);
        assert_eq!(s.create(u32::MAX), TOO_LARGE);
        assert_eq!(s.tapes.len(), 1);
    }

    #[test]
    fn lifecycle_and_capacity() {
        let mut s = State::new();
        let id = s.create(CAPACITY as u32) as u32;
        assert_eq!(s.splice(id, 0, 0, 1), TOO_LARGE);
        assert_eq!(s.splice(id, 0, 1, 1), 0);
        assert_eq!(s.close(id), 0);
        assert_eq!(s.close(id), INVALID_HANDLE);
        assert_eq!(s.read(id), INVALID_HANDLE);
        assert_eq!(s.splice(id, 0, 0, 0), INVALID_HANDLE);
        let next = s.create(0);
        assert_ne!(next as u32, id);
        for _ in 1..MAX_HANDLES {
            assert!(s.create(0) > 0);
        }
        assert_eq!(s.create(0), HANDLE_LIMIT);
        assert_eq!(s.tapes.len(), MAX_HANDLES);
        s.close(next as u32);
        s.next_handle = i32::MAX as u32;
        assert_eq!(s.create(0), i32::MAX);
        s.close(i32::MAX as u32);
        assert_eq!(s.create(0), HANDLE_LIMIT);
    }

    #[test]
    fn repeated_close_releases_live_documents_and_never_recycles_ids() {
        let mut s = State::new();
        let mut previous = 0;
        for round in 0..2_000 {
            s.input[..4].copy_from_slice(&[round as u16, 0, 0xd800, 0xffff]);
            let id = s.create(4) as u32;
            assert!(id > previous);
            assert_eq!(s.live_units(), 4);
            assert_eq!(s.splice(id, 1, 1, 4), 0);
            assert_eq!(s.live_units(), 7);
            assert_eq!(s.read(id), 7);
            assert_eq!(s.close(id), 0);
            assert_eq!(s.live_units(), 0);
            assert!(s.tapes.is_empty());
            assert_eq!(s.close(previous), INVALID_HANDLE);
            assert_eq!(s.splice(previous, 0, 0, 1), INVALID_HANDLE);
            previous = id;
        }
    }

    #[test]
    fn failed_operations_preserve_live_counts_and_other_documents() {
        let mut s = State::new();
        s.input[0] = 65;
        let first = s.create(1) as u32;
        s.input[0] = 66;
        let second = s.create(1) as u32;
        assert_eq!(s.live_units(), 2);
        assert_eq!(s.splice(first, 2, 0, 1), INVALID_RANGE);
        assert_eq!(s.create(u32::MAX), TOO_LARGE);
        assert_eq!(s.live_units(), 2);
        assert_eq!(s.close(first), 0);
        assert_eq!(s.splice(first, 0, 0, 1), INVALID_HANDLE);
        assert_eq!(s.close(first), INVALID_HANDLE);
        assert_eq!(s.live_units(), 1);
        assert_eq!(s.read(second), 1);
        assert_eq!(s.output[0], 66);
        assert_eq!(s.close(second), 0);
        assert_eq!(s.live_units(), 0);
    }

    #[test]
    fn cost_probe_bounds_are_exact() {
        assert_eq!(bridge_scalar_echo(u32::MAX), u32::MAX);
        assert_eq!(bridge_probe(0), 0);
        assert_eq!(bridge_probe(CAPACITY as u32), CAPACITY as i32);
        assert_eq!(bridge_probe(CAPACITY as u32 + 1), TOO_LARGE);
        assert_eq!(bridge_probe(u32::MAX), TOO_LARGE);
    }

    #[test]
    fn transfer_rejects_before_copy_and_preserves_documents() {
        {
            let mut s = state().lock().unwrap();
            s.input[..3].copy_from_slice(&[65, 0xd800, 0xffff]);
            s.output[..3].fill(42);
            assert!(s.create(3) > 0);
        }
        assert_eq!(bridge_transfer(CAPACITY as u32 + 1), TOO_LARGE);
        assert_eq!(bridge_transfer(u32::MAX), TOO_LARGE);
        assert_eq!(state().lock().unwrap().output[..3], [42; 3]);
        assert_eq!(bridge_transfer(3), 3);
        let mut s = state().lock().unwrap();
        assert_eq!(s.output[..3], [65, 0xd800, 0xffff]);
        assert_eq!(s.tapes.len(), 1);
        assert_eq!(s.live_units(), 3);
        let id = s.tapes[0].0;
        assert_eq!(s.close(id), 0);
        assert_eq!(s.live_units(), 0);
    }
}
