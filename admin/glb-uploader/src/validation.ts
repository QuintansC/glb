/**
 * Validações compartilhadas entre o servidor de desenvolvimento (Fastify/Node)
 * e o executável standalone (Bun). Não dependem de nenhum runtime específico.
 */

/** SKU aceito: alfanumérico com traço/underscore (VTEX itemId costuma ser numérico). */
const SKU_RE = /^[A-Za-z0-9_-]+$/;

export function isValidSku(sku: string): boolean {
  return SKU_RE.test(sku) && sku.length > 0 && sku.length <= 128;
}

/** GLB válido começa com o magic "glTF" (0x46546C67 little-endian) e versão 2. */
export function isValidGlb(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  const magic =
    String.fromCharCode(bytes[0]!) +
    String.fromCharCode(bytes[1]!) +
    String.fromCharCode(bytes[2]!) +
    String.fromCharCode(bytes[3]!);
  if (magic !== "glTF") return false;
  const version = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  ).getUint32(4, true);
  return version === 2;
}
