export function esc(s) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function normalizeText(text) {
  let t = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  t = t.replace(/\t/g, " ");
  t = t.split("\n").map(line => line.replace(/ {2,}/g, " ").trimEnd()).join("\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

export function decodeHtmlEntities(html) {
  const txt = document.createElement("textarea");
  txt.innerHTML = html;
  return txt.value;
}

export function stripHtmlToText(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const text = doc.body.innerText ?? doc.body.textContent ?? "";
  return normalizeText(text);
}

export function escapeHtml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function escapeRegExp(str) {
  return (str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function copyToClipboard(text) {
  const t = (text || "").toString();
  if (!t) return;
  try { await navigator.clipboard.writeText(t); } catch {}
}

export function includesCI(value, q) {
  if (!q) return true;
  return (value ?? "").toString().toLowerCase().includes(q);
}

export function isValidUrlMaybe(s) {
  if (!s) return true;
  try { new URL(s); return true; } catch { return false; }
}
