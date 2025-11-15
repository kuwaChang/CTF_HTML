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

// セキュリティ: 入力値のサニタイゼーションとバリデーション
function sanitizeInput(input, maxLength = 100) {
  if (typeof input !== 'string') return '';
  return input.trim().substring(0, maxLength);
}

function validateUserId(userid) {
  // 英数字とアンダースコアのみ許可、3-20文字
  return /^[a-zA-Z0-9_]{3,20}$/.test(userid);
}

function validateUsername(username) {
  // 3-50文字、危険な文字をチェック
  if (!username || username.length < 3 || username.length > 50) return false;
  // SQLインジェクション等の危険な文字がないかチェック
  return !/[<>'"]/.test(username);
}

function validatePassword(password) {
  // パスワードは8文字以上（必要に応じて強化）
  return password && password.length >= 8;
}

// 登録
router.post("/register", async (req, res) => {
  let { userid, username, password } = req.body;
  
  // セキュリティ: 入力値のサニタイゼーション
  userid = sanitizeInput(userid, 20);
  username = sanitizeInput(username, 50);
  
  // セキュリティ: 入力値のバリデーション
  if (!validateUserId(userid)) {
    return res.status(400).json({ success: false, message: "ユーザーIDは英数字とアンダースコアのみ、3-20文字で入力してください" });
  }
  
  if (!validateUsername(username)) {
    return res.status(400).json({ success: false, message: "ユーザー名は3-50文字で入力してください" });
  }
  
  if (!validatePassword(password)) {
    return res.status(400).json({ success: false, message: "パスワードは8文字以上で入力してください" });
  }
  
  // セキュリティ: パスワードのハッシュ化
  const hashedPw = await bcrypt.hash(password, 10);

  // セキュリティ: SQLインジェクション対策（既にパラメータ化クエリを使用）
  db.run(
    "INSERT INTO users (userid, username, password, score) VALUES (?, ?, ?, 0)",
    [userid, username, hashedPw],
    (err) => {
      if (err) {
        console.error("登録エラー:", err);
        // セキュリティ: エラー詳細をクライアントに返さない
        return res.json({ success: false, message: "登録失敗: IDが既に使用されています" });
      }
      res.json({ success: true, message: "登録完了！" });
    }
  );
});

// ログイン
router.post("/login", (req, res) => {
  let { userid, password } = req.body;
  
  // セキュリティ: 入力値のサニタイゼーション
  userid = sanitizeInput(userid, 20);
  
  // セキュリティ: 入力値のバリデーション
  if (!validateUserId(userid) || !password) {
    // セキュリティ: エラーメッセージを統一してユーザー存在の有無を判別できないようにする
    return res.json({ success: false, message: "ユーザーIDまたはパスワードが正しくありません" });
  }

  // セキュリティ: SQLインジェクション対策（既にパラメータ化クエリを使用）
  db.get("SELECT * FROM users WHERE userid = ?", [userid], async (err, user) => {
    if (err) {
      console.error("ログインエラー:", err);
      // セキュリティ: エラー詳細をクライアントに返さない
      return res.json({ success: false, message: "ログインに失敗しました" });
    }
    
    // セキュリティ: ユーザーが存在しない場合でも同じエラーメッセージを返す（情報漏洩防止）
    if (!user) {
      // パスワード検証を実行して時間差を埋める（タイミング攻撃対策）
      await bcrypt.compare(password, '$2b$10$dummyHashForTimingAttack');
      return res.json({ success: false, message: "ユーザーIDまたはパスワードが正しくありません" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.json({ success: false, message: "ユーザーIDまたはパスワードが正しくありません" });
    }

    req.session.userid = userid;
    res.json({
      success: true,
      message: "ログイン成功",
      role: userid === "admin" ? "admin" : "user",
      username: user.username
    });
  });
});

// 学習時間記録
router.post("/study-time", requireLogin, (req, res) => {
  const { durationMs, sessionStartedAt } = req.body || {};

  const duration = Number(durationMs);
  if (!Number.isFinite(duration) || duration <= 0) {
    return res.status(400).json({ success: false, message: "学習時間が不正です" });
  }

  let startDate = sessionStartedAt ? new Date(sessionStartedAt) : new Date(Date.now() - duration);
  if (Number.isNaN(startDate.getTime())) {
    startDate = new Date(Date.now() - duration);
  }
  const endDate = new Date();

  db.run(
    `INSERT INTO study_sessions (userid, start_time, end_time, duration_ms) VALUES (?, ?, ?, ?)`,
    [req.session.userid, startDate.toISOString(), endDate.toISOString(), Math.round(duration)],
    (err) => {
      if (err) {
        console.error("学習時間記録エラー:", err);
        return res.status(500).json({ success: false, message: "学習時間の記録に失敗しました" });
      }
      res.json({ success: true });
    }
  );
});

// ログアウト
router.get("/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true, message: "ログアウトしました" }));
});

module.exports = router;
