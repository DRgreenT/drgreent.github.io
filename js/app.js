    const elInput = document.getElementById('inputText');
    const elStrip = document.getElementById('stripHtml');
    const elKeywords = document.getElementById('keywords');
    const elOutput = document.getElementById('output');

    const wordCount = document.getElementById('wordCount');
    const kwCount = document.getElementById('kwCount');
    const hitCount = document.getElementById('hitCount');

    document.getElementById('clearBtn').addEventListener('click', () => {
      elInput.value = '';
      elKeywords.value = '';
      elStrip.checked = false;
      render();
    });

    document.getElementById('sampleBtn').addEventListener('click', () => {
      elInput.value =
`<div>
  <h2>LOFAR &amp; Radio Astronomy</h2>
  <p>The 21 cm hydrogen line is at <b>1420 MHz</b>. Black hole mergers are fascinating.</p>
  <p>Try searching for keywords like "black hole", LOFAR, 1420 MHz.</p>
</div>`;
      elKeywords.value = '"black hole", LOFAR, 1420 MHz';
      elStrip.checked = true;
      render();
    });

    document.getElementById('copyBtn').addEventListener('click', async () => {
      const text = getFormattedText();
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
    });

    elInput.addEventListener('input', render);
    elStrip.addEventListener('change', render);
    elKeywords.addEventListener('input', render);

    function decodeHtmlEntities(html) {
      // Sicheres Dekodieren von &amp; etc.
      const txt = document.createElement('textarea');
      txt.innerHTML = html;
      return txt.value;
    }

    function stripHtmlToText(html) {
      // HTML -> sichtbarer Text (inkl. sinnvollem Whitespace)
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const text = doc.body.innerText ?? doc.body.textContent ?? '';
      return normalizeText(text);
    }

    function normalizeText(text) {
      // Normalisiert Whitespace, aber behält Absätze
      // 1) Windows Zeilenenden -> \n
      let t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      // 2) Tabs -> Space
      t = t.replace(/\t/g, ' ');
      // 3) Mehrere Spaces in einer Zeile reduzieren (aber neue Zeilen behalten)
      t = t.split('\n').map(line => line.replace(/ {2,}/g, ' ').trimEnd()).join('\n');
      // 4) Mehrere Leerzeilen leicht normalisieren
      t = t.replace(/\n{3,}/g, '\n\n');
      return t.trim();
    }

    function getFormattedText() {
      const raw = elInput.value ?? '';
      if (!raw.trim()) return '';
      if (!elStrip.checked) {
        // Optional auch Entities dekodieren, falls jemand Text mit &amp; einfügt
        return normalizeText(decodeHtmlEntities(raw));
      }
      return stripHtmlToText(raw);
    }

    function parseKeywords(input) {
      // Unterstützt: kommagetrennt, und Phrasen in "..."
      // Beispiel: '"black hole", LOFAR, 1420 MHz'
      const s = (input || '').trim();
      if (!s) return [];

      const out = [];
      const re = /"([^"]+)"|([^,]+)/g;
      let m;
      while ((m = re.exec(s)) !== null) {
        const kw = (m[1] ?? m[2] ?? '').trim();
        if (kw) out.push(kw);
      }

      // Duplikate entfernen (case-insensitive), aber Original-Case behalten (erstes Vorkommen)
      const seen = new Set();
      const unique = [];
      for (const k of out) {
        const key = k.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(k);
        }
      }
      return unique;
    }

    function escapeHtml(str) {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function escapeRegExp(str) {
      // Keywords können Sonderzeichen enthalten, die Regex kaputt machen würden
      return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function highlight(text, keywords) {
      if (!text) return { html: '', hits: 0 };
      if (!keywords.length) return { html: escapeHtml(text), hits: 0 };

      // Längere Keywords zuerst, damit z.B. "black hole" vor "black" matched
      const sorted = [...keywords].sort((a, b) => b.length - a.length);

      const pattern = sorted.map(k => escapeRegExp(k)).join('|');
      if (!pattern) return { html: escapeHtml(text), hits: 0 };

      const re = new RegExp(pattern, 'gi');

      let hits = 0;
      const html = escapeHtml(text).replace(re, (match) => {
        hits++;
        return `<mark class="hl">${escapeHtml(match)}</mark>`;
      });

      return { html, hits };
    }

    function countWords(text) {
      if (!text) return 0;
      // Simple word count across lines
      const tokens = text.trim().split(/\s+/).filter(Boolean);
      return tokens.length;
    }

    function render() {
      const formatted = getFormattedText();
      const kws = parseKeywords(elKeywords.value);

      const { html, hits } = highlight(formatted, kws);
      elOutput.innerHTML = html || '';

      wordCount.textContent = `Words: ${countWords(formatted)}`;
      kwCount.textContent = `Keywords: ${kws.length}`;
      hitCount.textContent = `Hits: ${hits}`;
    }

    // Initial
    render();