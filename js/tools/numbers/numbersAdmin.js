import { sb, getSession } from "../../lib/supabaseClient.js";
import { isValidUrlMaybe, esc } from "../../lib/utils.js";
import {
  renderShell,
  wireAuth,
  requireAdmin,
  renderAccessDenied,
  buildAdminFormUI,
  buildTableUI,
  getFormRefs,
  clearForm,
  fillForm,
  payloadFromForm,
  validatePayload,
  loadAllRows,
  renderRows,
  haystack,
  loadNotesForBankId,
  addNote,
  updateNote,
  deleteNote,
} from "./numbers.shared.js";
import { TABLE } from "./numbers.schema.js";

export async function renderNumbersAdmin(adminRoot) {
  const session = await getSession();

  adminRoot.innerHTML = renderShell({
    title: "Admin Editor",
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
    ${notesAdminPanelHtml()}
    ${buildTableUI({ actions: true })}
    ${notesAdminCss()}
  `;

  const saveMsg = adminRoot.querySelector("#saveMsg");
  const searchEl = adminRoot.querySelector("#search");
  const notesBox = adminRoot.querySelector("#notesBox");

  const refs = getFormRefs(adminRoot);

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

    // if it was a new record, grab new id
    if (!editId) {
      editId = res.data?.id || null;
      if (editId) setNotesVisible(true);
    }

    await load();
    saveMsg.textContent = "Saved.";
    setTimeout(() => (saveMsg.textContent = ""), 1200);
  });

  function currentList() {
    const q = (searchEl?.value || "").trim().toLowerCase();
    return !q ? allRows : allRows.filter((r) => haystack(r).includes(q));
  }

  function render() {
    renderRows(adminRoot, currentList(), {
      actions: true,
      onEdit: async (id) => {
        const item = allRows.find((x) => x.id === id);
        if (!item) return;

        editId = id;
        fillForm(refs, item);
        saveMsg.textContent = "";

        setNotesVisible(true);
        await loadNotesPanel();
      },
      onDelete: async (id) => {
        const item = allRows.find((x) => x.id === id);
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
  }

  async function load() {
    const res = await loadAllRows();
    if (res.error) return alert(res.error.message);
    allRows = res.data || [];
    render();
  }

  searchEl?.addEventListener("input", render);
  refreshBtn?.addEventListener("click", load);

  // Notes Panel wiring
  adminRoot.querySelector("#noteAddBtn")?.addEventListener("click", async () => {
    const msg = adminRoot.querySelector("#noteMsg");
    const ta = adminRoot.querySelector("#noteText");
    msg.textContent = "";

    if (!editId) {
      msg.textContent = "Select an entry first (Edit).";
      return;
    }

    const text = (ta.value || "").trim();
    if (!text) {
      msg.textContent = "Note is empty.";
      return;
    }

    msg.textContent = "Saving...";
    const res = await addNote(editId, text);
    if (res.error) {
      msg.textContent = res.error.message;
      return;
    }

    ta.value = "";
    msg.textContent = "Saved.";
    await loadNotesPanel();
  });

  function setNotesVisible(visible) {
    notesBox.style.display = visible ? "block" : "none";
    if (!visible) {
      adminRoot.querySelector("#notesList").innerHTML = "";
      adminRoot.querySelector("#noteMsg").textContent = "";
      adminRoot.querySelector("#noteText").value = "";
    }
  }

  async function loadNotesPanel() {
    const listEl = adminRoot.querySelector("#notesList");
    const msgEl = adminRoot.querySelector("#noteMsg");
    msgEl.textContent = "";

    if (!editId) {
      listEl.innerHTML = "";
      return;
    }

    const res = await loadNotesForBankId(editId);
    if (res.error) {
      msgEl.textContent = res.error.message;
      return;
    }

    const notes = res.data || [];
    listEl.innerHTML = notes.length
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
    listEl.querySelectorAll("[data-noteedit]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-noteedit");
        const wrap = listEl.querySelector(`[data-noteeditwrap="${CSS.escape(id)}"]`);
        const view = listEl.querySelector(`[data-noteview="${CSS.escape(id)}"]`);
        if (wrap && view) {
          wrap.style.display = "grid";
          view.style.display = "none";
        }
      });
    });

    listEl.querySelectorAll("[data-notecancel]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-notecancel");
        const wrap = listEl.querySelector(`[data-noteeditwrap="${CSS.escape(id)}"]`);
        const view = listEl.querySelector(`[data-noteview="${CSS.escape(id)}"]`);
        if (wrap && view) {
          wrap.style.display = "none";
          view.style.display = "block";
        }
      });
    });

    listEl.querySelectorAll("[data-notesave]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-notesave");
        const ta = listEl.querySelector(`[data-noteedittext="${CSS.escape(id)}"]`);
        const text = ta?.value || "";

        msgEl.textContent = "Saving...";
        const res2 = await updateNote(id, text, session2.user.id);
        if (res2.error) {
          msgEl.textContent = res2.error.message;
          return;
        }
        msgEl.textContent = "Saved.";
        await loadNotesPanel();
      });
    });

    listEl.querySelectorAll("[data-notedel]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-notedel");
        if (!confirm("Delete this note?")) return;

        msgEl.textContent = "Deleting...";
        const res2 = await deleteNote(id);
        if (res2.error) {
          msgEl.textContent = res2.error.message;
          return;
        }
        msgEl.textContent = "Deleted.";
        await loadNotesPanel();
      });
    });
  }

  function notesAdminPanelHtml() {
    return `
      <div id="notesBox" style="display:none;">
        <div class="card" style="border-radius:14px;">
          <div class="cardHead">
            <strong>Notes (Admin)</strong>
            <span style="color:rgba(255,255,255,.68); font-size:12px;">
              Select an entry (Edit) to manage notes.
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

  function notesAdminCss() {
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

  // initial
  clearForm(refs);
  setNotesVisible(false);
  await load();
}
