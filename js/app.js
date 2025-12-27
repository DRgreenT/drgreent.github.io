const viewRoot = document.getElementById("viewRoot");
const navButtons = [...document.querySelectorAll(".navItem")];

const state = {
  view: "highlightit"
};

// ---------- Router ----------
function setView(name){
  state.view = name;
  navButtons.forEach(b => b.classList.toggle("active", b.dataset.view === name));
  if (name === "numbers") renderNumbers();
  else renderHighlightIt();
}

navButtons.forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));

// ---------- Tool 1: HighlightIt (minimal wrapper) ----------
function renderHighlightIt(){
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
          <div class="cardHead"><strong>Output</strong><button class="btn" id="copyBtn">Copy</button></div>
          <div class="cardBody">
            <div id="output" style="white-space:pre-wrap; line-height:1.55;"></div>
          </div>
        </div>
      </div>
    </section>
  `;

  // --- logic (same as before, shortened) ---
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

  function normalizeText(text){
    let t = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    t = t.replace(/\t/g, " ");
    t = t.split("\n").map(line => line.replace(/ {2,}/g, " ").trimEnd()).join("\n");
    t = t.replace(/\n{3,}/g, "\n\n");
    return t.trim();
  }

  function decodeHtmlEntities(html){
    const txt = document.createElement("textarea");
    txt.innerHTML = html;
    return txt.value;
  }

  function stripHtmlToText(html){
    const doc = new DOMParser().parseFromString(html, "text/html");
    const text = doc.body.innerText ?? doc.body.textContent ?? "";
    return normalizeText(text);
  }

  function getFormattedText(){
    const raw = elInput.value ?? "";
    if (!raw.trim()) return "";
    return elStrip.checked ? stripHtmlToText(raw) : normalizeText(decodeHtmlEntities(raw));
  }

  function parseKeywords(input){
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
    return out.filter(k => { const key = k.toLowerCase(); if(seen.has(key)) return false; seen.add(key); return true; });
  }

  function escapeHtml(str){
    return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  }

  function escapeRegExp(str){
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function render(){
    const text = getFormattedText();
    const kws = parseKeywords(elKeywords.value);
    if (!text) { elOutput.innerHTML = ""; return; }
    if (!kws.length) { elOutput.innerHTML = escapeHtml(text); return; }

    const sorted = [...kws].sort((a,b) => b.length - a.length);
    const pattern = sorted.map(escapeRegExp).join("|");
    const re = new RegExp(pattern, "gi");

    elOutput.innerHTML = escapeHtml(text).replace(re, (match) => `<mark style="padding:0 2px; border-radius:6px; background: rgba(255,227,94,.28); border:1px solid rgba(255,227,94,.55);">${escapeHtml(match)}</mark>`);
  }

  render();
}

// ---------- Tool 2: Numbers (CRUD in localStorage) ----------
const STORAGE_KEY = "agenttoolkit_numbers_v1";

function loadNumbers(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}

function saveNumbers(list){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function renderNumbers(){
  viewRoot.innerHTML = `
    <section class="card">
      <div class="cardHead">
        <strong>Numbers</strong>
        <div style="display:flex; gap:10px; align-items:center;">
          <input id="search" type="text" placeholder="Search..." style="width:260px; max-width: 45vw;">
          <button class="btn" id="addBtn">Add</button>
        </div>
      </div>

      <div class="cardBody">
        <div class="card">
          <div class="cardBody" style="gap:10px;">
            <input id="name" type="text" placeholder="Name / Label (e.g., Billing Hotline)">
            <input id="number" type="text" placeholder="Number (e.g., +30 210 123 4567)">
            <input id="note" type="text" placeholder="Note (optional)">
            <div style="display:flex; gap:10px;">
              <button class="btn" id="saveBtn">Save</button>
              <button class="btn" id="resetBtn">Reset</button>
            </div>
            <div style="color: rgba(255,255,255,.68); font-size:12px;">
              Data is stored locally in your browser (localStorage).
            </div>
          </div>
        </div>

        <table class="table">
          <thead>
            <tr>
              <th style="width:28%;">Name</th>
              <th style="width:22%;">Number</th>
              <th>Note</th>
              <th style="width:160px;">Actions</th>
            </tr>
          </thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
    </section>
  `;

  const elSearch = document.getElementById("search");
  const elName = document.getElementById("name");
  const elNumber = document.getElementById("number");
  const elNote = document.getElementById("note");
  const elRows = document.getElementById("rows");

  let editId = null;
  let list = loadNumbers();

  document.getElementById("addBtn").addEventListener("click", () => {
    editId = null;
    elName.value = "";
    elNumber.value = "";
    elNote.value = "";
    elName.focus();
  });

  document.getElementById("resetBtn").addEventListener("click", () => {
    editId = null;
    elName.value = "";
    elNumber.value = "";
    elNote.value = "";
  });

  document.getElementById("saveBtn").addEventListener("click", () => {
    const name = elName.value.trim();
    const number = elNumber.value.trim();
    const note = elNote.value.trim();
    if (!name || !number) return alert("Name and Number are required.");

    if (editId) {
      const idx = list.findIndex(x => x.id === editId);
      if (idx >= 0) list[idx] = { ...list[idx], name, number, note };
    } else {
      list.unshift({ id: crypto.randomUUID(), name, number, note, createdAt: Date.now() });
    }

    saveNumbers(list);
    editId = null;
    elName.value = ""; elNumber.value = ""; elNote.value = "";
    renderTable();
  });

  function esc(s){
    return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  }

  function renderTable(){
    const q = elSearch.value.trim().toLowerCase();
    const filtered = !q ? list : list.filter(x =>
      x.name.toLowerCase().includes(q) ||
      x.number.toLowerCase().includes(q) ||
      (x.note || "").toLowerCase().includes(q)
    );

    elRows.innerHTML = filtered.map(x => `
      <tr>
        <td>${esc(x.name)}</td>
        <td style="font-family: var(--mono);">${esc(x.number)}</td>
        <td>${esc(x.note || "")}</td>
        <td>
          <button class="btn" data-edit="${x.id}">Edit</button>
          <button class="btn" data-del="${x.id}">Delete</button>
        </td>
      </tr>
    `).join("");

    elRows.querySelectorAll("[data-edit]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-edit");
        const item = list.find(x => x.id === id);
        if (!item) return;
        editId = id;
        elName.value = item.name;
        elNumber.value = item.number;
        elNote.value = item.note || "";
        elName.focus();
      });
    });

    elRows.querySelectorAll("[data-del]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-del");
        const item = list.find(x => x.id === id);
        if (!item) return;
        if (!confirm(`Delete "${item.name}"?`)) return;
        list = list.filter(x => x.id !== id);
        saveNumbers(list);
        renderTable();
      });
    });
  }

  elSearch.addEventListener("input", renderTable);
  renderTable();
}

// старт
setView("highlightit");
