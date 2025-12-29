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

export async function renderNumbersAdmin(adminRoot) {
  const session = await getSession();

  adminRoot.innerHTML = renderShell({
    title: "Bank Info Editor",
    subtitle: "Admins only.",
    session,
  });

  const { refreshBtn } = await wireAuth({
    root: adminRoot,
    onAuthedRerender: () => renderNumbersAdmin(adminRoot),
    signupHint: "Signed up. Ask an existing admin to add you to admin_users.",
  });

  const { session: session2, isAdmin } = await requireAdmin();
  if (!session2) return;

  const bodyRoot = adminRoot.querySelector("#bodyRoot");
  if (!isAdmin) {
    bodyRoot.innerHTML = renderAccessDenied();
    return;
  }

  bodyRoot.innerHTML = `
    ${buildAdminFormUI()}
    ${notesPanelHtml()}
    ${buildNumbersTable({
      actions: true,
      showNotesCol: true,
      adminHeaderControlsHtml: `
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <input id="search" type="text" placeholder="Search..." style="width:300px; max-width:60vw;">
          <select id="f_has_notes" style="width:170px;">
            <option value="">Has notes: Any</option>
            <option value="with">With notes</option>
            <option value="without">Without notes</option>
          </select>
        </div>
      `,
    })}
    ${notesPanelCss()}
  `;

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
    alert("Admin UI init failed: missing expected DOM elements. Check HTML rendering.");
    return;
  }

  let editId = null;
  let allRows = [];

  adminRoot.querySelector("#newBtn")?.addEventListener("click", () => {
    editId = null;
    clearForm(refs);
    saveMsg.textContent = "";
    setNotesVisible(false);
  });

  adminRoot.querySelector("#saveBtn")?.addEventListener("click", async () => {
    saveMsg.textContent = "";

    const payload = payloadFromForm(refs);
    payload.updated_by = session2.user.id;
    payload.updated_at = new Date().toISOString();

    const err = validatePayload(payload, { isValidUrlMaybe });
    if (err) {
      saveMsg.textContent = err;
      return;
    }

    const res = editId
      ? await sb.from(TABLE).update(payload).eq("id", editId)
      : await sb.from(TABLE).insert(payload).select("id").single();

    if (res.error) {
      saveMsg.textContent = res.error.message;
      return;
    }

    if (!editId) editId = res.data?.id || null;

    await load();
    saveMsg.textContent = "Saved.";
    setTimeout(() => (saveMsg.textContent = ""), 1200);

    if (editId) {
      setNotesVisible(true);
      await loadNotesPanel();
    }
  });

  // Notes add
  adminRoot.querySelector("#noteAddBtn")?.addEventListener("click", async () => {
    noteMsg.textContent = "";

    if (!editId) {
      noteMsg.textContent = "Select an entry first (Edit or Notes).";
      return;
    }

    const text = (noteText.value || "").trim();
    if (!text) {
      noteMsg.textContent = "Note is empty.";
      return;
    }

    noteMsg.textContent = "Saving...";
    const res = await addNote(editId, text);
    if (res.error) {
      noteMsg.textContent = res.error.message;
      return;
    }

    noteText.value = "";
    noteMsg.textContent = "Saved.";
    await loadNotesPanel();
    await load(); // update notes_count in table
  });

  function currentList() {
    const q = (searchEl.value || "").trim().toLowerCase();
    const hasNotes = (hasNotesEl.value || "").trim(); // "", "with", "without"

    let list = allRows;

    if (hasNotes === "with") list = list.filter(r => (r.notes_count || 0) > 0);
    if (hasNotes === "without") list = list.filter(r => (r.notes_count || 0) === 0);

    if (!q) return list;
    return list.filter(r => haystack(r).includes(q));
  }

  function render() {
    const list = currentList();

    renderNumbersRows(adminRoot, list, {
      actions: true,
      showNotesCol: true,
      notesCellHtml: (r) => {
        const cnt = r.notes_count || 0;
        return `
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <span class="mono">${cnt}</span>
            <button class="btn" type="button" data-notes="${esc(r.id)}">Notes</button>
          </div>
        `;
      },
      onEdit: async (id) => startEdit(id, { openNotes: false }),
      onDelete: async (id) => {
        const item = allRows.find(x => x.id === id);
        if (!item) return;

        if (!confirm(`Delete "${item.bankname}" (${item.phone_number})?`)) return;

        const res = await sb.from(TABLE).delete().eq("id", id);
        if (res.error) {
          alert(res.error.message);
          return;
        }

        if (editId === id) {
          editId = null;
          setNotesVisible(false);
          clearForm(refs);
        }

        await load();
      },
    });

    // Notes buttons
    adminRoot.querySelectorAll("[data-notes]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-notes");
        await startEdit(id, { openNotes: true });
      });
    });
  }

  async function startEdit(id, { openNotes }) {
    const item = allRows.find(x => x.id === id);
    if (!item) return;

    editId = id;
    fillForm(refs, item);
    saveMsg.textContent = "";

    setNotesVisible(true, item);
    await loadNotesPanel();

    if (openNotes) notesBox.scrollIntoView({ behavior: "smooth", block: "start" });
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

    if (!editId) return;

    const res = await loadNotesForBankId(editId);
    if (res.error) {
      noteMsg.textContent = res.error.message;
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
                    <button class="btn" type="button" data-noteedit="${esc(n.id)}">Edit</button>
                    <button class="btn" type="button" data-notedel="${esc(n.id)}">Delete</button>
                  </div>
                </div>

                <div data-noteview="${esc(n.id)}">${esc(n.note_text)}</div>

                <div data-noteeditwrap="${esc(n.id)}" style="display:none; gap:10px;">
                  <textarea data-noteedittext="${esc(n.id)}" style="min-height:90px;">${esc(n.note_text)}</textarea>
                  <div class="noteActions">
                    <button class="btn" type="button" data-notesave="${esc(n.id)}">Save</button>
                    <button class="btn" type="button" data-notecancel="${esc(n.id)}">Cancel</button>
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join("")
      : `<div style="color:rgba(255,255,255,.68); font-size:12px;">No notes yet.</div>`;

    // wire edit
    notesList.querySelectorAll("[data-noteedit]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-noteedit");
        const wrap = notesList.querySelector(`[data-noteeditwrap="${CSS.escape(id)}"]`);
        const view = notesList.querySelector(`[data-noteview="${CSS.escape(id)}"]`);
        if (wrap && view) {
          wrap.style.display = "grid";
          view.style.display = "none";
        }
      });
    });

    notesList.querySelectorAll("[data-notecancel]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-notecancel");
        const wrap = notesList.querySelector(`[data-noteeditwrap="${CSS.escape(id)}"]`);
        const view = notesList.querySelector(`[data-noteview="${CSS.escape(id)}"]`);
        if (wrap && view) {
          wrap.style.display = "none";
          view.style.display = "block";
        }
      });
    });

    notesList.querySelectorAll("[data-notesave]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-notesave");
        const ta = notesList.querySelector(`[data-noteedittext="${CSS.escape(id)}"]`);
        const text = ta?.value || "";

        noteMsg.textContent = "Saving...";
        const res2 = await updateNote(id, text, session2.user.id);
        if (res2.error) {
          noteMsg.textContent = res2.error.message;
          return;
        }
        noteMsg.textContent = "Saved.";
        await loadNotesPanel();
      });
    });

    notesList.querySelectorAll("[data-notedel]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-notedel");
        if (!confirm("Delete this note?")) return;

        noteMsg.textContent = "Deleting...";
        const res2 = await deleteNote(id);
        if (res2.error) {
          noteMsg.textContent = res2.error.message;
          return;
        }
        noteMsg.textContent = "Deleted.";
        await loadNotesPanel();
        await load(); // refresh notes_count
      });
    });
  }

  async function load() {
    const res = await loadAllRowsWithNotesCount();
    if (res.error) return alert(res.error.message);
    allRows = res.data || [];
    render();
  }

  // events
  searchEl.addEventListener("input", render);
  hasNotesEl.addEventListener("change", render);
  refreshBtn?.addEventListener("click", load);

  // init
  clearForm(refs);
  setNotesVisible(false);
  await load();
}

function notesPanelHtml() {
  return `
    <div id="notesBox" style="display:none;">
      <div class="card" style="border-radius:14px;">
        <div class="cardHead">
          <strong id="notesTitle">Notes (Admin)</strong>
          <span style="color:rgba(255,255,255,.68); font-size:12px;">
            Select an entry (Edit or Notes) to manage notes.
          </span>
        </div>

        <div class="cardBody" style="gap:12px;">
          <div class="card" style="border-radius:14px;">
            <div class="cardHead"><strong>Add note</strong></div>
            <div class="cardBody" style="gap:10px;">
              <textarea id="noteText" placeholder="Write a note..." style="min-height:90px;"></textarea>
              <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                <button class="btn" id="noteAddBtn" type="button">Add note</button>
                <span id="noteMsg" style="color:rgba(255,255,255,.68); font-size:12px;"></span>
              </div>
            </div>
          </div>

          <div id="notesList" style="display:grid; gap:10px;"></div>
        </div>
      </div>
    </div>
  `;
}

function notesPanelCss() {
  return `
    <style>
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
