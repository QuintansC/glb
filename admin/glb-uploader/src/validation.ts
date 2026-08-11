/**
 * Validações compartilhadas entre o servidor de desenvolvimento (Fastify/Node)
 * e o executável standalone (Bun). Não dependem de nenhum runtime específico.
 */

/** SKU aceito: alfanumérico com traço/underscore (VTEX itemId costuma ser numérico). */
const SKU_RE = /^[A-Za-z0-9_-]+$/;

export function isValidSku(sku: string): boolean {
  return SKU_RE.test(sku) && sku.length > 0 && sku.length <= 128;
}

/**
 * Largura total da armação (ponto mais largo, charneira a charneira), em mm.
 * Faixa plausível para uma armação adulta — deve espelhar
 * MIN/MAX_TOTAL_WIDTH_MM em react/utils/frameMetrics.ts, que é quem consome
 * esse valor no provador.
 */
export const MIN_TOTAL_WIDTH_MM = 100;
export const MAX_TOTAL_WIDTH_MM = 165;

/**
 * Converte a largura informada pelo painel (string do formulário ou número)
 * para um valor válido em mm. Devolve `null` quando não foi informada e
 * `undefined` quando veio algo fora da faixa — o chamador distingue "não mexer"
 * de "recusar".
 */
export function parseTotalWidthMm(raw: unknown): number | null | undefined {
  if (raw === undefined || raw === null || raw === "") return null;
  const value = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  if (!Number.isFinite(value)) return undefined;
  const rounded = Math.round(value * 10) / 10;
  if (rounded < MIN_TOTAL_WIDTH_MM || rounded > MAX_TOTAL_WIDTH_MM) return undefined;
  return rounded;
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
