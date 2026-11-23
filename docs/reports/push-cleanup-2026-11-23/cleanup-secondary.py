#!/usr/bin/env python3
"""Verify preserved worktrees. Remove only approved secondary trees with --execute."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import tarfile
import tempfile

ROOT = Path('/Users/user/github/doc-sync')
REPORT = ROOT / 'docs/reports/push-cleanup-2026-11-23'
PRIVATE = Path('/Users/user/github/doc-sync-private-backup-20261123.tar.gz')
RESULT = REPORT / 'secondary-cleanup.json'
ENV = {**os.environ, 'GIT_OPTIONAL_LOCKS': '0'}


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def load(name):
    path = REPORT / name
    require(path.is_file() and not path.is_symlink(), 'Missing or symlink proof: ' + str(path))
    return json.loads(path.read_text())


def git(path, *args, check=True, timeout=180):
    p = subprocess.run(['git', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-C', str(path), *args],
                       env=ENV, capture_output=True, timeout=timeout)
    require(not check or p.returncode == 0, 'Git ' + args[0] + ' failed at ' + str(path))
    return p


def no_symlink_ancestors(path):
    require(path.is_absolute(), 'Path is not absolute: ' + str(path))
    for item in [path, *path.parents]:
        require(not item.is_symlink(), 'Symlink path crossover: ' + str(item))
    require(path.resolve() == path, 'Noncanonical path: ' + str(path))


def sha256_file(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1048576), b''):
            h.update(chunk)
    return h.hexdigest()


def file_identity(path):
    """Return Git blob ID and SHA-256 without following a file symlink."""
    s = path.lstat()
    if stat.S_ISLNK(s.st_mode):
        data = os.readlink(path).encode()
        return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest(), hashlib.sha256(data).hexdigest()
    require(stat.S_ISREG(s.st_mode), 'Unsupported source entry: ' + str(path))
    blob = hashlib.sha1(b'blob ' + str(s.st_size).encode() + b'\0')
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1048576), b''):
            blob.update(chunk)
            h.update(chunk)
    require(path.lstat().st_size == s.st_size, 'Source changed while reading: ' + str(path))
    return blob.hexdigest(), h.hexdigest()


def tree_entries(sha):
    result = {}
    for raw in git(ROOT, 'ls-tree', '-r', '-z', sha).stdout.split(b'\0'):
        if raw:
            meta, path = raw.split(b'\t', 1)
            mode, kind, blob = meta.decode().split()
            require(kind == 'blob', 'Unsupported non-blob tree entry')
            result[os.fsdecode(path)] = (mode, blob)
    return result


def relative_path(value):
    p = Path(value)
    require(not p.is_absolute() and '..' not in p.parts and '.' not in p.parts, 'Unsafe relative input path')
    return p


def safe_source_path(worktree, rel):
    p = worktree / relative_path(rel)
    for parent in p.parents:
        if parent == worktree:
            break
        require(not parent.is_symlink(), 'Source parent symlink crossover: ' + str(parent))
    return p


def worktree_blocks():
    blocks = {}
    for block in git(ROOT, 'worktree', 'list', '--porcelain').stdout.decode().strip().split('\n\n'):
        fields = dict(line.partition(' ')[::2] for line in block.splitlines())
        if 'worktree' in fields:
            blocks[fields['worktree']] = fields
    return blocks


def private_readback(manifest):
    no_symlink_ancestors(PRIVATE)
    require(manifest['archive_path'] == str(PRIVATE), 'Unexpected private archive path')
    require(PRIVATE.is_file(), 'Private archive missing')
    require(sha256_file(PRIVATE) == manifest['archive_sha256'], 'Private archive hash changed')
    expected = {x['archive_path']: x for x in manifest['entries']}
    require(len(expected) == manifest['entry_count'], 'Duplicate private manifest path')
    seen = set()
    with tarfile.open(PRIVATE, 'r:gz') as tf:
        for item in tf:
            require(item.name in expected and item.name not in seen, 'Unexpected private archive entry')
            seen.add(item.name)
            x = expected[item.name]
            if x['type'] == 'file':
                require(item.isfile(), 'Private archive type mismatch')
                h = hashlib.sha256()
                count = 0
                stream = tf.extractfile(item)
                for chunk in iter(lambda: stream.read(1048576), b''):
                    h.update(chunk)
                    count += len(chunk)
                require(count == x['bytes'] and h.hexdigest() == x['sha256'], 'Private archive file mismatch')
            elif x['type'] == 'directory':
                require(item.isdir(), 'Private directory type mismatch')
            elif x['type'] == 'symlink':
                require(item.issym() and hashlib.sha256(item.linkname.encode()).hexdigest() == x['link_target_sha256'], 'Private link mismatch')
            else:
                raise RuntimeError('Unsupported private archive entry type')
    require(seen == set(expected), 'Private archive entry missing')
    return {x['sha256'] for x in expected.values() if x['type'] == 'file'}


def reproducible_dir(path):
    if path.name in ('node_modules', 'dist') or path.name.startswith('clean-prepack-') or path.name in ('npm-cache', '_cacache'):
        return True
    if path.name == 'cache' and path.parent.name == '.vitepress':
        return True
    if path.name == 'target' or path.name.endswith('-target'):
        return any((path / marker).exists() for marker in ('CACHEDIR.TAG', '.rustc_info.json', 'debug/.fingerprint'))
    return False


def ignored_files(worktree):
    raw = git(worktree, 'ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z').stdout
    roots = [safe_source_path(worktree, os.fsdecode(p).rstrip('/')) for p in raw.split(b'\0') if p]
    found = set()
    for base in roots:
        if reproducible_dir(base):
            continue
        if base.is_symlink() or base.is_file():
            found.add(base)
            continue
        for current, dirs, files in os.walk(base, followlinks=False):
            current = Path(current)
            for name in list(dirs):
                p = current / name
                if reproducible_dir(p):
                    dirs.remove(name)
                elif p.is_symlink():
                    dirs.remove(name)
                    found.add(p)
            found.update(current / name for name in files)
    return found


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--execute', action='store_true', help='Delete only after all preservation checks pass.')
    mode.add_argument('--dry-run', action='store_true', help='Check all gates without deleting worktrees (default).')
    args = parser.parse_args()
    no_symlink_ancestors(ROOT)
    no_symlink_ancestors(REPORT)
    lock = REPORT / 'secondary-cleanup.lock'
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(fd)
    history = {'schema_version': 1, 'runs': []}
    recording = False
    run = {'started_utc': now(), 'mode': 'execute' if args.execute else 'dry-run', 'status': 'IN_PROGRESS', 'events': []}

    def record(event, **details):
        run['events'].append({'utc': now(), 'event': event, **details})
        tempfd, temporary = tempfile.mkstemp(prefix='.secondary-cleanup-', dir=REPORT)
        try:
            with os.fdopen(tempfd, 'w') as stream:
                json.dump(history, stream, indent=2)
                stream.write('\n')
            os.replace(temporary, RESULT)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    try:
        if RESULT.exists():
            require(not RESULT.is_symlink(), 'Result is a symlink')
            history = json.loads(RESULT.read_text())
            require(history.get('schema_version') == 1 and isinstance(history.get('runs'), list), 'Existing result format is unsupported')
        history['runs'].append(run)
        recording = True
        record('started')
        mainproof = load('main-push-verification.json')
        require(mainproof.get('status') == 'PASS', 'Main push proof is not PASS')
        recorded = mainproof.get('head_sha') or mainproof.get('verified_head_sha')
        require(isinstance(recorded, str) and len(recorded) == 40, 'Main push proof requires head_sha')
        require(mainproof.get('remote_sha') == recorded, 'Main push proof remote_sha differs')
        require(git(ROOT, 'symbolic-ref', 'HEAD').stdout.decode().strip() == 'refs/heads/main', 'Root is not on main')
        require(git(ROOT, 'rev-parse', 'HEAD').stdout.decode().strip() == recorded, 'Current main differs from push proof')
        inventory = load('worktree-inventory.json')
        recovery = load('secondary-recovery-index.json')
        plans = load('worktree-backup-plan.json')
        private = load('private-backup-manifest.json')
        require(recovery['status'] == 'PASS' and recovery['remote_verified_count'] == 23, 'Secondary recovery proof incomplete')
        approved = {x['worktree']: x for x in inventory['worktrees'] if x['worktree'] != str(ROOT)}
        snapshots = {x['worktree']: x for x in recovery['worktrees']}
        planmap = {x['worktree']: x for x in plans['worktrees'] if x['worktree'] != str(ROOT)}
        require(len(approved) == 23 and set(approved) == set(snapshots) == set(planmap), 'Approved worktree set mismatch')
        for value in approved:
            p = Path(value)
            require(p.parent == ROOT.parent and p.name.startswith('doc-sync-') and p != PRIVATE and p != ROOT, 'Unapproved deletion target')
            no_symlink_ancestors(p)
        refs = ['refs/heads/main', *['refs/heads/' + s['archive_branch'] for s in snapshots.values()]]
        require(len(set(refs)) == 24, 'Duplicate backup ref')
        remote = {}
        for line in git(ROOT, 'ls-remote', '--heads', 'origin', *refs).stdout.decode().splitlines():
            sha, ref = line.split()
            remote[ref] = sha
        require(remote.get('refs/heads/main') == recorded, 'Origin main differs from verified main')
        for s in snapshots.values():
            require(remote.get('refs/heads/' + s['archive_branch']) == s['snapshot_sha'], 'Remote archive SHA mismatch')
        private_hashes = private_readback(private)
        record('remote_and_private_verified', main_sha=recorded, backup_refs=23, private_archive_sha256=private['archive_sha256'])
        trees = {s['snapshot_sha']: tree_entries(s['snapshot_sha']) for s in snapshots.values()}
        root_tree = tree_entries(recorded)
        preserved_blobs = {blob for tree in [root_tree, *trees.values()] for mode, blob in tree.values()}
        registered = worktree_blocks()
        validated = []
        private_by_path = {x['archive_path']: x for x in private['entries']}
        def validate_source_bytes(wp, snapshot, plan):
            fingerprint = hashlib.sha256()
            def add_fingerprint(rel, blob, sha):
                fingerprint.update(rel.encode() + b'\0' + blob.encode() + b'\0' + sha.encode() + b'\0')
            tree = trees[snapshot['snapshot_sha']]
            for rel, (mode, blob) in tree.items():
                source = safe_source_path(wp, rel)
                require(source.exists() or source.is_symlink(), 'Snapshot source missing: ' + str(source))
                actual, source_sha = file_identity(source)
                add_fingerprint(rel, actual, source_sha)
                require(actual == blob, 'Snapshot source bytes changed: ' + str(source))
                require((mode == '120000') == source.is_symlink(), 'Snapshot source type changed: ' + str(source))
            for rel in plan['private_ignored_retain_paths']:
                source = safe_source_path(wp, rel)
                key = str(source.relative_to(ROOT.parent))
                expected = private_by_path.get(key)
                require(expected is not None and expected['type'] == 'file', 'Private source is absent from backup manifest')
                actual_sha = sha256_file(source)
                require(actual_sha == expected['sha256'], 'Private source changed since backup: ' + str(source))
                add_fingerprint(rel, '', actual_sha)
            known = {x['path']: x for x in plan['ignored_file_classification']}
            for source in sorted(ignored_files(wp)):
                rel = str(source.relative_to(wp))
                classification = known.get(rel, {}).get('category', '')
                if classification.startswith('REPRODUCIBLE_'):
                    continue
                blob, sha = file_identity(source)
                add_fingerprint(rel, blob, sha)
                require(blob in preserved_blobs or sha in private_hashes, 'Ignored file lacks durable verified backup: ' + str(source))
            return fingerprint.hexdigest()

        for value in approved:
            wp = Path(value)
            s = snapshots[value]
            inv = approved[value]
            plan = planmap[value]
            require(value in registered, 'Approved worktree no longer registered: ' + value)
            common = Path(git(wp, 'rev-parse', '--path-format=absolute', '--git-common-dir').stdout.decode().strip())
            require(common.resolve() == ROOT / '.git' and not common.is_symlink(), 'Wrong shared Git directory: ' + value)
            require(git(wp, 'rev-parse', 'HEAD').stdout.decode().strip() == s['original_head'] == inv['HEAD'], 'Original HEAD changed: ' + value)
            require(registered[value].get('branch') == inv.get('branch'), 'Original branch changed: ' + value)
            require(git(wp, 'diff', '--cached', '--quiet', s['original_head'], '--', check=False).returncode == 0, 'Normal index differs from original HEAD: ' + value)
            rawstatus = git(wp, 'status', '--porcelain=v1', '--untracked-files=all').stdout.decode().rstrip('\n')
            require(rawstatus == inv['status_porcelain'], 'Worktree status changed: ' + value)
            source_fingerprint = validate_source_bytes(wp, s, plan)
            kib = int(subprocess.check_output(['du', '-sk', str(wp)], timeout=120).split()[0])
            validated.append({'worktree': value, 'before_bytes': kib * 1024, 'snapshot_sha': s['snapshot_sha'], 'original_head': s['original_head'], 'status_sha256': hashlib.sha256(rawstatus.encode()).hexdigest(), 'source_fingerprint': source_fingerprint})
            record('worktree_validated', **validated[-1])
            print('Validated ' + wp.name, flush=True)
        record('all_worktrees_validated', count=len(validated))
        if args.execute:
            for item in validated:
                wp = Path(item['worktree'])
                no_symlink_ancestors(wp)
                require(git(ROOT, 'rev-parse', 'HEAD').stdout.decode().strip() == recorded, 'Main changed during cleanup')
                require(git(wp, 'rev-parse', 'HEAD').stdout.decode().strip() == item['original_head'], 'Secondary HEAD changed during cleanup')
                status = git(wp, 'status', '--porcelain=v1', '--untracked-files=all').stdout.decode().rstrip('\n')
                require(hashlib.sha256(status.encode()).hexdigest() == item['status_sha256'], 'Secondary status changed during cleanup')
                require(git(wp, 'diff', '--cached', '--quiet', item['original_head'], '--', check=False).returncode == 0, 'Normal index changed during cleanup')
                final_fingerprint = validate_source_bytes(wp, snapshots[str(wp)], planmap[str(wp)])
                require(final_fingerprint == item['source_fingerprint'], 'Source inputs changed after validation')
                record('removal_started', worktree=str(wp), before_bytes=item['before_bytes'])
                git(ROOT, 'worktree', 'remove', '--force', str(wp), timeout=300)
                require(not wp.exists() and not wp.is_symlink(), 'Worktree remains after removal')
                record('worktree_removed', **item, after_absent=True)
                print('Removed ' + wp.name, flush=True)
            remaining = worktree_blocks()
            require(not set(approved).intersection(remaining), 'Approved secondary registration remains')
            record('remaining_worktrees', worktrees=remaining)
            run['status'] = 'PASS'
        else:
            run['status'] = 'DRY_RUN_PASS'
            record('remaining_worktrees', worktrees=registered)
        run['completed_utc'] = now()
        record('completed', status=run['status'], deleted_count=23 if args.execute else 0)
        print(run['status'], flush=True)
    except Exception as exc:
        run['status'] = 'FAIL'
        run['completed_utc'] = now()
        if recording:
            record('failure', error=str(exc), remaining_worktrees=worktree_blocks())
        print('FAIL: ' + str(exc), flush=True)
        return 1
    finally:
        lock.unlink()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
