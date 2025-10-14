    // ログイン処理
    document.getElementById("loginForm").addEventListener("submit", async (e) => {
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
        //document.getElementById("registerForm").classList.add("hidden");
        document.getElementById("welcome").innerText = "ようこそ " + result.username + " さん！";
      } else {
        document.getElementById("loginMessage").innerText = result.message;
      }
    });

    //ログアウト
    app.get("/logout", (req, res) => {
      req.session.destroy(() => {
        res.json({ success: true, message: "ログアウトしました" });
      });
    });
    
    //ログイン必須チェック用ミドルウェア
    function requireLogin(req, res, next) {
      if (!req.session.userid) {
        return res.status(401).json({ success: false, message: "ログインしてください" });
      }
      next();
    }