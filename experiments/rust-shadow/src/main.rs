use doc_sync_rust_shadow::Server;
use serde_json::json;
use std::io::{self, BufRead, Write};
fn main() {
    let mut server = Server::default();
    let stdout = io::stdout();
    let mut output = stdout.lock();
    for line in io::stdin().lock().lines() {
        let response = match line {
            Ok(line) => match serde_json::from_str(&line) {
                Ok(request) => server.request(request),
                Err(error) => json!({"ok":false,"error":format!("invalid JSON: {error}")}),
            },
            Err(error) => {
                eprintln!("stdin: {error}");
                break;
            }
        };
        if serde_json::to_writer(&mut output, &response).is_err()
            || writeln!(output).is_err()
            || output.flush().is_err()
        {
            break;
        }
    }
}
