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

export async function renderNumbersView(viewRoot) {
  const session = await getSession();

  viewRoot.innerHTML = renderShell({
    title: "Numbers (Read-only)",
    subtitle: "Login required to view the list.",
    session,
  });

  const { refreshBtn } = await wireAuth({
    root: viewRoot,
    onAuthedRerender: () => renderNumbersView(viewRoot),
  });

  const session2 = await getSession();
  if (!session2) return;
  const myUid = session2.user.id;

  const bodyRoot = viewRoot.querySelector("#bodyRoot");
  const showAdminLink = await adminLinkVisible();

  bodyRoot.innerHTML = `
    ${buildFiltersUI({ showAdminLink })}
    ${buildTableUI({ actions: false, extraHeaderHtml: `<th style="width:140px;">Notes</th>` })}
    ${notesModalHtml()}
    ${notesModalCss()}
  `;

  const FLT = getFilters(viewRoot);

  let allRows = [];
  let notesByBankId = new Map();
  let activeBankId = null;

  function filteredRows() {
    return allRows.filter((r) => passesFilters(r, FLT));
  }

  function render() {
    const list = filteredRows();

    renderRows(viewRoot, list, {
      actions: false,
      extraCellHtml: (r) => {
        const cnt = notesByBankId.get(r.id)?.length || 0;
        return `<button class="btn" type="button" data-notes="${esc(r.id)}">Notes (${cnt})</button>`;
      },
    });

    viewRoot.querySelectorAll("[data-notes]").forEach((btn) => {
      btn.addEventListener("click", () => openNotes(btn.getAttribute("data-notes")));
    });
  }

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

            <div id="notesList" style="display:grid; gap:8px;"></div>

            <div class="card" style="border-radius:14px;">
              <div class="cardHead">
                <strong>Add a note</strong>
              </div>
              <div class="cardBody" style="gap:10px;">
                <textarea id="notesText" placeholder="Write a note..." style="min-height:90px;"></textarea>
                <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                  <button class="btn" id="notesAdd" type="button">Add note</button>
                  <span id="notesMsg" style="color:rgba(255,255,255,.68); font-size:12px;"></span>
                </div>
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
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,.55);
          padding: 24px;
          z-index: 999;
          overflow:auto;
        }
        .modalInner{ margin-top: 20px; }
        .noteMeta{
          color:rgba(255,255,255,.68);
          font-size:12px;
          display:flex;
          gap:10px;
          justify-content:space-between;
          align-items:center;
          flex-wrap:wrap;
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

  function openNotes(bankId) {
    activeBankId = bankId;

    const modal = viewRoot.querySelector("#notesModal");
    const listEl = viewRoot.querySelector("#notesList");
    const titleEl = viewRoot.querySelector("#notesTitle");
    const msgEl = viewRoot.querySelector("#notesMsg");
    const txtEl = viewRoot.querySelector("#notesText");

    msgEl.textContent = "";
    txtEl.value = "";

    const row = allRows.find((x) => x.id === bankId);
    titleEl.textContent = row ? `Notes — ${row.bankname}` : "Notes";

    const notes = notesByBankId.get(bankId) || [];
    listEl.innerHTML = notes.length
      ? notes.map((n) => {
          const when = new Date(n.created_at).toLocaleString();
          const canEdit = n.created_by === myUid;

          // For creator: inline edit textarea
          const editUi = canEdit
            ? `
              <div class="noteActions">
                <button class="btn" type="button" data-editnote="${esc(n.id)}">Edit</button>
                <button class="btn" type="button" data-delnote="${esc(n.id)}">Delete</button>
              </div>
            `
            : `<div class="noteActions"><span style="opacity:.7;">(read-only)</span></div>`;

          return `
            <div class="card" style="border-radius:14px;">
              <div class="cardBody" style="gap:8px;">
                <div class="noteMeta">
                  <span>${esc(when)}</span>
                  ${editUi}
                </div>

                <div data-noteview="${esc(n.id)}">${esc(n.note_text)}</div>

                <div data-noteeditwrap="${esc(n.id)}" style="display:none; gap:10px;">
                  <textarea data-noteedit="${esc(n.id)}" style="min-height:80px;">${esc(n.note_text)}</textarea>
                  <div class="noteActions">
                    <button class="btn" type="button" data-savenote="${esc(n.id)}">Save</button>
                    <button class="btn" type="button" data-cancelnote="${esc(n.id)}">Cancel</button>
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join("")
      : `<div style="color:rgba(255,255,255,.68); font-size:12px;">No notes yet.</div>`;

    modal.style.display = "block";

    viewRoot.querySelector("#notesClose").onclick = () => {
      modal.style.display = "none";
      activeBankId = null;
    };

    viewRoot.querySelector("#notesAdd").onclick = async () => {
      const text = txtEl.value.trim();
      if (!text) { msgEl.textContent = "Please enter a note."; return; }

      msgEl.textContent = "Saving...";
      const res = await addNote(bankId, text);
      if (res.error) { msgEl.textContent = res.error.message; return; }

      await reloadNotesFor(bankId);
      msgEl.textContent = "Saved.";
      openNotes(bankId);
      render();
    };

    // Creator edit/delete handlers
    listEl.querySelectorAll("[data-editnote]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-editnote");
        const wrap = listEl.querySelector(`[data-noteeditwrap="${CSS.escape(id)}"]`);
        const view = listEl.querySelector(`[data-noteview="${CSS.escape(id)}"]`);
        if (wrap && view) {
          wrap.style.display = "grid";
          view.style.display = "none";
        }
      });
    });

    listEl.querySelectorAll("[data-cancelnote]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-cancelnote");
        const wrap = listEl.querySelector(`[data-noteeditwrap="${CSS.escape(id)}"]`);
        const view = listEl.querySelector(`[data-noteview="${CSS.escape(id)}"]`);
        if (wrap && view) {
          wrap.style.display = "none";
          view.style.display = "block";
        }
      });
    });

    listEl.querySelectorAll("[data-savenote]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-savenote");
        const ta = listEl.querySelector(`[data-noteedit="${CSS.escape(id)}"]`);
        const newText = ta?.value || "";
        msgEl.textContent = "Saving...";

        const res = await updateNote(id, newText, myUid);
        if (res.error) { msgEl.textContent = res.error.message; return; }

        await reloadNotesFor(bankId);
        msgEl.textContent = "Saved.";
        openNotes(bankId);
        render();
      });
    });

    listEl.querySelectorAll("[data-delnote]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-delnote");
        if (!confirm("Delete this note?")) return;

        msgEl.textContent = "Deleting...";
        const res = await deleteNote(id);
        if (res.error) { msgEl.textContent = res.error.message; return; }

        await reloadNotesFor(bankId);
        msgEl.textContent = "Deleted.";
        openNotes(bankId);
        render();
      });
    });
  }

  async function reloadNotesFor(bankId) {
    const res = await loadNotesForBankIds([bankId]);
    if (res.error) { alert(res.error.message); return; }
    const m = groupNotesByBankId(res.data || []);
    notesByBankId = new Map(notesByBankId);
    notesByBankId.set(bankId, m.get(bankId) || []);
  }

  wireFilters({ FLT, onChange: render });

  async function load() {
    const res = await loadAllRows();
    if (res.error) return alert(res.error.message);

    allRows = res.data || [];

    const ids = allRows.map((x) => x.id).filter(Boolean);
    const notesRes = await loadNotesForBankIds(ids);

    if (notesRes.error) {
      alert(notesRes.error.message);
      notesByBankId = new Map();
    } else {
      notesByBankId = groupNotesByBankId(notesRes.data || []);
    }

    render();
  }

  refreshBtn?.addEventListener("click", load);

  await load();
}
