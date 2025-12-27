import {
  normalizeText, decodeHtmlEntities, stripHtmlToText,
  esc, escapeRegExp, copyToClipboard
} from "../lib/utils.js";

export function renderHighlightIt(viewRoot) {
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
    await copyToClipboard(getFormattedText());
  });

  elInput.addEventListener("input", render);
  elKeywords.addEventListener("input", render);
  elStrip.addEventListener("change", render);

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

  function render() {
    const text = getFormattedText();
    const kws = parseKeywords(elKeywords.value);

    if (!text) { elOutput.innerHTML = ""; return; }
    if (!kws.length) { elOutput.innerHTML = esc(text); return; }

    const sorted = [...kws].sort((a, b) => b.length - a.length);
    const pattern = sorted.map(escapeRegExp).join("|");
    const re = new RegExp(pattern, "gi");

    elOutput.innerHTML = esc(text).replace(
      re,
      (match) =>
        `<mark style="padding:0 2px; border-radius:6px; background: rgba(255,227,94,.28); border:1px solid rgba(255,227,94,.55);">${esc(match)}</mark>`
    );
  }

  render();
}
