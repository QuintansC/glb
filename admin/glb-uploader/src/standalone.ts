/**
 * Versão standalone do painel: um executável único, sem instalação.
 *
 * Diferenças para `server.ts` (usado no desenvolvimento com Node/Fastify):
 *  - usa o servidor HTTP embutido do Bun, sem dependências de runtime;
 *  - os arquivos do painel (html/css/js) são embutidos no binário;
 *  - as credenciais do S3 são embutidas em tempo de build (ver
 *    `scripts/build-exe.mjs`), então quem usa não precisa configurar nada;
 *  - abre o navegador sozinho e explica o que está acontecendo no console.
 *
 * Um `.env` ao lado do executável ainda tem prioridade sobre os valores
 * embutidos — útil para apontar para outro bucket sem recompilar.
 */

// Embutidos no binário pelo `bun build --compile`.
import indexHtml from "../public/index.html" with { type: "text" };
import stylesCss from "../public/styles.css" with { type: "text" };
import appJs from "../public/app.js" with { type: "text" };

import { isValidSku, isValidGlb } from "./validation.js";

// @types/bun tipa `*.html` como HTMLBundle (import de bundle); com
// `type: "text"` o que chega em runtime é o conteúdo do arquivo.
const indexHtmlText = indexHtml as unknown as string;

const ASSETS: Record<string, { body: string; type: string }> = {
  "/": { body: indexHtmlText, type: "text/html; charset=utf-8" },
  "/index.html": { body: indexHtmlText, type: "text/html; charset=utf-8" },
  "/styles.css": { body: stylesCss, type: "text/css; charset=utf-8" },
  "/app.js": { body: appJs, type: "text/javascript; charset=utf-8" },
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** Mantém a janela do console aberta para o usuário conseguir ler o erro. */
function haltWithError(title: string, detail: string): never {
  console.error(`\n  ✖ ${title}\n`);
  console.error(`  ${detail}\n`);
  console.error("  Avise a equipe de tecnologia com a mensagem acima.\n");
  prompt("  Pressione Enter para fechar...");
  process.exit(1);
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === "win32"
      ? ["cmd", "/c", "start", "", url]
      : process.platform === "darwin"
        ? ["open", url]
        : ["xdg-open", url];
  try {
    Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
  } catch {
    // Sem navegador padrão: o usuário abre a URL na mão (já impressa no console).
  }
}

async function main(): Promise<void> {
  // Import dinâmico: `config.ts` valida as variáveis e lança na importação —
  // aqui isso vira uma mensagem legível em vez de um stack trace.
  let configMod: typeof import("./config.js");
  try {
    configMod = await import("./config.js");
  } catch (err) {
    haltWithError(
      "Configuração do storage ausente ou inválida.",
      err instanceof Error ? err.message : String(err)
    );
  }
  const { config, publicUrlForSku } = configMod;
  const s3 = await import("./s3.js");

  const maxUploadMb = Math.round(config.maxUploadBytes / (1024 * 1024));

  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "GET" && ASSETS[path]) {
      const asset = ASSETS[path]!;
      return new Response(asset.body, {
        headers: { "content-type": asset.type, "cache-control": "no-store" },
      });
    }

    if (path === "/api/config" && req.method === "GET") {
      return json({
        publicBaseUrl: config.publicBaseUrl,
        bucket: config.s3.bucket,
        prefix: config.s3.prefix,
        endpoint: config.s3.endpoint,
        convention: "{skuId}.glb",
        maxUploadMb,
      });
    }

    if (path === "/api/models" && req.method === "GET") {
      try {
        return json({ models: await s3.listModels() });
      } catch (err) {
        console.error("[erro] listar modelos:", err);
        return json(
          { error: "Não foi possível listar os modelos no storage.", detail: String(err) },
          502
        );
      }
    }

    // /api/models/:sku  e  /api/models/:sku/exists
    const match = path.match(/^\/api\/models\/([^/]+)(\/exists)?$/);
    if (match) {
      const sku = decodeURIComponent(match[1]!);
      const isExists = Boolean(match[2]);

      if (!isValidSku(sku)) {
        return json({ error: "SKU inválido. Use apenas letras, números, - e _." }, 400);
      }

      if (isExists && req.method === "GET") {
        try {
          return json({ exists: await s3.modelExists(sku), url: publicUrlForSku(sku) });
        } catch (err) {
          console.error("[erro] consultar SKU:", err);
          return json({ error: "Falha ao consultar o storage.", detail: String(err) }, 502);
        }
      }

      if (!isExists && req.method === "POST") {
        const form = await req.formData();
        const file = form.get("file");
        if (!(file instanceof File)) {
          return json({ error: "Nenhum arquivo enviado." }, 400);
        }
        if (!file.name.toLowerCase().endsWith(".glb")) {
          return json({ error: "O arquivo precisa ter extensão .glb." }, 400);
        }
        if (file.size > config.maxUploadBytes) {
          return json({ error: `Arquivo maior que o limite de ${maxUploadMb} MB.` }, 413);
        }

        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!isValidGlb(bytes)) {
          return json(
            { error: "Arquivo não parece um GLB válido (magic/versão glTF 2.0 não encontrados)." },
            400
          );
        }

        try {
          const model = await s3.uploadModel(sku, Buffer.from(bytes));
          console.log(`  ✔ modelo cadastrado: ${sku}.glb (${(bytes.byteLength / 1024).toFixed(0)} KB)`);
          return json({ ok: true, model });
        } catch (err) {
          console.error("[erro] upload:", err);
          return json({ error: "Falha ao enviar para o storage.", detail: String(err) }, 502);
        }
      }

      if (!isExists && req.method === "DELETE") {
        try {
          await s3.deleteModel(sku);
          console.log(`  ✔ modelo removido: ${sku}.glb`);
          return json({ ok: true });
        } catch (err) {
          console.error("[erro] remover:", err);
          return json({ error: "Falha ao remover do storage.", detail: String(err) }, 502);
        }
      }
    }

    return json({ error: "Rota não encontrada." }, 404);
  }

  // A porta preferida pode estar ocupada (outra cópia do painel aberta).
  let server: ReturnType<typeof Bun.serve> | null = null;
  let lastErr: unknown = null;
  for (let port = config.port; port < config.port + 10; port++) {
    try {
      server = Bun.serve({ port, hostname: "127.0.0.1", fetch: handle });
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (!server) {
    haltWithError(
      "Não foi possível abrir o painel (portas ocupadas).",
      String(lastErr)
    );
  }

  const url = `http://localhost:${server.port}`;
  console.log("");
  console.log("  ┌────────────────────────────────────────────────┐");
  console.log("  │   Cadastro de Modelos 3D — Provador Virtual     │");
  console.log("  └────────────────────────────────────────────────┘");
  console.log("");
  console.log(`  Painel aberto em:  ${url}`);
  console.log(`  Storage alvo:      ${config.publicBaseUrl}/{skuId}.glb`);
  console.log("");
  console.log("  Se o navegador não abrir sozinho, copie o endereço acima.");
  console.log("  IMPORTANTE: mantenha esta janela preta aberta enquanto usa o painel.");
  console.log("  Para encerrar, feche esta janela.");
  console.log("");

  openBrowser(url);
}

await main();
