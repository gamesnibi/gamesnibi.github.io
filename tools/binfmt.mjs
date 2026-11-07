// Writer for the site's .bin files (see assets/js/sea/format.js for the layout).
import { deflateRawSync } from 'node:zlib';
const NAME = new Map([[Float32Array, 'f32'], [Uint16Array, 'u16'], [Uint32Array, 'u32'], [Int8Array, 'i8'], [Uint8Array, 'u8'], [Int16Array, 'i16']]);

export function writeBin(meta, parts) {
  const chunks = []; let off = 0;
  const put = (a) => {
    const type = NAME.get(a.constructor); if (!type) throw new Error('unsupported array type');
    const bytes = Buffer.from(a.buffer, a.byteOffset, a.byteLength);
    const spec = [off, a.length, type];
    chunks.push(bytes); off += bytes.length;
    const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; }
    return spec;
  };
  const head = { meta, parts: {} };
  for (const [name, P] of Object.entries(parts)) {
    const h = { attrs: {} };
    for (const [k, a] of Object.entries(P.attrs)) { const s = put(a); s.push(a.itemSize || 1); h.attrs[k] = s; }
    if (P.index) h.index = put(P.index);
    head.parts[name] = h;
  }
  let json = Buffer.from(JSON.stringify(head), 'utf8');
  const pad = (4 - ((8 + json.length) % 4)) % 4; if (pad) json = Buffer.concat([json, Buffer.from(' '.repeat(pad))]);
  const pre = Buffer.alloc(8); pre.write('NIBI', 0, 'latin1'); pre.writeUInt32LE(json.length, 4);
  return Buffer.concat([pre, json, ...chunks]);
}

export function deflateBin(buf) { return Buffer.concat([Buffer.from('NIBZ', 'latin1'), deflateRawSync(buf, { level: 9 })]); }
