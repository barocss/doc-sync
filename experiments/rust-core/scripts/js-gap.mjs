// Independent JavaScript implementation of gap.rs. All offsets are UTF-16 units.
export const GAP_CAPACITY = 1_048_576;
const Units = Uint16Array;
const typed = Object.getPrototypeOf(Units.prototype);
const getBuffer = Object.getOwnPropertyDescriptor(typed, 'buffer').get;
const getOffset = Object.getOwnPropertyDescriptor(typed, 'byteOffset').get;
const getLength = Object.getOwnPropertyDescriptor(typed, 'length').get;
const getTag = Object.getOwnPropertyDescriptor(typed, Symbol.toStringTag).get;
const set = Units.prototype.set;
const copyWithin = Units.prototype.copyWithin;
const subarray = Units.prototype.subarray;

function inputView(value) {
  if (getTag.call(value) !== 'Uint16Array') throw new TypeError('Uint16Array required');
  const length = getLength.call(value);
  // Constructing this view also rejects a detached ArrayBuffer, including empty ones.
  return { view: new Units(getBuffer.call(value), getOffset.call(value), length), length };
}
function index(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError('unsigned integer required');
}

export class JsGapStorage {
  #buffer = null;
  #start = 0;
  #end = 0;

  constructor(input) { if (arguments.length) this.init(input); }

  init(input) {
    const { view, length } = inputView(input);
    if (length > GAP_CAPACITY) throw new RangeError('input capacity');
    const buffer = new Units(length + 64);
    set.call(buffer, view);
    this.#buffer = buffer;
    this.#start = length;
    this.#end = length + 64;
  }

  length() {
    if (this.#buffer === null) throw new RangeError('storage error -2');
    return getLength.call(this.#buffer) - (this.#end - this.#start);
  }

  splice(at, remove, input) {
    index(at); index(remove);
    const { view, length: insertLength } = inputView(input);
    const length = this.length();
    if (at > length || remove > length - at || insertLength > GAP_CAPACITY - (length - remove)) throw new RangeError('splice range/capacity');

    if (at < this.#start) {
      const distance = this.#start - at;
      copyWithin.call(this.#buffer, this.#end - distance, at, this.#start);
      this.#end -= distance;
    } else {
      const distance = at - this.#start;
      copyWithin.call(this.#buffer, this.#start, this.#end, this.#end + distance);
      this.#end += distance;
    }
    this.#start = at;
    this.#end += remove;
    const gap = this.#end - this.#start;
    if (insertLength > gap) {
      const extra = Math.max(insertLength - gap, Math.floor((length - remove) / 2), 64);
      const oldLength = getLength.call(this.#buffer);
      const buffer = new Units(oldLength + extra);
      set.call(buffer, this.#buffer);
      copyWithin.call(buffer, this.#end + extra, this.#end, oldLength);
      this.#buffer = buffer;
      this.#end += extra;
    }
    set.call(this.#buffer, view, this.#start);
    this.#start += insertLength;
  }

  apply(from, to, input) {
    index(from); index(to);
    if (to < from) throw new RangeError('splice range/capacity');
    this.splice(from, to - from, input);
  }

  read() {
    const output = new Units(this.length());
    set.call(output, subarray.call(this.#buffer, 0, this.#start));
    set.call(output, subarray.call(this.#buffer, this.#end), this.#start);
    return output;
  }

  snapshot() {
    const length = this.length();
    return { start: this.#start, end: this.#end, storageUnits: getLength.call(this.#buffer), length };
  }

  clear() {
    this.length();
    this.#buffer = null;
    this.#start = 0;
    this.#end = 0;
  }
}
