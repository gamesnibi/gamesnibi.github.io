// Reader for the site's .bin files (the baked world and the models exported from Pond Reels).
// Layout: "NIBI", uint32 header length, UTF-8 JSON header, then the arrays (each 4-byte aligned).
// Header: { meta, parts: { name: { attrs: { attr: [offset, count, type, itemSize] }, index?: [offset, count, type] } } }
// A file starting "NIBZ" is the same thing deflated (raw deflate); inflateBin() unwraps it.
const TYPES = { f32: Float32Array, u16: Uint16Array, u32: Uint32Array, i8: Int8Array, u8: Uint8Array, i16: Int16Array };

function bytesOf(buf) { return buf instanceof Uint8Array ? buf : new Uint8Array(buf); }
const magic = (u8) => String.fromCharCode(u8[0], u8[1], u8[2], u8[3]);

export function readBin(buf) {
  const u8 = bytesOf(buf);
  if (magic(u8) !== 'NIBI') throw new Error('not a NIBI file');
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const n = dv.getUint32(4, true);
  const head = JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + n)));
  const base = 8 + n;
  const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);   // own, aligned copy
  const arr = ([off, count, type]) => new TYPES[type](ab, base + off, count);
  const parts = {};
  for (const [name, P] of Object.entries(head.parts)) {
    const attrs = {};
    for (const [k, spec] of Object.entries(P.attrs)) { const a = arr(spec); a.itemSize = spec[3] || 1; attrs[k] = a; }
    parts[name] = { attrs, index: P.index ? arr(P.index) : null };
  }
  return { meta: head.meta, parts };
}

export async function inflateBin(buf) {
  const u8 = bytesOf(buf);
  if (magic(u8) !== 'NIBZ') return u8;
  const ds = new DecompressionStream('deflate-raw');
  const out = await new Response(new Blob([u8.subarray(4)]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(out);
}

export async function loadBin(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ': ' + r.status);
  return readBin(await inflateBin(await r.arrayBuffer()));
}
