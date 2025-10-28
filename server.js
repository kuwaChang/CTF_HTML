const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const cors = require("cors");
const fs = require("fs");
const { Server } = require("socket.io");
const { router: sadRouter, setSocketIO } = require("./server-sad");

const app = express();

const db = new sqlite3.Database("users.db");
const http = require("http");
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// Socket.ioをSadサーバー機能に紐づけ
setSocketIO(io);

// デバッグ用：接続確認
io.on("connection", (socket) => {
  console.log("🟢 WebSocket接続:", socket.id);
});

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(session({
  secret: "super_secret_key",
  resave: false,
  saveUninitialized: false,
  store: new SQLiteStore({ db: "sessions.sqlite" }),
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,  // 1日
    sameSite: "lax"
  }
}));

// ルーティング設定
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// JSONデータを返すAPI
app.get("/api/quizData", (req, res) => {
  const filePath = path.join(__dirname, "data/quizData.json");
  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      console.error("JSON読み込みエラー:", err);
      return res.status(500).json({ error: "読み込み失敗" });
    }
    res.json(JSON.parse(data));
  });
});


// ✅ スコア取得API
app.get("/getScore", (req, res) => {
  db.get("SELECT score FROM users WHERE userid = ?", [req.session.userid], (err, row) => {
    if (err || !row) {
      res.json({ success: false, score: 0 });
    } else {
      res.json({ success: true, score: row.score });
    }
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


//セッション確認API
app.get("/session-check", (req, res) => {
  if (req.session.userid) {
    // ログイン中ならユーザー情報を返す
    db.get("SELECT username FROM users WHERE userid = ?", [req.session.userid], (err, row) => {
      if (err || !row) {
        return res.json({ loggedIn: false });
      }
      res.json({ loggedIn: true, username: row.username });
    });
  } else {
    res.json({ loggedIn: false });
  }
});



// 各ルート登録
const authRoutes = require("./routes/auth");
const quizRoutes = require("./routes/quiz");
const adminRoutes = require("./routes/admin");

app.use("/auth", authRoutes);
app.use("/quiz", quizRoutes);
app.use("/admin", adminRoutes);
app.use("/sad", sadRouter);

// ✅ Socket.ioが有効化されることを確認
io.on("connection", (socket) => {
  console.log("🟢 WebSocket接続成功:", socket.id);
});

const PORT = 3333;

app.listen(PORT, () => {
  console.log(`✅ サーバー起動: http://localhost:${PORT}`);
});
