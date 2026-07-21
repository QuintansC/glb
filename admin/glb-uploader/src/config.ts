import "dotenv/config";

/**
 * Configuração do painel, carregada do .env na inicialização.
 * Falha rápido (com mensagem clara) se algo essencial estiver faltando —
 * é melhor errar ao subir o servidor do que na hora do upload.
 */

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Variável de ambiente ausente: ${name}. Copie .env.example para .env e preencha.`
    );
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return fallback;
  return raw === "true" || raw === "1" || raw === "yes";
}

function int(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const endpoint = required("S3_ENDPOINT").replace(/\/+$/, "");
const bucket = required("S3_BUCKET");
const prefix = optional("S3_PREFIX").replace(/^\/+|\/+$/g, "");
const forcePathStyle = bool("S3_FORCE_PATH_STYLE", true);

/**
 * URL pública onde o front monta {base}/{skuId}.glb.
 * Se S3_PUBLIC_BASE_URL não for informada, derivamos de endpoint/bucket/prefixo
 * assumindo path-style (endpoint/bucket/key) — que é o formato do storage atual.
 */
function derivePublicBaseUrl(): string {
  const override = optional("S3_PUBLIC_BASE_URL").replace(/\/+$/, "");
  if (override) return override;
  const parts = [endpoint, bucket, prefix].filter(Boolean);
  return parts.join("/");
}

export const config = {
  port: int("PORT", 4173),
  maxUploadBytes: int("MAX_UPLOAD_MB", 40) * 1024 * 1024,
  s3: {
    endpoint,
    region: optional("S3_REGION", "us-east-1"),
    bucket,
    prefix,
    accessKeyId: required("S3_ACCESS_KEY_ID"),
    secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
    forcePathStyle,
    /** ACL a aplicar no objeto; vazio = não enviar ACL (bucket controla acesso). */
    objectAcl: optional("S3_OBJECT_ACL", "public-read"),
  },
  publicBaseUrl: derivePublicBaseUrl(),
} as const;

/** Monta a chave (key) do objeto no bucket a partir do SKU. Ex.: glb-models/12345.glb */
export function keyForSku(skuId: string): string {
  return config.s3.prefix ? `${config.s3.prefix}/${skuId}.glb` : `${skuId}.glb`;
}

/** URL pública final que o provador virtual vai buscar para este SKU. */
export function publicUrlForSku(skuId: string): string {
  return `${config.publicBaseUrl}/${skuId}.glb`;
}
