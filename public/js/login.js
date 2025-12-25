import { initTabs } from "./tabs.js";
import { loadQuizData } from "./quiz.js";

// ユーザーアイコンを更新する関数
function updateUserIcon(iconPath) {
  const iconImg = document.getElementById("userIconImg");
  const iconDefault = document.getElementById("userIconDefault");
  
  if (iconPath && iconImg && iconDefault) {
    iconImg.src = iconPath + "?t=" + Date.now(); // キャッシュ回避
    iconImg.style.display = "block";
    iconDefault.style.display = "none";
    iconImg.onerror = () => {
      // アイコン読み込み失敗時はデフォルトアイコンを表示
      iconImg.style.display = "none";
      iconDefault.style.display = "inline";
    };
  } else if (iconDefault) {
    // アイコンがない場合はデフォルトを表示
    if (iconImg) iconImg.style.display = "none";
    iconDefault.style.display = "inline";
  }
}

let loginStartTime = null;
let studyTrackingEventsBound = false;
let studyTimeSent = false;

function initializeLoginStartTime() {
  const stored = sessionStorage.getItem("loginStartTime");
  if (stored) {
    const parsed = Number(stored);
    if (Number.isFinite(parsed) && parsed > 0) {
      loginStartTime = parsed;
    } else {
      loginStartTime = Date.now();
      sessionStorage.setItem("loginStartTime", String(loginStartTime));
    }
  } else {
    loginStartTime = Date.now();
    sessionStorage.setItem("loginStartTime", String(loginStartTime));
  }
  studyTimeSent = false;
}

function sendStudyTime() {
  if (!loginStartTime || studyTimeSent) return;

  const durationMs = Date.now() - loginStartTime;
  if (durationMs <= 0) {
    return;
  }

  const payload = JSON.stringify({
    durationMs,
    sessionStartedAt: new Date(loginStartTime).toISOString()
  });

  let sent = false;
  if (navigator.sendBeacon) {
    const blob = new Blob([payload], { type: "application/json" });
    sent = navigator.sendBeacon("/auth/study-time", blob);
  }

  if (!sent) {
    fetch("/auth/study-time", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      credentials: "include",
      keepalive: true
    }).catch(() => {
      // 送信失敗時は再送しないが、アプリの挙動を止めない
    });
  }

  studyTimeSent = true;
  sessionStorage.removeItem("loginStartTime");
  loginStartTime = null;
}

function setupStudyTimeTracking() {
  initializeLoginStartTime();

  if (studyTrackingEventsBound) return;

  const handlePageHide = () => {
    sendStudyTime();
  };

  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("beforeunload", handlePageHide);
  studyTrackingEventsBound = true;
}
// ✅ ページ読み込み時にログイン状態をチェック
window.addEventListener("DOMContentLoaded", async () => {
  const res = await fetch("/session-check", { credentials: "include" });
  const data = await res.json();

  if (data.loggedIn) {
    // すでにログイン中ならUIを切り替える
    document.getElementById("loginSection").classList.add("hidden");
    document.getElementById("mainSection").classList.remove("hidden");
    document.getElementById("welcome").innerText = "ようこそ " + data.username + " さん！";

    // ユーザーアイコンを表示
    updateUserIcon(data.iconPath);

    initTabs();
    loadQuizData();
    setupStudyTimeTracking();
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

      // ユーザーアイコンを取得して表示
      const sessionRes = await fetch("/session-check", { credentials: "include" });
      const sessionData = await sessionRes.json();
      if (sessionData.loggedIn) {
        updateUserIcon(sessionData.iconPath);
      }

      // ✅ ログイン成功後の処理（タブと問題をロード）
      if (typeof onLoginSuccess === "function") onLoginSuccess();
      setupStudyTimeTracking();
    } else {
      document.getElementById("loginMessage").innerText = result.message;
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      sendStudyTime();
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
