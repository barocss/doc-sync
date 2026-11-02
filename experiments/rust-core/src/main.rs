use doc_sync_rust_experiment::{workload, MAX_ROUNDS};
use std::{hint::black_box, time::Instant};

fn main() {
    let mut args = std::env::args().skip(1);
    let rounds: u32 = args
        .next()
        .unwrap_or_else(|| "1000".into())
        .parse()
        .expect("integer rounds");
    let samples: u32 = args
        .next()
        .unwrap_or_else(|| "7".into())
        .parse()
        .expect("integer samples");
    assert!(rounds <= MAX_ROUNDS && samples > 0 && samples <= 1000);
    black_box(workload(rounds));
    let mut times = Vec::new();
    let mut checksum = 0;
    for _ in 0..samples {
        let start = Instant::now();
        checksum = black_box(workload(black_box(rounds)));
        times.push(start.elapsed().as_secs_f64() * 1000.0);
    }
    println!("{{\"runtime\":\"rust-native\",\"rounds\":{rounds},\"samples\":{samples},\"checksum\":{checksum},\"milliseconds\":{times:?}}}");
}
