import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  type ObjectCannedACL,
} from "@aws-sdk/client-s3";
import {
  config,
  keyForSku,
  metaKeyForSku,
  publicUrlForSku,
} from "./config.js";

const client = new S3Client({
  endpoint: config.s3.endpoint,
  region: config.s3.region,
  forcePathStyle: config.s3.forcePathStyle,
  credentials: {
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
  },
});

/** Conteúdo do sidecar {skuId}.json — o que o provador lê para dimensionar. */
export interface FrameModelMeta {
  /** Largura total da armação (ponto mais largo), em mm. */
  totalWidthMm: number;
}

export interface ModelInfo {
  skuId: string;
  key: string;
  url: string;
  sizeBytes: number;
  lastModified: string | null;
  /** Largura cadastrada no sidecar, ou null quando o SKU ainda não tem medida. */
  totalWidthMm: number | null;
}

/** Extrai o SKU a partir da key, para uma extensão específica. */
function skuFromKey(key: string, ext: ".glb" | ".json"): string | null {
  const withoutPrefix = config.s3.prefix
    ? key.slice(config.s3.prefix.length + 1)
    : key;
  if (!withoutPrefix.toLowerCase().endsWith(ext)) return null;
  return withoutPrefix.slice(0, -ext.length);
}

/** Roda `worker` sobre `items` com no máximo `size` chamadas em paralelo. */
async function pool<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  size = 8
): Promise<void> {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(size, queue.length) }, async () => {
      while (queue.length) await worker(queue.shift()!);
    })
  );
}

/** Lista todos os modelos .glb já cadastrados no bucket sob o prefixo. */
export async function listModels(): Promise<ModelInfo[]> {
  const models: ModelInfo[] = [];
  const skusWithMeta = new Set<string>();
  let continuationToken: string | undefined;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: config.s3.bucket,
        Prefix: config.s3.prefix ? `${config.s3.prefix}/` : undefined,
        ContinuationToken: continuationToken,
      })
    );

    for (const obj of res.Contents ?? []) {
      if (!obj.Key) continue;
      const metaSku = skuFromKey(obj.Key, ".json");
      if (metaSku) {
        skusWithMeta.add(metaSku);
        continue;
      }
      const skuId = skuFromKey(obj.Key, ".glb");
      if (!skuId) continue; // ignora subpastas / arquivos que não são .glb
      models.push({
        skuId,
        key: obj.Key,
        url: publicUrlForSku(skuId),
        sizeBytes: obj.Size ?? 0,
        lastModified: obj.LastModified?.toISOString() ?? null,
        totalWidthMm: null,
      });
    }

    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

  // A listagem só devolve as keys, não o conteúdo — mas já sabemos por ela quais
  // SKUs têm sidecar, então buscamos apenas esses (arquivos de poucos bytes).
  await pool(
    models.filter((m) => skusWithMeta.has(m.skuId)),
    async (m) => {
      m.totalWidthMm = (await readMeta(m.skuId))?.totalWidthMm ?? null;
    }
  );

  return models.sort((a, b) => {
    const ta = a.lastModified ?? "";
    const tb = b.lastModified ?? "";
    return tb.localeCompare(ta); // mais recentes primeiro
  });
}

/** Verifica se já existe um modelo para o SKU. */
export async function modelExists(skuId: string): Promise<boolean> {
  try {
    await client.send(
      new HeadObjectCommand({ Bucket: config.s3.bucket, Key: keyForSku(skuId) })
    );
    return true;
  } catch (err: unknown) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })
      ?.$metadata?.httpStatusCode;
    if (status === 404 || status === 403) return false;
    throw err;
  }
}

/** Lê o sidecar de medidas do SKU. Ausente/ilegível vira null. */
export async function readMeta(skuId: string): Promise<FrameModelMeta | null> {
  try {
    const res = await client.send(
      new GetObjectCommand({
        Bucket: config.s3.bucket,
        Key: metaKeyForSku(skuId),
      })
    );
    const raw = await res.Body?.transformToString();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { totalWidthMm?: unknown };
    return typeof parsed.totalWidthMm === "number" &&
      Number.isFinite(parsed.totalWidthMm)
      ? { totalWidthMm: parsed.totalWidthMm }
      : null;
  } catch {
    // 404 (sem sidecar), sem permissão de leitura ou JSON corrompido: o
    // provador simplesmente cai nas specs do catálogo.
    return null;
  }
}

/** Grava (ou substitui) o sidecar de medidas do SKU. */
export async function writeMeta(
  skuId: string,
  meta: FrameModelMeta
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: metaKeyForSku(skuId),
      Body: JSON.stringify(meta),
      ContentType: "application/json",
      // Curto de propósito: corrigir uma medida errada precisa refletir rápido
      // na loja, e o arquivo tem poucas dezenas de bytes.
      CacheControl: "public, max-age=300",
      ...(config.s3.objectAcl
        ? { ACL: config.s3.objectAcl as ObjectCannedACL }
        : {}),
    })
  );
}

/** Sobe (ou substitui) o .glb do SKU. Retorna as infos do modelo cadastrado. */
export async function uploadModel(
  skuId: string,
  body: Buffer,
  totalWidthMm?: number | null
): Promise<ModelInfo> {
  const key = keyForSku(skuId);
  await client.send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      Body: body,
      ContentType: "model/gltf-binary",
      CacheControl: "public, max-age=86400",
      ...(config.s3.objectAcl
        ? { ACL: config.s3.objectAcl as ObjectCannedACL }
        : {}),
    })
  );

  // Largura não informada não apaga a que já estava cadastrada — trocar o .glb
  // de um SKU (modelo mais leve, textura corrigida) não deve zerar a medida.
  if (totalWidthMm != null) {
    await writeMeta(skuId, { totalWidthMm });
  }

  return {
    skuId,
    key,
    url: publicUrlForSku(skuId),
    sizeBytes: body.byteLength,
    lastModified: new Date().toISOString(),
    totalWidthMm: totalWidthMm ?? (await readMeta(skuId))?.totalWidthMm ?? null,
  };
}

/** Remove o modelo do SKU do bucket, junto com o sidecar de medidas. */
export async function deleteModel(skuId: string): Promise<void> {
  await client.send(
    new DeleteObjectCommand({
      Bucket: config.s3.bucket,
      Key: keyForSku(skuId),
    })
  );
  await client.send(
    new DeleteObjectCommand({
      Bucket: config.s3.bucket,
      Key: metaKeyForSku(skuId),
    })
  );
}
