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
} from "./numbers/numbers.shared.js";

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
  const showAdminLink = await adminLinkVisible();

  bodyRoot.innerHTML = `
    ${buildFiltersUI({ showAdminLink })}
    ${buildTableUI({ actions: false })}
  `;

  const FLT = getFilters(viewRoot);

  let allRows = [];

  function render() {
    const list = allRows.filter((r) => passesFilters(r, FLT));
    renderRows(viewRoot, list, { actions: false });
  }

  wireFilters({ root: viewRoot, FLT, onChange: render });

  async function load() {
    const res = await loadAllRows();
    if (res.error) return alert(res.error.message);
    allRows = res.data || [];
    render();
  }

  if (refreshBtn) refreshBtn.addEventListener("click", load);

  await load();
}
