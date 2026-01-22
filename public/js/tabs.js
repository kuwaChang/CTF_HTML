import { loadScore } from "./quiz.js";
import { loadRanking } from "./ranking.js";
import { loadAchievements } from "./achievements.js";
import { initCodeEditor } from "./code-editor.js";

let codeEditorInitialized = false;

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
      } else if (tab.dataset.target === "achievements") {
        loadAchievements();
      } else if (tab.dataset.target === "code-editor" && !codeEditorInitialized) {
        initCodeEditor().then(() => {
          codeEditorInitialized = true;
        }).catch(err => {
          console.error("コードエディタの初期化に失敗しました:", err);
        });
      }
    });
  });
}
