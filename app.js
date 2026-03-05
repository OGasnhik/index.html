const $ = (id) => document.getElementById(id);

const state = {
  index: null,
  brand: null,
  parts: [],
  assemblies: [],
  modelsSet: new Set(),
  loadedAt: null
};

function norm(s) {
  return (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function escapeHtml(str) {
  return (str ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function fetchJson(url) {
  // чтобы GitHub Pages не отдавал старую версию из кеша
  const u = `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
  const r = await fetch(u);
  if (!r.ok) throw new Error(`Не удалось загрузить ${url} (${r.status})`);
  return r.json();
}

function setMeta(text) {
  $("meta").textContent = text;
}

function fillSelect(selectEl, items, { placeholder = "—", valueKey = "id", textKey = "title" } = {}) {
  selectEl.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = placeholder;
  selectEl.appendChild(opt0);

  for (const it of items) {
    const o = document.createElement("option");
    o.value = it[valueKey];
    o.textContent = it[textKey];
    selectEl.appendChild(o);
  }
}

function rebuildModels() {
  state.modelsSet = new Set();
  for (const p of state.parts) {
    for (const m of (p.models ?? [])) state.modelsSet.add(m);
  }
  const models = Array.from(state.modelsSet).sort((a, b) =>
    a.localeCompare(b, "en", { numeric: true })
  );

  fillSelect(
    $("model"),
    models.map(m => ({ id: m, title: m })),
    { placeholder: "Model (модель)" }
  );
  $("model").disabled = false;
}

function rebuildAssemblies() {
  fillSelect($("assembly"), state.assemblies, { placeholder: "Assembly (узел)" });
  $("assembly").disabled = false;
}

function matchesFilters(p, model, assembly, q) {
  if (model) {
    const ms = p.models ?? [];
    if (!ms.includes(model)) return false;
  }
  if (assembly) {
    if ((p.assembly ?? "") !== assembly) return false;
  }
  if (q) {
    const hay = [
      p.part_number,
      p.name_en,
      p.name_ru,
      (p.models ?? []).join(" "),
      p.assembly
    ].map(norm).join(" | ");

    const terms = q.split(" ").filter(Boolean);
    for (const t of terms) {
      if (!hay.includes(t)) return false;
    }
  }
  return true;
}

function render() {
  const model = $("model").value;
  const assembly = $("assembly").value;
  const q = norm($("q").value);

  const filtered = state.parts.filter(p => matchesFilters(p, model, assembly, q));

  setMeta(
    `Бренд: ${state.brand?.title ?? "—"} · Записей: ${state.parts.length} · Найдено: ${filtered.length} · Обновлено: ${state.loadedAt ?? "—"}`
  );

  const root = $("results");
  if (!filtered.length) {
    root.innerHTML = `<div class="empty">Ничего не найдено. Выбери модель/узел или введи запрос.</div>`;
    return;
  }

  root.innerHTML = filtered.slice(0, 300).map(p => {
    const pn = escapeHtml(p.part_number);
    const en = escapeHtml(p.name_en);
    const ru = escapeHtml(p.name_ru);
    const models = escapeHtml((p.models ?? []).join(", "));
    const asm = escapeHtml(p.assembly ?? "");
    const notes = escapeHtml(p.notes ?? "");

    return `
      <div class="card">
        <div class="pn">${pn}</div>
        <div class="name">${en}</div>
        ${ru ? `<div class="sub">${ru}</div>` : ""}
        <div class="tags">
          <span class="tag">Models: ${models || "—"}</span>
          <span class="tag">Assembly: ${asm || "—"}</span>
        </div>
        ${notes ? `<div class="sub">${notes}</div>` : ""}
      </div>
    `;
  }).join("");
}

async function loadBrand(brandId) {
  const b = state.index.brands.find(x => x.id === brandId);
  if (!b) return;

  state.brand = b;
  setMeta("Загрузка базы…");

  const [parts, assemblies] = await Promise.all([
    fetchJson(b.parts),
    fetchJson(b.assemblies)
  ]);

  state.parts = Array.isArray(parts) ? parts : [];
  state.assemblies = (assemblies?.assemblies ?? []).map(a => ({ id: a.id, title: a.title }));
  state.loadedAt = new Date().toLocaleString();

  rebuildModels();
  rebuildAssemblies();

  $("model").value = "";
  $("assembly").value = "";
  $("q").value = "";

  render();
}

async function init() {
  state.index = await fetchJson("database/index.json");

  fillSelect($("brand"), state.index.brands, { placeholder: "Brand (бренд)" });

  $("brand").addEventListener("change", async () => {
    const brandId = $("brand").value;
    if (!brandId) return;

    $("model").disabled = true;
    $("assembly").disabled = true;
    await loadBrand(brandId);
  });

  $("model").addEventListener("change", render);
  $("assembly").addEventListener("change", render);

  $("q").addEventListener("input", () => {
    clearTimeout(init._t);
    init._t = setTimeout(render, 80);
  });

  $("refresh").addEventListener("click", async () => {
    const brandId = $("brand").value;
    if (!brandId) return;
    await loadBrand(brandId);
  });

  setMeta("Выбери бренд, чтобы загрузить базу.");
}

init().catch(err => {
  console.error(err);
  setMeta("Ошибка: " + err.message);
});
