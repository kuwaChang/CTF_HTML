import { initLogin } from "./login.js";
import { initTabs } from "./tabs.js";
import { loadQuizData } from "./quiz.js";

window.addEventListener("DOMContentLoaded", () => {
  initLogin(() => {      // ← コールバックでログイン後に実行
    initTabs();
    loadQuizData();
  });
});