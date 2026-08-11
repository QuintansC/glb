import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyMultipart from "@fastify/multipart";
import { config, publicUrlForSku } from "./config.js";
import {
  listModels,
  uploadModel,
  deleteModel,
  modelExists,
  readMeta,
  writeMeta,
} from "./s3.js";
import {
  isValidSku,
  isValidGlb,
  parseTotalWidthMm,
  MIN_TOTAL_WIDTH_MM,
  MAX_TOTAL_WIDTH_MM,
} from "./validation.js";

const WIDTH_RANGE_ERROR = `Largura inválida. Informe um número entre ${MIN_TOTAL_WIDTH_MM} e ${MAX_TOTAL_WIDTH_MM} mm.`;

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: { level: "info" } });

await app.register(fastifyMultipart, {
  limits: { fileSize: config.maxUploadBytes, files: 1 },
});

// Serve o painel (public/) na raiz.
await app.register(fastifyStatic, {
  root: join(__dirname, "..", "public"),
  prefix: "/",
});

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/** Config não-sensível para a UI (nunca expõe chaves). */
app.get("/api/config", async () => ({
  publicBaseUrl: config.publicBaseUrl,
  bucket: config.s3.bucket,
  prefix: config.s3.prefix,
  endpoint: config.s3.endpoint,
  convention: "{skuId}.glb",
  maxUploadMb: Math.round(config.maxUploadBytes / (1024 * 1024)),
  minTotalWidthMm: MIN_TOTAL_WIDTH_MM,
  maxTotalWidthMm: MAX_TOTAL_WIDTH_MM,
}));

/** Lista os modelos já cadastrados. */
app.get("/api/models", async (_req, reply) => {
  try {
    return { models: await listModels() };
  } catch (err) {
    app.log.error(err);
    return reply
      .code(502)
      .send({ error: "Não foi possível listar os modelos no storage.", detail: String(err) });
  }
});

/**
 * Sobe (ou substitui) o modelo de um SKU.
 *
 * A largura vem na query (`?widthMm=134`), não como campo do multipart: aqui o
 * corpo é lido em streaming e só os campos que chegam ANTES do arquivo ficam
 * acessíveis, o que deixaria a ordem do FormData virar regra implícita.
 */
app.post("/api/models/:sku", async (req, reply) => {
  const sku = (req.params as { sku: string }).sku;
  if (!isValidSku(sku)) {
    return reply.code(400).send({ error: "SKU inválido. Use apenas letras, números, - e _." });
  }

  const totalWidthMm = parseTotalWidthMm((req.query as { widthMm?: string }).widthMm);
  if (totalWidthMm === undefined) {
    return reply.code(400).send({ error: WIDTH_RANGE_ERROR });
  }

  const data = await req.file();
  if (!data) {
    return reply.code(400).send({ error: "Nenhum arquivo enviado." });
  }

  let buffer: Buffer;
  try {
    buffer = await data.toBuffer();
  } catch {
    return reply
      .code(413)
      .send({ error: `Arquivo maior que o limite de ${Math.round(config.maxUploadBytes / (1024 * 1024))} MB.` });
  }

  if (data.file.truncated) {
    return reply
      .code(413)
      .send({ error: `Arquivo maior que o limite de ${Math.round(config.maxUploadBytes / (1024 * 1024))} MB.` });
  }

  if (!data.filename.toLowerCase().endsWith(".glb")) {
    return reply.code(400).send({ error: "O arquivo precisa ter extensão .glb." });
  }

  if (!isValidGlb(buffer)) {
    return reply
      .code(400)
      .send({ error: "Arquivo não parece um GLB válido (magic/versão glTF 2.0 não encontrados)." });
  }

  try {
    const model = await uploadModel(sku, buffer, totalWidthMm);
    app.log.info({ sku, size: buffer.byteLength, totalWidthMm }, "modelo cadastrado");
    return { ok: true, model };
  } catch (err) {
    app.log.error(err);
    return reply
      .code(502)
      .send({ error: "Falha ao enviar para o storage.", detail: String(err) });
  }
});

/** Consulta se um SKU já tem modelo (para confirmar substituição na UI). */
app.get("/api/models/:sku/exists", async (req, reply) => {
  const sku = (req.params as { sku: string }).sku;
  if (!isValidSku(sku)) {
    return reply.code(400).send({ error: "SKU inválido." });
  }
  try {
    const [exists, meta] = await Promise.all([modelExists(sku), readMeta(sku)]);
    return {
      exists,
      url: publicUrlForSku(sku),
      totalWidthMm: meta?.totalWidthMm ?? null,
    };
  } catch (err) {
    app.log.error(err);
    return reply.code(502).send({ error: "Falha ao consultar o storage.", detail: String(err) });
  }
});

/** Atualiza só a medida de um SKU, sem reenviar o .glb (backfill/correção). */
app.put("/api/models/:sku/meta", async (req, reply) => {
  const sku = (req.params as { sku: string }).sku;
  if (!isValidSku(sku)) {
    return reply.code(400).send({ error: "SKU inválido." });
  }
  const totalWidthMm = parseTotalWidthMm(
    (req.body as { totalWidthMm?: unknown } | undefined)?.totalWidthMm
  );
  if (totalWidthMm === undefined || totalWidthMm === null) {
    return reply.code(400).send({ error: WIDTH_RANGE_ERROR });
  }
  try {
    await writeMeta(sku, { totalWidthMm });
    app.log.info({ sku, totalWidthMm }, "medida atualizada");
    return { ok: true, totalWidthMm };
  } catch (err) {
    app.log.error(err);
    return reply.code(502).send({ error: "Falha ao gravar a medida.", detail: String(err) });
  }
});

/** Remove o modelo de um SKU. */
app.delete("/api/models/:sku", async (req, reply) => {
  const sku = (req.params as { sku: string }).sku;
  if (!isValidSku(sku)) {
    return reply.code(400).send({ error: "SKU inválido." });
  }
  try {
    await deleteModel(sku);
    app.log.info({ sku }, "modelo removido");
    return { ok: true };
  } catch (err) {
    app.log.error(err);
    return reply.code(502).send({ error: "Falha ao remover do storage.", detail: String(err) });
  }
});

// ---------------------------------------------------------------------------

try {
  await app.listen({ port: config.port, host: "127.0.0.1" });
  app.log.info(`Painel disponível em http://localhost:${config.port}`);
  app.log.info(`Storage alvo: ${config.publicBaseUrl}/{skuId}.glb`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
