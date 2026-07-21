"use strict";

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
const state = {
  file: /** @type {File | null} */ (null),
  objectUrl: /** @type {string | null} */ (null),
  publicBaseUrl: "",
  maxUploadMb: 40,
  /** @type {BatchItem[]} fila do modo lote */
  batch: [],
};

/**
 * @typedef {Object} BatchItem
 * @property {string} id
 * @property {File} file
 * @property {string} sku
 * @property {"pending"|"exists"|"uploading"|"done"|"skipped"|"error"|"invalid"} status
 * @property {string} message
 * @property {HTMLTableRowElement} [rowEl]
 */

const $ = (id) => document.getElementById(id);
const SKU_RE = /^[A-Za-z0-9_-]+$/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function toast(message, kind = "info", ms = 4200) {
  const el = document.createElement("div");
  el.className = `toast toast--${kind}`;
  el.textContent = message;
  $("toasts").appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity .3s";
    setTimeout(() => el.remove(), 320);
  }, ms);
}

function formatBytes(bytes) {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function sku() {
  return $("sku").value.trim();
}

// ---------------------------------------------------------------------------
// Validação e estado do botão
// ---------------------------------------------------------------------------
let existsCheckTimer = null;

function refreshSubmitState() {
  const valid = SKU_RE.test(sku()) && state.file !== null;
  $("submit").disabled = !valid;
  updateTargetName();
}

function updateTargetName() {
  const s = sku();
  if (!s) {
    $("target-name").innerHTML = "";
    return;
  }
  $("target-name").innerHTML = `Vai salvar como <strong>${s}.glb</strong>`;
}

async function checkSkuExists() {
  const s = sku();
  const status = $("sku-status");
  if (!s) {
    status.textContent = "";
    status.className = "field__status";
    return;
  }
  if (!SKU_RE.test(s)) {
    status.textContent = "Use apenas letras, números, - e _.";
    status.className = "field__status is-error";
    return;
  }
  status.textContent = "Verificando…";
  status.className = "field__status";
  try {
    const res = await fetch(`/api/models/${encodeURIComponent(s)}/exists`);
    const data = await res.json();
    if (data.exists) {
      status.textContent = "⚠ Já existe um modelo para este SKU — o envio vai substituir.";
      status.className = "field__status is-warn";
    } else {
      status.textContent = "✓ SKU livre.";
      status.className = "field__status is-ok";
    }
  } catch {
    status.textContent = "";
    status.className = "field__status";
  }
}

// ---------------------------------------------------------------------------
// Seleção de arquivo + preview
// ---------------------------------------------------------------------------
function setFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".glb")) {
    toast("O arquivo precisa ser .glb", "error");
    return;
  }
  const maxBytes = state.maxUploadMb * 1024 * 1024;
  if (file.size > maxBytes) {
    toast(`Arquivo acima do limite de ${state.maxUploadMb} MB.`, "error");
    return;
  }

  state.file = file;
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = URL.createObjectURL(file);

  $("dropzone-meta").textContent = `${file.name} · ${formatBytes(file.size)}`;
  $("preview").hidden = false;
  $("viewer").src = state.objectUrl;
  $("preview-caption").textContent = "Arraste para girar · pré-visualização local (ainda não enviado)";

  // Sugere o SKU pelo nome do arquivo se o campo estiver vazio.
  if (!sku()) {
    const guess = file.name.replace(/\.glb$/i, "");
    if (SKU_RE.test(guess)) {
      $("sku").value = guess;
      checkSkuExists();
    }
  }
  refreshSubmitState();
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------
async function upload() {
  const s = sku();
  if (!SKU_RE.test(s) || !state.file) return;

  // Confirma substituição se já existir.
  try {
    const res = await fetch(`/api/models/${encodeURIComponent(s)}/exists`);
    const data = await res.json();
    if (data.exists) {
      const ok = confirm(
        `Já existe um modelo para o SKU ${s}.\nSubstituir pelo novo arquivo?`
      );
      if (!ok) return;
    }
  } catch {
    /* segue e deixa o backend decidir */
  }

  const btn = $("submit");
  btn.disabled = true;
  btn.textContent = "Enviando…";

  const form = new FormData();
  form.append("file", state.file, state.file.name);

  try {
    const res = await fetch(`/api/models/${encodeURIComponent(s)}`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Falha no upload.");

    toast(`Modelo do SKU ${s} cadastrado com sucesso.`, "ok");
    resetUpload();
    loadModels();
  } catch (err) {
    toast(err.message || "Erro ao enviar.", "error", 6000);
  } finally {
    btn.textContent = "Enviar modelo";
    refreshSubmitState();
  }
}

function resetUpload() {
  state.file = null;
  if (state.objectUrl) {
    URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = null;
  }
  $("file").value = "";
  $("sku").value = "";
  $("sku-status").textContent = "";
  $("sku-status").className = "field__status";
  $("dropzone-meta").textContent = "";
  $("preview").hidden = true;
  $("viewer").removeAttribute("src");
  refreshSubmitState();
}

// ---------------------------------------------------------------------------
// Lista de modelos
// ---------------------------------------------------------------------------
async function loadModels() {
  const tbody = $("models");
  try {
    const res = await fetch("/api/models");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Falha ao listar.");

    const models = data.models || [];
    $("count").textContent = models.length ? `(${models.length})` : "";
    $("empty").hidden = models.length > 0;
    tbody.innerHTML = "";

    for (const m of models) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="sku-cell">${m.skuId}</td>
        <td>${formatBytes(m.sizeBytes)}</td>
        <td>${formatDate(m.lastModified)}</td>
        <td class="col-actions">
          <span class="row-actions">
            <button class="icon-btn" title="Preview 3D" data-preview="${encodeURIComponent(m.url)}" data-sku="${m.skuId}">◉</button>
            <a class="icon-btn" title="Abrir arquivo" href="${m.url}" target="_blank" rel="noopener">↗</a>
            <button class="icon-btn icon-btn--danger" title="Excluir" data-delete="${m.skuId}">🗑</button>
          </span>
        </td>`;
      tbody.appendChild(tr);
    }
  } catch (err) {
    toast(err.message || "Erro ao carregar modelos.", "error", 6000);
  }
}

async function deleteModel(s) {
  if (!confirm(`Excluir o modelo do SKU ${s}? O provador deixa de oferecer 3D nesse produto.`)) return;
  try {
    const res = await fetch(`/api/models/${encodeURIComponent(s)}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Falha ao excluir.");
    toast(`Modelo do SKU ${s} removido.`, "ok");
    loadModels();
  } catch (err) {
    toast(err.message || "Erro ao excluir.", "error", 6000);
  }
}

// ---------------------------------------------------------------------------
// Modal de preview
// ---------------------------------------------------------------------------
function openPreview(url, title) {
  $("modal-title").textContent = title;
  $("modal-viewer").src = url;
  $("modal").hidden = false;
}
function closeModal() {
  $("modal").hidden = true;
  $("modal-viewer").removeAttribute("src");
}

// ---------------------------------------------------------------------------
// Modo lote (vários de uma vez)
// ---------------------------------------------------------------------------
const BADGE_LABELS = {
  pending: "Na fila",
  exists: "Já existe",
  uploading: "Enviando…",
  done: "Enviado ✓",
  skipped: "Pulado",
  error: "Erro",
  invalid: "SKU inválido",
};

/** Deriva o SKU a partir do nome do arquivo (remove .glb). */
function skuFromFileName(name) {
  return name.replace(/\.glb$/i, "").trim();
}

function addBatchFiles(fileList) {
  const maxBytes = state.maxUploadMb * 1024 * 1024;
  let added = 0;
  let rejected = 0;

  for (const file of fileList) {
    if (!file.name.toLowerCase().endsWith(".glb")) {
      rejected++;
      continue;
    }
    const guess = skuFromFileName(file.name);
    const item = /** @type {BatchItem} */ ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      sku: guess,
      status: file.size > maxBytes ? "error" : SKU_RE.test(guess) ? "pending" : "invalid",
      message: file.size > maxBytes ? `Acima de ${state.maxUploadMb} MB` : "",
    });
    state.batch.push(item);
    added++;
  }

  if (rejected) toast(`${rejected} arquivo(s) ignorado(s): não são .glb`, "error");
  if (added) renderBatch();
}

function renderBatch() {
  const tbody = $("batch-rows");
  const has = state.batch.length > 0;
  $("batch-controls").hidden = !has;
  $("batch-table-wrap").hidden = !has;

  tbody.innerHTML = "";
  for (const item of state.batch) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><div class="batch-file-name" title="${item.file.name}">${item.file.name}</div></td>
      <td><input class="sku-input" value="${item.sku}" data-id="${item.id}" spellcheck="false" autocomplete="off" /></td>
      <td>${formatBytes(item.file.size)}</td>
      <td class="batch-status"></td>
      <td class="col-actions"><button class="icon-btn icon-btn--danger" title="Remover da lista" data-remove="${item.id}">✕</button></td>`;
    item.rowEl = tr;
    tbody.appendChild(tr);
    paintBatchRow(item);
  }
  updateBatchSummary();
}

/** Atualiza só a linha (status + validade do SKU) sem redesenhar a tabela toda. */
function paintBatchRow(item) {
  if (!item.rowEl) return;
  const statusCell = item.rowEl.querySelector(".batch-status");
  const label = item.message || BADGE_LABELS[item.status] || item.status;
  statusCell.innerHTML = `<span class="badge badge--${item.status}">${label}</span>`;
  const input = item.rowEl.querySelector(".sku-input");
  input.classList.toggle("is-invalid", !SKU_RE.test(item.sku));
}

function setBatchStatus(item, status, message = "") {
  item.status = status;
  item.message = message;
  paintBatchRow(item);
}

function updateBatchSummary() {
  const summary = $("batch-summary");
  const btn = $("batch-submit");
  const items = state.batch;
  const ready = items.filter((i) => SKU_RE.test(i.sku) && i.status !== "done");
  const done = items.filter((i) => i.status === "done").length;

  // Detecta SKUs duplicados dentro do próprio lote (o último sobrescreveria o anterior).
  const counts = {};
  for (const i of items) if (SKU_RE.test(i.sku)) counts[i.sku] = (counts[i.sku] || 0) + 1;
  const dups = Object.keys(counts).filter((k) => counts[k] > 1);
  const invalid = items.filter((i) => !SKU_RE.test(i.sku)).length;

  let msg = "";
  if (items.length) {
    msg = `${ready.length} pronto(s) para enviar`;
    if (done) msg += ` · ${done} enviado(s)`;
    if (invalid) msg += ` · ${invalid} com SKU inválido`;
    if (dups.length) msg += ` · ⚠ SKU repetido: ${dups.join(", ")}`;
  }
  summary.textContent = msg;
  summary.classList.toggle("batch-summary--warn", dups.length > 0);
  btn.disabled = ready.length === 0;
}

/** Executa `worker` sobre `items` com no máximo `size` em paralelo. */
async function runPool(items, worker, size = 3) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) await worker(queue.shift());
  });
  await Promise.all(runners);
}

async function uploadBatchItem(item, overwrite) {
  if (item.status === "done") return;
  if (!SKU_RE.test(item.sku)) return setBatchStatus(item, "invalid");
  if (item.file.size > state.maxUploadMb * 1024 * 1024)
    return setBatchStatus(item, "error", `Acima de ${state.maxUploadMb} MB`);

  setBatchStatus(item, "uploading");
  try {
    if (!overwrite) {
      const ex = await fetch(`/api/models/${encodeURIComponent(item.sku)}/exists`).then((r) => r.json());
      if (ex.exists) return setBatchStatus(item, "skipped", "Já existe (não substituído)");
    }
    const form = new FormData();
    form.append("file", item.file, item.file.name);
    const res = await fetch(`/api/models/${encodeURIComponent(item.sku)}`, { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Falha no upload.");
    setBatchStatus(item, "done");
  } catch (err) {
    setBatchStatus(item, "error", err.message || "Erro");
  }
}

async function batchSubmit() {
  const overwrite = $("batch-overwrite").checked;
  const pending = state.batch.filter((i) => SKU_RE.test(i.sku) && i.status !== "done");
  if (!pending.length) return;

  const btn = $("batch-submit");
  btn.disabled = true;
  btn.textContent = "Enviando…";

  await runPool(pending, (item) => uploadBatchItem(item, overwrite), 3);

  const done = state.batch.filter((i) => i.status === "done").length;
  const errors = state.batch.filter((i) => i.status === "error").length;
  const skipped = state.batch.filter((i) => i.status === "skipped").length;

  let kind = "ok";
  let msg = `${done} modelo(s) enviado(s)`;
  if (skipped) msg += ` · ${skipped} pulado(s)`;
  if (errors) {
    msg += ` · ${errors} com erro`;
    kind = errors === state.batch.length ? "error" : "info";
  }
  toast(msg, kind, 6000);

  btn.textContent = "Enviar modelos";
  updateBatchSummary();
  loadModels();
}

function clearBatch() {
  state.batch = [];
  $("batch-file").value = "";
  renderBatch();
}

function switchTab(tab) {
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("is-active", t.dataset.tab === tab)
  );
  document.querySelectorAll(".pane").forEach((p) => {
    p.hidden = p.dataset.pane !== tab;
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
async function init() {
  try {
    const res = await fetch("/api/config");
    const cfg = await res.json();
    state.publicBaseUrl = cfg.publicBaseUrl;
    state.maxUploadMb = cfg.maxUploadMb ?? 40;
    $("target-url").textContent = `${cfg.publicBaseUrl}/{skuId}.glb`;
    $("target-url").title = `${cfg.publicBaseUrl}/{skuId}.glb`;
  } catch {
    $("target-url").textContent = "erro ao carregar config";
  }

  // SKU input
  $("sku").addEventListener("input", () => {
    refreshSubmitState();
    clearTimeout(existsCheckTimer);
    existsCheckTimer = setTimeout(checkSkuExists, 350);
  });

  // Dropzone
  const dz = $("dropzone");
  dz.addEventListener("click", () => $("file").click());
  dz.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      $("file").click();
    }
  });
  $("file").addEventListener("change", (e) => setFile(e.target.files[0]));
  ["dragover", "dragenter"].forEach((ev) =>
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.add("is-drag");
    })
  );
  ["dragleave", "dragend", "drop"].forEach((ev) =>
    dz.addEventListener(ev, () => dz.classList.remove("is-drag"))
  );
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) setFile(e.dataTransfer.files[0]);
  });

  // Botões principais
  $("submit").addEventListener("click", upload);
  $("refresh").addEventListener("click", loadModels);

  // Abas (um modelo / lote)
  document.querySelectorAll(".tab").forEach((t) =>
    t.addEventListener("click", () => switchTab(t.dataset.tab))
  );

  // Dropzone do lote
  const bdz = $("batch-dropzone");
  bdz.addEventListener("click", () => $("batch-file").click());
  bdz.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      $("batch-file").click();
    }
  });
  $("batch-file").addEventListener("change", (e) => addBatchFiles(e.target.files));
  ["dragover", "dragenter"].forEach((ev) =>
    bdz.addEventListener(ev, (e) => {
      e.preventDefault();
      bdz.classList.add("is-drag");
    })
  );
  ["dragleave", "dragend", "drop"].forEach((ev) =>
    bdz.addEventListener(ev, () => bdz.classList.remove("is-drag"))
  );
  bdz.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) addBatchFiles(e.dataTransfer.files);
  });

  // Edição de SKU e remoção de linha (delegação)
  $("batch-rows").addEventListener("input", (e) => {
    const input = e.target.closest(".sku-input");
    if (!input) return;
    const item = state.batch.find((i) => i.id === input.dataset.id);
    if (!item) return;
    item.sku = input.value.trim();
    if (item.status === "invalid" || item.status === "pending")
      item.status = SKU_RE.test(item.sku) ? "pending" : "invalid";
    paintBatchRow(item);
    updateBatchSummary();
  });
  $("batch-rows").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove]");
    if (!btn) return;
    state.batch = state.batch.filter((i) => i.id !== btn.dataset.remove);
    renderBatch();
  });

  $("batch-submit").addEventListener("click", batchSubmit);
  $("batch-clear").addEventListener("click", clearBatch);

  // Delegação de eventos na tabela
  $("models").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.dataset.delete) deleteModel(btn.dataset.delete);
    if (btn.dataset.preview)
      openPreview(decodeURIComponent(btn.dataset.preview), `SKU ${btn.dataset.sku}`);
  });

  // Modal
  document.querySelectorAll("[data-close]").forEach((el) =>
    el.addEventListener("click", closeModal)
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  loadModels();
}

init();
