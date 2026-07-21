import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  type ObjectCannedACL,
} from "@aws-sdk/client-s3";
import { config, keyForSku, publicUrlForSku } from "./config.js";

const client = new S3Client({
  endpoint: config.s3.endpoint,
  region: config.s3.region,
  forcePathStyle: config.s3.forcePathStyle,
  credentials: {
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
  },
});

export interface ModelInfo {
  skuId: string;
  key: string;
  url: string;
  sizeBytes: number;
  lastModified: string | null;
}

/** Extrai o SKU a partir da key (remove prefixo e a extensão .glb). */
function skuFromKey(key: string): string | null {
  const withoutPrefix = config.s3.prefix
    ? key.slice(config.s3.prefix.length + 1)
    : key;
  if (!withoutPrefix.toLowerCase().endsWith(".glb")) return null;
  return withoutPrefix.slice(0, -".glb".length);
}

/** Lista todos os modelos .glb já cadastrados no bucket sob o prefixo. */
export async function listModels(): Promise<ModelInfo[]> {
  const models: ModelInfo[] = [];
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
      const skuId = skuFromKey(obj.Key);
      if (!skuId) continue; // ignora subpastas / arquivos que não são .glb
      models.push({
        skuId,
        key: obj.Key,
        url: publicUrlForSku(skuId),
        sizeBytes: obj.Size ?? 0,
        lastModified: obj.LastModified?.toISOString() ?? null,
      });
    }

    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

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

/** Sobe (ou substitui) o .glb do SKU. Retorna as infos do modelo cadastrado. */
export async function uploadModel(
  skuId: string,
  body: Buffer
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

  return {
    skuId,
    key,
    url: publicUrlForSku(skuId),
    sizeBytes: body.byteLength,
    lastModified: new Date().toISOString(),
  };
}

/** Remove o modelo do SKU do bucket. */
export async function deleteModel(skuId: string): Promise<void> {
  await client.send(
    new DeleteObjectCommand({
      Bucket: config.s3.bucket,
      Key: keyForSku(skuId),
    })
  );
}
