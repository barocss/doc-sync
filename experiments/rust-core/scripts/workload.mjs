// Independent JavaScript UTF-16 storage implementation of the same workload.
// A fixed typed-array capacity avoids Array.splice boxing and argument limits.
export function javascript(rounds) {
  const units = new Uint16Array(100_002);
  let length = 100_000;
  for (let i = 0; i < length; i++) units[i] = i % 65_536;
  let state = 0x12345678;
  function next() {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  }
  for (let round = 0; round < rounds; round++) {
    const at = next() % (length - 2);
    const unit = next() & 0xffff;
    if (round % 2 === 0) {
      units.copyWithin(at + 3, at + 1, length);
      units[at] = unit;
      units[at + 1] = 0xd83d;
      units[at + 2] = 0xde00;
      length += 2;
    } else {
      units.copyWithin(at + 1, at + 3, length);
      units[at] = unit;
      length -= 2;
    }
  }
  let hash = 2166136261;
  for (let i = 0; i < length; i++) hash = Math.imul(hash ^ units[i], 16777619) >>> 0;
  return hash;
}
