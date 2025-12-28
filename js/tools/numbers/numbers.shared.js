import { sb, getSession } from "../../lib/supabaseClient.js";
import { esc, includesCI } from "../../lib/utils.js";
import { signIn, signUp, signOut, isAdminUser } from "../../lib/auth.js";
import { TABLE, COLUMNS } from "./numbers.schema.js";

// ---------------------------
// Shell + Auth
// ---------------------------

export function renderShell({ title, subtitle, session }) {
  return `
    <section class="card">
      <div class="cardHead">
        <strong>${esc(title)}</strong>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <button class="btn" id="refreshBtn" type="button">Refresh</button>
          <button class="btn" id="logoutBtn" type="button" style="display:${session ? "inline-flex" : "none"};">Logout</button>
        </div>
      </div>

      <div class="cardBody" style="gap:14px;">
        <div class="card" style="border-radius:14px;">
          <div class="cardHead">
            <strong>Login</strong>
            <span style="color:rgba(255,255,255,.68); font-size:12px;">${esc(subtitle)}</span>
          </div>
          <div class="cardBody" id="authBox" style="display:${session ? "none" : "grid"}; gap:10px;">
            <input id="email" type="text" placeholder="Email">
            <input id="password" type="password" placeholder="Password">
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <button class="btn" id="loginBtn" type="button">Login</button>
              <button class="btn" id="signupBtn" type="button">Sign up</button>
            </div>
            <div id="authMsg" style="color:rgba(255,255,255,.68); font-size:12px;"></div>
          </div>
        </div>

        <div id="bodyRoot" style="display:${session ? "grid" : "none"}; gap:14px;"></div>
      </div>
    </section>
  `;
}

/**
 * Wires login/signup/logout for a rendered shell.
 * Returns: { refreshBtn }
 */
export async function wireAuth({ root, onAuthedRerender, signupHint }) {
  const authMsg = root.querySelector("#authMsg");
  const loginBtn = root.querySelector("#loginBtn");
  const signupBtn = root.querySelector("#signupBtn");
  const logoutBtn = root.querySelector("#logoutBtn");
  const refreshBtn = root.querySelector("#refreshBtn");

  if (loginBtn) {
    loginBtn.addEventListener("click", async () => {
      authMsg.textContent = "";
      const email = root.querySelector("#email")?.value?.trim() || "";
      const password = root.querySelector("#password")?.value || "";
      const { error } = await signIn(email, password);
      if (error) authMsg.textContent = error.message;
      else onAuthedRerender();
    });
  }

  if (signupBtn) {
    signupBtn.addEventListener("click", async () => {
      authMsg.textContent = "";
      const email = root.querySelector("#email")?.value?.trim() || "";
      const password = root.querySelector("#password")?.value || "";
      const { error } = await signUp(email, password);

      if (error) authMsg.textContent = error.message;
      else authMsg.textContent = signupHint || "Signed up. If email confirmation is enabled, check your inbox.";
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await signOut();
      onAuthedRerender();
    });
  }

  return { refreshBtn };
}

// ---------------------------
// Permissions helpers
// ---------------------------

export async function adminLinkVisible() {
  const s = await getSession();
  if (!s) return false;
  return await isAdminUser();
}

export async function requireSession() {
  const s = await getSession();
  return s || null;
}

export async function requireAdmin() {
  const s = await getSession();
  if (!s) return { session: null, isAdmin: false };
  const ok = await isAdminUser();
  return { session: s, isAdmin: ok };
}

export function renderAccessDenied() {
  return `
    <div class="card" style="border-radius:14px;">
      <div class="cardHead"><strong>Access denied</strong></div>
      <div class="cardBody">
        You are logged in, but you are not an admin.
        Ask an admin to add your user id to <span class="mono">admin_users</span>.
      </div>
    </div>
  `;
}

// ---------------------------
// Filters UI + logic (shared)
// ---------------------------

export function buildFiltersUI({ showAdminLink = false }) {
  const filterInputs = COLUMNS
    .filter(c => c.filter && c.type !== "bool")
    .map(c => `<input data-filter="${esc(c.key)}" type="text" placeholder="${esc(c.label)}">`)
    .join("");

  return `
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
          <a class="btn" id="adminLink" href="./admin.html" style="display:${showAdminLink ? "inline-flex" : "none"};">Admin Editor</a>
        </div>
      </div>

      <div class="cardBody">
        <div class="grid4">
          ${filterInputs}
        </div>
      </div>
    </div>
  `;
}

export function getFilters(root) {
  const fieldMap = {};
  COLUMNS.forEach(c => {
    if (c.filter && c.type !== "bool") {
      fieldMap[c.key] = root.querySelector(`[data-filter="${CSS.escape(c.key)}"]`);
    }
  });

  return {
    globalSearch: root.querySelector("#globalSearch"),
    isems: root.querySelector("#f_isems_number"),
    fields: fieldMap,
    clearBtn: root.querySelector("#clearBtn"),
  };
}

export function haystack(row) {
  return COLUMNS.map(c => {
    const v = row[c.key];
    if (c.type === "bool") return v ? "ems" : "non-ems";
    return (v ?? "").toString();
  }).join(" | ").toLowerCase();
}

export function passesFilters(row, FLT) {
  const qGlobal = (FLT.globalSearch?.value || "").trim().toLowerCase();
  const qEms = (FLT.isems?.value || "").trim();

  for (const [key, el] of Object.entries(FLT.fields || {})) {
    const q = (el?.value || "").trim().toLowerCase();
    if (!includesCI(row[key], q)) return false;
  }

  if (qEms !== "") {
    const want = qEms === "true";
    if (!!row.isems_number !== want) return false;
  }

  if (qGlobal && !haystack(row).includes(qGlobal)) return false;
  return true;
}

export function wireFilters({ root, FLT, onChange }) {
  Object.values(FLT.fields).forEach(el => el?.addEventListener("input", onChange));
  FLT.globalSearch?.addEventListener("input", onChange);
  FLT.isems?.addEventListener("change", onChange);

  FLT.clearBtn?.addEventListener("click", () => {
    if (FLT.globalSearch) FLT.globalSearch.value = "";
    if (FLT.isems) FLT.isems.value = "";
    Object.values(FLT.fields).forEach(el => { if (el) el.value = ""; });
    onChange();
  });
}

// ---------------------------
// Table UI + rendering
// ---------------------------

export function buildTableUI({ actions = false }) {
  const heads = COLUMNS.map(c => `<th>${esc(c.label)}</th>`).join("");
  const actionsHead = actions ? `<th style="width:170px;">Actions</th>` : "";
  const searchBox = actions ? `<input id="search" type="text" placeholder="Search..." style="width:300px; max-width:60vw;">` : "";

  return `
    <div class="card" style="border-radius:14px; overflow:hidden;">
      <div class="cardHead">
        <strong>List</strong>
        <span id="count" style="color:rgba(255,255,255,.68); font-size:12px;"></span>
        ${searchBox}
      </div>
      <div class="tableWrap">
        <table class="table">
          <thead><tr>${heads}${actionsHead}</tr></thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
    </div>
  `;
}

export function renderRows(root, list, { actions = false, onEdit, onDelete } = {}) {
  const rowsEl = root.querySelector("#rows");
  const countEl = root.querySelector("#count");
  if (countEl) countEl.textContent = `${list.length} entries`;
  if (!rowsEl) return;

  rowsEl.innerHTML = list.map(r => {
    const tds = COLUMNS.map(c => {
      const v = r[c.key];

      if (c.type === "url") {
        return `<td>${v ? `<a href="${esc(v)}" target="_blank" rel="noopener noreferrer">${esc(v)}</a>` : ""}</td>`;
      }
      if (c.type === "bool") {
        return `<td>${v ? "EMS" : "Non-EMS"}</td>`;
      }

      const cls = c.mono ? ` class="mono"` : "";
      return `<td${cls}>${esc(v ?? "")}</td>`;
    }).join("");

    const actionTd = actions ? `
      <td>
        <button class="btn" type="button" data-edit="${esc(r.id)}">Edit</button>
        <button class="btn" type="button" data-del="${esc(r.id)}">Delete</button>
      </td>` : "";

    return `<tr>${tds}${actionTd}</tr>`;
  }).join("");

  if (actions) {
    rowsEl.querySelectorAll("[data-edit]").forEach(btn => {
      btn.addEventListener("click", () => onEdit?.(btn.getAttribute("data-edit")));
    });
    rowsEl.querySelectorAll("[data-del]").forEach(btn => {
      btn.addEventListener("click", () => onDelete?.(btn.getAttribute("data-del")));
    });
  }
}

// ---------------------------
// Admin form (schema-driven)
// ---------------------------

function groupColumnsForForm() {
  const cols = COLUMNS.filter(c => c.form);
  const groups = new Map();
  for (const c of cols) {
    const g = c.group ?? 99;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(c);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([_, arr]) => arr);
}

function gridClassForCount(n) {
  if (n <= 2) return "grid2";
  if (n === 3) return "grid3";
  return "grid4";
}

function formControlHTML(c) {
  if (c.type === "bool") {
    return `
      <select id="${esc(c.key)}">
        <option value="false">Non-EMS</option>
        <option value="true">EMS</option>
      </select>
    `;
  }

  const star = c.required ? " *" : "";
  const ph = `${c.label}${star}${c.type === "url" ? " (https://...)" : ""}`;
  return `<input id="${esc(c.key)}" type="text" placeholder="${esc(ph)}">`;
}

export function buildAdminFormUI() {
  const groups = groupColumnsForForm();

  const groupHtml = groups.map(cols => `
    <div class="${gridClassForCount(cols.length)}">
      ${cols.map(formControlHTML).join("")}
    </div>
  `).join("\n");

  return `
    <div class="card" style="border-radius:14px;">
      <div class="cardHead">
        <strong>Add / Edit / Delete</strong>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn" id="newBtn" type="button">New</button>
          <button class="btn" id="saveBtn" type="button">Save</button>
        </div>
      </div>

      <div class="cardBody" style="gap:10px;">
        ${groupHtml}
        <div id="saveMsg" style="color:rgba(255,255,255,.68); font-size:12px;"></div>
      </div>
    </div>
  `;
}

export function getFormRefs(root) {
  const refs = {};
  for (const c of COLUMNS) {
    if (!c.form) continue;
    refs[c.key] = root.querySelector(`#${CSS.escape(c.key)}`);
  }
  return refs;
}

export function clearForm(refs) {
  for (const c of COLUMNS) {
    if (!c.form) continue;
    const el = refs[c.key];
    if (!el) continue;

    if (c.type === "bool" && el.tagName === "SELECT") el.value = "false";
    else el.value = "";
  }
  refs.bankname?.focus?.();
}

export function fillForm(refs, item) {
  for (const c of COLUMNS) {
    if (!c.form) continue;
    const el = refs[c.key];
    if (!el) continue;

    if (c.type === "bool") el.value = item[c.key] ? "true" : "false";
    else el.value = item[c.key] ?? "";
  }
  refs.bankname?.focus?.();
}

export function payloadFromForm(refs) {
  const payload = {};
  for (const c of COLUMNS) {
    if (!c.form) continue;
    const el = refs[c.key];
    if (!el) continue;

    if (c.type === "bool") {
      payload[c.key] = el.value === "true";
      continue;
    }

    const v = (el.value ?? "").toString().trim();
    payload[c.key] = v ? v : null;
  }
  return payload;
}

export function validatePayload(payload, { isValidUrlMaybe }) {
  for (const c of COLUMNS) {
    if (!c.required) continue;
    const v = payload[c.key];
    if (!v) return `${c.label} is required.`;
  }

  if (payload.bankwebsite && !isValidUrlMaybe(payload.bankwebsite)) {
    return "Bank website must be a valid URL (https://...)";
  }

  return null;
}

// ---------------------------
// DB helpers
// ---------------------------

export async function loadAllRows() {
  return await sb.from(TABLE).select("*").order("bankname", { ascending: true });
}
