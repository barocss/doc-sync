//! Bounded, synchronous raw WASM adapter for the Vec and gap experiments.
//!
//! Backend 0 owns one `TextTape`; backend 1 owns one `GapTape`. `init` replaces
//! only the selected slot. Lengths and offsets count UTF-16 code units verbatim.
//! The two fixed scratch buffers live for the instance lifetime. A trusted host
//! must access only their advertised ranges, write only the input buffer, and
//! make exclusive synchronous calls. Exported pointers do not grant access to
//! any other memory. Refresh host memory views after calls that can allocate.
//! CAPACITY bounds logical text and each scratch buffer, not allocator storage.

use crate::{GapTape, TextTape};
use std::sync::{Mutex, OnceLock};

pub const CAPACITY: usize = 1_048_576;
pub const INVALID_BACKEND: i32 = -1;
pub const MISSING_STATE: i32 = -2;
pub const INVALID_RANGE: i32 = -3;
pub const TOO_LARGE: i32 = -4;

#[derive(Debug, Clone, PartialEq, Eq)]
enum Tape {
    Vec(TextTape),
    Gap(GapTape),
}

impl Tape {
    fn len(&self) -> usize {
        match self {
            Self::Vec(tape) => tape.units().len(),
            Self::Gap(tape) => tape.len(),
        }
    }

    fn copy_into(&self, output: &mut [u16]) {
        match self {
            Self::Vec(tape) => output[..tape.units().len()].copy_from_slice(tape.units()),
            Self::Gap(tape) => {
                let (left, right) = tape.as_slices();
                output[..left.len()].copy_from_slice(left);
                output[left.len()..left.len() + right.len()].copy_from_slice(right);
            }
        }
    }
}

struct State {
    input: Box<[u16]>,
    output: Box<[u16]>,
    slots: [Option<Tape>; 2],
}

impl State {
    fn new() -> Self {
        Self {
            input: vec![0; CAPACITY].into_boxed_slice(),
            output: vec![0; CAPACITY].into_boxed_slice(),
            slots: [None, None],
        }
    }

    fn index(backend: u32) -> Result<usize, i32> {
        match backend {
            0 => Ok(0),
            1 => Ok(1),
            _ => Err(INVALID_BACKEND),
        }
    }

    fn init(&mut self, backend: u32, len: u32) -> i32 {
        let index = match Self::index(backend) {
            Ok(index) => index,
            Err(error) => return error,
        };
        let len = len as usize;
        if len > CAPACITY {
            return TOO_LARGE;
        }
        let units = self.input[..len].to_vec();
        self.slots[index] = Some(if index == 0 {
            Tape::Vec(TextTape::new(units))
        } else {
            Tape::Gap(GapTape::new(units))
        });
        0
    }

    fn len(&self, backend: u32) -> i32 {
        let index = match Self::index(backend) {
            Ok(index) => index,
            Err(error) => return error,
        };
        match &self.slots[index] {
            Some(tape) => tape.len() as i32,
            None => MISSING_STATE,
        }
    }

    fn splice(&mut self, backend: u32, at: u32, delete: u32, insert_len: u32) -> i32 {
        let index = match Self::index(backend) {
            Ok(index) => index,
            Err(error) => return error,
        };
        let Some(tape) = &mut self.slots[index] else {
            return MISSING_STATE;
        };
        let len = tape.len();
        let (at, delete, insert_len) = (at as usize, delete as usize, insert_len as usize);
        // Guard subtraction and capacity before moving a gap, allocating, or
        // mutating text. No unchecked addition of host values is necessary.
        if at > len || delete > len - at {
            return INVALID_RANGE;
        }
        if insert_len > CAPACITY || insert_len > CAPACITY - (len - delete) {
            return TOO_LARGE;
        }
        let insert = &self.input[..insert_len];
        match tape {
            Tape::Vec(tape) => tape.splice(at, delete, insert).unwrap(),
            Tape::Gap(tape) => tape.splice(at, delete, insert).unwrap(),
        }
        0
    }

    fn read(&mut self, backend: u32) -> i32 {
        let index = match Self::index(backend) {
            Ok(index) => index,
            Err(error) => return error,
        };
        let Some(tape) = &self.slots[index] else {
            return MISSING_STATE;
        };
        tape.copy_into(&mut self.output);
        tape.len() as i32
    }

    fn drop_slot(&mut self, backend: u32) -> i32 {
        let index = match Self::index(backend) {
            Ok(index) => index,
            Err(error) => return error,
        };
        if self.slots[index].is_none() {
            return MISSING_STATE;
        }
        self.slots[index] = None;
        0
    }
}

fn state() -> &'static Mutex<State> {
    static STATE: OnceLock<Mutex<State>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(State::new()))
}

#[no_mangle]
pub extern "C" fn storage_api_version() -> u32 {
    1
}

#[no_mangle]
pub extern "C" fn storage_capacity() -> u32 {
    CAPACITY as u32
}

// Returning an address does not dereference a raw pointer. Neither buffer moves.
#[no_mangle]
pub extern "C" fn storage_input_ptr() -> usize {
    state().lock().unwrap().input.as_mut_ptr() as usize
}

#[no_mangle]
pub extern "C" fn storage_output_ptr() -> usize {
    state().lock().unwrap().output.as_ptr() as usize
}

#[no_mangle]
pub extern "C" fn storage_init(backend: u32, len: u32) -> i32 {
    state().lock().unwrap().init(backend, len)
}

#[no_mangle]
pub extern "C" fn storage_len(backend: u32) -> i32 {
    state().lock().unwrap().len(backend)
}

#[no_mangle]
pub extern "C" fn storage_splice(backend: u32, at: u32, delete: u32, insert_len: u32) -> i32 {
    state()
        .lock()
        .unwrap()
        .splice(backend, at, delete, insert_len)
}

#[no_mangle]
pub extern "C" fn storage_read(backend: u32) -> i32 {
    state().lock().unwrap().read(backend)
}

#[no_mangle]
pub extern "C" fn storage_drop(backend: u32) -> i32 {
    state().lock().unwrap().drop_slot(backend)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_units(state: &mut State, backend: u32, expected: &[u16]) {
        assert_eq!(state.len(backend), expected.len() as i32);
        assert_eq!(state.read(backend), expected.len() as i32);
        assert_eq!(&state.output[..expected.len()], expected);
    }

    #[test]
    fn both_backends_preserve_utf16_and_have_independent_lifecycles() {
        let mut state = State::new();
        let initial = [0, 0xac00, 0xd83d, 0xde00, 0xd800, 0xffff];
        state.input[..initial.len()].copy_from_slice(&initial);
        for backend in 0..2 {
            assert_eq!(state.len(backend), MISSING_STATE);
            assert_eq!(state.read(backend), MISSING_STATE);
            assert_eq!(state.splice(backend, 0, 0, 0), MISSING_STATE);
            assert_eq!(state.drop_slot(backend), MISSING_STATE);
            assert_eq!(state.init(backend, initial.len() as u32), 0);
        }
        // Split the surrogate pair, preserve an isolated surrogate, and append.
        state.input[0] = 0xdc00;
        assert_eq!(state.splice(1, 3, 1, 1), 0);
        assert_units(&mut state, 0, &initial);
        assert_units(&mut state, 1, &[0, 0xac00, 0xd83d, 0xdc00, 0xd800, 0xffff]);
        assert_eq!(state.splice(1, 6, 0, 1), 0);
        assert_eq!(state.splice(1, 0, 7, 0), 0);
        assert_units(&mut state, 1, &[]);
        assert_eq!(state.drop_slot(1), 0);
        assert_eq!(state.drop_slot(1), MISSING_STATE);
        assert_units(&mut state, 0, &initial);
        assert_eq!(state.init(0, 1), 0);
        assert_units(&mut state, 0, &[0xdc00]);
    }

    #[test]
    fn invalid_input_is_atomic_for_text_and_output() {
        let mut state = State::new();
        state.input[..3].copy_from_slice(&[65, 0xd800, 0xdc00]);
        for backend in 0..2 {
            assert_eq!(state.init(backend, 3), 0);
            assert_eq!(state.read(backend), 3);
            let output = state.output.clone();
            let slots = state.slots.clone();
            for (at, delete, insert_len, error) in [
                (4, 0, 1, INVALID_RANGE),
                (2, u32::MAX, 1, INVALID_RANGE),
                (u32::MAX, 0, 0, INVALID_RANGE),
                (0, 0, u32::MAX, TOO_LARGE),
            ] {
                assert_eq!(state.splice(backend, at, delete, insert_len), error);
                assert_eq!(state.output, output);
                assert_eq!(state.slots, slots);
                assert_units(&mut state, backend, &[65, 0xd800, 0xdc00]);
            }
            assert_eq!(state.init(backend, u32::MAX), TOO_LARGE);
            assert_eq!(state.slots, slots);
            assert_units(&mut state, backend, &[65, 0xd800, 0xdc00]);
        }
        let output = state.output.clone();
        for backend in [2, u32::MAX] {
            assert_eq!(state.init(backend, 0), INVALID_BACKEND);
            assert_eq!(state.len(backend), INVALID_BACKEND);
            assert_eq!(state.read(backend), INVALID_BACKEND);
            assert_eq!(state.splice(backend, 0, 0, 0), INVALID_BACKEND);
            assert_eq!(state.drop_slot(backend), INVALID_BACKEND);
            assert_eq!(state.output, output);
        }
    }

    #[test]
    fn exact_capacity_and_replacement_are_supported_for_both_backends() {
        let mut state = State::new();
        state.input.fill(0xdfff);
        for backend in 0..2 {
            assert_eq!(state.init(backend, CAPACITY as u32), 0);
            assert_eq!(state.splice(backend, CAPACITY as u32, 0, 0), 0);
            assert_eq!(state.splice(backend, 0, 0, 1), TOO_LARGE);
            assert_eq!(state.splice(backend, 0, 1, 1), 0);
            assert_eq!(state.read(backend), CAPACITY as i32);
            assert!(state.output.iter().all(|unit| *unit == 0xdfff));
            assert_eq!(
                state.splice(backend, 0, CAPACITY as u32, CAPACITY as u32),
                0
            );
            assert_eq!(state.splice(backend, 0, CAPACITY as u32, 0), 0);
            assert_units(&mut state, backend, &[]);
            assert_eq!(state.drop_slot(backend), 0);
            assert_eq!(state.read(backend), MISSING_STATE);
        }
    }
}
