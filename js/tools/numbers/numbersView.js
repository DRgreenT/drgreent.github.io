import { getSession } from "../../lib/supabaseClient.js";
import { esc } from "../../lib/utils.js";
import {
  renderShell,
  wireAuth,
  buildFiltersUI,
  buildTableUI,
  getFilters,
  wireFilters,
  passesFilters,
  loadAllRows,
  renderRows,
  adminLinkVisible,
  loadNotesForBankIds,
  groupNotesByBankId,
  addNote,
  updateNote,
  deleteNote,
} from "./numbers.shared.js";

/**
 * Render the Numbers public tool into the given root element.
 * Includes filtering, search, and the notes modal.
 */
export async function renderNumbersView(viewRoot) {
  viewRoot.innerHTML = "Loading...";

  const session = await getSession();

  viewRoot.innerHTML = renderShell({
    title: "Bank Numbers",
    subtitle: "Browse and search. Notes are shared with all users.",
    session,
  });

  await wireAuth({
    root: viewRoot,
    onAuthedRerender: () => renderNumbersView(viewRoot),
    signupHint: "If you just signed up, you might need to confirm your email first.",
  });

  const slot = viewRoot.querySelector("#slot");

  function notesModalHtml() {
    return `
      <div id="notesModal" class="modal" style="display:none;">
        <div class="modalInner card" style="max-width:980px; margin:0 auto;">
          <div class="cardHead">
            <strong id="notesTitle">Notes</strong>
            <button class="btn" id="notesClose" type="button">Close</button>
          </div>

          <div class="cardBody" style="gap:10px;">
            <div style="color:rgba(255,255,255,.68); font-size:12px;">
              Notes are visible to all users. You can edit/delete only the notes you created.
            </div>

            <div id="notesList" style="display:grid; gap:10px;"></div>

            <div style="display:grid; gap:8px;">
              <textarea class="input" id="noteNewText" style="min-height:80px;" placeholder="Write a note..."></textarea>
              <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                <button class="btn" id="noteAddBtn" type="button">Add note</button>
                <span id="noteMsg" style="color:rgba(255,255,255,.68); font-size:12px;"></span>
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
          position:fixed; inset:0;
          background: rgba(0,0,0,.55);
          padding: 24px;
          z-index: 9999;
          overflow:auto;
        }
        .modalInner{margin-top: 10px;}
      </style>
    `;
  }

  slot.innerHTML = `
    <div style="display:grid; gap:14px;">
      ${buildFiltersUI()}
      <div id="tableBox">${buildTableUI({ actions: false, extraHeaderHtml: "Notes" })}</div>
      <div id="adminLinkBox" style="display:none;"></div>
      ${notesModalHtml()}
      ${notesModalCss()}
    </div>
  `;

  const adminLinkBox = slot.querySelector("#adminLinkBox");
  if (adminLinkBox) {
    const showAdmin = await adminLinkVisible();
    if (showAdmin) {
      adminLinkBox.style.display = "block";
      adminLinkBox.innerHTML = `
        <div class="card" style="border-radius:14px;">
          <div class="cardHead"><strong>Admin</strong></div>
          <div class="cardBody">
            <a href="./admin.html">Open admin editor</a>
          </div>
        </div>
      `;
    }
  }

  const notesModal = slot.querySelector("#notesModal");
  const notesClose = slot.querySelector("#notesClose");
  const notesTitle = slot.querySelector("#notesTitle");
  const notesList = slot.querySelector("#notesList");
  const noteNewText = slot.querySelector("#noteNewText");
  const noteAddBtn = slot.querySelector("#noteAddBtn");
  const noteMsg = slot.querySelector("#noteMsg");

  let list = [];
  let filtered = [];
  let notesByBankId = new Map();
  let activeNotesBankId = null;
  let activeNotesBankName = "";

  notesClose?.addEventListener("click", () => {
    if (notesModal) notesModal.style.display = "none";
    activeNotesBankId = null;
    activeNotesBankName = "";
    if (notesList) notesList.innerHTML = "";
    if (noteMsg) noteMsg.textContent = "";
    if (noteNewText) noteNewText.value = "";
  });

  function openNotes(bankId, bankName) {
    activeNotesBankId = bankId;
    activeNotesBankName = bankName || "";
    if (notesTitle) notesTitle.textContent = `Notes — ${esc(activeNotesBankName)}`;
    if (notesModal) notesModal.style.display = "block";
    reloadNotesFor(bankId);
  }

  async function reloadNotesFor(bankId) {
    if (!notesList || !noteMsg) return;
    noteMsg.textContent = "";
    notesList.innerHTML = "";

    const notes = notesByBankId.get(bankId) || [];
    const s = await getSession();
    const myUserId = s?.user?.id;

    notesList.innerHTML = notes.length
      ? notes.map(n => {
          const when = new Date(n.created_at).toLocaleString();
          const updated = n.updated_at ? ` • updated: ${new Date(n.updated_at).toLocaleString()}` : "";
          const mine = myUserId && n.created_by === myUserId;

          const editUi = mine
            ? `
              <div class="noteActions">
                <button class="btnRow" type="button" data-editnote="${esc(n.id)}">Edit</button>
                <button class="btnRow btnRowDanger" type="button" data-delnote="${esc(n.id)}">Delete</button>
              </div>
            `
            : "";

          return `
            <div class="card" style="border-radius:14px;">
              <div class="cardBody" style="gap:8px;">
                <div class="noteMeta">
                  <span>${esc(when)}${esc(updated)}</span>
                  ${editUi}
                </div>

                <div data-noteview="${esc(n.id)}">${esc(n.note_text)}</div>

                <div data-noteeditwrap="${esc(n.id)}" style="display:none; gap:10px;">
                  <textarea data-noteedit="${esc(n.id)}" style="min-height:80px;">${esc(n.note_text)}</textarea>
                  <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <button class="btnRow" type="button" data-savenote="${esc(n.id)}">Save</button>
                    <button class="btnRow" type="button" data-cancelnote="${esc(n.id)}">Cancel</button>
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join("")
      : `<div style="color:rgba(255,255,255,.68); font-size:12px;">No notes yet.</div>`;

    // Wire edit/delete
    notesList.querySelectorAll("[data-editnote]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.editnote;
        notesList.querySelector(`[data-noteview="${id}"]`)?.setAttribute("style", "display:none;");
        notesList.querySelector(`[data-noteeditwrap="${id}"]`)?.setAttribute("style", "display:grid; gap:10px;");
      });
    });

    notesList.querySelectorAll("[data-cancelnote]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.cancelnote;
        notesList.querySelector(`[data-noteview="${id}"]`)?.setAttribute("style", "display:block;");
        notesList.querySelector(`[data-noteeditwrap="${id}"]`)?.setAttribute("style", "display:none;");
      });
    });

    notesList.querySelectorAll("[data-savenote]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.savenote;
        const ta = notesList.querySelector(`[data-noteedit="${id}"]`);
        const text = (ta?.value || "").trim();
        if (!text) return;

        const s2 = await getSession();
        const res2 = await updateNote(id, text, s2?.user?.id);
        if (res2.error) {
          noteMsg.textContent = res2.error.message || "Failed to update note.";
          return;
        }
        await load(); // refresh notes map + list
        await reloadNotesFor(bankId);
      });
    });

    notesList.querySelectorAll("[data-delnote]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.delnote;
        const ok = confirm("Delete note?");
        if (!ok) return;
        const res2 = await deleteNote(id);
        if (res2.error) {
          noteMsg.textContent = res2.error.message || "Failed to delete note.";
          return;
        }
        await load();
        await reloadNotesFor(bankId);
      });
    });
  }

  noteAddBtn?.addEventListener("click", async () => {
    if (!noteMsg || !noteNewText) return;
    noteMsg.textContent = "";

    if (!activeNotesBankId) {
      noteMsg.textContent = "No entry selected.";
      return;
    }

    const text = (noteNewText.value || "").trim();
    if (!text) return;

    const res = await addNote(activeNotesBankId, text);
    if (res.error) {
      noteMsg.textContent = res.error.message || "Failed to add note.";
      return;
    }

    noteNewText.value = "";
    await load();
    await reloadNotesFor(activeNotesBankId);
  });

  function notesCellHtml(r) {
    const notes = notesByBankId.get(r.id) || [];
    const label = notes.length ? `${notes.length} note${notes.length === 1 ? "" : "s"}` : "Notes";
    return `<button class="btnRow" type="button" data-notes="${esc(r.id)}">${esc(label)}</button>`;
  }

  async function load() {
    const res = await loadAllRows();
    if (res.error) {
      viewRoot.innerHTML = `<div class="card"><div class="cardBody">Load error: ${esc(res.error.message || "unknown")}</div></div>`;
      return;
    }

    list = res.data || [];

    // Load notes for all entries in one go
    const ids = list.map(x => x.id);
    const notesRes = await loadNotesForBankIds(ids);
    const notes = notesRes?.data || [];
    notesByBankId = groupNotesByBankId(notes);

    // Populate countries select
    const countrySel = slot.querySelector("#f_country");
    if (countrySel) {
      const countries = [...new Set(list.map(r => r.country).filter(Boolean))].sort();
      const current = countrySel.value || "";
      countrySel.innerHTML = `<option value="">All countries</option>` + countries.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
      countrySel.value = current;
    }

    applyFilters();
  }

  function applyFilters() {
    const filters = getFilters(slot);
    filtered = list.filter(r => passesFilters(r, filters));

    renderRows(slot, filtered, {
      actions: false,
      extraCellHtml: notesCellHtml,
    });

    // Notes open handling
    slot.querySelectorAll("[data-notes]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.notes;
        const row = list.find(x => String(x.id) === String(id));
        openNotes(id, row?.bankname || "");
      });
    });
  }

  wireFilters(slot, applyFilters);

  await load();
}
