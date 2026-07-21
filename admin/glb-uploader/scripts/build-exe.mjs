#!/usr/bin/env node
/**
 * Gera o executável único do painel (um arquivo, sem instalação).
 *
 * Lê o `.env` deste diretório e EMBUTE os valores no binário, para que quem
 * usa não precise configurar nada. Um `.env` ao lado do executável continua
 * tendo prioridade sobre os valores embutidos.
 *
 * Uso:
 *   node scripts/build-exe.mjs              # alvo padrão: windows-x64
 *   node scripts/build-exe.mjs linux-x64    # outros alvos do bun --target
 *
 * ATENÇÃO: o binário gerado contém as credenciais do storage. Trate-o como
 * um segredo — entregue direto a quem faz o cadastro, nunca publique.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Variáveis do .env que vão para dentro do binário. */
const EMBEDDED_KEYS = [
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_PREFIX",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_FORCE_PATH_STYLE",
  "S3_OBJECT_ACL",
  "S3_PUBLIC_BASE_URL",
  "PORT",
  "MAX_UPLOAD_MB",
];

function parseEnvFile(path) {
  if (!existsSync(path)) {
    console.error(`\n✖ Arquivo .env não encontrado em ${path}`);
    console.error("  Crie o .env com as credenciais do storage antes de gerar o executável.\n");
    process.exit(1);
  }
  const out = {};
  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function findBun() {
  for (const candidate of ["bun", join(process.env.HOME ?? "", ".bun/bin/bun")]) {
    try {
      execFileSync(candidate, ["--version"], { stdio: "ignore" });
      return candidate;
    } catch {
      /* tenta o próximo */
    }
  }
  console.error("\n✖ Bun não encontrado. Instale com:  curl -fsSL https://bun.sh/install | bash\n");
  process.exit(1);
}

const target = process.argv[2] ?? "windows-x64";
const env = parseEnvFile(join(root, ".env"));

const missing = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"].filter(
  (k) => !env[k]
);
if (missing.length) {
  console.error(`\n✖ Faltam variáveis no .env: ${missing.join(", ")}\n`);
  process.exit(1);
}

const embedded = Object.fromEntries(
  EMBEDDED_KEYS.filter((k) => env[k] !== undefined && env[k] !== "").map((k) => [k, env[k]])
);

// Entrypoint temporário: injeta a config embutida antes de subir o servidor.
const buildDir = join(root, "build");
mkdirSync(buildDir, { recursive: true });
const entryPath = join(buildDir, "entry.ts");
writeFileSync(
  entryPath,
  `// GERADO POR scripts/build-exe.mjs — não editar, não versionar (contém credenciais).
import "dotenv/config"; // um .env ao lado do executável tem prioridade
const EMBEDDED: Record<string, string> = ${JSON.stringify(embedded, null, 2)};
for (const [key, value] of Object.entries(EMBEDDED)) {
  if (!process.env[key]) process.env[key] = value;
}
await import("../src/standalone.js");
`,
  "utf8"
);

const isWindows = target.startsWith("windows");
const outName = "cadastro-modelos-3d";
const outFile = join(root, "dist", outName);

try {
  mkdirSync(join(root, "dist"), { recursive: true });
  console.log(`\n▸ Compilando para ${target}...`);
  execFileSync(
    findBun(),
    ["build", entryPath, "--compile", `--target=bun-${target}`, "--outfile", outFile],
    { cwd: root, stdio: "inherit" }
  );
} finally {
  // O entry tem credenciais em texto puro: nunca deixar no disco.
  rmSync(entryPath, { force: true });
  rmSync(buildDir, { recursive: true, force: true });
}

const finalPath = isWindows ? `${outFile}.exe` : outFile;
const sizeMb = (statSync(finalPath).size / (1024 * 1024)).toFixed(0);
console.log(`\n✔ Executável gerado: ${finalPath} (${sizeMb} MB)`);
console.log("  Contém as credenciais do storage — entregue direto ao responsável pelo cadastro.\n");
