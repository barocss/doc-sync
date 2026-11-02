//! Native GapTape comparison adapter. Binary trace loading, JSON, and IPC are
//! outside all measured regions. All offsets are raw UTF-16 code units.
use doc_sync_rust_experiment::GapTape;
use std::{
    hint::black_box,
    io::{self, Write},
    time::Instant,
};

#[derive(Debug)]
struct Edit {
    at: usize,
    delete: usize,
    insert: Vec<u16>,
}
struct Trace {
    capacity: usize,
    initial: Vec<u16>,
    edits: Vec<Edit>,
}
struct Reader<'a> {
    bytes: &'a [u8],
    at: usize,
}
impl Reader<'_> {
    fn take(&mut self, n: usize) -> Result<&[u8], String> {
        let end = self.at.checked_add(n).ok_or("trace offset overflow")?;
        let value = self.bytes.get(self.at..end).ok_or("truncated trace")?;
        self.at = end;
        Ok(value)
    }
    fn u32(&mut self) -> Result<usize, String> {
        Ok(u32::from_le_bytes(self.take(4)?.try_into().unwrap()) as usize)
    }
    fn units(&mut self, n: usize) -> Result<Vec<u16>, String> {
        let bytes = self.take(n.checked_mul(2).ok_or("unit count overflow")?)?;
        Ok(bytes
            .chunks_exact(2)
            .map(|p| u16::from_le_bytes([p[0], p[1]]))
            .collect())
    }
}
fn parse(bytes: &[u8]) -> Result<Trace, String> {
    let mut r = Reader { bytes, at: 0 };
    if r.take(8)? != b"NGAP0001" {
        return Err("invalid trace magic".into());
    }
    let capacity = r.u32()?;
    let len = r.u32()?;
    if len > capacity {
        return Err("initial text exceeds capacity".into());
    }
    let initial = r.units(len)?;
    let count = r.u32()?;
    if count > (bytes.len() - r.at) / 12 {
        return Err("truncated operation records".into());
    }
    let mut edits = Vec::with_capacity(count);
    for _ in 0..count {
        let at = r.u32()?;
        let delete = r.u32()?;
        let len = r.u32()?;
        edits.push(Edit {
            at,
            delete,
            insert: r.units(len)?,
        });
    }
    if r.at != bytes.len() {
        return Err("trailing trace bytes".into());
    }
    Ok(Trace {
        capacity,
        initial,
        edits,
    })
}
fn apply(tape: &mut GapTape, edit: &Edit, capacity: usize) -> i32 {
    let len = tape.len();
    if edit.at > len || edit.delete > len - edit.at {
        return -3;
    }
    if edit.insert.len() > capacity || edit.insert.len() > capacity - (len - edit.delete) {
        return -4;
    }
    tape.splice(edit.at, edit.delete, black_box(&edit.insert))
        .unwrap();
    0
}
fn ms(start: Instant) -> f64 {
    start.elapsed().as_secs_f64() * 1000.0
}
fn measured(trace: &Trace) -> (f64, f64, f64, Vec<u16>, usize) {
    let start = Instant::now();
    let mut tape = black_box(GapTape::new(black_box(&trace.initial).to_vec()));
    let construction = ms(start);
    let start = Instant::now();
    for edit in black_box(&trace.edits) {
        black_box(apply(&mut tape, edit, trace.capacity));
    }
    black_box(&tape);
    let edits = ms(start);
    let start = Instant::now();
    let units = black_box(tape.to_units());
    let materialization = ms(start);
    (
        construction,
        edits,
        materialization,
        units,
        tape.storage_units(),
    )
}
fn checkpoint(phase: &str) -> Result<(), String> {
    println!("{{\"phase\":\"{phase}\"}}");
    io::stdout().flush().map_err(|e| e.to_string())?;
    let mut line = String::new();
    if io::stdin()
        .read_line(&mut line)
        .map_err(|e| e.to_string())?
        == 0
    {
        return Err(format!("stdin closed while waiting at {phase}"));
    }
    Ok(())
}
fn run() -> Result<(), String> {
    let mut mode = String::from("bench");
    let mut path = None;
    let mut warmup = 5usize;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        let value = args
            .next()
            .ok_or_else(|| format!("missing value for {arg}"))?;
        match arg.as_str() {
            "--mode" => mode = value,
            "--trace" => path = Some(value),
            "--warmup" => warmup = value.parse().map_err(|_| "invalid warmup")?,
            _ => return Err(format!("unknown option {arg}")),
        }
    }
    if !matches!(mode.as_str(), "bench" | "correctness" | "memory") {
        return Err("invalid mode".into());
    }
    let path = path.ok_or("--trace is required")?;
    if mode == "memory" {
        checkpoint("baseline")?;
    }
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let trace = parse(&bytes)?;
    drop(bytes);
    if mode == "memory" {
        checkpoint("loaded")?;
        let mut tape = GapTape::new(trace.initial.clone());
        checkpoint("constructed")?;
        for edit in &trace.edits {
            black_box(apply(&mut tape, edit, trace.capacity));
        }
        checkpoint("edited")?;
        let units = tape.to_units();
        checkpoint("materialized")?;
        println!(
            "{{\"runtime\":\"rust-native\",\"units\":{units:?},\"storage_units\":{}}}",
            tape.storage_units()
        );
        io::stdout().flush().map_err(|e| e.to_string())?;
        drop(units);
        drop(tape);
        checkpoint("released")?;
        black_box(&trace);
    } else if mode == "correctness" {
        let mut tape = GapTape::new(trace.initial.clone());
        println!(
            "{{\"step\":-1,\"status\":0,\"units\":{:?},\"storage_units\":{}}}",
            tape.to_units(),
            tape.storage_units()
        );
        for (step, edit) in trace.edits.iter().enumerate() {
            let status = apply(&mut tape, edit, trace.capacity);
            println!(
                "{{\"step\":{step},\"status\":{status},\"units\":{:?},\"storage_units\":{}}}",
                tape.to_units(),
                tape.storage_units()
            );
        }
    } else {
        let mut warmup_times = Vec::with_capacity(warmup);
        for _ in 0..warmup {
            let (construction, edits, materialization, units, _) = measured(&trace);
            black_box(&units);
            warmup_times.push((construction, edits, materialization));
        }
        let (construction, edits, materialization, units, storage) = measured(&trace);
        print!("{{\"runtime\":\"rust-native\",\"warmup_times\":[");
        for (index, (c, e, m)) in warmup_times.iter().enumerate() {
            if index > 0 {
                print!(",");
            }
            print!("{{\"construction_ms\":{c},\"edits_ms\":{e},\"materialization_ms\":{m}}}");
        }
        println!("],\"construction_ms\":{construction},\"edits_ms\":{edits},\"materialization_ms\":{materialization},\"units\":{units:?},\"storage_units\":{storage}}}");
    }
    Ok(())
}
fn main() {
    if let Err(error) = run() {
        eprintln!("native-gap-compare: {error}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn capacity_bounds_and_invalid_ranges_preserve_full_gap_state() {
        let mut tape = GapTape::new(vec![0xd800, 0xdc00, 65]);
        for edit in [
            Edit {
                at: 4,
                delete: 0,
                insert: vec![],
            },
            Edit {
                at: 1,
                delete: usize::MAX,
                insert: vec![],
            },
            Edit {
                at: 0,
                delete: 0,
                insert: vec![1, 2],
            },
        ] {
            let before = tape.clone();
            assert!(apply(&mut tape, &edit, 4) < 0);
            assert_eq!(tape, before);
        }
        assert_eq!(
            apply(
                &mut tape,
                &Edit {
                    at: 1,
                    delete: 1,
                    insert: vec![0xdfff, 0xd800]
                },
                4
            ),
            0
        );
        assert_eq!(tape.to_units(), vec![0xd800, 0xdfff, 0xd800, 65]);
    }
    #[test]
    fn parser_rejects_truncated_and_trailing_bytes() {
        let mut bytes = b"NGAP0001".to_vec();
        for n in [4u32, 1, 0xd800, 0] {
            if n == 0xd800 {
                bytes.extend_from_slice(&(n as u16).to_le_bytes());
            } else {
                bytes.extend_from_slice(&n.to_le_bytes());
            }
        }
        assert_eq!(parse(&bytes).unwrap().initial, vec![0xd800]);
        assert!(parse(&bytes[..bytes.len() - 1]).is_err());
        bytes.push(0);
        assert!(parse(&bytes).is_err());
    }
}
