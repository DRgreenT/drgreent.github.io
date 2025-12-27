import { sb, getSession } from "../lib/supabaseClient.js";
import { esc, includesCI, copyToClipboard } from "../lib/utils.js";
import { signIn, signUp, signOut, isAdminUser } from "../lib/auth.js";

const TABLE = "bank_numbers";

export async function renderNumbersView(viewRoot) {
  const session = await getSession();

  viewRoot.innerHTML = `
    <section class="card">
      <div class="cardHead">
        <strong>Numbers (Read-only)</strong>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <button class="btn" id="refreshBtn">Refresh</button>
          <button class="btn" id="logoutBtn" style="display:${session ? "inline-flex" : "none"};">Logout</button>
        </div>
      </div>

      <div class="cardBody" style="gap:14px;">
        <div class="card" style="border-radius:14px;">
          <div class="cardHead">
            <strong>Login</strong>
            <span style="color:rgba(255,255,255,.68); font-size:12px;">Login required to view the list.</span>
          </div>
          <div class="cardBody" id="authBox" style="display:${session ? "none" : "grid"}; gap:10px;">
            <input id="email" type="text" placeholder="Email">
            <input id="password" type="password" placeholder="Password">
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <button class="btn" id="loginBtn">Login</button>
              <button class="btn" id="signupBtn">Sign up</button>
            </div>
            <div id="authMsg" style="color:rgba(255,255,255,.68); font-size:12px;"></div>
          </div>
        </div>

        <div id="appBox" style="display:${session ? "grid" : "none"}; gap:14px;">
          <div class="card" style="border-radius:14px;">
            <div class="cardHead">
              <strong>Filters</strong>
              <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <input id="globalSearch" type="text" placeholder="Global search (all fields)" style="width:320px; max-width:70vw;">
                <select id="f_isems_number" style="width:160px;">
                  <option value="">EMS: Any</option>
                  <option value="true">EMS</option>
                  <option value="false">Non-EMS</option>
                </select>
                <button class="btn" id="clearBtn" type="button">Clear</button>
                <a class="btn" id="adminLink" href="./admin.html" style="display:none;">Admin Editor</a>
              </div>
            </div>
            <div class="cardBody">
              <div class="grid4">
                <input id="f_bankname" type="text" placeholder="Bankname">
                <input id="f_bankwebsite" type="text" placeholder="Bank website">
                <input id="f_location_name" type="text" placeholder="Location">
                <input id="f_phone_number" type="text" placeholder="Phone">
              </div>
              <div class="grid4">
                <input id="f_cardtype" type="text" placeholder="Card type">
                <input id="f_service_provider_name" type="text" placeholder="Service provider">
                <input id="f_ica_number" type="text" placeholder="ICA">
                <input id="f_fax_number" type="text" placeholder="Fax">
              </div>
              <div class="grid4">
                <input id="f_insurance_name" type="text" placeholder="Insurance name">
                <input id="f_insurance_number" type="text" placeholder="Insurance number">
                <input id="f_bic_number" type="text" placeholder="BIC">
                <input id="f_blz_number" type="text" placeholder="BLZ">
              </div>
              <div class="grid2">
                <input id="f_bin_number" type="text" placeholder="BIN">
                <span style="color:rgba(255,255,255,.55); font-size:12px; align-self:center;">
                  Tip: Click “Copy phone” in the table.
                </span>
              </div>
            </div>
          </div>

          <div class="card" style="border-radius:14px; overflow:hidden;">
            <div class="cardHead">
              <strong>List</strong>
              <span id="count" style="color:rgba(255,255,255,.68); font-size:12px;"></span>
            </div>
            <div class="tableWrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Bankname</th>
                    <th>Bank website</th>
                    <th>Location</th>
                    <th>EMS</th>
                    <th>Phone</th>
                    <th>Card type</th>
                    <th>Service provider</th>
                    <th>ICA</th>
                    <th>Fax</th>
                    <th>Insurance name</th>
                    <th>Insurance number</th>
                    <th>BIC</th>
                    <th>BLZ</th>
                    <th>BIN</th>
                    <th style="width:140px;">Copy</th>
                  </tr>
                </thead>
                <tbody id="rows"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;

  // --- auth wiring
  const authMsg = document.getElementById("authMsg");
  const loginBtn = document.getElementById("loginBtn");
  const signupBtn = document.getElementById("signupBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const refreshBtn = document.getElementById("refreshBtn");

  if (loginBtn) {
    loginBtn.addEventListener("click", async () => {
      authMsg.textContent = "";
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;
      const { error } = await signIn(email, password);
      if (error) authMsg.textContent = error.message;
      else renderNumbersView(viewRoot);
    });
  }

  if (signupBtn) {
    signupBtn.addEventListener("click", async () => {
      authMsg.textContent = "";
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;
      const { error } = await signUp(email, password);
      if (error) authMsg.textContent = error.message;
      else authMsg.textContent = "Signed up. If email confirmation is enabled, check your inbox.";
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await signOut();
      renderNumbersView(viewRoot);
    });
  }

  if (refreshBtn) refreshBtn.addEventListener("click", async () => loadAndRender());

  const session2 = await getSession();
  if (!session2) return;

  // show admin link only for admins
  const adminLink = document.getElementById("adminLink");
  if (await isAdminUser()) adminLink.style.display = "inline-flex";

  // ---- elements
  const elRows = document.getElementById("rows");
  const elCount = document.getElementById("count");

  const FLT = {
    globalSearch: document.getElementById("globalSearch"),
    f_isems_number: document.getElementById("f_isems_number"),
    f_bankname: document.getElementById("f_bankname"),
    f_bankwebsite: document.getElementById("f_bankwebsite"),
    f_location_name: document.getElementById("f_location_name"),
    f_phone_number: document.getElementById("f_phone_number"),
    f_cardtype: document.getElementById("f_cardtype"),
    f_service_provider_name: document.getElementById("f_service_provider_name"),
    f_ica_number: document.getElementById("f_ica_number"),
    f_fax_number: document.getElementById("f_fax_number"),
    f_insurance_name: document.getElementById("f_insurance_name"),
    f_insurance_number: document.getElementById("f_insurance_number"),
    f_bic_number: document.getElementById("f_bic_number"),
    f_blz_number: document.getElementById("f_blz_number"),
    f_bin_number: document.getElementById("f_bin_number"),
  };

  const clearBtn = document.getElementById("clearBtn");

  let allRows = [];

  Object.values(FLT).forEach(el => {
    el.addEventListener("input", renderTable);
    el.addEventListener("change", renderTable);
  });

  clearBtn.addEventListener("click", () => {
    Object.values(FLT).forEach(el => {
      if (el.tagName === "SELECT") el.value = "";
      else el.value = "";
    });
    renderTable();
  });

  function haystack(r) {
    return [
      r.bankname, r.bankwebsite, r.location_name,
      r.isems_number ? "ems" : "non-ems",
      r.phone_number, r.cardtype, r.service_provider_name,
      r.ica_number, r.fax_number,
      r.insurance_name, r.insurance_number,
      r.bic_number, r.blz_number, r.bin_number
    ].map(x => (x ?? "").toString().toLowerCase()).join(" | ");
  }

  function passesFilters(r) {
    const qGlobal = (FLT.globalSearch.value || "").trim().toLowerCase();
    const qEms = (FLT.f_isems_number.value || "").trim();

    if (!includesCI(r.bankname, (FLT.f_bankname.value || "").trim().toLowerCase())) return false;
    if (!includesCI(r.bankwebsite, (FLT.f_bankwebsite.value || "").trim().toLowerCase())) return false;
    if (!includesCI(r.location_name, (FLT.f_location_name.value || "").trim().toLowerCase())) return false;
    if (!includesCI(r.phone_number, (FLT.f_phone_number.value || "").trim().toLowerCase())) return false;
    if (!includesCI(r.cardtype, (FLT.f_cardtype.value || "").trim().toLowerCase())) return false;
    if (!includesCI(r.service_provider_name, (FLT.f_service_provider_name.value || "").trim().toLowerCase())) return false;
    if (!includesCI(r.ica_number, (FLT.f_ica_number.value || "").trim().toLowerCase())) return false;
    if (!includesCI(r.fax_number, (FLT.f_fax_number.value || "").trim().toLowerCase())) return false;
    if (!includesCI(r.insurance_name, (FLT.f_insurance_name.value || "").trim().toLowerCase())) return false;
    if (!includesCI(r.insurance_number, (FLT.f_insurance_number.value || "").trim().toLowerCase())) return false;
    if (!includesCI(r.bic_number, (FLT.f_bic_number.value || "").trim().toLowerCase())) return false;
    if (!includesCI(r.blz_number, (FLT.f_blz_number.value || "").trim().toLowerCase())) return false;
    if (!includesCI(r.bin_number, (FLT.f_bin_number.value || "").trim().toLowerCase())) return false;

    if (qEms !== "") {
      const want = qEms === "true";
      if (!!r.isems_number !== want) return false;
    }

    if (qGlobal && !haystack(r).includes(qGlobal)) return false;
    return true;
  }

  function renderTable() {
    const list = allRows.filter(passesFilters);
    elCount.textContent = `${list.length} entries`;

    elRows.innerHTML = list.map(r => `
      <tr>
        <td>${esc(r.bankname)}</td>
        <td>${r.bankwebsite ? `<a href="${esc(r.bankwebsite)}" target="_blank" rel="noopener noreferrer">${esc(r.bankwebsite)}</a>` : ""}</td>
        <td>${esc(r.location_name || "")}</td>
        <td>${r.isems_number ? "EMS" : "Non-EMS"}</td>
        <td class="mono">${esc(r.phone_number)}</td>
        <td>${esc(r.cardtype || "")}</td>
        <td>${esc(r.service_provider_name || "")}</td>
        <td>${esc(r.ica_number || "")}</td>
        <td>${esc(r.fax_number || "")}</td>
        <td>${esc(r.insurance_name || "")}</td>
        <td>${esc(r.insurance_number || "")}</td>
        <td>${esc(r.bic_number || "")}</td>
        <td>${esc(r.blz_number || "")}</td>
        <td>${esc(r.bin_number || "")}</td>
        <td>
          <button class="btn" data-copy="${esc(r.phone_number)}">Copy phone</button>
        </td>
      </tr>
    `).join("");

    elRows.querySelectorAll("[data-copy]").forEach(btn => {
      btn.addEventListener("click", async () => {
        await copyToClipboard(btn.getAttribute("data-copy"));
      });
    });
  }

  async function loadAndRender() {
    const res = await sb.from(TABLE).select("*").order("bankname", { ascending: true });
    if (res.error) { alert(res.error.message); return; }
    allRows = res.data || [];
    renderTable();
  }

  await loadAndRender();
}
