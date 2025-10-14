import { loadRanking, loadScore } from "./quiz.js";

export function initTabs() {
  const tabs = document.querySelectorAll(".tab");
  const contents = document.querySelectorAll(".tab-content");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      contents.forEach(c => c.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(tab.dataset.target).classList.add("active");

      if (tab.dataset.target === "result_check") {
        loadRanking();
      } else if (tab.dataset.target === "score") {
        loadScore();
      }
    });
  });
}