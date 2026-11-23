import { Utf16Bridge, fromUnits, toUnits } from './bridge.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function rejected(fn, ErrorType, message) {
  try { fn(); } catch (error) {
    if (!(error instanceof ErrorType)) throw error;
    return;
  }
  throw new Error(message);
}

/** Synchronous instance-local checks. No GC, allocator, or RSS inference. */
export function lifetime(instance, { cycles = 2000 } = {}) {
  assert(Number.isInteger(cycles) && cycles > 0 && cycles <= 100000, 'invalid cycle count');
  const raw = instance.exports;
  const wrappers = [];
  const make = (target = instance) => {
    const wrapper = new Utf16Bridge(target);
    wrappers.push(wrapper);
    return wrapper;
  };
  const baseHandles = raw.bridge_live_handles();
  const baseUnits = raw.bridge_live_units();
  const count = (handles, units) => {
    assert(raw.bridge_live_handles() === baseHandles + handles, 'live handle count mismatch');
    assert(raw.bridge_live_units() === baseUnits + units, 'live logical unit count mismatch');
  };
  assert(baseHandles === 0 && baseUnits === 0, 'lifetime suite requires an unused instance');
  const memoryBefore = raw.memory.buffer.byteLength;
  let staleRejections = 0;
  let hostileGetterReads = 0;
  let peakHandles = 0;
  let peakUnits = 0;
  let memoryAfterCycles;
  try {
    const bridge = make();
    let previous = 0;
    for (let round = 0; round < cycles; round++) {
      const caller = new Uint16Array([round & 0xffff, 0, 0xd800, 0xdfff]);
      const expected = caller.slice();
      const handle = bridge.create(caller);
      assert(handle > previous, 'handle recycled');
      caller.fill(42);
      assert(fromUnits(bridge.read(handle)) === fromUnits(expected), 'create retained caller storage');
      const insertion = new Uint16Array([65, 0xdc00]);
      bridge.splice(handle, 1, 1, insertion);
      insertion.fill(42);
      const text = String.fromCharCode(expected[0], 65, 0xdc00, 0xd800, 0xdfff);
      const result = bridge.read(handle);
      assert(fromUnits(result) === text, 'splice retained caller storage');
      result.fill(0);
      assert(fromUnits(bridge.read(handle)) === text, 'read exposed scratch or document storage');
      count(1, 5);
      peakHandles = Math.max(peakHandles, 1);
      peakUnits = Math.max(peakUnits, 5);
      if (previous !== 0) {
        assert(raw.bridge_read(previous) === -1, 'stale read accepted');
        assert(raw.bridge_splice(previous, 0, 0, 1) === -1, 'stale splice accepted');
        assert(raw.bridge_close(previous) === -1, 'stale close accepted');
        staleRejections += 3;
        assert(fromUnits(bridge.read(handle)) === text, 'stale operation changed live document');
      }
      bridge.close(handle);
      rejected(() => bridge.close(handle), RangeError, 'double close accepted');
      count(0, 0);
      previous = handle;
    }
    memoryAfterCycles = raw.memory.buffer.byteLength;
    bridge.dispose();
    bridge.dispose();
    for (const call of [
      () => bridge.create(), () => bridge.read(previous),
      () => bridge.splice(previous, 0, 0), () => bridge.checksum(previous),
      () => bridge.close(previous),
    ]) rejected(call, RangeError, 'disposed wrapper accepted document operation');
    assert(bridge.resourceStats().disposed && bridge.resourceStats().ownedHandles === 0, 'dispose diagnostics mismatch');

    const ownerA = make();
    const ownerB = make();
    const handleA = ownerA.create(toUnits('A\ud800'));
    const handleB = ownerB.create(toUnits('B\udfff'));
    for (const [other, handle] of [[ownerA, handleB], [ownerB, handleA]]) {
      for (const call of [() => other.read(handle), () => other.close(handle),
        () => other.splice(handle, 0, 0, toUnits('bad')), () => other.checksum(handle)]) {
        rejected(call, RangeError, 'cross-owner operation accepted');
      }
    }
    count(2, 4);
    assert(ownerA.resourceStats().ownedHandles === 1 && ownerB.resourceStats().ownedHandles === 1,
      'wrapper ownership count mismatch');
    ownerA.dispose();
    count(1, 2);
    assert(fromUnits(ownerB.read(handleB)) === 'B\udfff', 'dispose changed another owner');
    ownerB.dispose();
    count(0, 0);

    const failures = make();
    const live = failures.create(toUnits('safe'));
    rejected(() => failures.splice(live, 5, 0), RangeError, 'invalid range accepted');
    rejected(() => failures.create(new Uint16Array(failures.capacity + 1)), RangeError, 'oversized create accepted');
    rejected(() => failures.splice(live, 0, 0, new Uint16Array(failures.capacity + 1)), RangeError, 'oversized splice accepted');
    assert(fromUnits(failures.read(live)) === 'safe', 'failed operation changed document');
    count(1, 4);
    for (let i = 1; i < raw.bridge_max_handles(); i++) failures.create();
    count(raw.bridge_max_handles(), 4);
    peakHandles = Math.max(peakHandles, raw.bridge_max_handles());
    rejected(() => failures.create(), RangeError, 'handle-limit create accepted');
    failures.dispose();
    count(0, 0);

    // A close failure must not skip cleanup of other owned handles. Failed
    // handles remain visible for a retry, while the wrapper remains terminal.
    let failClose = true;
    const cleanup = make({ exports: { ...raw, bridge_close(handle) {
      if (failClose) { failClose = false; throw new Error('injected close failure'); }
      return raw.bridge_close(handle);
    } } });
    cleanup.create(toUnits('kept'));
    cleanup.create(toUnits('drop'));
    rejected(() => cleanup.dispose(), Error, 'injected cleanup failure was hidden');
    count(1, 4);
    assert(cleanup.resourceStats().ownedHandles === 1 && cleanup.resourceStats().disposed,
      'failed cleanup lost ownership diagnostics');
    rejected(() => cleanup.create(), RangeError, 'failed dispose reopened wrapper');
    cleanup.dispose();
    count(0, 0);

    const hostile = make();
    const input = new Uint16Array([65, 0xd800, 66]);
    const forbidden = () => { hostileGetterReads++; throw new Error('hostile getter read'); };
    for (const name of ['length', 'buffer', 'byteOffset', 'byteLength', 'constructor', 'subarray']) {
      Object.defineProperty(input, name, { get: forbidden });
    }
    Object.defineProperty(input, Symbol.iterator, { get: forbidden });
    Object.defineProperty(input, Symbol.toStringTag, { get: forbidden });
    const hostileId = hostile.create(input);
    hostile.splice(hostileId, 1, 1, input);
    assert(fromUnits(hostile.read(hostileId)) === 'AA\ud800BB', 'hostile metadata changed input');
    assert(hostileGetterReads === 0, 'wrapper read caller metadata');
    const forged = new Uint8Array([1, 2, 3]);
    Object.setPrototypeOf(forged, Uint16Array.prototype);
    rejected(() => hostile.create(forged), TypeError, 'forged Uint16Array prototype accepted');
    rejected(() => hostile.create(new Proxy(input, {})), TypeError, 'typed-array proxy accepted');
    hostile.dispose();
    count(0, 0);

    const grown = make();
    const grownId = grown.create(toUnits('stable'));
    const readSnapshot = grown.read(grownId);
    const callerInWasm = new Uint16Array(raw.memory.buffer, raw.bridge_input_ptr() >>> 0, 2);
    const oldBuffer = raw.memory.buffer;
    raw.memory.grow(1);
    assert(oldBuffer.byteLength === 0, 'WASM growth did not detach old caller buffer');
    rejected(() => grown.create(callerInWasm), TypeError, 'detached create input accepted');
    rejected(() => grown.splice(grownId, 0, 0, callerInWasm), TypeError, 'detached splice input accepted');
    count(1, 6);
    assert(fromUnits(readSnapshot) === 'stable', 'read snapshot aliases WASM memory');
    assert(fromUnits(grown.read(grownId)) === 'stable', 'detached input changed live document');
    grown.splice(grownId, 0, 0, toUnits('new '));
    assert(fromUnits(grown.read(grownId)) === 'new stable', 'growth invalidated wrapper scratch views');
    peakUnits = Math.max(peakUnits, 10);
    grown.dispose();
    count(0, 0);
  } finally {
    // Preserve any primary assertion failure; collect cleanup state below on success.
    for (const wrapper of wrappers) {
      try { wrapper.dispose(); } catch { /* Primary failure remains authoritative. */ }
    }
  }
  count(0, 0);
  return {
    status: 'PASS', cycles, staleRejections, hostileGetterReads,
    peakHandles, peakLogicalUnits: peakUnits,
    finalLiveHandles: raw.bridge_live_handles(), finalLiveLogicalUnits: raw.bridge_live_units(),
    memoryBytes: { before: memoryBefore, afterCycles: memoryAfterCycles, afterExplicitGrow: raw.memory.buffer.byteLength },
    coverage: ['repeated create/edit/read/close', 'caller and read copy ownership', 'monotonic stale handles',
      'terminal idempotent dispose', 'simultaneous wrapper ownership', 'failure cleanup and retry',
      'hostile typed-array metadata and forged brands', 'detached caller inputs', 'scratch view refresh after memory.grow'],
    boundary: 'Synchronous single-threaded wrapper use. Raw exports are trusted instance-level access, not an owner security boundary. Counters measure live documents and logical UTF-16 units. Linear memory can retain allocator capacity; no allocator, GC, RSS, or production leak claim.',
  };
}
