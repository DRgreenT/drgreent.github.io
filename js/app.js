import { renderHighlightIt } from "./tools/highlightit.js";
import { renderNumbersView } from "./tools/numbers/numbersView.js";

const viewRoot = document.getElementById("viewRoot");
const navButtons = [...document.querySelectorAll(".navItem")];

/**
 * Switch the main content area to the requested tool/view.
 * Also updates the active state of the side navigation buttons.
 */
function setView(name) {
  navButtons.forEach(b => b.classList.toggle("active", b.dataset.view === name));

  if (name === "highlight") {
    renderHighlightIt(viewRoot);
    return;
  }
  if (name === "numbers") {
    renderNumbersView(viewRoot);
    return;
  }

  viewRoot.innerHTML = `<div class="card"><div class="cardBody">Unknown view: ${name}</div></div>`;
}

navButtons.forEach(btn => {
  btn.addEventListener("click", () => setView(btn.dataset.view));
});

setView("numbers");
