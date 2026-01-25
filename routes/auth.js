const express = require("express");
const bcrypt = require("bcrypt");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");
const router = express.Router();

// dbフォルダが存在しない場合は作成
const dbDir = path.join(__dirname, "../db");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(__dirname, "../db/users.db");
//console.log("[auth.js] データベースパス:", dbPath);
//console.log("[auth.js] ファイル存在確認:", fs.existsSync(dbPath));
//console.log("[auth.js] ディレクトリ存在確認:", fs.existsSync(path.dirname(dbPath)));
let db;
try {
  db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
      console.error("❌ データベース接続エラー (auth.js):", err.message);
      console.error("   エラーコード:", err.code);
      console.error("   エラー番号:", err.errno);
      console.error("   データベースパス:", dbPath);
      console.error("   スタックトレース:", err.stack);
    } else {
      //console.log("✅ [auth.js] データベース接続成功");
    }
  });
} catch (err) {
  console.error("❌ データベース作成時の例外 (auth.js):", err.message);
  console.error("   スタックトレース:", err.stack);
  throw err;
}
db.on('error', (err) => {
  console.error("❌ データベースエラー (auth.js):", err.message);
  console.error("   エラーコード:", err.code);
  console.error("   エラー番号:", err.errno);
  console.error("   データベースパス:", dbPath);
  if (err.stack) {
    console.error("   スタックトレース:", err.stack);
  }
});

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
  // 新規ユーザーはデフォルトで'user'ロールを設定
  db.run(
    "INSERT INTO users (userid, username, password, score, role) VALUES (?, ?, ?, 0, 'user')",
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
  console.log("[auth.js] ログイン試行:", userid);
  db.get("SELECT * FROM users WHERE userid = ?", [userid], async (err, user) => {
    if (err) {
      console.error("❌ ログインエラー (auth.js):", err.message);
      console.error("   エラーコード:", err.code);
      console.error("   エラー番号:", err.errno);
      console.error("   スタックトレース:", err.stack);
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

    // セキュリティ: データベースからroleを取得（デフォルトは'user'）
    const userRole = user.role || 'user';
    
    // セッションが利用可能か確認
    if (!req.session) {
      console.error("❌ セッションが利用できません (auth.js)");
      return res.json({ success: false, message: "セッションエラーが発生しました" });
    }
    
    // セキュリティ: セッションにuseridとroleを保存
    req.session.userid = userid;
    req.session.role = userRole;
    
    // ログイン履歴を記録（login_logsテーブル）
    // テーブルが存在しない場合は作成を試みる（同期的に実行）
    db.run(`CREATE TABLE IF NOT EXISTS login_logs (
      userid TEXT NOT NULL,
      login_date TEXT NOT NULL,
      PRIMARY KEY (userid, login_date)
    )`, (err) => {
      if (err) {
        console.error("ログイン履歴テーブル作成エラー:", err);
      } else {
        // テーブル作成成功後、今日の日付をYYYY-MM-DD形式で記録
        const today = new Date().toISOString().split('T')[0];
        db.run(
          "INSERT OR IGNORE INTO login_logs (userid, login_date) VALUES (?, ?)",
          [userid, today],
          (err) => {
            if (err) {
              console.error("ログイン履歴記録エラー:", err);
            }
            
            // 実績チェック（連続ログイン）
            const { checkAchievements } = require("./achievements");
            checkAchievements(userid, "login_streak", { logged_in: true })
              .catch(err => console.error("ログイン実績チェックエラー:", err));
          }
        );
      }
    });
    
    console.log("✅ [auth.js] ログイン成功:", userid, "role:", userRole);
    res.json({
      success: true,
      message: "ログイン成功",
      role: userRole,
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
      
      // 実績チェック（学習時間）
      const { checkAchievements } = require("./achievements");
      checkAchievements(req.session.userid, "study_time", { study_time_updated: true })
        .catch(err => console.error("学習時間実績チェックエラー:", err));
      
      res.json({ success: true });
    }
  );
});

// ログアウト
router.get("/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true, message: "ログアウトしました" }));
});

module.exports = router;
