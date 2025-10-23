const express = require("express");
const bcrypt = require("bcrypt");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const router = express.Router();

const db = new sqlite3.Database(path.join(__dirname, "../users.db"));

// セッション用: ログイン必須ミドルウェア（他でも再利用できる）
function requireLogin(req, res, next) {
  if (!req.session.userid) {
    return res.status(401).json({ message: "ログインが必要です" });
  }
  next();
}

// 登録
router.post("/register", async (req, res) => {
  const { userid, username, password } = req.body;
  const hashedPw = await bcrypt.hash(password, 10);

  db.run(
    "INSERT INTO users (userid, username, password, score) VALUES (?, ?, ?, 0)",
    [userid, username, hashedPw],
    (err) => {
      if (err) return res.json({ success: false, message: "登録失敗: ID重複" });
      res.json({ success: true, message: "登録完了！" });
    }
  );
});

// ログイン
router.post("/login", (req, res) => {
  const { userid, password } = req.body;

  db.get("SELECT * FROM users WHERE userid = ?", [userid], async (err, user) => {
    if (err || !user) return res.json({ success: false, message: "ユーザーが存在しません" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.json({ success: false, message: "パスワードが違います" });

    req.session.userid = userid;
    res.json({
      success: true,
      message: "ログイン成功",
      role: userid === "admin" ? "admin" : "user",
      username: user.username
    });
  });
});

// ログアウト
router.get("/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true, message: "ログアウトしました" }));
});

module.exports = router;
