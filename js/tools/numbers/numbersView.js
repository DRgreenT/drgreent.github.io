import { getSession } from "../../lib/supabaseClient.js";
import { esc } from "../../lib/utils.js";
import {
  renderShell,
  wireAuth,
  buildFiltersUI,
  getFilters,
  wireFilters,
  passesFilters,
  loadAllRows,
  adminLinkVisible,
  loadNotesForBankIds,
  loadNotesForBankId,
  groupNotesByBankId,
  addNote,
  updateNote,
  deleteNote,
} from "./numbers.shared.js";
import { COLUMNS } from "./numbers.schema.js";

/**
 * Numbers (non-admin) view
 *
 * Requirements:
 * - Keep the existing layout + look (sidebar, cards, etc.) untouched.
 * - Default table shows only a compact column set (in a fixed order).
 * - Remaining fields are revealed by expanding the row (button at end of row).
 * - Notes button stays in the default column set.
 */
export async function renderNumbersView(viewRoot) {
  const session = await getSession();

  viewRoot.innerHTML = renderShell({
    title: "Numbers",
    subtitle: "Search & browse. Notes are available for signed-in users.",
    session,
  });

  const { refreshBtn } = await wireAuth({
    root: viewRoot,
    onAuthedRerender: () => renderNumbersView(viewRoot),
  });

  const bodyRoot = viewRoot.querySelector("#bodyRoot");

  // Keep the existing filters UI (global search + per-column filters)
  const showAdminLink = await adminLinkVisible();

  bodyRoot.innerHTML = `
    ${buildFiltersUI({ showAdminLink })}
    ${buildCompactTableUI()}
    ${notesModalHtml()}
    ${notesModalCss()}
  `;

  const FLT = getFilters(viewRoot);

  // Load full dataset once, then render on filter changes.
  const { data: allRows, error } = await loadAllRows();
  if (error) {
    bodyRoot.querySelector("#rows").innerHTML = `<tr><td colspan="99">Error: ${esc(error.message)}</td></tr>`;
    return;
  }

  // Notes counts (1 query for all visible bank ids)
  const bankIds = (allRows || []).map(r => r.id);
  const { data: allNotes, error: notesErr } = await loadNotesForBankIds(bankIds);
  const notesByBankId = groupNotesByBankId(allNotes || []);

  function render(filteredRows) {
    // Header count
    const countEl = bodyRoot.querySelector("#count");
    if (countEl) countEl.textContent = `${filteredRows.length} entr${filteredRows.length === 1 ? "y" : "ies"}`;

    const rowsEl = bodyRoot.querySelector("#rows");
    rowsEl.innerHTML = renderCompactRows(filteredRows, notesByBankId);

    // Notes
    rowsEl.querySelectorAll("[data-notes]").forEach((btn) => {
      btn.addEventListener("click", () => openNotes(btn.getAttribute("data-notes")));
    });

    // Row expand/collapse
    rowsEl.querySelectorAll("[data-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => toggleDetails(btn.getAttribute("data-toggle")));
    });
  }

  function applyFiltersAndRender() {
    const filtered = (allRows || []).filter((r) => passesFilters(r, FLT));
    render(filtered);
  }

  wireFilters({ FLT, onChange: applyFiltersAndRender });
  refreshBtn?.addEventListener("click", applyFiltersAndRender);

  // Initial render
  applyFiltersAndRender();

  // ---------------------------
  // Expandable details row
  // ---------------------------

  function toggleDetails(bankId) {
    const detailsTr = bodyRoot.querySelector(`[data-details="${cssEscape(bankId)}"]`);
    const btn = bodyRoot.querySelector(`[data-toggle="${cssEscape(bankId)}"]`);
    if (!detailsTr || !btn) return;

    const isHidden = detailsTr.hasAttribute("hidden");
    if (isHidden) {
      detailsTr.removeAttribute("hidden");
      btn.textContent = "Less";
    } else {
      detailsTr.setAttribute("hidden", "");
      btn.textContent = "More";
    }
  }

  // ---------------------------
  // Notes modal
  // ---------------------------

  let activeBankId = null;

  function openNotes(bankId) {
    activeBankId = bankId;
    const modal = bodyRoot.querySelector("#notesModal");
    modal.style.display = "flex";
    modal.querySelector("#noteText").value = "";
    modal.querySelector("#notesList").innerHTML = "";
    modal.querySelector("#notesTitle").textContent = `Notes`;

    // Load notes for the selected bank id
    loadAndRenderNotes();
  }

  function closeNotes() {
    const modal = bodyRoot.querySelector("#notesModal");
    modal.style.display = "none";
    activeBankId = null;
  }

  async function loadAndRenderNotes() {
    const modal = bodyRoot.querySelector("#notesModal");
    const list = modal.querySelector("#notesList");
    const title = modal.querySelector("#notesTitle");

    if (!activeBankId) return;
    const row = (allRows || []).find(r => String(r.id) === String(activeBankId));
    title.textContent = `Notes — ${row ? esc(row.bankname || "") : ""}`;

    // Fetch per-bank notes (keeps modal always fresh)
    const { data: notes, error: err } = await loadNotesForBankId(activeBankId);
    if (err) {
      list.innerHTML = `<div class="small">Error loading notes: ${esc(err.message)}</div>`;
      return;
    }

    list.innerHTML = (notes || []).map(n => noteItemHtml(n)).join("") || `<div class="small">No notes yet.</div>`;

    // Wire edit/delete per note
    list.querySelectorAll("[data-note-edit]").forEach(btn => {
      btn.addEventListener("click", () => startEdit(btn.getAttribute("data-note-edit")));
    });
    list.querySelectorAll("[data-note-del]").forEach(btn => {
      btn.addEventListener("click", () => doDelete(btn.getAttribute("data-note-del")));
    });
  }

  function noteItemHtml(n) {
    const when = n.updated_at || n.created_at;
    return `
      <div class="card" style="border-radius:12px; padding:10px; margin-bottom:10px;">
        <div class="small" style="display:flex; justify-content:space-between; gap:10px;">
          <span>${esc(new Date(when).toLocaleString())}</span>
          <span class="mono">${esc(n.created_by || "")}</span>
        </div>
        <div style="margin-top:8px; white-space:pre-wrap;">${esc(n.note_text || "")}</div>
        <div class="noteActions" style="margin-top:10px;">
          <button class="btn btnRow btnRow--ghost" type="button" data-note-edit="${esc(n.id)}">Edit</button>
          <button class="btn btnRow btnRow--ghost" type="button" data-note-del="${esc(n.id)}">Delete</button>
        </div>
      </div>
    `;
  }

  async function doCreate(noteText) {
    if (!activeBankId) return;
    const { error: err } = await addNote(activeBankId, noteText);
    if (err) return alert(err.message || "Failed to add note.");
    await loadAndRenderNotes();
    applyFiltersAndRender(); // refresh counts in table
  }

  function startEdit(noteId) {
    const modal = bodyRoot.querySelector("#notesModal");

    // Re-fetch notes and find the note by id.
    // This avoids having to embed the full note text into the DOM.
    (async () => {
      const { data: notes } = await loadNotesForBankId(activeBankId);
      const n = (notes || []).find(x => String(x.id) === String(noteId));
      if (!n) return;

      modal.querySelector("#noteText").value = n.note_text || "";
      modal.querySelector("#saveNoteBtn").textContent = "Update note";
      modal.querySelector("#saveNoteBtn").setAttribute("data-editing", noteId);
    })();
  }

  async function doUpdate(noteId, noteText) {
    const { error: err } = await updateNote(noteId, noteText);
    if (err) return alert(err.message || "Failed to update note.");
    await loadAndRenderNotes();
    applyFiltersAndRender();
  }

  async function doDelete(noteId) {
    if (!confirm("Delete this note?")) return;
    const { error: err } = await deleteNote(noteId);
    if (err) return alert(err.message || "Failed to delete note.");
    await loadAndRenderNotes();
    applyFiltersAndRender();
  }

  // Wire modal buttons
  (() => {
    const modal = bodyRoot.querySelector("#notesModal");
    const closeBtn = modal.querySelector("#closeNotesBtn");
    const saveBtn = modal.querySelector("#saveNoteBtn");
    const noteText = modal.querySelector("#noteText");

    closeBtn.addEventListener("click", closeNotes);
    modal.addEventListener("click", (e) => {
      if (e.target?.id === "notesModal") closeNotes();
    });

    saveBtn.addEventListener("click", async () => {
      const editingId = saveBtn.getAttribute("data-editing");
      const txt = noteText.value || "";

      if (editingId) {
        await doUpdate(editingId, txt);
        saveBtn.removeAttribute("data-editing");
        saveBtn.textContent = "Add note";
        noteText.value = "";
      } else {
        await doCreate(txt);
        noteText.value = "";
      }
    });
  })();
}

/* ------------------------------------------------------------------
 * Compact table (non-admin)
 * ------------------------------------------------------------------ */

const DEFAULT_KEYS = [
  "bank_country",
  "bankname",
  "ica_number",
  "bankwebsite",
  "cardtype",
  "isems_number",
  "service_provider_name",
  "phone_number",
  "info",
];

function buildCompactTableUI() {
  // Keep the same container markup that buildNumbersTable uses (card + tableWrap),
  // but render a compact header set required by the user.
  return `
    <div class="card" style="border-radius:14px; overflow:hidden;">
      <div class="cardHead">
        <strong>List</strong>
        <span id="count" style="color:rgba(255,255,255,.68); font-size:12px;"></span>
      </div>
      <div class="tableWrap">
        <table class="table">
          <thead>
            <tr>
              <th>Bank Country</th>
              <th>Name</th>
              <th>ICA</th>
              <th style="width:70px;">Link</th>
              <th>Card type</th>
              <th style="width:70px;">EMS</th>
              <th>Service provider</th>
              <th>Phone</th>
              <th>Info</th>
              <th style="width:140px;">Notes</th>
              <th style="width:90px;"></th>
            </tr>
          </thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
    </div>
  `;
}

function renderCompactRows(list, notesByBankId) {
  const extraColsKeys = COLUMNS
    .map(c => c.key)
    .filter(k => !DEFAULT_KEYS.includes(k));

  const extraCols = COLUMNS.filter(c => extraColsKeys.includes(c.key));

  return (list || []).map(r => {
    const cnt = notesByBankId.get(r.id)?.length || 0;

    const website = (r.bankwebsite || "").trim();
    const websiteCell = website
      ? `<a href="${esc(website)}" target="_blank" rel="noopener">Link</a>`
      : "";

    const emsCell = r.isems_number ? "Yes" : "No";

    // Default row (compact columns)
    const mainRow = `
      <tr>
        <td>${esc(r.bank_country || "")}</td>
        <td>${esc(r.bankname || "")}</td>
        <td class="mono">${esc(r.ica_number || "")}</td>
        <td>${websiteCell}</td>
        <td>${esc(r.cardtype || "")}</td>
        <td>${emsCell}</td>
        <td>${esc(r.service_provider_name || "")}</td>
        <td class="mono">${esc(r.phone_number || "")}</td>
        <td>${esc(r.info || "")}</td>
        <td>
          <button class="btn btnRow" type="button" data-notes="${esc(r.id)}">Notes (${cnt})</button>
        </td>
        <td>
          <button class="btn btnRow btnRow--more" type="button" data-toggle="${esc(r.id)}">More</button>
        </td>
      </tr>
    `;

    // Details row (collapsed by default)
    const detailsCards = extraCols
      .map(c => {
        const raw = r[c.key];
        const val = formatCellValue(c, raw);
        if (val === "") return "";
        return `
          <div class="kv">
            <div class="k">${esc(c.label)}</div>
            <div class="v">${val}</div>
          </div>
        `;
      })
      .filter(Boolean)
      .join("");

    const detailsRow = `
      <tr class="detailsRow" data-details="${esc(r.id)}" hidden>
        <td colspan="11">
          <div class="detailsBox">
            <div class="detailsGrid">
              ${detailsCards || `<div class="small">No additional details.</div>`}
            </div>
          </div>
        </td>
      </tr>
    `;

    return mainRow + detailsRow;
  }).join("");
}

function formatCellValue(col, raw) {
  if (raw === null || raw === undefined) return "";
  if (col.type === "bool") return raw ? "Yes" : "No";
  if (col.type === "url") {
    const u = String(raw || "").trim();
    return u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>` : "";
  }
  return esc(String(raw));
}

/**
 * CSS.escape polyfill (enough for our ids)
 * We use it for querySelector attributes.
 */
function cssEscape(v) {
  return String(v).replace(/["\\]/g, "\\$&");
}

/* ------------------------------------------------------------------
 * Notes modal markup + minimal CSS (keeps existing look)
 * ------------------------------------------------------------------ */

function notesModalHtml() {
  return `
    <div id="notesModal" class="modal" style="display:none;">
      <div class="modalInner card" style="width:min(920px, 92vw); max-height: 88vh; overflow:auto;">
        <div class="cardHead" style="position:sticky; top:0; background:rgba(0,0,0,.25); backdrop-filter: blur(6px); z-index: 1;">
          <strong id="notesTitle">Notes</strong>
          <div style="display:flex; gap:10px; align-items:center;">
            <button id="closeNotesBtn" class="btn btnRow btnRow--ghost" type="button">Close</button>
          </div>
        </div>

        <div style="padding:14px;">
          <div class="grid2" style="align-items:start;">
            <div>
              <div class="small" style="margin-bottom:6px;">Write a note</div>
              <textarea id="noteText" placeholder="Type your note here..."></textarea>
              <div style="display:flex; justify-content:flex-end; margin-top:10px;">
                <button id="saveNoteBtn" class="btn" type="button">Add note</button>
              </div>
            </div>

            <div>
              <div class="small" style="margin-bottom:6px;">Existing notes</div>
              <div id="notesList"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function notesModalCss() {
  return `
    <style>
      .modal{
        position:fixed;
        inset:0;
        display:flex;
        justify-content:center;
        align-items:flex-start;
        padding: 40px 10px;
        background: rgba(0,0,0,.55);
        z-index: 50;
      }
      .noteActions{
        display:flex;
        gap:10px;
        flex-wrap:wrap;
        justify-content:flex-end;
        align-items:center;
      }
    </style>
  `;
}
