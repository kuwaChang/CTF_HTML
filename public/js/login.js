import { initTabs } from "./tabs.js";
import { loadQuizData } from "./quiz.js";
// ✅ ページ読み込み時にログイン状態をチェック
window.addEventListener("DOMContentLoaded", async () => {
  const res = await fetch("/session-check", { credentials: "include" });
  const data = await res.json();

  if (data.loggedIn) {
    // すでにログイン中ならUIを切り替える
    document.getElementById("loginSection").classList.add("hidden");
    document.getElementById("mainSection").classList.remove("hidden");
    document.getElementById("welcome").innerText = "ようこそ " + data.username + " さん！";

    initTabs();
    loadQuizData();
  } else {
    // 未ログインならログインフォームを表示
    document.getElementById("loginSection").classList.remove("hidden");
    document.getElementById("mainSection").classList.add("hidden");
  }
});

export function initLogin(onLoginSuccess) {
  const loginForm = document.getElementById("loginForm");

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      userid: e.target.userid.value,
      password: e.target.password.value
    };

    const res = await fetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      credentials: "include"
    });
    const result = await res.json();

    if (result.success) {
      document.getElementById("loginMessage").innerText = "";
      document.getElementById("loginSection").classList.add("hidden");
      document.getElementById("mainSection").classList.remove("hidden");
      document.getElementById("welcome").innerText = "ようこそ " + result.username + " さん！";

      // ✅ ログイン成功後の処理（タブと問題をロード）
      if (typeof onLoginSuccess === "function") onLoginSuccess();
    } else {
      document.getElementById("loginMessage").innerText = result.message;
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      const res = await fetch("/auth/logout", { credentials: "include" });
      const data = await res.json();

      if (data.success) {
        alert("ログアウトしました！");
        // ログイン画面に戻す
        document.getElementById("loginSection").classList.remove("hidden");
        document.getElementById("mainSection").classList.add("hidden");
        document.getElementById("loginForm").reset();
      }
    });
  }
});
