import { renderHighlightIt } from "./tools/highlightit.js";
import { renderNumbersView } from "./tools/numbers/numbersView.js";

const viewRoot = document.getElementById("viewRoot");
const navButtons = [...document.querySelectorAll(".navItem")];

function setView(name) {
  navButtons.forEach(b => b.classList.toggle("active", b.dataset.view === name));
  if (name === "numbers") renderNumbersView(viewRoot);
  else renderHighlightIt(viewRoot);
}

navButtons.forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
setView("highlightit");
