// Exact port of src/storage_trace.rs. xorshift32 uses one draw per edit.
export const SEED = 305419896;
export const KINDS = ['cursor-local', 'far-jump', 'alternating-ends'];
export function initialUnits(length) {
  return Uint16Array.from({ length }, (_, i) => i % 65536);
}
export function trace(kind, length, rounds, seed = SEED) {
  let state = seed >>> 0, current = length, cursor = Math.floor(length / 2);
  return Array.from({ length: rounds }, (_, round) => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    state >>>= 0;
    let at;
    if (kind === 'cursor-local') {
      cursor = Math.max(0, cursor + state % 33 - 16);
      at = Math.min(cursor, current - 3);
    } else if (kind === 'far-jump') at = state % (current - 2);
    else if (kind === 'alternating-ends') at = round % 2 === 0 ? 0 : current - 3;
    else throw new Error('unknown trace');
    const insert = new Uint16Array(round % 2 === 0 ? [state & 65535, 0xd83d, 0xde00] : [state & 65535]);
    const remove = round % 2 === 0 ? 1 : 3;
    current += insert.length - remove; cursor = at + insert.length;
    return { at, remove, insert };
  });
}
export function asString(units) {
  let text = '';
  for (let start = 0; start < units.length; start += 8192) text += String.fromCharCode(...units.subarray(start, start + 8192));
  return text;
}
export function oracleSplice(text, at, remove, insert) {
  if (!Number.isInteger(at) || !Number.isInteger(remove) || at < 0 || remove < 0 || at > text.length || remove > text.length - at) throw new RangeError('invalid splice');
  return text.slice(0, at) + asString(insert) + text.slice(at + remove);
}
export function equalText(units, text, context) {
  if (units.length !== text.length) throw new Error(`${context}: length ${units.length} != ${text.length}`);
  for (let i = 0; i < text.length; i++) if (units[i] !== text.charCodeAt(i)) throw new Error(`${context}: code unit ${i}`);
}
export function checksum(units) {
  let hash = 2166136261;
  for (const unit of units) hash = Math.imul(hash ^ unit, 16777619) >>> 0;
  return hash;
}
