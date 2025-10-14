const express = require("express");
const quizAnswers = require("./quizData.json");
const app = express();
const fs = require("fs");
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

// JSONデータを返すAPI
app.get("/api/quizData", (req, res) => {
  const filePath = path.join(__dirname, "quizData.json");
  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      console.error("JSON読み込みエラー:", err);
      return res.status(500).json({ error: "読み込み失敗" });
    }
    res.json(JSON.parse(data));
  });
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

  db.run(`CREATE TABLE IF NOT EXISTS solved (
    userid TEXT,
    category TEXT,
    qid TEXT,
    PRIMARY KEY (userid, category, qid)
  )`);
});

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
  const userid = req.session.userid;
  const { category, qid, answer, point } = req.body;

  console.log("カテゴリ:", category, "問題ID:", qid, "答え:", answer);
  console.log("正解リストから取得:", quizAnswers[category]?.[qid]?.answer);

  // 正解データ取得
  const correctAnswer = quizAnswers[category]?.[qid]?.answer;
  if (!correctAnswer) {
    return res.json({ correct: false, message: "問題が存在しません" });
  }

  // すでに解いたかチェック
  db.get(
    "SELECT * FROM solved WHERE userid = ? AND category = ? AND qid = ?",
    [userid, category, qid],
    (err, row) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ correct: false, message: "DBエラー" });
      }

      if (row) {
        // すでに解いた場合
        return res.json({
          correct: true,
          alreadySolved: true,
          message: "この問題はすでに解いています！",
        });
      }

      // まだ解いていない場合のみ判定
      const normalizedAnswer = String(answer).trim().toLowerCase();
      const normalizedCorrect = String(correctAnswer).trim().toLowerCase();

      if (normalizedAnswer === normalizedCorrect) {
        const gain = Number(point) || 0;

        // スコア加算＋解いた記録を追加
        db.run("UPDATE users SET score = score + ? WHERE userid = ?", [gain, userid], (err) => {
          if (err) console.error("スコア更新失敗:", err);
        });

        db.run(
          "INSERT INTO solved (userid, category, qid) VALUES (?, ?, ?)",
          [userid, category, qid],
          (err) => {
            if (err) console.error("solved登録失敗:", err);
          }
        );

        // 最新スコア取得して返す
        db.get("SELECT score FROM users WHERE userid = ?", [userid], (err, row) => {
          res.json({
            correct: true,
            alreadySolved: false,
            message: "正解！",
            point: gain,
            score: row?.score ?? 0,
          });
        });
      } else {
        // 不正解
        res.json({ correct: false, message: "不正解..." });
      }
    }
  );
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

// すでに解いた問題一覧を返すAPI
app.get("/solvedList", requireLogin, (req, res) => {
  const userid = req.session.userid;
  db.all("SELECT category, qid FROM solved WHERE userid = ?", [userid], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: "DBエラー" });
    }
    res.json(rows); // [{category:"TEST", qid:"q1"}, ...]
  });
});

app.listen(3333, () => {
  console.log("✅ サーバー起動: http://localhost:3333");
});
