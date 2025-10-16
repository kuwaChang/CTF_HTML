import { initLogin } from "./login.js";
import { initTabs } from "./tabs.js";
import { loadQuizData } from "./quiz.js";

window.addEventListener("DOMContentLoaded", () => {
  initLogin(() => {      // ← ログイン後だけ実行
    initTabs();
    console.log("📥 loadQuizData呼び出し開始");
    loadQuizData();
  });
});

console.log("✅ main.js 読み込み成功！");
