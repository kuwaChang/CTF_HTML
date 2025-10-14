export function initLogin(onLoginSuccess) {
  const loginForm = document.getElementById("loginForm");

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      userid: e.target.userid.value,
      password: e.target.password.value
    };

    const res = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
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
