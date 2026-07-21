import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyMultipart from "@fastify/multipart";
import { config, publicUrlForSku } from "./config.js";
import { listModels, uploadModel, deleteModel, modelExists } from "./s3.js";
import { isValidSku, isValidGlb } from "./validation.js";

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

/** Sobe (ou substitui) o modelo de um SKU. */
app.post("/api/models/:sku", async (req, reply) => {
  const sku = (req.params as { sku: string }).sku;
  if (!isValidSku(sku)) {
    return reply.code(400).send({ error: "SKU inválido. Use apenas letras, números, - e _." });
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
    const model = await uploadModel(sku, buffer);
    app.log.info({ sku, size: buffer.byteLength }, "modelo cadastrado");
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
    return { exists: await modelExists(sku), url: publicUrlForSku(sku) };
  } catch (err) {
    app.log.error(err);
    return reply.code(502).send({ error: "Falha ao consultar o storage.", detail: String(err) });
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
