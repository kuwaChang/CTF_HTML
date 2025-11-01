const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const cors = require("cors");
const fs = require("fs");
const { Server } = require("socket.io");
const { router: sadRouter, setSocketIO } = require("./server-sad");
const crypto = require("crypto");

// セキュリティ: セッションシークレットの生成（環境変数があれば使用、なければランダム生成）
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex');

// セキュリティ: レート制限（ブルートフォース対策）
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15分
const RATE_LIMIT_MAX_REQUESTS = 100; // 15分間に100リクエストまで
const LOGIN_RATE_LIMIT_MAX = 5; // ログイン試行は15分間に5回まで

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 0, loginAttempts: 0, resetTime: now + RATE_LIMIT_WINDOW });
  }
  
  const limit = rateLimitMap.get(ip);
  
  // 時間窓が過ぎたらリセット
  if (now > limit.resetTime) {
    limit.count = 0;
    limit.loginAttempts = 0;
    limit.resetTime = now + RATE_LIMIT_WINDOW;
  }
  
  // ログイン試行のチェック（/auth/loginエンドポイントのみ）
  if (req.path === '/auth/login' || req.path.includes('/auth/login')) {
    limit.loginAttempts++;
    if (limit.loginAttempts > LOGIN_RATE_LIMIT_MAX) {
      return res.status(429).json({ 
        success: false, 
        message: 'ログイン試行回数が上限を超えました。15分後に再試行してください。' 
      });
    }
  }
  
  // 一般リクエストのレート制限
  limit.count++;
  if (limit.count > RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({ 
      success: false, 
      message: 'リクエストが多すぎます。しばらく待ってから再試行してください。' 
    });
  }
  
  next();
}

// Expressのtrust proxyを有効化（リバースプロキシ経由の場合に対応）
const app = express();
app.set('trust proxy', true);

const db = new sqlite3.Database("users.db");
const http = require("http");
const server = http.createServer(app);
const io = new Server(server, {
  path: "/socket.io",
  transports: ["websocket", "polling"],
  cors: {
    origin: true, // LAN内のすべてのオリジンを許可
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Socket.ioをSadサーバー機能に紐づけ
setSocketIO(io);

// デバッグ用：接続確認
io.on("connection", (socket) => {
  console.log("🟢 WebSocket接続:", socket.id);
});

// LAN内のみアクセス可能にするミドルウェア
function checkLanAccess(req, res, next) {
  const clientIp = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
  
  // IPv4アドレスを抽出（プロキシ経由の場合の処理）
  const ip = clientIp ? clientIp.split(',')[0].trim() : '';
  
  // プライベートIPアドレスの範囲をチェック
  const isPrivateIP = (ip) => {
    // localhost
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return true;
    
    // IPv4のプライベートIP範囲
    const ipv4Match = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4Match) {
      const [, a, b, c] = ipv4Match.map(Number);
      // 10.0.0.0/8
      if (a === 10) return true;
      // 172.16.0.0/12
      if (a === 172 && b >= 16 && b <= 31) return true;
      // 192.168.0.0/16
      if (a === 192 && b === 168) return true;
    }
    
    // IPv6のリンクローカルアドレス
    if (ip.startsWith('fe80::') || ip.startsWith('::ffff:10.') || 
        ip.startsWith('::ffff:172.') || ip.startsWith('::ffff:192.168.')) {
      return true;
    }
    
    return false;
  };
  
  if (!isPrivateIP(ip)) {
    console.log(`🚫 アクセス拒否: ${ip}`);
    return res.status(403).send('LAN内からのアクセスのみ許可されています');
  }
  
  next();
}

// セキュリティ: JSONペイロードサイズ制限（DoS対策）
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// すべてのリクエストに対してLAN内アクセスのみを許可
app.use(checkLanAccess);

// セキュリティ: レート制限を適用
app.use(rateLimit);

app.use(express.static(path.join(__dirname, "public")));

// セキュリティ: CORS設定の改善（LAN内のみ許可）
app.use(cors({
  origin: (origin, callback) => {
    // オリジンなし（直接アクセス）またはプライベートIPからのアクセスのみ許可
    if (!origin) return callback(null, true);
    
    // オリジンのホスト部分を抽出
    try {
      const url = new URL(origin);
      const hostname = url.hostname;
      
      // プライベートIPまたはlocalhostかチェック
      const isPrivate = hostname === 'localhost' || 
                       hostname === '127.0.0.1' ||
                       hostname.startsWith('192.168.') ||
                       hostname.startsWith('10.') ||
                       /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);
      
      if (isPrivate) {
        callback(null, true);
      } else {
        callback(new Error('CORS: LAN内からのアクセスのみ許可されています'));
      }
    } catch (err) {
      callback(new Error('CORS: 無効なオリジン'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: new SQLiteStore({ db: "sessions.sqlite" }),
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,  // 1日
    sameSite: "lax",
    httpOnly: true,  // XSS対策: JavaScriptからアクセス不可
    secure: false,   // HTTPS使用時はtrueに変更（LAN内なのでfalseのまま）
    path: "/"
  },
  name: "sessionId"  // デフォルトのconnect.sidから変更（セキュリティ向上）
}));

// ルーティング設定
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// JSONデータを返すAPI（認証必須に変更）
app.get("/api/quizData", (req, res) => {
  // セキュリティ: 認証チェック追加
  if (!req.session.userid) {
    return res.status(401).json({ error: "ログインが必要です" });
  }
  
  const filePath = path.join(__dirname, "data/quizData.json");
  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      console.error("JSON読み込みエラー:", err);
      // セキュリティ: エラー詳細をクライアントに返さない
      return res.status(500).json({ error: "読み込み失敗" });
    }
    try {
      res.json(JSON.parse(data));
    } catch (parseErr) {
      console.error("JSON解析エラー:", parseErr);
      return res.status(500).json({ error: "データ形式エラー" });
    }
  });
});


// ✅ スコア取得API
app.get("/getScore", (req, res) => {
  // セキュリティ: 認証チェック追加
  if (!req.session.userid) {
    return res.status(401).json({ success: false, message: "ログインが必要です" });
  }
  
  // セキュリティ: SQLインジェクション対策（既にパラメータ化クエリを使用）
  db.get("SELECT score FROM users WHERE userid = ?", [req.session.userid], (err, row) => {
    if (err) {
      console.error("DBエラー:", err);
      return res.status(500).json({ success: false, message: "エラーが発生しました" });
    }
    if (!row) {
      return res.json({ success: false, score: 0 });
    }
    res.json({ success: true, score: row.score });
  });
});
//データベースへのアクセス
app.get("/ranking", (req, res) => {
  // セキュリティ: SQLインジェクション対策（既にパラメータ化クエリを使用）
  // LIMIT値も固定値なので安全
  db.all("SELECT userid, score FROM users ORDER BY score DESC LIMIT 10", [], (err, rows) => {
    if (err) {
      console.error("DBエラー:", err);
      // セキュリティ: エラー詳細をクライアントに返さない
      return res.status(500).json({ error: "データ取得に失敗しました" });
    }
    res.json(rows); //json形式で返す
  });
});

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
// セキュリティ: Socket.ioの認証ミドルウェア追加
io.use((socket, next) => {
  // クッキーからセッションIDを取得して認証チェック
  // 注意: Socket.ioの認証は複雑なので、必要に応じて拡張が必要
  next();
});

io.on("connection", (socket) => {
  console.log("🟢 WebSocket接続成功:", socket.id);
  
  // セキュリティ: 未認証ユーザーの接続を拒否する場合
  // socket.handshake.auth や socket.handshake.headers.cookie から認証情報を取得
});

const PORT = 3333;

// LAN内のすべてのインターフェースでリッスン
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ サーバー起動: http://0.0.0.0:${PORT}`);
  console.log(`📡 LAN内の他のデバイスからアクセス可能です`);
});
