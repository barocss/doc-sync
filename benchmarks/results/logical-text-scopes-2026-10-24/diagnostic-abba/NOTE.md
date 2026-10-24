# Diagnostic run

Timing and model assertions passed. The first runner used the current repository as cwd even for the archived baseline, so the baseline harness self-reported current-tree source hashes. The actual baseline imports were archived source, but those self-reported hashes are not valid baseline provenance. These originals remain unchanged. The corrected runner uses each measured tree as cwd; use the later abba folder for the final comparison.
