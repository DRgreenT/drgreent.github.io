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
  // ---------------------------------------------------------------------------
  // Auth + shell
  // ---------------------------------------------------------------------------

  const session = await getSession();

  viewRoot.innerHTML = renderShell({
    title: "Banks info",
    subtitle: "Search & browse.",
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

  // ---------------------------------------------------------------------------
  // Load base dataset once
  // ---------------------------------------------------------------------------

  const { data: allRows, error } = await loadAllRows();
  if (error) {
    bodyRoot.querySelector("#rows").innerHTML = `<tr><td colspan="99">Error: ${esc(error.message)}</td></tr>`;
    return;
  }

  // ---------------------------------------------------------------------------
  // Notes cache (used for table counts)
  // IMPORTANT: This must be refreshable after CRUD actions.
  // ---------------------------------------------------------------------------

  let notesByBankId = new Map();

  /**
   * Refreshes the notes cache for all currently loaded rows.
   * This is used to keep the "Notes (x)" counters in the table correct after CRUD.
   */
  async function refreshNotesCache() {
    const bankIds = (allRows || []).map((r) => r.id);

    // Single request (fix: removed duplicate call)
    const { data: allNotes, error: notesErr } = await loadNotesForBankIds(bankIds);
    if (notesErr) {
      // Keep UI usable even if notes fail
      notesByBankId = new Map();
      return;
    }

    notesByBankId = groupNotesByBankId(allNotes || []);
  }

  await refreshNotesCache();

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  /**
   * Renders the table body for the given filtered rows and wires row actions.
   * @param {Array<Object>} filteredRows
   */
  function render(filteredRows) {
    // Header count
    const countEl = bodyRoot.querySelector("#count");
    if (countEl) countEl.textContent = `${filteredRows.length} entr${filteredRows.length === 1 ? "y" : "ies"}`;

    const rowsEl = bodyRoot.querySelector("#rows");
    rowsEl.innerHTML = renderCompactRows(filteredRows, notesByBankId);

    // Notes button
    rowsEl.querySelectorAll("[data-notes]").forEach((btn) => {
      btn.addEventListener("click", () => openNotes(btn.getAttribute("data-notes")));
    });

    // Row expand/collapse
    rowsEl.querySelectorAll("[data-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => toggleDetails(btn.getAttribute("data-toggle")));
    });

    // Copy phone to clipboard
    rowsEl.querySelectorAll("[data-copy-phone]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        // Don't trigger row interactions / table selection
        e.preventDefault();
        e.stopPropagation();

        const phone = btn.getAttribute("data-copy-phone") || "";
        if (!phone) return;

        const ok = await copyToClipboard(phone);

        // Tiny feedback without changing layout
        const img = btn.querySelector("img");
        if (!img) return;

        const oldOpacity = img.style.opacity;
        img.style.opacity = ok ? "1" : "0.35";
        setTimeout(() => (img.style.opacity = oldOpacity), 650);
      });
    });
  }

  /**
   * Applies current filter state to the loaded dataset and triggers a re-render.
   */
  function applyFiltersAndRender() {
    const filtered = (allRows || []).filter((r) => passesFilters(r, FLT));
    render(filtered);
  }

  wireFilters({ FLT, onChange: applyFiltersAndRender });
  refreshBtn?.addEventListener("click", applyFiltersAndRender);

  // Initial render
  applyFiltersAndRender();

  // ---------------------------------------------------------------------------
  // Expandable details row
  // ---------------------------------------------------------------------------

  /**
   * Toggles the expanded details row for the given bank id.
   * Keeps layout intact; only switches hidden attribute and button text.
   * @param {string|number} bankId
   */
  function toggleDetails(bankId) {
    const safeId = cssEscape(bankId);
    const detailsTr = bodyRoot.querySelector(`[data-details="${safeId}"]`);
    const btn = bodyRoot.querySelector(`[data-toggle="${safeId}"]`);
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

  // ---------------------------------------------------------------------------
  // Notes modal
  // ---------------------------------------------------------------------------

  let activeBankId = null;

  /**
   * Opens the notes modal for a given bank id and loads notes for that bank.
   * @param {string|number} bankId
   */
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

  /**
   * Closes the notes modal and clears the active bank id.
   */
  function closeNotes() {
    const modal = bodyRoot.querySelector("#notesModal");
    modal.style.display = "none";
    activeBankId = null;
  }

  /**
   * Loads notes for the currently active bank id and renders them into the modal.
   * Always fetches fresh data from backend to avoid stale modal content.
   */
  async function loadAndRenderNotes() {
    const modal = bodyRoot.querySelector("#notesModal");
    const list = modal.querySelector("#notesList");
    const title = modal.querySelector("#notesTitle");

    if (!activeBankId) return;

    const row = (allRows || []).find((r) => String(r.id) === String(activeBankId));
    title.textContent = `Notes — ${row ? esc(row.bankname || "") : ""}`;

    const { data: notes, error: err } = await loadNotesForBankId(activeBankId);
    if (err) {
      list.innerHTML = `<div class="small">Error loading notes: ${esc(err.message)}</div>`;
      return;
    }

    list.innerHTML = (notes || []).map((n) => noteItemHtml(n)).join("") || `<div class="small">No notes yet.</div>`;

    // Wire edit/delete per note
    list.querySelectorAll("[data-note-edit]").forEach((btn) => {
      btn.addEventListener("click", () => startEdit(btn.getAttribute("data-note-edit")));
    });
    list.querySelectorAll("[data-note-del]").forEach((btn) => {
      btn.addEventListener("click", () => doDelete(btn.getAttribute("data-note-del")));
    });
  }

  /**
   * Creates the HTML for a single note card item in the modal.
   * @param {Object} n Note record
   * @returns {string} HTML
   */
  function noteItemHtml(n) {
    const when = n.updated_at || n.created_at;
    const whenTxt = when ? new Date(when).toLocaleString() : "";

    return `
      <div class="card" style="border-radius:12px; padding:10px; margin-bottom:10px;">
        <div class="small" style="display:flex; justify-content:space-between; gap:10px;">
          <span>${esc(whenTxt)}</span>
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

  /**
   * Creates a new note for the active bank id.
   * After creation, refreshes modal and table counters.
   * @param {string} noteText
   */
  async function doCreate(noteText) {
    if (!activeBankId) return;

    const { error: err } = await addNote(activeBankId, noteText);
    if (err) return alert(err.message || "Failed to add note.");

    await loadAndRenderNotes();

    // Fix: counters in table must reflect changes
    await refreshNotesCache();
    applyFiltersAndRender();
  }

  /**
   * Starts editing an existing note by loading it and populating the textarea.
   * @param {string|number} noteId
   */
  function startEdit(noteId) {
    const modal = bodyRoot.querySelector("#notesModal");
    if (!activeBankId) return;

    // Re-fetch notes and find the note by id (keeps editing always fresh)
    (async () => {
      const { data: notes } = await loadNotesForBankId(activeBankId);
      const n = (notes || []).find((x) => String(x.id) === String(noteId));
      if (!n) return;

      modal.querySelector("#noteText").value = n.note_text || "";
      modal.querySelector("#saveNoteBtn").textContent = "Update note";
      modal.querySelector("#saveNoteBtn").setAttribute("data-editing", noteId);
    })();
  }

  /**
   * Updates a note by id.
   * After update, refreshes modal and table counters.
   * @param {string|number} noteId
   * @param {string} noteText
   */
  async function doUpdate(noteId, noteText) {
    const { error: err } = await updateNote(noteId, noteText);
    if (err) return alert(err.message || "Failed to update note.");

    await loadAndRenderNotes();

    // Fix: counters in table must reflect changes
    await refreshNotesCache();
    applyFiltersAndRender();
  }

  /**
   * Deletes a note by id (with confirm).
   * After delete, refreshes modal and table counters.
   * @param {string|number} noteId
   */
  async function doDelete(noteId) {
    if (!confirm("Delete this note?")) return;

    const { error: err } = await deleteNote(noteId);
    if (err) return alert(err.message || "Failed to delete note.");

    await loadAndRenderNotes();

    // Fix: counters in table must reflect changes
    await refreshNotesCache();
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

/**
 * Keys that are shown in the compact (default) table row.
 * All other schema columns are shown inside the expandable details area.
 */
const DEFAULT_KEYS = [
  "bank_country",
  "bankname",
  "ica_number",
  "bankwebsite",
  "cardtype",
  "ems_status",
  "service_provider_name",
  "phone_number",
  "info",
];

/**
 * Builds the compact table skeleton (header + empty tbody).
 * Layout/styles remain unchanged.
 * @returns {string} HTML
 */
function buildCompactTableUI() {
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
              <th>Country</th>
              <th>Name</th>
              <th>ICA</th>
              <th style="width:70px;">Website</th>
              <th>Cards</th>
              <th>EMS</th>
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

/**
 * Renders all rows (main + expandable details row) as HTML.
 * Uses notesByBankId map to display the note counters.
 *
 * @param {Array<Object>} list Bank rows
 * @param {Map<any, Array<Object>>} notesByBankId Map(bankId -> notes[])
 * @returns {string} HTML
 */
function renderCompactRows(list, notesByBankId) {
  const extraColsKeys = COLUMNS.map((c) => c.key).filter((k) => !DEFAULT_KEYS.includes(k));
  const extraCols = COLUMNS.filter((c) => extraColsKeys.includes(c.key));

  return (list || [])
    .map((r) => {
      const cnt = notesByBankId.get(r.id)?.length || 0;

      const website = (r.bankwebsite || "").trim();
      const websiteCell = website ? `<a href="${esc(website)}" target="_blank" rel="noopener">Link</a>` : "";

      // EMS status is restricted to: Both / Yes / No.
      const emsCell = esc(r.ems_status || "");

      const phone = (r.phone_number || "").trim();

      // Only show copy icon if phone exists
      const phoneCell = phone
        ? `
          <span style="vertical-align: middle; font-size:medium;">${esc(phone)}</span>
          <button
            type="button"
            class="btn btnRow btnRow--ghost"
            data-copy-phone="${esc(phone)}"
            title="Copy phone number"
            aria-label="Copy phone number"
            style="margin-left:8px; padding:3px 8px; line-height:1; vertical-align:middle;"
          >
            <img
              src="/src/copy.png"
              alt="Copy"
              style="width:14px; height:14px; vertical-align:middle; display:inline-block;"
            />
          </button>
        `
        : "";

      const mainRow = `
      <tr>
        <td style="vertical-align: middle;">${esc(r.bank_country || "")}</td>
        <td style="vertical-align: middle;">${esc(r.bankname || "")}</td>
        <td style="vertical-align: middle;" class="mono">${esc(r.ica_number || "")}</td>
        <td style="vertical-align: middle;">${websiteCell}</td>
        <td style="vertical-align: middle;">${esc(r.cardtype || "")}</td>
        <td style="vertical-align: middle;">${emsCell}</td>
        <td style="vertical-align: middle;">${esc(r.service_provider_name || "")}</td>
        <td style="vertical-align: middle;" class="mono">${phoneCell}</td>
        <td style="vertical-align: middle;">${esc(r.info || "")}</td>
        <td>
          <button class="btn btnRow" type="button" data-notes="${esc(r.id)}">Notes (${cnt})</button>
        </td>
        <td>
          <button class="btn btnRow btnRow--more" type="button" data-toggle="${esc(r.id)}">More</button>
        </td>
      </tr>
    `;

      const detailsCards = extraCols
        .map((c) => {
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
    })
    .join("");
}

/**
 * Formats a raw cell value based on schema column type.
 * - url: renders as clickable link
 * - default: HTML-escapes and returns as plain text
 *
 * @param {Object} col Column schema object
 * @param {*} raw Raw value
 * @returns {string} HTML-safe string
 */
function formatCellValue(col, raw) {
  if (raw === null || raw === undefined) return "";
  if (col.type === "url") {
    const u = String(raw || "").trim();
    return u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>` : "";
  }
  return esc(String(raw));
}

/**
 * Escapes a value for usage inside querySelector attribute selectors.
 * Uses native CSS.escape if available, otherwise a minimal fallback.
 *
 * @param {string|number} v
 * @returns {string}
 */
function cssEscape(v) {
  const s = String(v);
  if (window.CSS?.escape) return window.CSS.escape(s);

  // Fallback: escape characters that commonly break attribute selectors
  return s.replace(/["\\\]\n\r]/g, "\\$&");
}

/**
 * Copies given text to clipboard.
 * Uses navigator.clipboard when available; falls back to textarea + execCommand.
 *
 * @param {string} text
 * @returns {Promise<boolean>} true if copy likely succeeded
 */
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    // Fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return !!ok;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------
 * Notes modal markup + minimal CSS (keeps existing look)
 * ------------------------------------------------------------------ */

/**
 * Returns the notes modal HTML markup. (Hidden by default)
 * @returns {string} HTML
 */
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

/**
 * Returns minimal CSS required for the modal (keeps existing look).
 * @returns {string} HTML <style> block
 */
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
        background: rgba(0,0,0,.8);
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
