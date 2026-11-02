// Capture intrinsic accessors once. No caller-overridable typed-array methods or
// own length/buffer/byteOffset properties participate in scratch bounds checks.
const typed = Object.getPrototypeOf(Uint16Array.prototype);
const getBuffer = Object.getOwnPropertyDescriptor(typed, 'buffer').get;
const getOffset = Object.getOwnPropertyDescriptor(typed, 'byteOffset').get;
const getLength = Object.getOwnPropertyDescriptor(typed, 'length').get;
const getTag = Object.getOwnPropertyDescriptor(typed, Symbol.toStringTag).get;
const intrinsicSet = Uint16Array.prototype.set;
function inputView(value) {
  if (getTag.call(value) !== 'Uint16Array') throw new TypeError('Uint16Array required');
  const length = getLength.call(value);
  return { view: new Uint16Array(getBuffer.call(value), getOffset.call(value), length), length };
}
function index(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError('unsigned integer required');
  return value;
}
export class WasmStorage {
  #exports; #backend; #capacity;
  constructor(exports, backend) {
    if (backend !== 0 && backend !== 1) throw new RangeError('backend');
    this.#exports = exports; this.#backend = backend;
    this.#capacity = exports.storage_capacity() >>> 0;
  }
  #check(code) { if (code < 0) throw new RangeError(`storage error ${code}`); return code; }
  #write({ view, length }) {
    if (length > this.#capacity) throw new RangeError('input capacity');
    // Refresh after each call: Rust allocation or memory.grow can detach views.
    const pointer = this.#exports.storage_input_ptr() >>> 0;
    const scratch = new Uint16Array(this.#exports.memory.buffer, pointer, length);
    intrinsicSet.call(scratch, view);
    return length;
  }
  init(input) {
    const length = this.#write(inputView(input));
    this.#check(this.#exports.storage_init(this.#backend, length));
  }
  length() { return this.#check(this.#exports.storage_len(this.#backend)); }
  splice(at, remove, input) {
    index(at); index(remove);
    const { view, length: insertLength } = inputView(input);
    const length = this.length();
    if (at > length || remove > length - at || insertLength > this.#capacity - (length - remove)) throw new RangeError('splice range/capacity');
    const count = this.#write({ view, length: insertLength });
    this.#check(this.#exports.storage_splice(this.#backend, at, remove, count));
  }
  read() {
    const length = this.#check(this.#exports.storage_read(this.#backend));
    const pointer = this.#exports.storage_output_ptr() >>> 0;
    const view = new Uint16Array(this.#exports.memory.buffer, pointer, length);
    const copy = new Uint16Array(length); intrinsicSet.call(copy, view); return copy;
  }
  clear() { this.#check(this.#exports.storage_drop(this.#backend)); }
}
