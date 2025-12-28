import { getSession } from "../../lib/supabaseClient.js";
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
  deleteNote,
} from "./numbers.shared.js";
import { esc } from "../../lib/utils.js";

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

  const bodyRoot = viewRoot.querySelector("#bodyRoot");
  const isAdmin = await adminLinkVisible();

  bodyRoot.innerHTML = `
    ${buildFiltersUI({ showAdminLink: isAdmin })}
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

    wireNotesButtons();
  }

  function wireNotesButtons() {
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
            <div id="notesList" style="display:grid; gap:8px;"></div>

            <div class="card" style="border-radius:14px;">
              <div class="cardHead">
                <strong>Add a note</strong>
                <span style="color:rgba(255,255,255,.68); font-size:12px;">
                  Notes are visible to all users. Only admins can delete.
                </span>
              </div>
              <div class="cardBody" style="gap:10px;">
                <textarea id="notesText" placeholder="Write a note for the admin..." style="min-height:90px;"></textarea>
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
        .noteMeta{ color:rgba(255,255,255,.68); font-size:12px; display:flex; gap:10px; justify-content:space-between; align-items:center; flex-wrap:wrap; }
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
      ? notes
          .map((n) => {
            const when = new Date(n.created_at).toLocaleString();
            const delBtn = isAdmin
              ? `<button class="btn" type="button" data-delnote="${esc(n.id)}">Delete</button>`
              : "";
            return `
              <div class="card" style="border-radius:14px;">
                <div class="cardBody" style="gap:6px;">
                  <div class="noteMeta">
                    <span>${esc(when)}</span>
                    ${delBtn}
                  </div>
                  <div>${esc(n.note_text)}</div>
                </div>
              </div>
            `;
          })
          .join("")
      : `<div style="color:rgba(255,255,255,.68); font-size:12px;">No notes yet.</div>`;

    modal.style.display = "block";

    viewRoot.querySelector("#notesClose").onclick = () => {
      modal.style.display = "none";
      activeBankId = null;
    };

    viewRoot.querySelector("#notesAdd").onclick = async () => {
      const text = txtEl.value.trim();
      if (!text) {
        msgEl.textContent = "Please enter a note.";
        return;
      }

      msgEl.textContent = "Saving...";
      const res = await addNote(bankId, text);
      if (res.error) {
        msgEl.textContent = res.error.message;
        return;
      }

      await reloadNotesFor([bankId]);
      msgEl.textContent = "Saved.";
      openNotes(bankId); // refresh modal content
      render(); // update counts
    };

    // Admin-only delete
    if (isAdmin) {
      listEl.querySelectorAll("[data-delnote]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const noteId = btn.getAttribute("data-delnote");
          if (!confirm("Delete this note?")) return;

          const res = await deleteNote(noteId);
          if (res.error) {
            alert(res.error.message);
            return;
          }

          await reloadNotesFor([bankId]);
          openNotes(bankId);
          render();
        });
      });
    }
  }

  async function reloadNotesFor(bankIds) {
    const notesRes = await loadNotesForBankIds(bankIds);
    if (notesRes.error) {
      alert(notesRes.error.message);
      return;
    }

    // merge only these bankIds
    const partial = groupNotesByBankId(notesRes.data || []);
    const merged = new Map(notesByBankId);
    for (const id of bankIds) merged.set(id, partial.get(id) || []);
    notesByBankId = merged;
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

  if (refreshBtn) refreshBtn.addEventListener("click", load);

  await load();
}
