const express = require("express");
const app = express();
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("users.db");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const session = require("express-session");
const path = require("path");

app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());

app.use(session({
  secret: "secret_key",
  resave: false,
  saveUninitialized: true
}));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "top_page.html"));
});

//データベースへのアクセス
app.get("/ranking", (req, res) => {
  db.all("SELECT userid, score FROM users ORDER BY score DESC LIMIT 10", (err, rows) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: "DB error"});
      return;
    }
    res.json(rows); //json形式で返す
  })
})

// DB初期化
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userid TEXT UNIQUE,
    username TEXT,
    password TEXT,
    score INTEGER
  )`);
});

// 正解一覧
const quizAnswers = {
  q1: "sample",
  q2: "answer"
};

//会員登録
app.post("/register", async (req, res) => {
  const { userid, username, password } = req.body;
  const hashedPw = await bcrypt.hash(password, 10);
  const stmt = db.prepare("INSERT INTO users (userid, username, password, score) VALUES (?, ?, ?, 0)");
  stmt.run(userid, username, hashedPw, (err) => {
    if (err) {
      res.json({ success: false, message: "登録失敗: すでに存在するユーザーIDです" });
    } else {
      res.json({ success: true, message: "登録完了!" });
    }
  });
  stmt.finalize();
});

//ログイン
app.post("/login", (req, res) => {
  const { userid, password } = req.body;
  db.get("SELECT * FROM users WHERE userid = ?", [userid], async (err, user) => {
    if (err || !user) {
      return res.json({ success: false, message: "ユーザーが存在しません" });
    }
    const match = await bcrypt.compare(password, user.password);
    if (match) {
      req.session.userid = userid; // ← ログイン状態を保存
      res.json({ success: true, message: "ログイン成功", username: user.username });
    } else {
      res.json({ success: false, message: "パスワードが違います" });
    }
  });
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

//正誤判定＆スコア加算
app.post("/checkAnswer", requireLogin, (req, res) => {
  const userid = req.session.userid; // ← ここで自動的に取得！
  const { qid, answer } = req.body;
  const correctAnswer = quizAnswers[qid];

  if (!correctAnswer) {
    return res.json({ correct: false, message: "問題が存在しません" });
  }

  if (String(answer).trim().toLowerCase() === String(correctAnswer).trim().toLowerCase()) {
    const point = 10;
    db.run("UPDATE users SET score = score + ? WHERE userid = ?", [point, userid], function(err) {
      if (err) return res.json({ correct: false, message: "スコア更新失敗" });
      db.get("SELECT score FROM users WHERE userid = ?", [userid], (err, row) => {
        res.json({ correct: true, message: "正解！", point, score: row.score });
      });
    });
  } else {
    db.get("SELECT score FROM users WHERE userid = ?", [userid], (err, row) => {
      res.json({ correct: false, message: "不正解...", point: 0, score: row ? row.score : 0 });
    });
  }
});

//スコア取得API
app.get("/getScore", requireLogin, (req, res) => {
  db.get("SELECT score FROM users WHERE userid = ?", [req.session.userid], (err, row) => {
    if (err || !row) {
      res.json({ success: false, score: 0 });
    } else {
      res.json({ success: true, score: row.score });
    }
  });
});

app.listen(3333, () => {
  console.log("✅ サーバー起動: http://localhost:3333");
});
