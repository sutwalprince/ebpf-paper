// ---------------------------------------------------------------------
// Config: which classification fields become sidebar filters.
// Add/remove rows here to change what's filterable — every field still
// gets full-text search and shows up in the card's "more" detail either way.
// ---------------------------------------------------------------------
const FACET_FIELDS = [
  { key: "primary_categories", label: "Category" },
  { key: "research_areas", label: "Research Area" },
  { key: "application_domain", label: "Application Domain" },
  { key: "ebpf_mechanisms", label: "eBPF Mechanism" },
  { key: "deployment_type", label: "Deployment" },
  { key: "innovation_type", label: "Innovation Type" },
];

// Fields shown read-only inside a card's "more" panel (not sidebar facets).
const DETAIL_FIELDS = [
  { key: "secondary_categories", label: "Secondary Categories" },
  { key: "supporting_categories", label: "Supporting Categories" },
  { key: "system_layers", label: "System Layers" },
  { key: "goals", label: "Goals" },
  { key: "kernel_subsystems", label: "Kernel Subsystems" },
  { key: "target_workloads", label: "Target Workloads" },
  { key: "target_resources", label: "Target Resources" },
  { key: "performance_objectives", label: "Performance Objectives" },
];

const ALL_ARRAY_FIELDS = [...FACET_FIELDS, ...DETAIL_FIELDS].map(f => f.key);

const state = {
  search: "",
  filters: Object.fromEntries(FACET_FIELDS.map(f => [f.key, new Set()])),
  sort: "year-desc",
};

let allPapers = [];
let dirty = false;
let editingId = null; // null while adding, paper id while editing
const facetValueEls = {}; // facetKey -> { value -> { li, countEl } }

// ---------------------------------------------------------------------
// Admin mode — read ?admin=<token> from URL, verify with server
// ---------------------------------------------------------------------
let isAdmin = false;
const adminToken = new URLSearchParams(window.location.search).get("admin") || "";

async function checkAdminStatus() {
  if (!adminToken) return false;
  try {
    const res = await fetch(`/api/admin-check?token=${encodeURIComponent(adminToken)}`);
    const data = await res.json();
    return data.admin === true;
  } catch {
    return false;
  }
}

function applyAdminVisibility() {
  const adminEls = document.querySelectorAll(".admin-only");
  adminEls.forEach(el => {
    el.style.display = isAdmin ? "" : "none";
  });
  // Also hide card-level admin controls
  document.querySelectorAll(".card-admin").forEach(el => {
    el.style.display = isAdmin ? "" : "none";
  });
}

// ---------------------------------------------------------------------
// Data loading + normalization
// ---------------------------------------------------------------------
async function loadPapers() {
  isAdmin = await checkAdminStatus();
  const res = await fetch("papers.json");
  const raw = await res.json();
  allPapers = raw.map(normalizePaper);
  ensureUniqueIds();
  buildFacetGroupsDOM();
  attachGlobalListeners();
  applyAdminVisibility();
  render();
}

function normalizePaper(p) {
  const title = p.title || p.paper_title || "Untitled";
  for (const key of ALL_ARRAY_FIELDS) {
    if (!Array.isArray(p[key])) p[key] = [];
  }
  if (!p.id) p.id = makeId(title, p.year);
  const reasoningText = p.classification_reasoning
    ? Object.values(p.classification_reasoning)
        .flatMap(group => Object.values(group))
        .join(" ")
    : "";
  const searchParts = [
    title,
    (p.authors || []).join(" "),
    p.venue || "",
    String(p.year || ""),
    p.summary || "",
    ...ALL_ARRAY_FIELDS.flatMap(key => p[key]),
    reasoningText,
  ];
  p._title = title;
  p._searchIndex = searchParts.join(" ").toLowerCase();
  return p;
}

function ensureUniqueIds() {
  const seen = new Set();
  for (const p of allPapers) {
    let id = p.id;
    let n = 2;
    while (seen.has(id)) { id = `${p.id}-${n++}`; }
    p.id = id;
    seen.add(id);
  }
}

function makeId(title, year) {
  const base = slug(title) || "paper";
  return year ? `${base}-${year}` : base;
}

// ---------------------------------------------------------------------
// Filtering / sorting
// ---------------------------------------------------------------------
function matchesSearch(paper) {
  const term = state.search.trim().toLowerCase();
  if (!term) return true;
  return paper._searchIndex.includes(term);
}

function matchesFilters(paper, excludeKey) {
  for (const f of FACET_FIELDS) {
    if (f.key === excludeKey) continue;
    const selected = state.filters[f.key];
    if (selected.size === 0) continue;
    const values = paper[f.key] || [];
    if (!values.some(v => selected.has(v))) return false;
  }
  return true;
}

function getFiltered(excludeKey = null) {
  return allPapers.filter(p => matchesSearch(p) && matchesFilters(p, excludeKey));
}

function sortPapers(papers) {
  const arr = [...papers];
  arr.sort((a, b) => {
    if (state.sort === "title-asc") {
      return a._title.localeCompare(b._title);
    }
    const ay = a.year || 0, by = b.year || 0;
    if (state.sort === "year-asc") return ay - by || a._title.localeCompare(b._title);
    return by - ay || a._title.localeCompare(b._title); // year-desc default
  });
  return arr;
}

function resetFiltersAndSearch() {
  for (const f of FACET_FIELDS) state.filters[f.key].clear();
  state.search = "";
  document.getElementById("search-input").value = "";
}

// ---------------------------------------------------------------------
// Facet sidebar — rebuilt whenever the paper set changes (add/edit/delete
// can introduce new tag values), preserving open/closed panels and any
// currently-active checkboxes.
// ---------------------------------------------------------------------
function buildFacetGroupsDOM() {
  const container = document.getElementById("facet-groups");

  const openState = {};
  container.querySelectorAll(".facet-group").forEach(d => {
    openState[d.dataset.facetKey] = d.open;
  });
  container.innerHTML = "";

  for (const f of FACET_FIELDS) {
    const values = uniqueSorted(allPapers.flatMap(p => p[f.key]));
    if (values.length === 0) continue;

    facetValueEls[f.key] = {};

    const details = document.createElement("details");
    details.className = "facet-group";
    details.dataset.facetKey = f.key;
    details.open = f.key in openState ? openState[f.key] : true;

    const summary = document.createElement("summary");
    summary.innerHTML = `<span>${escapeHtml(f.label)}</span><span class="chevron">&#10095;</span>`;
    details.appendChild(summary);

    const optionsWrap = document.createElement("div");
    optionsWrap.className = "facet-options";

    for (const value of values) {
      const id = `facet-${f.key}-${slug(value)}`;
      const label = document.createElement("label");
      label.className = "facet-option";
      label.setAttribute("for", id);

      const input = document.createElement("input");
      input.type = "checkbox";
      input.id = id;
      input.dataset.facet = f.key;
      input.dataset.value = value;
      input.checked = state.filters[f.key].has(value);
      input.addEventListener("change", onFacetToggle);

      const text = document.createElement("span");
      text.textContent = value;

      const count = document.createElement("span");
      count.className = "count";

      label.append(input, text, count);
      optionsWrap.appendChild(label);
      facetValueEls[f.key][value] = { li: label, countEl: count };
    }

    details.appendChild(optionsWrap);
    container.appendChild(details);
  }
}

function onFacetToggle(e) {
  const { facet, value } = e.target.dataset;
  const set = state.filters[facet];
  if (e.target.checked) set.add(value);
  else set.delete(value);
  render();
}

function updateFacetCounts() {
  for (const f of FACET_FIELDS) {
    const els = facetValueEls[f.key];
    if (!els) continue;
    const pool = getFiltered(f.key); // matches search + all OTHER active groups
    const counts = {};
    for (const p of pool) {
      for (const v of p[f.key]) counts[v] = (counts[v] || 0) + 1;
    }
    for (const [value, { li, countEl }] of Object.entries(els)) {
      const n = counts[value] || 0;
      countEl.textContent = n;
      li.classList.toggle("is-zero", n === 0);
    }
  }
}

// ---------------------------------------------------------------------
// Active filter chips ("flags")
// ---------------------------------------------------------------------
function renderActiveFilters() {
  const wrap = document.getElementById("active-filters");
  wrap.innerHTML = "";
  for (const f of FACET_FIELDS) {
    for (const value of state.filters[f.key]) {
      const chip = document.createElement("span");
      chip.className = "flag-chip";
      chip.innerHTML = `<span>--${escapeHtml(f.key)}:${escapeHtml(value)}</span>`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("aria-label", `remove filter ${f.label}: ${value}`);
      btn.textContent = "\u00d7";
      btn.addEventListener("click", () => {
        state.filters[f.key].delete(value);
        const cb = document.getElementById(`facet-${f.key}-${slug(value)}`);
        if (cb) cb.checked = false;
        render();
      });
      chip.appendChild(btn);
      wrap.appendChild(chip);
    }
  }
}

// ---------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------
function renderCards(papers) {
  const list = document.getElementById("paper-list");
  const empty = document.getElementById("empty-state");
  list.innerHTML = "";

  if (papers.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  for (const p of papers) list.appendChild(buildCard(p));
}

function buildCard(p) {
  const card = document.createElement("article");
  card.className = "paper-card";
  card.dataset.id = p.id;

  const venueLabel = p.venue
    ? `${p.venue}${p.year ? ` \u2019${String(p.year).slice(-2)}` : ""}`
    : (p.year ? String(p.year) : "");
  const titleHtml = p.links && p.links.paper
    ? `<a href="${escapeAttr(p.links.paper)}" target="_blank" rel="noopener">${escapeHtml(p._title)}</a>`
    : escapeHtml(p._title);

  const tagValues = [];
  const seen = new Set();
  for (const f of FACET_FIELDS) {
    for (const v of p[f.key]) {
      if (!seen.has(v)) { seen.add(v); tagValues.push({ key: f.key, value: v }); }
    }
  }

  const linksHtml = [
    p.links?.paper ? `<a href="${escapeAttr(p.links.paper)}" target="_blank" rel="noopener">paper &#8599;</a>` : "",
    p.links?.code ? `<a href="${escapeAttr(p.links.code)}" target="_blank" rel="noopener">code &#8599;</a>` : "",
    p.links?.talk ? `<a href="${escapeAttr(p.links.talk)}" target="_blank" rel="noopener">talk &#8599;</a>` : "",
  ].filter(Boolean).join("");

  const detailFieldsHtml = DETAIL_FIELDS
    .filter(f => p[f.key] && p[f.key].length)
    .map(f => `
      <div>
        <div class="more-field-label">${escapeHtml(f.label)}</div>
        <div class="card-tags">${p[f.key].map(v => `<span class="tag">${escapeHtml(v)}</span>`).join("")}</div>
      </div>`).join("");

  const reasoningHtml = buildReasoningHtml(p.classification_reasoning);

  card.innerHTML = `
    <div class="card-top">
      <h2 class="card-title">${titleHtml}</h2>
      ${venueLabel ? `<span class="venue-badge">${escapeHtml(venueLabel)}</span>` : ""}
    </div>
    ${p.authors && p.authors.length ? `<p class="card-authors">${escapeHtml(p.authors.join(", "))}</p>` : ""}
    ${p.summary ? `<p class="card-summary">${escapeHtml(p.summary)}</p>` : ""}
    <div class="card-tags">
      ${tagValues.map(t => `<span class="tag" data-facet="${escapeAttr(t.key)}" data-value="${escapeAttr(t.value)}">${escapeHtml(t.value)}</span>`).join("")}
    </div>
    ${linksHtml ? `<div class="card-links">${linksHtml}</div>` : ""}
    ${(detailFieldsHtml || reasoningHtml) ? `
      <details class="card-more">
        <summary>more detail</summary>
        <div class="more-body">
          ${detailFieldsHtml}
          ${reasoningHtml}
        </div>
      </details>` : ""}
    <div class="card-admin" ${isAdmin ? '' : 'style="display:none"'}>
      <button type="button" class="admin-btn edit-btn">edit</button>
      <button type="button" class="admin-btn delete-btn">delete</button>
    </div>
  `;

  card.querySelectorAll(".tag[data-facet]").forEach(tagEl => {
    tagEl.addEventListener("click", () => {
      const { facet, value } = tagEl.dataset;
      if (!state.filters[facet]) return;
      state.filters[facet].add(value);
      const cb = document.getElementById(`facet-${facet}-${slug(value)}`);
      if (cb) cb.checked = true;
      render();
    });
  });

  card.querySelector(".edit-btn").addEventListener("click", () => openModal(p.id));
  card.querySelector(".delete-btn").addEventListener("click", () => {
    if (!confirm(`Delete "${p._title}"? This can't be undone (unless you haven't exported yet).`)) return;
    allPapers = allPapers.filter(x => x.id !== p.id);
    dirty = true;
    updateDirtyIndicator();
    persistToServer();
    buildFacetGroupsDOM();
    render();
  });

  return card;
}

function buildReasoningHtml(reasoning) {
  if (!reasoning || Object.keys(reasoning).length === 0) return "";
  const groups = Object.entries(reasoning).map(([field, entries]) => {
    const label = [...FACET_FIELDS, ...DETAIL_FIELDS].find(f => f.key === field)?.label
      || field.replace(/_/g, " ");
    const items = Object.entries(entries)
      .map(([value, why]) => `<p class="reasoning-item"><b>${escapeHtml(value)}:</b> ${escapeHtml(why)}</p>`)
      .join("");
    return `<div><div class="more-field-label">why: ${escapeHtml(label)}</div>${items}</div>`;
  }).join("");
  return groups;
}

// ---------------------------------------------------------------------
// Top-level render
// ---------------------------------------------------------------------
function render() {
  const filtered = sortPapers(getFiltered());
  document.getElementById("results-count").innerHTML =
    `<span class="num">${filtered.length}</span> paper${filtered.length === 1 ? "" : "s"}`;
  renderActiveFilters();
  updateFacetCounts();
  renderCards(filtered);
}

function focusCard(id) {
  const el = [...document.querySelectorAll(".paper-card")].find(c => c.dataset.id === id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("just-saved");
  setTimeout(() => el.classList.remove("just-saved"), 1600);
}

// ---------------------------------------------------------------------
// Add / edit modal
// ---------------------------------------------------------------------
const modalEls = {};

function cacheModalEls() {
  modalEls.dialog = document.getElementById("paper-modal");
  modalEls.title = document.getElementById("modal-title");
  modalEls.form = document.getElementById("paper-form");
  modalEls.error = document.getElementById("form-error");
  modalEls.fTitle = document.getElementById("f-title");
  modalEls.fAuthors = document.getElementById("f-authors");
  modalEls.fVenue = document.getElementById("f-venue");
  modalEls.fYear = document.getElementById("f-year");
  modalEls.fPaperLink = document.getElementById("f-paper-link");
  modalEls.fCodeLink = document.getElementById("f-code-link");
  modalEls.fTalkLink = document.getElementById("f-talk-link");
  modalEls.fSummary = document.getElementById("f-summary");
  modalEls.fClassification = document.getElementById("f-classification");
  modalEls.deleteBtn = document.getElementById("modal-delete");
}

function classificationJsonFor(p) {
  const obj = {};
  for (const key of ALL_ARRAY_FIELDS) if (p[key] && p[key].length) obj[key] = p[key];
  if (p.classification_reasoning) obj.classification_reasoning = p.classification_reasoning;
  return Object.keys(obj).length ? JSON.stringify(obj, null, 2) : "";
}

function openModal(id = null) {
  editingId = id;
  modalEls.error.hidden = true;
  modalEls.error.textContent = "";

  if (id) {
    const p = allPapers.find(x => x.id === id);
    modalEls.title.textContent = "edit paper";
    modalEls.fTitle.value = p._title || "";
    modalEls.fAuthors.value = (p.authors || []).join(", ");
    modalEls.fVenue.value = p.venue || "";
    modalEls.fYear.value = p.year || "";
    modalEls.fPaperLink.value = p.links?.paper || "";
    modalEls.fCodeLink.value = p.links?.code || "";
    modalEls.fTalkLink.value = p.links?.talk || "";
    modalEls.fSummary.value = p.summary || "";
    modalEls.fClassification.value = classificationJsonFor(p);
    modalEls.deleteBtn.hidden = false;
  } else {
    modalEls.title.textContent = "add paper";
    modalEls.form.reset();
    modalEls.deleteBtn.hidden = true;
  }

  modalEls.dialog.showModal();
  modalEls.fTitle.focus();
}

function closeModal() {
  modalEls.dialog.close();
  editingId = null;
}

function onSaveModal() {
  const title = modalEls.fTitle.value.trim();
  if (!title) {
    showFormError("Title is required.");
    return;
  }

  let classification = {};
  const raw = modalEls.fClassification.value.trim();
  if (raw) {
    try {
      classification = JSON.parse(raw);
      if (typeof classification !== "object" || Array.isArray(classification)) throw new Error("must be a JSON object");
    } catch (e) {
      showFormError("Classification JSON is invalid: " + e.message);
      return;
    }
  }

  const year = modalEls.fYear.value ? Number(modalEls.fYear.value) : undefined;
  const paper = {
    id: editingId || undefined,
    title,
    authors: splitCsv(modalEls.fAuthors.value),
    venue: modalEls.fVenue.value.trim() || undefined,
    year,
    links: {
      paper: modalEls.fPaperLink.value.trim() || undefined,
      code: modalEls.fCodeLink.value.trim() || undefined,
      talk: modalEls.fTalkLink.value.trim() || undefined,
    },
    summary: modalEls.fSummary.value.trim() || undefined,
  };

  for (const key of ALL_ARRAY_FIELDS) {
    paper[key] = Array.isArray(classification[key]) ? classification[key] : [];
  }
  if (classification.classification_reasoning) {
    paper.classification_reasoning = classification.classification_reasoning;
  }

  if (!paper.id) paper.id = makeId(title, year);
  normalizePaper(paper);

  if (editingId) {
    const idx = allPapers.findIndex(p => p.id === editingId);
    if (idx !== -1) allPapers[idx] = paper;
  } else {
    // avoid id collisions with existing papers
    const existingIds = new Set(allPapers.map(p => p.id));
    let id = paper.id, n = 2;
    while (existingIds.has(id)) id = `${paper.id}-${n++}`;
    paper.id = id;
    allPapers.push(paper);
  }

  dirty = true;
  updateDirtyIndicator();
  persistToServer();
  buildFacetGroupsDOM();
  closeModal();
  resetFiltersAndSearch();
  render();
  focusCard(paper.id);
}

function onDeleteFromModal() {
  if (!editingId) return;
  const p = allPapers.find(x => x.id === editingId);
  if (!confirm(`Delete "${p?._title || "this paper"}"? This can't be undone (unless you haven't exported yet).`)) return;
  allPapers = allPapers.filter(x => x.id !== editingId);
  dirty = true;
  updateDirtyIndicator();
  persistToServer();
  buildFacetGroupsDOM();
  closeModal();
  render();
}

function showFormError(msg) {
  modalEls.error.textContent = msg;
  modalEls.error.hidden = false;
}

// ---------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------
function exportPapers() {
  const clean = allPapers.map(({ _title, _searchIndex, ...rest }) => rest);
  const blob = new Blob([JSON.stringify(clean, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "papers.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  dirty = false;
  updateDirtyIndicator();
}

// ---------------------------------------------------------------------
// Persist to server (auto-save papers.json to disk)
// ---------------------------------------------------------------------
async function persistToServer() {
  if (!isAdmin) {
    console.warn("Not in admin mode — save blocked.");
    return;
  }
  const clean = allPapers.map(({ _title, _searchIndex, ...rest }) => rest);
  try {
    const res = await fetch("/api/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Token": adminToken,
      },
      body: JSON.stringify(clean, null, 2),
    });
    const result = await res.json();
    if (result.ok) {
      dirty = false;
      updateDirtyIndicator();
      console.log(`papers.json saved (${result.count} papers)`);
    } else {
      console.error("Save failed:", result.error);
    }
  } catch (err) {
    console.error("Could not save to server:", err);
  }
}

function updateDirtyIndicator() {
  const el = document.getElementById("dirty-indicator");
  el.hidden = !dirty;
}

// ---------------------------------------------------------------------
// Global listeners
// ---------------------------------------------------------------------
function attachGlobalListeners() {
  document.getElementById("search-input").addEventListener("input", e => {
    state.search = e.target.value;
    render();
  });

  document.getElementById("sort-select").addEventListener("change", e => {
    state.sort = e.target.value;
    render();
  });

  const clearAll = () => {
    resetFiltersAndSearch();
    document.querySelectorAll('.facet-option input[type="checkbox"]').forEach(cb => cb.checked = false);
    render();
    closeSidebar(); // close drawer on mobile
  };
  document.getElementById("clear-all").addEventListener("click", clearAll);
  document.getElementById("empty-clear").addEventListener("click", clearAll);

  // --- Mobile sidebar drawer ---
  const sidebar = document.getElementById("sidebar");
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const sidebarOverlay = document.getElementById("sidebar-overlay");

  function openSidebar() {
    sidebar.classList.add("is-open");
    sidebarOverlay.classList.add("is-visible");
    document.body.style.overflow = "hidden"; // prevent background scroll
  }

  function closeSidebar() {
    sidebar.classList.remove("is-open");
    sidebarOverlay.classList.remove("is-visible");
    document.body.style.overflow = "";
  }

  sidebarToggle.addEventListener("click", () => {
    if (sidebar.classList.contains("is-open")) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });

  sidebarOverlay.addEventListener("click", closeSidebar);

  cacheModalEls();
  document.getElementById("add-paper-btn").addEventListener("click", () => openModal(null));
  document.getElementById("export-btn").addEventListener("click", exportPapers);
  document.getElementById("modal-cancel").addEventListener("click", closeModal);
  document.getElementById("modal-save").addEventListener("click", onSaveModal);
  modalEls.deleteBtn.addEventListener("click", onDeleteFromModal);
  modalEls.dialog.addEventListener("cancel", () => { editingId = null; });
  modalEls.dialog.addEventListener("click", e => {
    if (e.target === modalEls.dialog) closeModal(); // click on backdrop
  });

  // --- JSON Import Modal ---
  const jsonModal = document.getElementById("json-import-modal");
  const jsonTextarea = document.getElementById("json-import-textarea");
  const jsonError = document.getElementById("json-import-error");
  const jsonStatus = document.getElementById("json-status");
  const jsonCharCount = document.getElementById("json-char-count");
  const jsonEditorWrap = document.querySelector(".json-editor-wrap");
  const jsonPreview = document.getElementById("json-preview");
  const jsonPreviewContent = document.getElementById("json-preview-content");

  document.getElementById("import-json-btn").addEventListener("click", () => {
    jsonTextarea.value = "";
    jsonError.hidden = true;
    jsonError.textContent = "";
    jsonStatus.textContent = "ready";
    jsonStatus.className = "json-status";
    jsonCharCount.textContent = "0 chars";
    jsonEditorWrap.classList.remove("has-error", "is-valid");
    jsonPreview.hidden = true;
    jsonPreviewContent.innerHTML = "";
    jsonModal.showModal();
    jsonTextarea.focus();
  });

  document.getElementById("json-import-cancel").addEventListener("click", () => {
    jsonModal.close();
  });

  jsonModal.addEventListener("click", e => {
    if (e.target === jsonModal) jsonModal.close();
  });

  // Live validation on input
  let jsonValidationTimer = null;
  jsonTextarea.addEventListener("input", () => {
    const val = jsonTextarea.value;
    jsonCharCount.textContent = `${val.length} chars`;

    clearTimeout(jsonValidationTimer);
    jsonValidationTimer = setTimeout(() => {
      validateJsonInput(val);
    }, 300);
  });

  function validateJsonInput(val) {
    if (!val.trim()) {
      jsonStatus.textContent = "ready";
      jsonStatus.className = "json-status";
      jsonEditorWrap.classList.remove("has-error", "is-valid");
      jsonPreview.hidden = true;
      jsonError.hidden = true;
      return null;
    }

    try {
      const parsed = JSON.parse(val);
      if (typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Expected a JSON object, not an array or primitive");
      }
      const title = parsed.paper_title || parsed.title;
      if (!title) {
        throw new Error("Missing 'paper_title' or 'title' field");
      }
      jsonStatus.textContent = "valid JSON";
      jsonStatus.className = "json-status status-valid";
      jsonEditorWrap.classList.remove("has-error");
      jsonEditorWrap.classList.add("is-valid");
      jsonError.hidden = true;

      // Build preview
      renderJsonPreview(parsed);
      return parsed;
    } catch (e) {
      jsonStatus.textContent = e.message.length > 50 ? e.message.slice(0, 50) + "…" : e.message;
      jsonStatus.className = "json-status status-error";
      jsonEditorWrap.classList.remove("is-valid");
      jsonEditorWrap.classList.add("has-error");
      jsonPreview.hidden = true;
      return null;
    }
  }

  function renderJsonPreview(parsed) {
    const title = parsed.paper_title || parsed.title || "Untitled";
    const categories = parsed.primary_categories || [];
    const areas = parsed.research_areas || [];
    const mechanisms = parsed.ebpf_mechanisms || [];
    const allTags = [...new Set([...categories, ...areas, ...mechanisms])];

    // Count how many classification fields are populated
    let fieldCount = 0;
    for (const key of ALL_ARRAY_FIELDS) {
      if (Array.isArray(parsed[key]) && parsed[key].length > 0) fieldCount++;
    }
    if (parsed.classification_reasoning) fieldCount++;

    const metaParts = [];
    if (parsed.venue) metaParts.push(`<span class="preview-meta-item"><span class="meta-label">venue</span> ${escapeHtml(parsed.venue)}</span>`);
    if (parsed.year) metaParts.push(`<span class="preview-meta-item"><span class="meta-label">year</span> ${parsed.year}</span>`);
    if (parsed.authors && parsed.authors.length) metaParts.push(`<span class="preview-meta-item"><span class="meta-label">authors</span> ${parsed.authors.length}</span>`);

    jsonPreviewContent.innerHTML = `
      <h3 class="preview-title">${escapeHtml(title)}</h3>
      ${metaParts.length ? `<div class="preview-meta">${metaParts.join("")}</div>` : ""}
      ${allTags.length ? `<div class="preview-tags">${allTags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
      <div class="preview-field-count">${fieldCount} classification field${fieldCount !== 1 ? "s" : ""} detected</div>
    `;
    jsonPreview.hidden = false;
  }

  // Format button
  document.getElementById("json-format-btn").addEventListener("click", () => {
    const val = jsonTextarea.value.trim();
    if (!val) return;
    try {
      const parsed = JSON.parse(val);
      jsonTextarea.value = JSON.stringify(parsed, null, 2);
      jsonCharCount.textContent = `${jsonTextarea.value.length} chars`;
      validateJsonInput(jsonTextarea.value);
    } catch (e) {
      // Can't format invalid JSON — show error
      jsonStatus.textContent = "can't format: " + e.message.slice(0, 40);
      jsonStatus.className = "json-status status-error";
    }
  });

  // Clear button
  document.getElementById("json-clear-btn").addEventListener("click", () => {
    jsonTextarea.value = "";
    jsonCharCount.textContent = "0 chars";
    jsonStatus.textContent = "ready";
    jsonStatus.className = "json-status";
    jsonEditorWrap.classList.remove("has-error", "is-valid");
    jsonPreview.hidden = true;
    jsonError.hidden = true;
    jsonTextarea.focus();
  });

  // Import/Save
  document.getElementById("json-import-save").addEventListener("click", () => {
    const val = jsonTextarea.value.trim();
    if (!val) {
      jsonError.textContent = "Paste a JSON object to import.";
      jsonError.hidden = false;
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(val);
      if (typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Expected a JSON object, not an array or primitive");
      }
    } catch (e) {
      jsonError.textContent = "Invalid JSON: " + e.message;
      jsonError.hidden = false;
      return;
    }

    const title = parsed.paper_title || parsed.title;
    if (!title) {
      jsonError.textContent = "Missing required field: 'paper_title' or 'title'.";
      jsonError.hidden = false;
      return;
    }

    // Build paper object from the JSON
    const paper = { ...parsed };
    paper.title = title;
    if (!paper.id) paper.id = makeId(title, paper.year);

    // Ensure all array fields exist
    for (const key of ALL_ARRAY_FIELDS) {
      if (!Array.isArray(paper[key])) paper[key] = [];
    }

    normalizePaper(paper);

    // Avoid id collisions
    const existingIds = new Set(allPapers.map(p => p.id));
    let id = paper.id, n = 2;
    while (existingIds.has(id)) id = `${paper.id}-${n++}`;
    paper.id = id;

    allPapers.push(paper);
    dirty = true;
    updateDirtyIndicator();
    persistToServer();
    buildFacetGroupsDOM();
    jsonModal.close();
    resetFiltersAndSearch();
    render();
    focusCard(paper.id);

    // Show success toast
    showImportToast(title);
  });

  function showImportToast(title) {
    const toast = document.createElement("div");
    toast.className = "json-import-toast";
    toast.innerHTML = `<span class="toast-icon">&#10003;</span> imported "${escapeHtml(title.length > 40 ? title.slice(0, 40) + "…" : title)}"`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2600);
  }

  window.addEventListener("beforeunload", e => {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = "";
  });
}

// ---------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------
function uniqueSorted(arr) {
  return [...new Set(arr)].sort((a, b) => a.localeCompare(b));
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function splitCsv(s) {
  return String(s || "").split(",").map(x => x.trim()).filter(Boolean);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

loadPapers().catch(err => {
  document.getElementById("results-count").textContent = "couldn't load papers.json";
  console.error(err);
});
