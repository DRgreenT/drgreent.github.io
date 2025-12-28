import { sb, getSession } from "../../lib/supabaseClient.js";
import { esc, includesCI } from "../../lib/utils.js";
import { signIn, signUp, signOut, isAdminUser } from "../../lib/auth.js";
import { TABLE, COLUMNS, NOTES_TABLE } from "./numbers.schema.js";

// ---------------------------
// Shell + Auth
// ---------------------------

/**
 * Build the common page shell (title/subtitle + auth toolbar).
 * Returns HTML as a string.
 */
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

      <div class="cardBody">
        <div style="display:grid; gap:10px;">
          <div style="display:flex; gap:10px; align-items:center; justify-content:space-between; flex-wrap:wrap;">
            <div style="display:grid;">
              <div style="color:rgba(255,255,255,.92); font-size:13px;">${esc(subtitle || "")}</div>
              <div id="authStatus" style="color:rgba(255,255,255,.68); font-size:12px;">
                ${session ? `Signed in: ${esc(session.user.email)}` : "Not signed in"}
              </div>
            </div>

            <div id="authBox" style="display:${session ? "none" : "flex"}; gap:10px; align-items:center; flex-wrap:wrap;">
              <input class="input" id="email" placeholder="email" style="width:220px;" />
              <input class="input" id="pw" placeholder="password" type="password" style="width:220px;" />
              <button class="btn" id="loginBtn" type="button">Login</button>
              <button class="btn" id="signupBtn" type="button">Sign up</button>
              <span id="authMsg" style="color:rgba(255,255,255,.68); font-size:12px;"></span>
            </div>
          </div>

          <div id="slot"></div>
        </div>
      </div>
    </section>
  `;
}

/**
 * Render a simple access denied / not-authorized message.
 */
export function renderAccessDenied() {
  return `
    <section class="card">
      <div class="cardHead"><strong>Access denied</strong></div>
      <div class="cardBody">
        <div style="color:rgba(255,255,255,.72); font-size:13px;">
          You don't have the required permissions for this page.
        </div>
      </div>
    </section>
  `;
}

/**
 * Wire login/signup/logout controls inside a rendered shell.
 * Calls onAuthedRerender() after a successful auth state change.
 */
export async function wireAuth({ root, onAuthedRerender, signupHint }) {
  const refreshBtn = root.querySelector("#refreshBtn");
  const logoutBtn = root.querySelector("#logoutBtn");
  const loginBtn = root.querySelector("#loginBtn");
  const signupBtn = root.querySelector("#signupBtn");
  const emailEl = root.querySelector("#email");
  const pwEl = root.querySelector("#pw");
  const authMsg = root.querySelector("#authMsg");

  refreshBtn?.addEventListener("click", () => onAuthedRerender?.());
  logoutBtn?.addEventListener("click", async () => {
    await signOut();
    onAuthedRerender?.();
  });

  async function doAuth(fn) {
    if (!emailEl || !pwEl || !authMsg) return;
    authMsg.textContent = "";
    const email = (emailEl.value || "").trim();
    const pw = (pwEl.value || "").trim();
    if (!email || !pw) {
      authMsg.textContent = "Email and password required.";
      return;
    }
    const res = await fn(email, pw);
    if (res.error) {
      authMsg.textContent = res.error.message || "Auth failed.";
      return;
    }
    authMsg.textContent = signupHint || "";
    onAuthedRerender?.();
  }

  loginBtn?.addEventListener("click", () => doAuth(signIn));
  signupBtn?.addEventListener("click", () => doAuth(signUp));
}

/**
 * Returns { session, isAdmin } for the current user.
 * isAdmin is derived from your auth rules / helper.
 */
export async function requireAdmin() {
  const s = await getSession();
  if (!s) return { session: null, isAdmin: false };
  const ok = await isAdminUser();
  return { session: s, isAdmin: ok };
}

// ---------------------------
// Filtering / search helpers
// ---------------------------

/**
 * Convert a row into a searchable string used by the client-side search.
 */
export function haystack(r) {
  return [
    r.bankname,
    r.bic,
    r.country,
    r.postcode,
    r.city,
    r.title,
    r.ibanstart,
    r.url,
    r.ems ? "EMS" : "Non-EMS",
  ]
    .filter(Boolean)
    .join(" • ");
}

/**
 * Client-side filter predicate for the list view.
 */
export function passesFilters(row, filters) {
  const q = (filters.q || "").trim();
  if (q && !includesCI(haystack(row), q)) return false;

  if (filters.onlyEms === true && !row.ems) return false;
  if (filters.onlyEms === false && row.ems) return false;

  if (filters.country && row.country !== filters.country) return false;

  return true;
}

// ---------------------------
// Admin form
// ---------------------------

/**
 * Build the admin editor form HTML.
 */
export function buildAdminFormUI() {
  const fields = COLUMNS.map(c => {
    if (c.key === "id") return ""; // id is not editable
    const label = esc(c.label);
    if (c.type === "bool") {
      return `
        <label style="display:flex; align-items:center; gap:10px;">
          <span style="width:140px; color:rgba(255,255,255,.72); font-size:12px;">${label}</span>
          <input type="checkbox" id="f_${esc(c.key)}" />
        </label>
      `;
    }
    return `
      <label style="display:grid; gap:6px;">
        <span style="color:rgba(255,255,255,.72); font-size:12px;">${label}</span>
        <input class="input" id="f_${esc(c.key)}" placeholder="${label}" />
      </label>
    `;
  }).join("");

  return `
    <div class="card" style="border-radius:14px;">
      <div class="cardHead"><strong>Editor</strong></div>
      <div class="cardBody">
        <div id="saveMsg" style="color:rgba(255,255,255,.68); font-size:12px;"></div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
          ${fields}
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn" id="newBtn" type="button">New</button>
          <button class="btn" id="saveBtn" type="button">Save</button>
          <button class="btn" id="clearBtn" type="button">Clear</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Collect and return input references from the admin form.
 */
export function getFormRefs(root) {
  const refs = {};
  for (const c of COLUMNS) {
    if (c.key === "id") continue;
    refs[c.key] = root.querySelector(`#f_${c.key}`);
  }
  return refs;
}

/**
 * Reset the admin form to an empty state.
 */
export function clearForm(refs) {
  for (const [k, el] of Object.entries(refs)) {
    if (!el) continue;
    if (el.type === "checkbox") el.checked = false;
    else el.value = "";
  }
}

/**
 * Fill the admin form with a row payload.
 */
export function fillForm(refs, row) {
  for (const [k, el] of Object.entries(refs)) {
    if (!el) continue;
    const v = row?.[k];
    if (el.type === "checkbox") el.checked = !!v;
    else el.value = v ?? "";
  }
}

/**
 * Read values from the admin form and build a payload for insert/update.
 */
export function payloadFromForm(refs) {
  const p = {};
  for (const c of COLUMNS) {
    if (c.key === "id") continue;
    const el = refs[c.key];
    if (!el) continue;
    if (c.type === "bool") p[c.key] = !!el.checked;
    else p[c.key] = (el.value || "").trim();
  }
  return p;
}

/**
 * Validate the editor payload. Returns an error string or null.
 */
export function validatePayload(p) {
  if (!p.bankname) return "bankname is required.";
  if (!p.bic) return "bic is required.";
  if (!p.country) return "country is required.";
  return null;
}

// ---------------------------
// DB loaders
// ---------------------------

/**
 * Load all bank-number rows.
 */
export async function loadAllRows() {
  return await sb
    .from(TABLE)
    .select("*")
    .order("bankname", { ascending: true });
}

/**
 * Load all rows and also include a notes-count (for admin filtering).
 */
export async function loadAllRowsWithNotesCount() {
  const res = await sb
    .from(TABLE)
    .select("*, notes:bank_number_notes(count)")
    .order("bankname", { ascending: true });

  if (res.error) return res;

  const list = (res.data || []).map(r => ({
    ...r,
    notes_count: (r.notes?.[0]?.count ?? 0),
  }));

  return { data: list, error: null };
}

/**
 * Load notes for a single bank_number_id.
 */
export async function loadNotesForBankId(bankId) {
  return await sb
    .from(NOTES_TABLE)
    .select("id, bank_number_id, note_text, created_at, created_by, updated_at, updated_by")
    .eq("bank_number_id", bankId)
    .order("created_at", { ascending: false });
}

/**
 * Load notes for many bank_number_id values.
 */
export async function loadNotesForBankIds(bankIds) {
  if (!bankIds?.length) return { data: [], error: null };
  return await sb
    .from(NOTES_TABLE)
    .select("id, bank_number_id, note_text, created_at, created_by, updated_at, updated_by")
    .in("bank_number_id", bankIds)
    .order("created_at", { ascending: false });
}

/**
 * Group notes by bank_number_id (Map<id, notes[]>).
 */
export function groupNotesByBankId(notes) {
  const map = new Map();
  for (const n of notes || []) {
    const k = n.bank_number_id;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(n);
  }
  return map;
}

/**
 * Insert a note for a bank_number_id.
 */
export async function addNote(bankNumberId, noteText) {
  const s = await getSession();
  if (!s) return { data: null, error: new Error("Not signed in.") };

  return await sb
    .from(NOTES_TABLE)
    .insert({
      bank_number_id: bankNumberId,
      note_text: noteText,
      created_by: s.user.id,
    })
    .select("*")
    .single();
}

/**
 * Update note text. Only allowed for the note owner (enforced server-side).
 */
export async function updateNote(noteId, newText, userId) {
  return await sb
    .from(NOTES_TABLE)
    .update({
      note_text: newText,
      updated_at: new Date().toISOString(),
      updated_by: userId || null,
    })
    .eq("id", noteId)
    .select("*")
    .single();
}

/**
 * Delete a note by id.
 */
export async function deleteNote(noteId) {
  return await sb.from(NOTES_TABLE).delete().eq("id", noteId);
}

/**
 * Returns true if the current session should see the Admin link.
 */
export async function adminLinkVisible() {
  const s = await getSession();
  if (!s) return false;
  return await isAdminUser();
}

// ---------------------------
// Table UI
// ---------------------------

/**
 * Build the bank numbers table UI (header + table skeleton).
 */
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
          <thead>
            <tr>
              ${heads}
              ${notesHead}
              ${actionsHead}
            </tr>
          </thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
    </div>
  `;
}

/**
 * Render table rows into the provided root element.
 */
export function renderNumbersRows(root, list, { actions = false, showNotesCol = false, notesCellHtml, onEdit, onDelete }) {
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
      return `<td>${esc(v ?? "")}</td>`;
    }).join("");

    const notesTd = showNotesCol
      ? `<td>${notesCellHtml ? notesCellHtml(r) : ""}</td>`
      : "";

    const actionsTd = actions
      ? `
        <td style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btnRow" type="button" data-edit="${esc(r.id)}">Edit</button>
          <button class="btnRow btnRowDanger" type="button" data-del="${esc(r.id)}">Delete</button>
        </td>
      `
      : "";

    return `
      <tr>
        ${tds}
        ${notesTd}
        ${actionsTd}
      </tr>
    `;
  }).join("");

  // Delegate edit/delete handlers
  rowsEl.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => onEdit?.(btn.dataset.edit));
  });
  rowsEl.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", () => onDelete?.(btn.dataset.del));
  });

  // Delegate optional notes handlers
  rowsEl.querySelectorAll("[data-notes]").forEach(btn => {
    btn.addEventListener("click", () => root.dispatchEvent(new CustomEvent("openNotes", { detail: btn.dataset.notes })));
  });
}

// ---------------------------
// Public filters UI
// ---------------------------

/**
 * Build the filter UI HTML for the public view.
 */
export function buildFiltersUI() {
  return `
    <div class="card" style="border-radius:14px;">
      <div class="cardHead"><strong>Filters</strong></div>
      <div class="cardBody" style="gap:12px;">
        <input class="input" id="search" placeholder="Search..." />

        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <label style="display:flex; gap:8px; align-items:center;">
            <input type="checkbox" id="f_ems" />
            <span style="color:rgba(255,255,255,.72); font-size:12px;">Only EMS</span>
          </label>

          <label style="display:flex; gap:8px; align-items:center;">
            <input type="checkbox" id="f_nonems" />
            <span style="color:rgba(255,255,255,.72); font-size:12px;">Only Non-EMS</span>
          </label>

          <select class="input" id="f_country" style="width:220px;">
            <option value="">All countries</option>
          </select>
        </div>
      </div>
    </div>
  `;
}

/**
 * Read the current filter UI values and return a filters object.
 */
export function getFilters(root) {
  const q = root.querySelector("#search")?.value || "";
  const onlyEms = root.querySelector("#f_ems")?.checked || false;
  const onlyNonEms = root.querySelector("#f_nonems")?.checked || false;
  const country = root.querySelector("#f_country")?.value || "";

  let emsFilter = null;
  if (onlyEms && !onlyNonEms) emsFilter = true;
  if (!onlyEms && onlyNonEms) emsFilter = false;

  return {
    q,
    onlyEms: emsFilter,
    country: country || "",
  };
}

/**
 * Attach filter change handlers.
 */
export function wireFilters(root, onChange) {
  ["#search", "#f_ems", "#f_nonems", "#f_country"].forEach(sel => {
    root.querySelector(sel)?.addEventListener("input", () => onChange?.());
    root.querySelector(sel)?.addEventListener("change", () => onChange?.());
  });
}

// ---------------------------
// Backwards compatible aliases
// ---------------------------

/**
 * Backwards-compatible alias for buildNumbersTable.
 */
export function buildTableUI(opts = {}) {
  // old signature: { actions?: boolean, extraHeaderHtml?: string }
  // our new signature: buildNumbersTable({ actions, showNotesCol, adminHeaderControlsHtml })
  const { actions = false, extraHeaderHtml = "", adminHeaderControlsHtml = "" } = opts;

  // If old code used extraHeaderHtml, we emulate by using showNotesCol + manual injection.
  const showNotesCol = !!extraHeaderHtml;

  return buildNumbersTable({
    actions,
    showNotesCol,
    adminHeaderControlsHtml,
  });
}

/**
 * Backwards-compatible alias for renderNumbersRows.
 */
export function renderRows(root, list, opts = {}) {
  const { actions = false, onEdit, onDelete, extraCellHtml } = opts;

  // If old code provided extraCellHtml, we treat it as "notes column" cell builder.
  const showNotesCol = typeof extraCellHtml === "function";

  return renderNumbersRows(root, list, {
    actions,
    showNotesCol,
    notesCellHtml: extraCellHtml,
    onEdit,
    onDelete,
  });
}
