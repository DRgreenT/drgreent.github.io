import { sb, getSession } from "../../lib/supabaseClient.js";
import { esc, includesCI } from "../../lib/utils.js";
import { signIn, signUp, signOut, isAdminUser } from "../../lib/auth.js";
import { TABLE, COLUMNS, NOTES_TABLE } from "./numbers.schema.js";

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
            </div>
            <div id="authMsg" style="color:rgba(255,255,255,.68); font-size:12px;"></div>
          </div>
        </div>

        <div id="bodyRoot" style="display:${session ? "grid" : "none"}; gap:14px;"></div>
      </div>
    </section>
  `;
}

export async function wireAuth({ root, onAuthedRerender, signupHint }) {
  const authMsg = root.querySelector("#authMsg");
  const loginBtn = root.querySelector("#loginBtn");

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
// Filters logic (used in view)
// ---------------------------

export function haystack(row) {
  // Concatenate all column values for the global search.
  // (Everything is treated as text.)
  return COLUMNS
    .map(c => (row[c.key] ?? "").toString())
    .join(" | ")
    .toLowerCase();
}

export function passesFilters(row, FLT) {
  const qGlobal = (FLT.globalSearch?.value || "").trim().toLowerCase();

  for (const [key, el] of Object.entries(FLT.fields || {})) {
    const q = (el?.value || "").trim().toLowerCase();
    if (!includesCI(row[key], q)) return false;
  }

  if (qGlobal && !haystack(row).includes(qGlobal)) return false;
  return true;
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
  const star = c.required ? " *" : "";
  const ph = `${c.label}${star}${c.type === "url" ? " (https://...)" : ""}`;

  // Support enum/select fields (e.g. ems_status)
  if (c.type === "enum" && Array.isArray(c.options)) {
    const opts = [`<option value="">${esc(ph)}</option>`]
      .concat(c.options.map(o => `<option value="${esc(o)}">${esc(o)}</option>`))
      .join("");
    return `<select id="${esc(c.key)}">${opts}</select>`;
  }

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
    el.value = "";
  }
  refs.bankname?.focus?.();
}

export function fillForm(refs, item) {
  for (const c of COLUMNS) {
    if (!c.form) continue;
    const el = refs[c.key];
    if (!el) continue;
    el.value = item[c.key] ?? "";
  }
  refs.bankname?.focus?.();
}

export function payloadFromForm(refs) {
  const payload = {};
  for (const c of COLUMNS) {
    if (!c.form) continue;
    const el = refs[c.key];
    if (!el) continue;

    const v = (el.value ?? "").toString().trim();
    payload[c.key] = v ? v : null;
  }
  return payload;
}

/**
 * Validates client-side like your SQL CHECK constraints.
 * Also normalizes a few obvious fields so the DB check passes:
 * - bank_country: uppercase
 * - bic_number: uppercase
 * - ems_status: accepts both/yes/no and converts to Both/Yes/No
 *
 * Returns: string error message or null
 */
export function validatePayload(payload, { isValidUrlMaybe }) {
  // --- Normalization (minimal + predictable)
  if (payload.bank_country) payload.bank_country = String(payload.bank_country).trim().toUpperCase();
  if (payload.bic_number) payload.bic_number = String(payload.bic_number).trim().toUpperCase();

  // ems_status: allow user input "both/yes/no" and normalize to DB values
  if (payload.ems_status) {
    const raw = String(payload.ems_status).trim();
    const lower = raw.toLowerCase();
    if (lower === "both") payload.ems_status = "Both";
    else if (lower === "yes") payload.ems_status = "Yes";
    else if (lower === "no") payload.ems_status = "No";
    else payload.ems_status = raw; // let validation below catch it
  }

  // required fields
  for (const c of COLUMNS) {
    if (!c.required) continue;
    const v = payload[c.key];
    if (!v) return `${c.label} is required.`;
  }

  // URL check (schema: bankwebsite varchar(255), optional)
  if (payload.bankwebsite && !isValidUrlMaybe(payload.bankwebsite)) {
    return "Bank website must be a valid URL (https://...)";
  }

  // --- DB constraint mirrors (client-side)
  // bank_country varchar(2) check (bank_country ~ '^[A-Z]{2}$')
  if (payload.bank_country && !/^[A-Z]{2}$/.test(payload.bank_country)) {
    return "Bank Country must be exactly 2 uppercase letters (e.g. DE, GR, US).";
  }

  // ems_status varchar(4) check (ems_status in ('Both','Yes','No'))
  if (payload.ems_status && !/^(Both|Yes|No)$/.test(payload.ems_status)) {
    return "EMS must be one of: Both, Yes, No.";
  }

  // phone_number varchar(25) check (phone_number ~ '^[0-9+ ]+$')
  if (payload.phone_number && !/^[0-9+ ]+$/.test(payload.phone_number)) {
    return "Phone number may only contain digits, spaces, and '+' (e.g. +49 30 123456).";
  }

  // fax_number varchar(25) check (fax_number is null or fax_number ~ '^[0-9+ ]+$')
  if (payload.fax_number && !/^[0-9+ ]+$/.test(payload.fax_number)) {
    return "Fax number may only contain digits, spaces, and '+'.";
  }

  // ica_number varchar(11) check (ica_number is null or ica_number ~ '^[0-9]+$')
  if (payload.ica_number && !/^[0-9]+$/.test(payload.ica_number)) {
    return "ICA must contain digits only.";
  }

  // insurance_number varchar(30) check (insurance_number is null or insurance_number ~ '^[0-9]+$')
  if (payload.insurance_number && !/^[0-9]+$/.test(payload.insurance_number)) {
    return "Insurance number must contain digits only.";
  }

  // bic_number varchar(11) check (bic_number is null or bic_number ~ '^[A-Z0-9]{8}([A-Z0-9]{3})?$')
  if (payload.bic_number && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(payload.bic_number)) {
    return "BIC must be 8 or 11 characters (A-Z/0-9), e.g. DEUTDEFF or DEUTDEFF500.";
  }

  // blz_number varchar(8) check (blz_number is null or blz_number ~ '^[0-9]{8}$')
  if (payload.blz_number && !/^[0-9]{8}$/.test(payload.blz_number)) {
    return "BLZ must be exactly 8 digits.";
  }

  // bin_number varchar(6) check (bin_number is null or bin_number ~ '^[0-9]{6}$')
  if (payload.bin_number && !/^[0-9]{6}$/.test(payload.bin_number)) {
    return "BIN must be exactly 6 digits.";
  }

  // --- Length mirrors (helpful messages; DB will also enforce)
  if (payload.bankname && String(payload.bankname).length > 150) return "Bankname is too long (max 150).";
  if (payload.bankwebsite && String(payload.bankwebsite).length > 255) return "Bank website is too long (max 255).";
  if (payload.location_name && String(payload.location_name).length > 150) return "Location is too long (max 150).";
  if (payload.phone_number && String(payload.phone_number).length > 25) return "Phone number is too long (max 25).";
  if (payload.cardtype && String(payload.cardtype).length > 50) return "Card type is too long (max 50).";
  if (payload.uad_search_name && String(payload.uad_search_name).length > 150) return "UAD search name is too long (max 150).";
  if (payload.service_provider_name && String(payload.service_provider_name).length > 150) return "Service provider name is too long (max 150).";
  if (payload.ica_number && String(payload.ica_number).length > 11) return "ICA is too long (max 11).";
  if (payload.fax_number && String(payload.fax_number).length > 25) return "Fax number is too long (max 25).";
  if (payload.insurance_name && String(payload.insurance_name).length > 150) return "Insurance name is too long (max 150).";
  if (payload.insurance_number && String(payload.insurance_number).length > 30) return "Insurance number is too long (max 30).";
  if (payload.bic_number && String(payload.bic_number).length > 11) return "BIC is too long (max 11).";
  if (payload.blz_number && String(payload.blz_number).length > 8) return "BLZ is too long (max 8).";
  if (payload.bin_number && String(payload.bin_number).length > 6) return "BIN is too long (max 6).";

  return null;
}

// ---------------------------
// Table helpers (simple, stable)
// ---------------------------

export function buildNumbersTable({ actions = false, showNotesCol = false, adminHeaderControlsHtml = "" }) {
  const heads = COLUMNS.map(c => `<th>${esc(c.label)}</th>`).join("");
  const notesHead = showNotesCol ? `<th style="width:140px;">Notes</th>` : "";
  const actionsHead = actions ? `<th style="width:170px;">Actions</th>` : "";

  return `
    <div class="card" style="border-radius:14px; overflow:hidden;">
      <div class="cardHead">
        <strong>List</strong>
        <span id="count" style="color:rgba(255,255,255,.68); font-size:12px;"></span>
        ${adminHeaderControlsHtml}
      </div>
      <div class="tableWrap">
        <table class="table">
          <thead><tr>${heads}${notesHead}${actionsHead}</tr></thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
    </div>
  `;
}

export function renderNumbersRows(root, list, { actions = false, showNotesCol = false, notesCellHtml, onEdit, onDelete } = {}) {
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

      const cls = c.mono ? ` class="mono"` : "";
      return `<td${cls}>${esc(v ?? "")}</td>`;
    }).join("");

    const notesTd = showNotesCol ? `<td>${notesCellHtml ? notesCellHtml(r) : ""}</td>` : "";

    const actionTd = actions ? `
      <td>
        <button class="btn" type="button" data-edit="${esc(r.id)}">Edit</button>
        <button class="btn" type="button" data-del="${esc(r.id)}">Delete</button>
      </td>` : "";

    return `<tr>${tds}${notesTd}${actionTd}</tr>`;
  }).join("");

  if (actions) {
    rowsEl.querySelectorAll("[data-edit]").forEach(btn =>
      btn.addEventListener("click", () => onEdit?.(btn.getAttribute("data-edit")))
    );
    rowsEl.querySelectorAll("[data-del]").forEach(btn =>
      btn.addEventListener("click", () => onDelete?.(btn.getAttribute("data-del")))
    );
  }
}

// ---------------------------
// DB helpers
// ---------------------------

export async function loadAllRows() {
  return await sb.from(TABLE).select("*").order("bankname", { ascending: true });
}

/**
 * ADMIN: load rows with notes count
 * Needs FK relation bank_number_notes.bank_number_id -> bank_numbers.id
 */
export async function loadAllRowsWithNotesCount() {
  const res = await sb
    .from(TABLE)
    .select("*, bank_number_notes(count)")
    .order("bankname", { ascending: true });

  if (res.error) return res;

  const data = (res.data || []).map(r => {
    const cnt = Array.isArray(r.bank_number_notes) && r.bank_number_notes[0]?.count != null
      ? Number(r.bank_number_notes[0].count)
      : 0;

    const out = { ...r, notes_count: cnt };
    delete out.bank_number_notes;
    return out;
  });

  return { data, error: null };
}

// ---------------------------
// Notes helpers (CRUD) + compatibility
// ---------------------------

export function groupNotesByBankId(notes) {
  const m = new Map();
  for (const n of notes || []) {
    const k = n.bank_number_id;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(n);
  }
  return m;
}

export async function loadNotesForBankIds(bankIds) {
  if (!bankIds?.length) return { data: [], error: null };

  return await sb
    .from(NOTES_TABLE)
    .select("id, bank_number_id, note_text, created_at, created_by, updated_at, updated_by")
    .in("bank_number_id", bankIds)
    .order("created_at", { ascending: false });
}

export async function loadNotesForBankId(bankId) {
  return await sb
    .from(NOTES_TABLE)
    .select("id, bank_number_id, note_text, created_at, created_by, updated_at, updated_by")
    .eq("bank_number_id", bankId)
    .order("created_at", { ascending: false });
}

export async function addNote(bankNumberId, noteText) {
  const trimmed = (noteText || "").trim();
  if (!trimmed) return { data: null, error: { message: "Note is empty." } };

  return await sb.from(NOTES_TABLE).insert({
    bank_number_id: bankNumberId,
    note_text: trimmed,
  });
}

export async function updateNote(noteId, newText, userId) {
  const trimmed = (newText || "").trim();
  if (!trimmed) return { data: null, error: { message: "Note is empty." } };

  return await sb
    .from(NOTES_TABLE)
    .update({
      note_text: trimmed,
      updated_at: new Date().toISOString(),
      updated_by: userId || null,
    })
    .eq("id", noteId);
}

export async function deleteNote(noteId) {
  return await sb.from(NOTES_TABLE).delete().eq("id", noteId);
}

// ---------------------------
// Filters UI + wiring (compat for numbersView.js)
// ---------------------------

export function buildFiltersUI({ showAdminLink = false }) {
  // Filters are mostly text inputs; ems_status is a select (Both/Yes/No).
  const filterInputs = COLUMNS
    .filter(c => c.filter)
    .map(c => {
      if (c.key === "ems_status" && Array.isArray(c.options)) {
        const opts = [`<option value="">${esc(c.label)} (Any)</option>`]
          .concat(c.options.map(o => `<option value="${esc(o)}">${esc(o)}</option>`))
          .join("");
        return `<select data-filter="${esc(c.key)}">${opts}</select>`;
      }
      return `<input data-filter="${esc(c.key)}" type="text" placeholder="${esc(c.label)}">`;
    })
    .join("");

  return `
    <div class="card" style="border-radius:14px;">
      <div class="cardHead">
        <strong>Filters</strong>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <input id="globalSearch" type="text" placeholder="Global search (all fields)" style="width:320px; max-width:70vw;">
          <button class="btn" id="clearBtn" type="button">Clear</button>
          <a class="btn" id="adminLink" href="./admin.html" style="display:${showAdminLink ? "inline-flex" : "none"};">Bank Info Editor</a>
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
    if (c.filter) {
      fieldMap[c.key] = root.querySelector(`[data-filter="${CSS.escape(c.key)}"]`);
    }
  });

  return {
    globalSearch: root.querySelector("#globalSearch"),
    clearBtn: root.querySelector("#clearBtn"),
    fields: fieldMap,
  };
}

export function wireFilters({ FLT, onChange }) {
  // inputs
  Object.values(FLT.fields || {}).forEach(el => {
    if (!el) return;
    const evt = el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(evt, onChange);
  });
  // global search
  FLT.globalSearch?.addEventListener("input", onChange);

  // clear button
  FLT.clearBtn?.addEventListener("click", () => {
    if (FLT.globalSearch) FLT.globalSearch.value = "";
    Object.values(FLT.fields || {}).forEach(el => { if (el) el.value = ""; });
    onChange();
  });
}

// ------------------------------------------------------------------
// Backwards-compat exports
// ------------------------------------------------------------------

export function buildTableUI(opts = {}) {
  const { actions = false, extraHeaderHtml = "", adminHeaderControlsHtml = "" } = opts;
  const showNotesCol = !!extraHeaderHtml;

  return buildNumbersTable({
    actions,
    showNotesCol,
    adminHeaderControlsHtml,
  });
}

export function renderRows(root, list, opts = {}) {
  const { actions = false, onEdit, onDelete, extraCellHtml } = opts;
  const showNotesCol = typeof extraCellHtml === "function";

  return renderNumbersRows(root, list, {
    actions,
    showNotesCol,
    notesCellHtml: extraCellHtml,
    onEdit,
    onDelete,
  });
}
