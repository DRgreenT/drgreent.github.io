import { sb, getSession } from "../../lib/supabaseClient.js";
import { isValidUrlMaybe } from "../../lib/utils.js";
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
    ${buildTableUI({ actions: true })}
  `;

  const saveMsg = adminRoot.querySelector("#saveMsg");
  const searchEl = adminRoot.querySelector("#search");

  const refs = getFormRefs(adminRoot);

  let editId = null;
  let allRows = [];

  adminRoot.querySelector("#newBtn")?.addEventListener("click", () => {
    editId = null;
    clearForm(refs);
    saveMsg.textContent = "";
  });

  adminRoot.querySelector("#saveBtn")?.addEventListener("click", async () => {
    saveMsg.textContent = "";

    const payload = payloadFromForm(refs);

    // metadata columns (optional in your DB)
    payload.updated_by = session2.user.id;
    payload.updated_at = new Date().toISOString();

    const err = validatePayload(payload, { isValidUrlMaybe });
    if (err) {
      saveMsg.textContent = err;
      return;
    }

    const res = editId
      ? await sb.from(TABLE).update(payload).eq("id", editId)
      : await sb.from(TABLE).insert(payload);

    if (res.error) {
      saveMsg.textContent = res.error.message;
      return;
    }

    editId = null;
    clearForm(refs);
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
      onEdit: (id) => {
        const item = allRows.find((x) => x.id === id);
        if (!item) return;
        editId = id;
        fillForm(refs, item);
        saveMsg.textContent = "";
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

  clearForm(refs);
  await load();
}
