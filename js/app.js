// =====================================
// Supabase (FREE cloud DB) setup
// =====================================
const SUPABASE_URL = "https://artcxskvrbvxcwybcblx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_XAiOftT-_u-pgSWguvYE3Q_WPbmaWyP";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TABLE = "bank_contacts";

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
  if (name === "numbers") renderNumbers(); // keep your nav name
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

function isValidUrlMaybe(s) {
  if (!s) return true;
  try { new URL(s); return true; } catch { return false; }
}

async function getSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

// =====================================
// Tool 1: HighlightIt (working version)
// =====================================
function renderHighlightIt() {
  viewRoot.innerHTML = `
    <section class="card">
      <div class="cardHead">
        <strong>HighlightIt</strong>
        <div>
          <label style="font-size:13px; color: rgba(255,255,255,.68);">
            <input id="stripHtml" type="checkbox" />
            Strip HTML
          </label>
          <button class="btn" id="sampleBtn" type="button">Example</button>
        </div>
      </div>

      <div class="cardBody">
        <textarea id="inputText" placeholder="Paste text here..."></textarea>

        <input id="keywords" type="text" placeholder='Keywords (comma-separated or "as phrase")' />

        <div class="card" style="border-radius:14px;">
          <div class="cardHead">
            <strong>Output</strong>
            <button class="btn" id="copyBtn">Copy</button>
          </div>
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
// Tool 2: Numbers -> Cloud "Bank Contacts"
// Columns: bank_name, ica, issuer, is_ems, phone_number, website, additional_info
// =====================================
async function renderNumbers() {
  const session = await getSession();

  viewRoot.innerHTML = `
    <section class="card">
      <div class="cardHead">
        <strong>Bank Contacts</strong>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <input id="search" type="text" placeholder="Search..." style="width:260px; max-width:45vw;">
          <button class="btn" id="refreshBtn">Refresh</button>
          <button class="btn" id="logoutBtn" style="display:${session ? "inline-flex" : "none"};">Logout</button>
        </div>
      </div>

      <div class="cardBody" style="gap:14px;">
        <!-- AUTH -->
        <div class="card" style="border-radius:14px;">
          <div class="cardHead">
            <strong>Login</strong>
            <span style="color:rgba(255,255,255,.68); font-size:12px;">Login required to view/edit shared contacts.</span>
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

        <!-- FORM -->
        <div class="card" id="appBox" style="border-radius:14px; display:${session ? "block" : "none"};">
          <div class="cardHead">
            <strong>Add / Edit</strong>
            <div style="display:flex; gap:10px;">
              <button class="btn" id="newBtn">New</button>
              <button class="btn" id="saveBtn">Save</button>
            </div>
          </div>
          <div class="cardBody" style="gap:10px;">
            <input id="bankName" type="text" placeholder="Bank name (required)">
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
              <input id="ica" type="text" placeholder="ICA (optional)">
              <input id="issuer" type="text" placeholder="Issuer (optional)">
            </div>

            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
              <label style="font-size:13px; color:rgba(255,255,255,.82); display:flex; gap:8px; align-items:center;">
                <input id="isEms" type="checkbox"> EMS
              </label>
              <span style="color:rgba(255,255,255,.55); font-size:12px;">Unchecked = Non-EMS</span>
            </div>

            <input id="phone" type="text" placeholder="Phone number (required)">
            <input id="website" type="text" placeholder="Website URL (optional, https://...)">
            <input id="info" type="text" placeholder="Additional info (optional)">
            <div id="saveMsg" style="color:rgba(255,255,255,.68); font-size:12px;"></div>
          </div>
        </div>

        <!-- TABLE -->
        <div class="card" id="listBox" style="border-radius:14px; overflow:hidden; display:${session ? "block" : "none"};">
          <div class="cardHead">
            <strong>List</strong>
            <span id="count" style="color:rgba(255,255,255,.68); font-size:12px;"></span>
          </div>
          <div style="overflow:auto;">
            <table class="table">
              <thead>
                <tr>
                  <th style="width:18%;">Bank</th>
                  <th style="width:10%;">ICA</th>
                  <th style="width:14%;">Issuer</th>
                  <th style="width:10%;">EMS</th>
                  <th style="width:16%;">Phone</th>
                  <th style="width:18%;">Website</th>
                  <th>Info</th>
                  <th style="width:170px;">Actions</th>
                </tr>
              </thead>
              <tbody id="rows"></tbody>
            </table>
          </div>
        </div>

      </div>
    </section>
  `;

  // --- Auth wiring ---
  const authMsg = document.getElementById("authMsg");
  const saveMsg = document.getElementById("saveMsg");

  const loginBtn = document.getElementById("loginBtn");
  const signupBtn = document.getElementById("signupBtn");
  const logoutBtn = document.getElementById("logoutBtn");

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

  // If not logged in, stop here
  const session2 = await getSession();
  if (!session2) return;

  // --- App wiring ---
  const elSearch = document.getElementById("search");
  const elRows = document.getElementById("rows");
  const elCount = document.getElementById("count");

  const elBankName = document.getElementById("bankName");
  const elIca = document.getElementById("ica");
  const elIssuer = document.getElementById("issuer");
  const elIsEms = document.getElementById("isEms");
  const elPhone = document.getElementById("phone");
  const elWebsite = document.getElementById("website");
  const elInfo = document.getElementById("info");

  let editId = null;
  let allRows = [];

  document.getElementById("refreshBtn").addEventListener("click", () => loadAndRender());
  document.getElementById("newBtn").addEventListener("click", () => clearForm());

  document.getElementById("saveBtn").addEventListener("click", async () => {
    saveMsg.textContent = "";

    const bank_name = elBankName.value.trim();
    const ica = elIca.value.trim();
    const issuer = elIssuer.value.trim();
    const is_ems = !!elIsEms.checked;
    const phone_number = elPhone.value.trim();
    const website = elWebsite.value.trim();
    const additional_info = elInfo.value.trim();

    if (!bank_name || !phone_number) {
      saveMsg.textContent = "Bank name and phone number are required.";
      return;
    }

    if (!isValidUrlMaybe(website)) {
      saveMsg.textContent = "Website must be a valid URL (e.g., https://example.com).";
      return;
    }

    const payload = {
      bank_name,
      ica: ica || null,
      issuer: issuer || null,
      is_ems,
      phone_number,
      website: website || null,
      additional_info: additional_info || null,
      updated_by: session2.user.id,
      updated_at: new Date().toISOString()
    };

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
    elBankName.value = "";
    elIca.value = "";
    elIssuer.value = "";
    elIsEms.checked = false;
    elPhone.value = "";
    elWebsite.value = "";
    elInfo.value = "";
    elBankName.focus();
  }

  function filteredList() {
    const q = (elSearch.value || "").trim().toLowerCase();
    if (!q) return allRows;

    return allRows.filter(x => {
      const emsText = x.is_ems ? "ems" : "non-ems";
      return (
        (x.bank_name || "").toLowerCase().includes(q) ||
        (x.ica || "").toLowerCase().includes(q) ||
        (x.issuer || "").toLowerCase().includes(q) ||
        emsText.includes(q) ||
        (x.phone_number || "").toLowerCase().includes(q) ||
        (x.website || "").toLowerCase().includes(q) ||
        (x.additional_info || "").toLowerCase().includes(q)
      );
    });
  }

  function renderTable() {
    const list = filteredList();
    elCount.textContent = `${list.length} entries`;

    elRows.innerHTML = list.map(x => `
      <tr>
        <td>${esc(x.bank_name)}</td>
        <td>${esc(x.ica || "")}</td>
        <td>${esc(x.issuer || "")}</td>
        <td>${x.is_ems ? "EMS" : "Non-EMS"}</td>
        <td style="font-family: var(--mono);">${esc(x.phone_number)}</td>
        <td>${x.website ? `<a href="${esc(x.website)}" target="_blank" rel="noopener noreferrer">${esc(x.website)}</a>` : ""}</td>
        <td>${esc(x.additional_info || "")}</td>
        <td>
          <button class="btn" data-edit="${x.id}">Edit</button>
          <button class="btn" data-del="${x.id}">Delete</button>
        </td>
      </tr>
    `).join("");

    elRows.querySelectorAll("[data-edit]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-edit");
        const item = allRows.find(r => r.id === id);
        if (!item) return;

        editId = id;
        elBankName.value = item.bank_name || "";
        elIca.value = item.ica || "";
        elIssuer.value = item.issuer || "";
        elIsEms.checked = !!item.is_ems;
        elPhone.value = item.phone_number || "";
        elWebsite.value = item.website || "";
        elInfo.value = item.additional_info || "";
        elBankName.focus();
      });
    });

    elRows.querySelectorAll("[data-del]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-del");
        const item = allRows.find(r => r.id === id);
        if (!item) return;
        if (!confirm(`Delete "${item.bank_name}"?`)) return;

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
    const res = await sb
      .from(TABLE)
      .select("*")
      .order("bank_name", { ascending: true });

    if (res.error) {
      alert(res.error.message);
      return;
    }
    allRows = res.data || [];
    renderTable();
  }

  elSearch.addEventListener("input", renderTable);
  await loadAndRender();
}

setView("highlightit");
