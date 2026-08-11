import type { VtexFrame } from "../types";

/**
 * Regra de tamanho da armação — fonte única para o modo 3D e para o 2D.
 *
 * O `.glb` que sobe para o storage é NORMALIZADO pelo pipeline de exportação
 * (medido no `miumiu-v2.glb`: bounding box 2.0067 × 0.6085 × 1.9744, ou seja
 * encaixado em ~[-1,1], sem `asset.extras`). O arquivo carrega PROPORÇÃO, nunca
 * escala real — então o tamanho físico obrigatoriamente vem de metadado.
 *
 * A medida adotada é a LARGURA TOTAL da armação: a distância entre os pontos
 * mais largos, que cai na região das charneiras. É exatamente o que o bounding
 * box em X do `.glb` representa (varrendo o miumiu por faixa de Z, o X máximo
 * está em z≈0..0.33 — as charneiras — e as hastes afinam para trás), então
 * `larguraTotal_mm ↔ bbox.x` é um mapeamento direto e sem correção.
 */

/** Metadados gravados ao lado do `.glb` no storage, em `{skuId}.json`. */
export interface FrameModelMeta {
  /** Largura total da armação (ponto mais largo, charneira a charneira), em mm. */
  totalWidthMm?: number;
}

/**
 * Duas medidas diferentes, e confundi-las custa ~10% no tamanho renderizado:
 *
 *  - LARGURA FRONTAL (2A+DBL): lente + ponte + lente. É o que o catálogo chama
 *    de "Tamanho Frontal" — conferido: um produto 50–18 traz 118, que é
 *    exatamente 50·2 + 18. NÃO inclui as charneiras.
 *  - LARGURA TOTAL: o ponto mais largo, charneira a charneira. É o que o
 *    bounding box em X do `.glb` representa, e portanto o que a escala precisa.
 *
 * A conversão entre as duas é a sobra de cada lado (endpiece). ~6 mm por lado é
 * o típico de mercado, e é a única suposição que sobrou nesta cadeia — some
 * quando o SKU tem medida no sidecar, que é aferida com paquímetro.
 */
const ENDPIECE_MM = 6;

/** Faixa plausível para a largura TOTAL de uma armação adulta. */
export const MIN_TOTAL_WIDTH_MM = 100;
export const MAX_TOTAL_WIDTH_MM = 165;

/** Faixa plausível para a largura FRONTAL (2A+DBL) de uma armação adulta. */
export const MIN_FRONT_WIDTH_MM = 90;
export const MAX_FRONT_WIDTH_MM = 150;

/** Usado quando não há metadado nem specs: armação média 52–18. */
export const FALLBACK_TOTAL_WIDTH_MM = 134;

export type FrameWidthSource = "meta" | "specs" | "fallback";

export interface ResolvedFrameWidth {
  widthMm: number;
  source: FrameWidthSource;
}

export function isPlausibleTotalWidthMm(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_TOTAL_WIDTH_MM &&
    value <= MAX_TOTAL_WIDTH_MM
  );
}

/**
 * Valida o JSON do sidecar vindo do storage. É conteúdo remoto: qualquer coisa
 * fora do formato/faixa esperados vira `null` e a resolução cai para as specs.
 */
export function parseFrameModelMeta(raw: unknown): FrameModelMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const width = (raw as { totalWidthMm?: unknown }).totalWidthMm;
  if (!isPlausibleTotalWidthMm(width)) return null;
  return { totalWidthMm: width };
}

export function isPlausibleFrontWidthMm(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_FRONT_WIDTH_MM &&
    value <= MAX_FRONT_WIDTH_MM
  );
}

/**
 * Largura frontal (2A+DBL) a partir da nomenclatura 52–18, para quando o
 * catálogo não traz "Tamanho Frontal" pronto. Deve dar o mesmo número que a
 * spec: 50–18 → 118.
 */
export function deriveFrontWidthMm(
  lensWidthMm: number | undefined,
  bridgeWidthMm: number | undefined
): number | null {
  if (lensWidthMm === undefined || bridgeWidthMm === undefined) return null;
  const width = lensWidthMm * 2 + bridgeWidthMm;
  return isPlausibleFrontWidthMm(width) ? width : null;
}

/**
 * Converte largura frontal em largura total somando as duas charneiras. É o
 * único ponto onde `ENDPIECE_MM` entra, então as duas origens da frontal (spec
 * pronta ou derivada) não podem divergir.
 */
export function totalFromFrontWidthMm(
  frontWidthMm: number | null | undefined
): number | null {
  if (!isPlausibleFrontWidthMm(frontWidthMm)) return null;
  const total = frontWidthMm + ENDPIECE_MM * 2;
  return isPlausibleTotalWidthMm(total) ? total : null;
}

/**
 * Cadeia de resolução, do mais específico para o mais genérico:
 *   1. `{skuId}.json` no storage (medido/conferido no cadastro do modelo);
 *   2. specs do catálogo VTEX, já apuradas em `frame.totalWidth_mm`;
 *   3. armação média.
 *
 * O passo 2 é `undefined` — e não um chute — quando as specs não foram
 * encontradas: é o que mantém `source` honesto e torna visível um catálogo
 * incompleto, em vez de mascarar tudo com um default plausível.
 */
export function resolveFrameWidthMm(
  meta: FrameModelMeta | null | undefined,
  frame: VtexFrame | null | undefined
): ResolvedFrameWidth {
  if (meta && isPlausibleTotalWidthMm(meta.totalWidthMm)) {
    return { widthMm: meta.totalWidthMm, source: "meta" };
  }
  if (frame && isPlausibleTotalWidthMm(frame.totalWidth_mm)) {
    return { widthMm: frame.totalWidth_mm, source: "specs" };
  }
  return { widthMm: FALLBACK_TOTAL_WIDTH_MM, source: "fallback" };
}
