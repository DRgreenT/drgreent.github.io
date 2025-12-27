import { sb, getSession } from "../lib/supabaseClient.js";
import { esc, isValidUrlMaybe, copyToClipboard } from "../lib/utils.js";
import { signIn, signUp, signOut, isAdminUser } from "../lib/auth.js";

const TABLE = "bank_numbers";

export async function renderNumbersAdmin(adminRoot) {
  const session = await getSession();

  adminRoot.innerHTML = `
    <section class="card">
      <div class="cardHead">
        <strong>Admin Editor</strong>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <button class="btn" id="refreshBtn">Refresh</button>
          <button class="btn" id="logoutBtn" style="display:${session ? "inline-flex" : "none"};">Logout</button>
        </div>
      </div>

      <div class="cardBody" style="gap:14px;">
        <div class="card" style="border-radius:14px;">
          <div class="cardHead">
            <strong>Login</strong>
            <span style="color:rgba(255,255,255,.68); font-size:12px;">Admins only.</span>
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

        <div id="gate" style="display:${session ? "block" : "none"};"></div>
      </div>
    </section>
  `;

  // Auth
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
      else renderNumbersAdmin(adminRoot);
    });
  }

  if (signupBtn) {
    signupBtn.addEventListener("click", async () => {
      authMsg.textContent = "";
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;
      const { error } = await signUp(email, password);
      if (error) authMsg.textContent = error.message;
      else authMsg.textContent = "Signed up. Ask an existing admin to add you to admin_users.";
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await signOut();
      renderNumbersAdmin(adminRoot);
    });
  }

  if (refreshBtn) refreshBtn.addEventListener("click", async () => renderNumbersAdmin(adminRoot));

  const session2 = await getSession();
  if (!session2) return;

  const gate = document.getElementById("gate");

  // Admin gate (server-side enforced by RLS anyway, but UI gate is nicer)
  const isAdmin = await isAdminUser();
  if (!isAdmin) {
    gate.innerHTML = `
      <div class="card" style="border-radius:14px;">
        <div class="cardHead"><strong>Access denied</strong></div>
        <div class="cardBody">
          You are logged in, but you are not an admin.
          Ask an admin to add your user id to <span class="mono">admin_users</span>.
        </div>
      </div>
    `;
    return;
  }

  gate.innerHTML = `
    <div class="card" style="border-radius:14px;">
      <div class="cardHead">
        <strong>Add / Edit / Delete</strong>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn" id="newBtn">New</button>
          <button class="btn" id="saveBtn">Save</button>
        </div>
      </div>

      <div class="cardBody" style="gap:10px;">
        <div class="grid3">
          <input id="bankname" type="text" placeholder="Bankname *">
          <input id="bankwebsite" type="text" placeholder="Bank website (https://...)">
          <input id="location_name" type="text" placeholder="Location name">
        </div>

        <div class="grid3">
          <select id="isems_number">
            <option value="false">Non-EMS</option>
            <option value="true">EMS</option>
          </select>
          <input id="phone_number" type="text" placeholder="Phone number *">
          <input id="fax_number" type="text" placeholder="Fax number">
        </div>

        <div class="grid3">
          <input id="cardtype" type="text" placeholder="Card type">
          <input id="service_provider_name" type="text" placeholder="Service provider name">
          <input id="ica_number" type="text" placeholder="ICA number">
        </div>

        <div class="grid3">
          <input id="insurance_name" type="text" placeholder="Insurance name">
          <input id="insurance_number" type="text" placeholder="Insurance number">
          <input id="bic_number" type="text" placeholder="BIC number">
        </div>

        <div class="grid3">
          <input id="blz_number" type="text" placeholder="BLZ number">
          <input id="bin_number" type="text" placeholder="BIN number">
          <button class="btn" id="copyPhoneBtn" type="button">Copy phone</button>
        </div>

        <div id="saveMsg" style="color:rgba(255,255,255,.68); font-size:12px;"></div>
      </div>
    </div>

    <div class="card" style="border-radius:14px; overflow:hidden; margin-top:14px;">
      <div class="cardHead">
        <strong>List</strong>
        <input id="search" type="text" placeholder="Search..." style="width:300px; max-width:60vw;">
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
              <th style="width:170px;">Actions</th>
            </tr>
          </thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
    </div>
  `;

  const saveMsg = document.getElementById("saveMsg");
  const search = document.getElementById("search");
  const rowsEl = document.getElementById("rows");

  const F = {
    bankname: document.getElementById("bankname"),
    bankwebsite: document.getElementById("bankwebsite"),
    location_name: document.getElementById("location_name"),
    isems_number: document.getElementById("isems_number"),
    phone_number: document.getElementById("phone_number"),
    fax_number: document.getElementById("fax_number"),
    cardtype: document.getElementById("cardtype"),
    service_provider_name: document.getElementById("service_provider_name"),
    ica_number: document.getElementById("ica_number"),
    insurance_name: document.getElementById("insurance_name"),
    insurance_number: document.getElementById("insurance_number"),
    bic_number: document.getElementById("bic_number"),
    blz_number: document.getElementById("blz_number"),
    bin_number: document.getElementById("bin_number"),
  };

  let editId = null;
  let allRows = [];

  document.getElementById("newBtn").addEventListener("click", clearForm);

  document.getElementById("copyPhoneBtn").addEventListener("click", async () => {
    await copyToClipboard(F.phone_number.value.trim());
  });

  document.getElementById("saveBtn").addEventListener("click", async () => {
    saveMsg.textContent = "";

    const payload = {
      bankname: F.bankname.value.trim(),
      bankwebsite: F.bankwebsite.value.trim() || null,
      location_name: F.location_name.value.trim() || null,
      isems_number: F.isems_number.value === "true",
      phone_number: F.phone_number.value.trim(),

      cardtype: F.cardtype.value.trim() || null,
      service_provider_name: F.service_provider_name.value.trim() || null,
      ica_number: F.ica_number.value.trim() || null,
      fax_number: F.fax_number.value.trim() || null,
      insurance_name: F.insurance_name.value.trim() || null,
      insurance_number: F.insurance_number.value.trim() || null,
      bic_number: F.bic_number.value.trim() || null,
      blz_number: F.blz_number.value.trim() || null,
      bin_number: F.bin_number.value.trim() || null,

      updated_by: session2.user.id,
      updated_at: new Date().toISOString(),
    };

    if (!payload.bankname || !payload.phone_number) {
      saveMsg.textContent = "Bankname and phone number are required.";
      return;
    }

    if (payload.bankwebsite && !isValidUrlMaybe(payload.bankwebsite)) {
      saveMsg.textContent = "Bank website must be a valid URL (https://...)";
      return;
    }

    const res = editId
      ? await sb.from(TABLE).update(payload).eq("id", editId)
      : await sb.from(TABLE).insert(payload);

    if (res.error) {
      saveMsg.textContent = res.error.message;
      return;
    }

    clearForm();
    await loadAndRender();
    saveMsg.textContent = "Saved.";
    setTimeout(() => (saveMsg.textContent = ""), 1200);
  });

  function clearForm() {
    editId = null;
    Object.values(F).forEach(el => {
      if (el.tagName === "SELECT") el.value = "false";
      else el.value = "";
    });
    F.bankname.focus();
  }

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

  function renderTable() {
    const q = (search.value || "").trim().toLowerCase();
    const list = !q ? allRows : allRows.filter(r => haystack(r).includes(q));

    rowsEl.innerHTML = list.map(r => `
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
          <button class="btn" data-edit="${r.id}">Edit</button>
          <button class="btn" data-del="${r.id}">Delete</button>
        </td>
      </tr>
    `).join("");

    rowsEl.querySelectorAll("[data-edit]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-edit");
        const item = allRows.find(x => x.id === id);
        if (!item) return;

        editId = id;
        F.bankname.value = item.bankname || "";
        F.bankwebsite.value = item.bankwebsite || "";
        F.location_name.value = item.location_name || "";
        F.isems_number.value = item.isems_number ? "true" : "false";
        F.phone_number.value = item.phone_number || "";
        F.cardtype.value = item.cardtype || "";
        F.service_provider_name.value = item.service_provider_name || "";
        F.ica_number.value = item.ica_number || "";
        F.fax_number.value = item.fax_number || "";
        F.insurance_name.value = item.insurance_name || "";
        F.insurance_number.value = item.insurance_number || "";
        F.bic_number.value = item.bic_number || "";
        F.blz_number.value = item.blz_number || "";
        F.bin_number.value = item.bin_number || "";

        F.bankname.focus();
      });
    });

    rowsEl.querySelectorAll("[data-del]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-del");
        const item = allRows.find(x => x.id === id);
        if (!item) return;

        if (!confirm(`Delete "${item.bankname}" (${item.phone_number})?`)) return;

        const res = await sb.from(TABLE).delete().eq("id", id);
        if (res.error) {
          alert(res.error.message);
          return;
        }
        await loadAndRender();
      });
    });
  }

  async function loadAndRender() {
    const res = await sb.from(TABLE).select("*").order("bankname", { ascending: true });
    if (res.error) { alert(res.error.message); return; }
    allRows = res.data || [];
    renderTable();
  }

  search.addEventListener("input", renderTable);
  await loadAndRender();
}
