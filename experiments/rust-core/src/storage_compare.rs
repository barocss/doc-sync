use doc_sync_rust_experiment::{GapTape, TextTape};
use std::{hint::black_box, time::Instant};
mod storage_trace;
use storage_trace::{checksum, initial, trace, Edit};

#[derive(Default)]
struct Times {
    construction: Vec<f64>,
    edits: Vec<f64>,
    materialization: Vec<f64>,
}

fn elapsed(start: Instant) -> f64 {
    start.elapsed().as_secs_f64() * 1000.0
}

fn run_vec(input: &[u16], edits: &[Edit], times: &mut Times) -> Vec<u16> {
    let start = Instant::now();
    let mut tape = black_box(TextTape::new(black_box(input).to_vec()));
    times.construction.push(elapsed(start));
    let start = Instant::now();
    for edit in black_box(edits) {
        tape.splice(edit.at, edit.delete, black_box(&edit.insert))
            .unwrap();
    }
    black_box(&tape);
    times.edits.push(elapsed(start));
    let start = Instant::now();
    let units = black_box(tape.units().to_vec());
    times.materialization.push(elapsed(start));
    units
}

fn run_gap(input: &[u16], edits: &[Edit], times: &mut Times) -> (Vec<u16>, usize) {
    let start = Instant::now();
    let mut tape = black_box(GapTape::new(black_box(input).to_vec()));
    times.construction.push(elapsed(start));
    let start = Instant::now();
    for edit in black_box(edits) {
        tape.splice(edit.at, edit.delete, black_box(&edit.insert))
            .unwrap();
    }
    black_box(&tape);
    times.edits.push(elapsed(start));
    let start = Instant::now();
    let units = black_box(tape.to_units());
    times.materialization.push(elapsed(start));
    (units, tape.storage_units())
}

fn print_times(name: &str, t: &Times) {
    print!(
        "\"{name}\":{{\"construction_ms\":{:?},\"edits_ms\":{:?},\"materialization_ms\":{:?}}}",
        t.construction, t.edits, t.materialization
    );
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    assert!(
        args.len() <= 3,
        "usage: storage-compare [rounds=10000] [samples=7] [initial_units=100000]"
    );
    let rounds: usize = args
        .first()
        .map_or(10_000, |v| v.parse().expect("integer rounds"));
    let samples: usize = args
        .get(1)
        .map_or(7, |v| v.parse().expect("integer samples"));
    let len: usize = args
        .get(2)
        .map_or(100_000, |v| v.parse().expect("integer initial units"));
    assert!(
        (1..=100_000).contains(&rounds)
            && (1..=100).contains(&samples)
            && (4..=1_000_000).contains(&len)
    );
    let input = initial(len);
    for kind in ["cursor-local", "far-jump", "alternating-ends"] {
        let edits = trace(kind, len, rounds, 0x1234_5678);
        // One untimed warmup per implementation; full outputs compared outside timers.
        let expected = run_vec(&input, &edits, &mut Times::default());
        assert_eq!(run_gap(&input, &edits, &mut Times::default()).0, expected);
        let mut vec_times = Times::default();
        let mut gap_times = Times::default();
        let mut storage = 0;
        for sample in 0..samples {
            let (vec, gap) = if sample % 2 == 0 {
                (
                    run_vec(&input, &edits, &mut vec_times),
                    run_gap(&input, &edits, &mut gap_times),
                )
            } else {
                let gap = run_gap(&input, &edits, &mut gap_times);
                (run_vec(&input, &edits, &mut vec_times), gap)
            };
            assert_eq!(vec, expected);
            assert_eq!(gap.0, expected);
            storage = gap.1;
        }
        print!("{{\"runtime\":\"rust-native\",\"trace\":\"{kind}\",\"seed\":305419896,\"initial_units\":{len},\"rounds\":{rounds},\"samples\":{samples},\"checksum\":{},\"final_units\":{},\"gap_storage_units\":{storage},\"costs\":\"construction includes input copy; materialization copies both to fresh Vec; trace and checks excluded; drops excluded\",", checksum(&expected), expected.len());
        print_times("vec", &vec_times);
        print!(",");
        print_times("gap", &gap_times);
        println!("}}");
    }
}
