const U32_MAX = 0xffff_ffff;
const typedArrayLength = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint16Array.prototype), 'length',
).get;
const typedArrayTag = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint16Array.prototype), Symbol.toStringTag,
).get;

function integer(value, name, max = U32_MAX, min = 0) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

export function toUnits(text) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  const units = new Uint16Array(text.length);
  for (let i = 0; i < text.length; i++) units[i] = text.charCodeAt(i);
  return units;
}

export function fromUnits(units) {
  const parts = [];
  for (let i = 0; i < units.length; i += 8192) {
    parts.push(String.fromCharCode(...units.subarray(i, i + 8192)));
  }
  return parts.join('');
}

export function checksum(units) {
  let hash = 2166136261;
  for (const unit of units) hash = Math.imul(hash ^ unit, 16777619) >>> 0;
  return hash;
}

/** Synchronous, single-owner wrapper. Scratch views never escape this class. */
export class Utf16Bridge {
  #exports;
  #handles = new Set();
  #input;
  #output;
  #capacity;
  #disposed = false;
  constructor(instance) {
    this.#exports = instance.exports;
    this.#capacity = this.#exports.bridge_capacity();
    // These calls initialize Rust-owned fixed buffers. Their addresses never change.
    this.#input = this.#exports.bridge_input_ptr() >>> 0;
    this.#output = this.#exports.bridge_output_ptr() >>> 0;
    this.#view(this.#input, this.#capacity);
    this.#view(this.#output, this.#capacity);
  }
  get capacity() { return this.#capacity; }
  #checkOpen() {
    if (this.#disposed) throw new RangeError('wrapper is disposed');
  }
  #view(offset, length) {
    // memory.grow detaches old ArrayBuffers. Always use the current buffer.
    const buffer = this.#exports.memory.buffer;
    if (offset % 2 || offset > buffer.byteLength || length > (buffer.byteLength - offset) / 2) {
      throw new RangeError('WASM scratch buffer is outside memory');
    }
    return new Uint16Array(buffer, offset, length);
  }
  #checkHandle(handle) {
    this.#checkOpen();
    integer(handle, 'handle', 0x7fff_ffff, 1);
    if (!this.#handles.has(handle)) throw new RangeError('handle is closed or belongs to another wrapper');
  }
  #write(units) {
    if (typedArrayTag.call(units) !== 'Uint16Array') throw new TypeError('input must be Uint16Array');
    // A typed array can have an own length accessor. Use its intrinsic length once.
    const length = typedArrayLength.call(units);
    integer(length, 'insert length', this.#capacity);
    this.#view(this.#input, length).set(units);
    return length;
  }
  #result(result) {
    if (result < 0) throw new RangeError(`WASM bridge rejected operation (${result})`);
    return result;
  }
  create(units = new Uint16Array()) {
    this.#checkOpen();
    const length = this.#write(units);
    const handle = this.#result(this.#exports.bridge_create(length));
    this.#handles.add(handle);
    return handle;
  }
  splice(handle, at, deleteCount, insert = new Uint16Array()) {
    this.#checkHandle(handle);
    integer(at, 'at');
    integer(deleteCount, 'deleteCount');
    const length = this.#write(insert);
    this.#result(this.#exports.bridge_splice(handle, at, deleteCount, length));
  }
  read(handle) {
    this.#checkHandle(handle);
    const length = this.#result(this.#exports.bridge_read(handle));
    return this.#view(this.#output, length).slice();
  }
  checksum(handle) {
    this.#checkHandle(handle);
    const result = this.#exports.bridge_checksum(handle);
    if (result < 0n) throw new RangeError('WASM bridge rejected handle');
    return Number(result);
  }
  close(handle) {
    this.#checkHandle(handle);
    this.#result(this.#exports.bridge_close(handle));
    this.#handles.delete(handle);
  }
  dispose() {
    if (this.#disposed && this.#handles.size === 0) return;
    this.#disposed = true;
    let firstError;
    for (const handle of this.#handles) {
      try {
        this.#result(this.#exports.bridge_close(handle));
        this.#handles.delete(handle);
      }
      catch (error) { firstError ??= error; }
    }
    if (firstError) throw firstError;
  }
  resourceStats() {
    return {
      ownedHandles: this.#handles.size,
      liveHandles: this.#exports.bridge_live_handles(),
      liveUnits: this.#exports.bridge_live_units(),
      memoryBytes: this.#exports.memory.buffer.byteLength,
      disposed: this.#disposed,
    };
  }
}
