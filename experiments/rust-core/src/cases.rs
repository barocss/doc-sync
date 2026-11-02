//! Test-only line protocol for differential validation. Not a production API.
use doc_sync_rust_experiment::TextTape;
use std::io::{self, BufRead};

fn units(text: &str) -> Vec<u16> {
    if text.is_empty() {
        Vec::new()
    } else {
        text.split(',')
            .map(|unit| unit.parse().expect("u16 unit"))
            .collect()
    }
}

fn main() {
    let stdin = io::stdin();
    let mut lines = stdin.lock().lines();
    let initial = lines.next().expect("initial line").expect("read initial");
    let mut tape = TextTape::new(units(&initial));
    for line in lines {
        let line = line.expect("read operation");
        let fields: Vec<_> = line.split('\t').collect();
        assert_eq!(fields.len(), 3);
        let at = fields[0].parse().expect("usize offset");
        let delete = fields[1].parse().expect("usize deletion");
        let insert = units(fields[2]);
        let status = if tape.splice(at, delete, &insert).is_ok() {
            "ok"
        } else {
            "error"
        };
        let content = tape
            .units()
            .iter()
            .map(u16::to_string)
            .collect::<Vec<_>>()
            .join(",");
        println!("{status}\t{content}");
    }
}
