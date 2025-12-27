// =====================================
// Supabase (FREE cloud DB) setup
// =====================================
const SUPABASE_URL = "https://artcxskvrbvxcwybcblx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_XAiOftT-_u-pgSWguvYE3Q_WPbmaWyP";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TABLE = "bank_numbers";

// =====================================
// App shell
// =====================================
const viewRoot = document.getElementById("viewRoot");
const navButtons = [...document.querySelectorAll(".navItem")];
const state = { view: "highlightit" };

// ---------- Router ----------
function setView(name) {
  state.view = name;
  navButtons.forEach(b => b.classList.toggle("active", b.dataset.view === name));
  if (name === "numbers") renderNumbers();
  else renderHighlightIt();
}
navButtons.forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));

// =====================================
// Helpers
// =====================================
function esc(s) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function getSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

// =====================================
// Tool 1: HighlightIt
// =====================================
function renderHighlightIt() {
  viewRoot.innerHTML = `
    <section class="card">
      <div class="cardHead">
        <strong>HighlightIt</strong>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <label style="font-size:13px; color: rgba(255,255,255,.68); display:flex; align-items:center; gap:8px;">
            <input id="stripHtml" type="checkbox" />
            Strip HTML
          </label>
          <button class="btn" id="sampleBtn" type="button">Example</button>
          <button class="btn" id="copyBtn" type="button">Copy</button>
        </div>
      </div>

      <div class="cardBody">
        <textarea id="inputText" placeholder="Paste text here..."></textarea>

        <input id="keywords" type="text" placeholder='Keywords (comma-separated or "as phrase")' />

        <div class="card" style="border-radius:14px;">
          <div class="cardHead"><strong>Output</strong></div>
          <div class="cardBody">
            <div id="output" style="white-space:pre-wrap; line-height:1.55;"></div>
          </div>
        </div>
      </div>
    </section>
  `;

  const elInput = document.getElementById("inputText");
  const elKeywords = document.getElementById("keywords");
  const elStrip = document.getElementById("stripHtml");
  const elOutput = document.getElementById("output");

  document.getElementById("sampleBtn").addEventListener("click", () => {
    elInput.value = `<div><p>The 21cm line is <b>1420 MHz</b>. Black hole mergers.</p></div>`;
    elKeywords.value = `"black hole", 1420 MHz`;
    elStrip.checked = true;
    render();
  });

  document.getElementById("copyBtn").addEventListener("click", async () => {
    const t = getFormattedText();
    try { await navigator.clipboard.writeText(t); } catch {}
  });

  elInput.addEventListener("input", render);
  elKeywords.addEventListener("input", render);
  elStrip.addEventListener("change", render);

  function normalizeText(text) {
    let t = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    t = t.replace(/\t/g, " ");
    t = t.split("\n").map(line => line.replace(/ {2,}/g, " ").trimEnd()).join("\n");
    t = t.replace(/\n{3,}/g, "\n\n");
    return t.trim();
  }

  function decodeHtmlEntities(html) {
    const txt = document.createElement("textarea");
    txt.innerHTML = html;
    return txt.value;
  }

  function stripHtmlToText(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const text = doc.body.innerText ?? doc.body.textContent ?? "";
    return normalizeText(text);
  }

  function getFormattedText() {
    const raw = elInput.value ?? "";
    if (!raw.trim()) return "";
    return elStrip.checked ? stripHtmlToText(raw) : normalizeText(decodeHtmlEntities(raw));
  }

  function parseKeywords(input) {
    const s = (input || "").trim();
    if (!s) return [];
    const out = [];
    const re = /"([^"]+)"|([^,]+)/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      const kw = (m[1] ?? m[2] ?? "").trim();
      if (kw) out.push(kw);
    }
    const seen = new Set();
    return out.filter(k => {
      const key = k.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function render() {
    const text = getFormattedText();
    const kws = parseKeywords(elKeywords.value);

    if (!text) { elOutput.innerHTML = ""; return; }
    if (!kws.length) { elOutput.innerHTML = escapeHtml(text); return; }

    const sorted = [...kws].sort((a, b) => b.length - a.length);
    const pattern = sorted.map(escapeRegExp).join("|");
    const re = new RegExp(pattern, "gi");

    elOutput.innerHTML = escapeHtml(text).replace(
      re,
      (match) => `<mark style="padding:0 2px; border-radius:6px; background: rgba(255,227,94,.28); border:1px solid rgba(255,227,94,.55);">${escapeHtml(match)}</mark>`
    );
  }

  render();
}

// =====================================
// Tool 2: Numbers (Cloud + filters + CRUD)
// Columns required:
// bankname, location_name, isems_number(bool), phone_number, cardtype,
// service_provider_name, ICA_number, fax_number, insurance_name,
// incurance_number (typo in text -> using insurance_number), bic_number,
// blz_number, bin_number
// =====================================
async function renderNumbers() {
  const session = await getSession();

  viewRoot.innerHTML = `
    <section class="card">
      <div class="cardHead">
        <strong>Numbers (Cloud)</strong>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <button class="btn" id="refreshBtn">Refresh</button>
          <button class="btn" id="logoutBtn" style="display:${session ? "inline-flex" : "none"};">Logout</button>
        </div>
      </div>

      <div class="cardBody" style="gap:14px;">
        <!-- AUTH -->
        <div class="card" style="border-radius:14px;">
          <div class="cardHead">
            <strong>Login</strong>
            <span style="color:rgba(255,255,255,.68); font-size:12px;">Login required to view/edit shared data.</span>
          </div>
          <div class="cardBody" id="authBox" style="display:${session ? "none" : "grid"}; gap:10px;">
            <input id="email" type="text" placeholder="Email">
            <input id="password" type="password" placeholder="Password" autocomplete="current-password">
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <button class="btn" id="loginBtn">Login</button>
              <button class="btn" id="signupBtn">Sign up</button>
            </div>
            <div id="authMsg" style="color:rgba(255,255,255,.68); font-size:12px;"></div>
          </div>
        </div>

        <!-- APP -->
        <div id="appBox" style="display:${session ? "grid" : "none"}; gap:14px;">
          <!-- FORM -->
          <div class="card" style="border-radius:14px;">
            <div class="cardHead">
              <strong>Add / Edit</strong>
              <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <button class="btn" id="newBtn">New</button>
                <button class="btn" id="saveBtn">Save</button>
              </div>
            </div>

            <div class="cardBody" style="gap:10px;">
              <div class="grid3">
                <input id="bankname" type="text" placeholder="Bankname *">
                <input id="location_name" type="text" placeholder="Location name">
                <select id="isems_number">
                  <option value="false">Non-EMS</option>
                  <option value="true">EMS</option>
                </select>
              </div>

              <div class="grid3">
                <input id="phone_number" type="text" placeholder="Phone number *">
                <input id="fax_number" type="text" placeholder="Fax number">
                <input id="cardtype" type="text" placeholder="Card type">
              </div>

              <div class="grid3">
                <input id="service_provider_name" type="text" placeholder="Service provider name">
                <input id="ica_number" type="text" placeholder="ICA number">
                <input id="bin_number" type="text" placeholder="BIN number">
              </div>

              <div class="grid3">
                <input id="insurance_name" type="text" placeholder="Insurance name">
                <input id="insurance_number" type="text" placeholder="Insurance number">
                <input id="bic_number" type="text" placeholder="BIC number">
              </div>

              <div class="grid2">
                <input id="blz_number" type="text" placeholder="BLZ number">
                <div style="display:flex; gap:10px;">
                  <button class="btn" id="copyPhoneBtn" type="button">Copy phone</button>
                  <span id="saveMsg" style="align-self:center; color:rgba(255,255,255,.68); font-size:12px;"></span>
                </div>
              </div>

              <div style="color:rgba(255,255,255,.55); font-size:12px;">
                * required
              </div>
            </div>
          </div>

          <!-- FILTERS -->
          <div class="card" style="border-radius:14px;">
            <div class="cardHead">
              <strong>Filters</strong>
              <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <button class="btn" id="clearFiltersBtn" type="button">Clear filters</button>
              </div>
            </div>
            <div class="cardBody" style="gap:10px;">
              <div class="grid4">
                <input id="f_bankname" type="text" placeholder="Filter: Bankname">
                <input id="f_location_name" type="text" placeholder="Filter: Location">
                <select id="f_isems_number">
                  <option value="">EMS: Any</option>
                  <option value="true">EMS</option>
                  <option value="false">Non-EMS</option>
                </select>
                <input id="f_phone_number" type="text" placeholder="Filter: Phone">
              </div>

              <div class="grid4">
                <input id="f_cardtype" type="text" placeholder="Filter: Card type">
                <input id="f_service_provider_name" type="text" placeholder="Filter: Service provider">
                <input id="f_ica_number" type="text" placeholder="Filter: ICA">
                <input id="f_fax_number" type="text" placeholder="Filter: Fax">
              </div>

              <div class="grid4">
                <input id="f_insurance_name" type="text" placeholder="Filter: Insurance name">
                <input id="f_insurance_number" type="text" placeholder="Filter: Insurance number">
                <input id="f_bic_number" type="text" placeholder="Filter: BIC">
                <input id="f_blz_number" type="text" placeholder="Filter: BLZ">
              </div>

              <div class="grid2">
                <input id="f_bin_number" type="text" placeholder="Filter: BIN">
                <input id="globalSearch" type="text" placeholder="Global search (all fields)">
              </div>

              <div style="color:rgba(255,255,255,.55); font-size:12px;">
                Filters are client-side (fast). Use Global search to find anything.
              </div>
            </div>
          </div>

          <!-- TABLE -->
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
        </div>
      </div>
    </section>
  `;

  // ---- Auth wiring
  const authMsg = document.getElementById("authMsg");
  const saveMsg = document.getElementById("saveMsg");

  const loginBtn = document.getElementById("loginBtn");
  const signupBtn = document.getElementById("signupBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const refreshBtn = document.getElementById("refreshBtn");

  if (loginBtn) {
    loginBtn.addEventListener("click", async () => {
      authMsg.textContent = "";
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) authMsg.textContent = error.message;
      else renderNumbers();
    });
  }

  if (signupBtn) {
    signupBtn.addEventListener("click", async () => {
      authMsg.textContent = "";
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;
      const { error } = await sb.auth.signUp({ email, password });
      if (error) authMsg.textContent = error.message;
      else authMsg.textContent = "Signed up. If email confirmation is enabled, check your inbox.";
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await sb.auth.signOut();
      renderNumbers();
    });
  }

  if (refreshBtn) refreshBtn.addEventListener("click", async () => loadAndRender());

  // If not logged in, stop
  const session2 = await getSession();
  if (!session2) return;

  // ---- Elements
  const elRows = document.getElementById("rows");
  const elCount = document.getElementById("count");

  // Form fields
  const F = {
    bankname: document.getElementById("bankname"),
    location_name: document.getElementById("location_name"),
    isems_number: document.getElementById("isems_number"),
    phone_number: document.getElementById("phone_number"),
    cardtype: document.getElementById("cardtype"),
    service_provider_name: document.getElementById("service_provider_name"),
    ica_number: document.getElementById("ica_number"),
    fax_number: document.getElementById("fax_number"),
    insurance_name: document.getElementById("insurance_name"),
    insurance_number: document.getElementById("insurance_number"),
    bic_number: document.getElementById("bic_number"),
    blz_number: document.getElementById("blz_number"),
    bin_number: document.getElementById("bin_number"),
  };

  // Filter fields
  const FLT = {
    f_bankname: document.getElementById("f_bankname"),
    f_location_name: document.getElementById("f_location_name"),
    f_isems_number: document.getElementById("f_isems_number"),
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
    globalSearch: document.getElementById("globalSearch"),
  };

  const newBtn = document.getElementById("newBtn");
  const saveBtn = document.getElementById("saveBtn");
  const copyPhoneBtn = document.getElementById("copyPhoneBtn");
  const clearFiltersBtn = document.getElementById("clearFiltersBtn");

  let editId = null;
  let allRows = [];

  newBtn.addEventListener("click", () => clearForm());

  copyPhoneBtn.addEventListener("click", async () => {
    const phone = (F.phone_number.value || "").trim();
    if (!phone) return;
    try { await navigator.clipboard.writeText(phone); } catch {}
  });

  saveBtn.addEventListener("click", async () => {
    saveMsg.textContent = "";

    const payload = {
      bankname: (F.bankname.value || "").trim(),
      location_name: (F.location_name.value || "").trim() || null,
      isems_number: F.isems_number.value === "true",
      phone_number: (F.phone_number.value || "").trim(),
      cardtype: (F.cardtype.value || "").trim() || null,
      service_provider_name: (F.service_provider_name.value || "").trim() || null,
      ica_number: (F.ica_number.value || "").trim() || null,
      fax_number: (F.fax_number.value || "").trim() || null,
      insurance_name: (F.insurance_name.value || "").trim() || null,
      insurance_number: (F.insurance_number.value || "").trim() || null,
      bic_number: (F.bic_number.value || "").trim() || null,
      blz_number: (F.blz_number.value || "").trim() || null,
      bin_number: (F.bin_number.value || "").trim() || null,
      updated_by: session2.user.id,
      updated_at: new Date().toISOString(),
    };

    if (!payload.bankname || !payload.phone_number) {
      saveMsg.textContent = "Bankname and phone number are required.";
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

  clearFiltersBtn.addEventListener("click", () => {
    Object.values(FLT).forEach(el => {
      if (!el) return;
      if (el.tagName === "SELECT") el.value = "";
      else el.value = "";
    });
    renderTable();
  });

  // Any filter change triggers re-render
  Object.values(FLT).forEach(el => {
    if (!el) return;
    el.addEventListener("input", renderTable);
    el.addEventListener("change", renderTable);
  });

  function clearForm() {
    editId = null;
    F.bankname.value = "";
    F.location_name.value = "";
    F.isems_number.value = "false";
    F.phone_number.value = "";
    F.cardtype.value = "";
    F.service_provider_name.value = "";
    F.ica_number.value = "";
    F.fax_number.value = "";
    F.insurance_name.value = "";
    F.insurance_number.value = "";
    F.bic_number.value = "";
    F.blz_number.value = "";
    F.bin_number.value = "";
    F.bankname.focus();
  }

  function haystack(row) {
    // global search content
    return [
      row.bankname, row.location_name,
      row.isems_number ? "ems" : "non-ems",
      row.phone_number, row.cardtype,
      row.service_provider_name, row.ica_number,
      row.fax_number, row.insurance_name,
      row.insurance_number, row.bic_number,
      row.blz_number, row.bin_number
    ].map(x => (x ?? "").toString().toLowerCase()).join(" | ");
  }

  function includesCI(value, q) {
    if (!q) return true;
    return (value ?? "").toString().toLowerCase().includes(q);
  }

  function passesFilters(row) {
    const qBank = (FLT.f_bankname.value || "").trim().toLowerCase();
    const qLoc = (FLT.f_location_name.value || "").trim().toLowerCase();
    const qEms = (FLT.f_isems_number.value || "").trim(); // "", "true", "false"
    const qPhone = (FLT.f_phone_number.value || "").trim().toLowerCase();
    const qCard = (FLT.f_cardtype.value || "").trim().toLowerCase();
    const qSp = (FLT.f_service_provider_name.value || "").trim().toLowerCase();
    const qIca = (FLT.f_ica_number.value || "").trim().toLowerCase();
    const qFax = (FLT.f_fax_number.value || "").trim().toLowerCase();
    const qInsName = (FLT.f_insurance_name.value || "").trim().toLowerCase();
    const qInsNo = (FLT.f_insurance_number.value || "").trim().toLowerCase();
    const qBic = (FLT.f_bic_number.value || "").trim().toLowerCase();
    const qBlz = (FLT.f_blz_number.value || "").trim().toLowerCase();
    const qBin = (FLT.f_bin_number.value || "").trim().toLowerCase();
    const qGlobal = (FLT.globalSearch.value || "").trim().toLowerCase();

    if (!includesCI(row.bankname, qBank)) return false;
    if (!includesCI(row.location_name, qLoc)) return false;

    if (qEms !== "") {
      const want = qEms === "true";
      if (!!row.isems_number !== want) return false;
    }

    if (!includesCI(row.phone_number, qPhone)) return false;
    if (!includesCI(row.cardtype, qCard)) return false;
    if (!includesCI(row.service_provider_name, qSp)) return false;
    if (!includesCI(row.ica_number, qIca)) return false;
    if (!includesCI(row.fax_number, qFax)) return false;
    if (!includesCI(row.insurance_name, qInsName)) return false;
    if (!includesCI(row.insurance_number, qInsNo)) return false;
    if (!includesCI(row.bic_number, qBic)) return false;
    if (!includesCI(row.blz_number, qBlz)) return false;
    if (!includesCI(row.bin_number, qBin)) return false;

    if (qGlobal) {
      if (!haystack(row).includes(qGlobal)) return false;
    }

    return true;
  }

  function filteredRows() {
    return allRows.filter(passesFilters);
  }

  function renderTable() {
    const list = filteredRows();
    elCount.textContent = `${list.length} entries`;

    elRows.innerHTML = list.map(r => `
      <tr>
        <td>${esc(r.bankname)}</td>
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

    // Edit
    elRows.querySelectorAll("[data-edit]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-edit");
        const item = allRows.find(x => x.id === id);
        if (!item) return;

        editId = id;
        F.bankname.value = item.bankname || "";
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

    // Delete
    elRows.querySelectorAll("[data-del]").forEach(btn => {
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
    if (res.error) {
      alert(res.error.message);
      return;
    }
    allRows = res.data || [];
    renderTable();
  }

  await loadAndRender();
}

setView("highlightit");
