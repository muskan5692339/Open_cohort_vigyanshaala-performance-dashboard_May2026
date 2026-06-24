/** Gzip compress JSON workbook payload for Storage upload. */

export async function gzipJson(payload: unknown): Promise<{ bytes: Uint8Array; base64: string; hash: string }> {
  const json = JSON.stringify(payload);
  const hash = await hashString(json);

  if (typeof CompressionStream === 'undefined') {
    const enc = new TextEncoder();
    const bytes = enc.encode(json);
    return { bytes, base64: uint8ToBase64(bytes), hash };
  }

  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  const bytes = new Uint8Array(buf);
  return { bytes, base64: uint8ToBase64(bytes), hash };
}

export async function gunzipJson<T>(bytes: Uint8Array, isGzip: boolean): Promise<T> {
  if (!isGzip) {
    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text) as T;
  }

  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Decompression not supported in this browser');
  }

  const copy = Uint8Array.from(bytes);
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream('gzip'));
  const text = await new Response(stream).text();
  return JSON.parse(text) as T;
}

export async function hashString(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 0;
  for (let i = 0; i < input.length; i++) h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  return `fallback_${(h >>> 0).toString(16)}`;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
