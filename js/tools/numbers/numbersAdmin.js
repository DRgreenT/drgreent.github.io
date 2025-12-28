import { sb, getSession } from "../../lib/supabaseClient.js";
import { isValidUrlMaybe, esc } from "../../lib/utils.js";
import {
  renderShell,
  wireAuth,
  requireAdmin,
  renderAccessDenied,
  buildAdminFormUI,
  getFormRefs,
  clearForm,
  fillForm,
  payloadFromForm,
  validatePayload,
  haystack,
  loadAllRowsWithNotesCount,
  buildNumbersTable,
  renderNumbersRows,
  loadNotesForBankId,
  addNote,
  updateNote,
  deleteNote,
} from "./numbers.shared.js";
import { TABLE } from "./numbers.schema.js";

/**
 * Render the Numbers admin tool into the given root element.
 */
export async function renderNumbersAdmin(adminRoot) {
  adminRoot.innerHTML = "Loading...";

  const { session, isAdmin } = await requireAdmin();

  if (!session || !isAdmin) {
    adminRoot.innerHTML = renderAccessDenied();
    return;
  }

  adminRoot.innerHTML = renderShell({
    title: "Admin Editor",
    subtitle: "Admins only.",
    session,
  });

  const slot = adminRoot.querySelector("#slot");

  slot.innerHTML = `
    <div style="display:grid; grid-template-columns: 1fr 1.2fr; gap:14px;">
      <div style="display:grid; gap:14px;">
        ${buildAdminFormUI()}

        <div class="card" style="border-radius:14px;">
          <div class="cardHead"><strong>Search</strong></div>
          <div class="cardBody" style="gap:10px;">
            <input class="input" id="search" placeholder="Search..." />
            <label style="display:flex; gap:8px; align-items:center;">
              <input type="checkbox" id="f_has_notes" />
              <span style="color:rgba(255,255,255,.72); font-size:12px;">Only entries with notes</span>
            </label>
          </div>
        </div>
      </div>

      <div style="display:grid; gap:14px;">
        <div id="tableBox"></div>

        <div id="notesBox" class="card" style="border-radius:14px; display:none;">
          <div class="cardHead">
            <strong id="notesTitle">Notes (Admin)</strong>
          </div>
          <div class="cardBody" style="gap:10px;">
            <div id="notesList" style="display:grid; gap:10px;"></div>

            <div style="display:grid; gap:8px;">
              <textarea class="input" id="noteText" style="min-height:80px;" placeholder="Write a note..."></textarea>
              <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                <button class="btn" id="noteAddBtn" type="button">Add note</button>
                <span id="noteMsg" style="color:rgba(255,255,255,.68); font-size:12px;"></span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  `;

  await wireAuth({
    root: adminRoot,
    onAuthedRerender: () => renderNumbersAdmin(adminRoot),
  });

  const tableBox = adminRoot.querySelector("#tableBox");
  tableBox.innerHTML = buildNumbersTable({
    actions: true,
    showNotesCol: true,
    adminHeaderControlsHtml: `<span style="color:rgba(255,255,255,.68); font-size:12px;">Click Edit to load entry</span>`,
  });

  const refs = getFormRefs(adminRoot);

  const saveMsg = adminRoot.querySelector("#saveMsg");
  const searchEl = adminRoot.querySelector("#search");
  const hasNotesEl = adminRoot.querySelector("#f_has_notes");

  const notesBox = adminRoot.querySelector("#notesBox");
  const notesTitle = adminRoot.querySelector("#notesTitle");
  const notesList = adminRoot.querySelector("#notesList");
  const noteText = adminRoot.querySelector("#noteText");
  const noteMsg = adminRoot.querySelector("#noteMsg");

  // Guard: if any of these are missing, fail loudly (avoids null errors)
  if (!saveMsg || !searchEl || !hasNotesEl || !notesBox || !notesTitle || !notesList || !noteText || !noteMsg) {
    adminRoot.innerHTML = `<div class="card"><div class="cardBody">UI wiring error: missing elements.</div></div>`;
    return;
  }

  let list = [];
  let filtered = [];
  let editId = null;

  function notesPanelHtml(r) {
    const n = r?.notes_count ?? 0;
    const label = n ? `${n} note${n === 1 ? "" : "s"}` : "No notes";
    return `<button class="btnRow" type="button" data-notes="${esc(r.id)}">${esc(label)}</button>`;
  }

  function setNotesVisible(visible, item = null) {
    notesBox.style.display = visible ? "block" : "none";
    if (!visible) {
      notesTitle.textContent = "Notes (Admin)";
      notesList.innerHTML = "";
      noteMsg.textContent = "";
      noteText.value = "";
    } else {
      notesTitle.textContent = item ? `Notes — ${item.bankname}` : "Notes (Admin)";
    }
  }

  async function loadNotesPanel() {
    notesList.innerHTML = "";
    noteMsg.textContent = "";

    if (!editId) {
      noteMsg.textContent = "Select an entry first (Edit or Notes).";
      return;
    }

    const res = await loadNotesForBankId(editId);
    if (res.error) {
      noteMsg.textContent = res.error.message || "Failed to load notes.";
      return;
    }

    const notes = res.data || [];
    notesList.innerHTML = notes.length
      ? notes.map(n => {
          const when = new Date(n.created_at).toLocaleString();
          const updated = n.updated_at ? ` • updated: ${new Date(n.updated_at).toLocaleString()}` : "";
          return `
            <div class="card" style="border-radius:14px;">
              <div class="cardBody" style="gap:8px;">
                <div class="noteMeta">
                  <span>${esc(when)}${esc(updated)}</span>
                  <div class="noteActions">
                    <button class="btnRow" type="button" data-noteedit="${esc(n.id)}">Edit</button>
                    <button class="btnRow btnRowDanger" type="button" data-notedel="${esc(n.id)}">Delete</button>
                  </div>
                </div>

                <div data-noteview="${esc(n.id)}">${esc(n.note_text)}</div>

                <div data-noteeditwrap="${esc(n.id)}" style="display:none; gap:10px;">
                  <textarea data-noteedittext="${esc(n.id)}" style="min-height:80px;" class="input">${esc(n.note_text)}</textarea>
                  <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <button class="btnRow" type="button" data-notesave="${esc(n.id)}">Save</button>
                    <button class="btnRow" type="button" data-notecancel="${esc(n.id)}">Cancel</button>
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join("")
      : `<div style="color:rgba(255,255,255,.68); font-size:12px;">No notes yet.</div>`;

    // Wire notes actions
    notesList.querySelectorAll("[data-noteedit]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.noteedit;
        notesList.querySelector(`[data-noteview="${id}"]`)?.setAttribute("style", "display:none;");
        notesList.querySelector(`[data-noteeditwrap="${id}"]`)?.setAttribute("style", "display:grid; gap:10px;");
      });
    });

    notesList.querySelectorAll("[data-notecancel]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.notecancel;
        notesList.querySelector(`[data-noteview="${id}"]`)?.setAttribute("style", "display:block;");
        notesList.querySelector(`[data-noteeditwrap="${id}"]`)?.setAttribute("style", "display:none;");
      });
    });

    notesList.querySelectorAll("[data-notesave]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.notesave;
        const ta = notesList.querySelector(`[data-noteedittext="${id}"]`);
        const text = (ta?.value || "").trim();
        if (!text) return;

        const s = await getSession();
        const res2 = await updateNote(id, text, s?.user?.id);

        if (res2.error) {
          noteMsg.textContent = res2.error.message || "Failed to update note.";
          return;
        }

        await loadNotesPanel();
      });
    });

    notesList.querySelectorAll("[data-notedel]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.notedel;
        const ok = confirm("Delete note?");
        if (!ok) return;
        const res2 = await deleteNote(id);
        if (res2.error) {
          noteMsg.textContent = res2.error.message || "Failed to delete note.";
          return;
        }
        await loadNotesPanel();
      });
    });
  }

  async function load() {
    saveMsg.textContent = "";
    const res = await loadAllRowsWithNotesCount();
    if (res.error) {
      adminRoot.innerHTML = `<div class="card"><div class="cardBody">Load error: ${esc(res.error.message || "unknown")}</div></div>`;
      return;
    }
    list = res.data || [];
    applyFilters();
  }

  function applyFilters() {
    const q = (searchEl.value || "").trim();
    const onlyWithNotes = !!hasNotesEl.checked;

    filtered = list.filter(r => {
      if (onlyWithNotes && !(r.notes_count > 0)) return false;
      if (q && !haystack(r).toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });

    renderNumbersRows(adminRoot, filtered, {
      actions: true,
      showNotesCol: true,
      notesCellHtml: notesPanelHtml,
      onEdit: async (id) => {
        editId = id;
        const row = list.find(x => String(x.id) === String(id));
        if (row) {
          fillForm(refs, row);
          setNotesVisible(true, row);
          await loadNotesPanel();
        }
      },
      onDelete: async (id) => {
        const ok = confirm("Delete this entry?");
        if (!ok) return;
        const res2 = await sb.from(TABLE).delete().eq("id", id);
        if (res2.error) {
          saveMsg.textContent = res2.error.message || "Delete failed.";
          return;
        }
        if (String(editId) === String(id)) {
          editId = null;
          setNotesVisible(false);
        }
        await load();
      },
    });

    // Notes open from table cell
    adminRoot.addEventListener("openNotes", async (ev) => {
      const id = ev.detail;
      editId = id;
      const row = list.find(x => String(x.id) === String(id));
      setNotesVisible(true, row);
      await loadNotesPanel();
    }, { once: true });
  }

  // Form controls
  adminRoot.querySelector("#newBtn")?.addEventListener("click", () => {
    editId = null;
    clearForm(refs);
    setNotesVisible(false);
  });

  adminRoot.querySelector("#clearBtn")?.addEventListener("click", () => {
    clearForm(refs);
  });

  adminRoot.querySelector("#saveBtn")?.addEventListener("click", async () => {
    saveMsg.textContent = "";

    const p = payloadFromForm(refs);
    const err = validatePayload(p);
    if (err) {
      saveMsg.textContent = err;
      return;
    }
    if (p.url && !isValidUrlMaybe(p.url)) {
      saveMsg.textContent = "url does not look valid.";
      return;
    }

    if (editId) {
      const res = await sb.from(TABLE).update(p).eq("id", editId).select("*").single();
      if (res.error) {
        saveMsg.textContent = res.error.message || "Update failed.";
        return;
      }
    } else {
      const res = await sb.from(TABLE).insert(p).select("*").single();
      if (res.error) {
        saveMsg.textContent = res.error.message || "Insert failed.";
        return;
      }
      editId = res.data?.id ?? null;
    }

    await load();
    saveMsg.textContent = "Saved.";
  });

  // Filters
  searchEl.addEventListener("input", applyFilters);
  hasNotesEl.addEventListener("change", applyFilters);

  // Notes add
  adminRoot.querySelector("#noteAddBtn")?.addEventListener("click", async () => {
    noteMsg.textContent = "";

    if (!editId) {
      noteMsg.textContent = "Select an entry first (Edit or Notes).";
      return;
    }

    const text = (noteText.value || "").trim();
    if (!text) return;

    const res = await addNote(editId, text);
    if (res.error) {
      noteMsg.textContent = res.error.message || "Failed to add note.";
      return;
    }
    noteText.value = "";
    await loadNotesPanel();
    await load(); // refresh notes_count
  });

  await load();
}
