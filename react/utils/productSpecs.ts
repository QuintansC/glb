/**
 * Leitura das especificações do produto na VTEX.
 *
 * O nome cadastrado no catálogo não é estável: varia em acento, em unidade
 * entre parênteses e até no substantivo ("Tamanho da Ponte" vs "Largura da
 * Ponte"). Comparar com `===` transforma qualquer divergência em silêncio — o
 * `??` do chamador devolve o default e o produto inteiro passa despercebido com
 * medida errada. Por isso aqui o nome é normalizado e cada medida aceita uma
 * lista de sinônimos.
 */

export interface VtexProperty {
  name: string;
  values: string[];
}

/** Formato alternativo que a VTEX também expõe no contexto de produto. */
interface SpecificationGroup {
  specifications?: { name?: string; values?: string[] }[];
}

interface ProductLike {
  properties?: VtexProperty[];
  specificationGroups?: SpecificationGroup[];
}

/**
 * Minúsculas, sem acento, sem unidade entre parênteses, espaços colapsados.
 * "Largura da Lente (mm)" e "largura da lente" viram a mesma chave.
 */
export function normalizeSpecName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // marcas combinantes soltas pelo NFD
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Junta as duas formas em que a VTEX pode entregar as specs. */
export function collectSpecs(product: ProductLike | undefined | null): VtexProperty[] {
  if (!product) return [];
  const out: VtexProperty[] = [...(product.properties ?? [])];
  for (const group of product.specificationGroups ?? []) {
    for (const spec of group.specifications ?? []) {
      if (spec?.name) out.push({ name: spec.name, values: spec.values ?? [] });
    }
  }
  return out;
}

/** Sinônimos aceitos por medida, já na forma normalizada. */
export const SPEC_ALIASES = {
  /** Largura de UMA lente (o "calibre" da nomenclatura 52-18). */
  lensWidth: ["largura da lente", "largura lente", "calibre", "aro"],
  /** Distância entre as lentes. */
  bridgeWidth: ["tamanho da ponte", "largura da ponte", "ponte"],
  templeLength: ["comprimento da haste", "tamanho da haste", "haste"],
  lensHeight: ["altura da lente", "altura lente"],
  /**
   * Largura FRONTAL (2A+DBL): lente + ponte + lente, sem as charneiras.
   * Conferido no catálogo: um produto 50–18 traz "Tamanho Frontal" = 118, que é
   * exatamente 50·2 + 18. Não confundir com a largura total — ver
   * `totalFromFrontWidthMm` em frameMetrics.ts.
   */
  frontWidth: [
    "tamanho frontal",
    "largura frontal",
    "tamanho da frente",
    "largura da frente",
  ],
} as const;

/** Primeiro valor de texto entre os sinônimos, ou undefined. */
export function readSpecText(
  specs: VtexProperty[],
  aliases: readonly string[]
): string | undefined {
  const wanted = aliases.map(normalizeSpecName);
  for (const spec of specs) {
    if (!spec?.name) continue;
    if (!wanted.includes(normalizeSpecName(spec.name))) continue;
    const value = spec.values?.find((v) => v != null && String(v).trim() !== "");
    if (value !== undefined) return String(value).trim();
  }
  return undefined;
}

/**
 * Idem, como número. Aceita "50", "50 mm", "52,5" — o catálogo é preenchido à
 * mão e nem sempre vem só o número. Texto sem dígito (ex.: "Médio") vira
 * undefined, o que deixa o chamador cair no próximo candidato.
 */
export function readSpecNumber(
  specs: VtexProperty[],
  aliases: readonly string[]
): number | undefined {
  const raw = readSpecText(specs, aliases);
  if (raw === undefined) return undefined;
  const match = raw.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : undefined;
}
