const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const cors = require("cors");
const fs = require("fs");
const os = require("os");
const { Server } = require("socket.io");
const { router: sadRouter, setSocketIO } = require("./server-sad");
const crypto = require("crypto");
const multer = require("multer");

// グローバルエラーハンドラー（未処理のエラーをキャッチ）
process.on('uncaughtException', (err) => {
  console.error("❌ 未処理の例外:", err.message);
  console.error("   エラーコード:", err.code);
  console.error("   エラー番号:", err.errno);
  console.error("   スタックトレース:", err.stack);
  // アプリケーションを終了させずに続行（ログイン機能を維持）
});

process.on('unhandledRejection', (reason, promise) => {
  console.error("❌ 未処理のPromise拒否:", reason);
  if (reason instanceof Error) {
    console.error("   エラーコード:", reason.code);
    console.error("   エラー番号:", reason.errno);
    console.error("   スタックトレース:", reason.stack);
  }
});

// セキュリティ: セッションシークレットの生成（環境変数があれば使用、なければランダム生成）
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex');

// セキュリティ: レート制限（ブルートフォース対策）
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15分
const RATE_LIMIT_MAX_REQUESTS = 100; // 15分間に100リクエストまで
const LOGIN_RATE_LIMIT_MAX = 10; // ログイン試行は15分間に10回まで

// レート制限(ブルートフォース対策)
function rateLimit(req, res, next) {
  // レート制限を除外するパス（APIエンドポイントや静的ファイルなど）
  const excludedPaths = [
    '/api/quizData',
    '/sad/start-sad',
    '/sad/stop-sad',
    '/socket.io',
    '/favicon.ico',
    '/js/',
    '/css/',
    '/lib/',
    '/icons/',
    '/files/'
  ];
  
  // 除外パスに該当する場合はレート制限をスキップ
  const isExcluded = excludedPaths.some(path => req.path.startsWith(path));
  if (isExcluded) {
    return next();
  }
  
  // Nginx経由の場合、X-Real-IPまたはX-Forwarded-ForからIPを取得
  const ip = req.headers['x-real-ip'] || 
             req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
             req.ip || 
             req.connection.remoteAddress || 
             'unknown';
  
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

// dbフォルダが存在しない場合は作成
const dbDir = path.join(__dirname, "db");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// ユーザーアイコン用のディレクトリを作成
const iconsDir = path.join(__dirname, "public", "icons");
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// アイコンアップロード用のファイル名サニタイズ関数
function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.\./g, '')
    .replace(/^\.+/, '')
    .substring(0, 255);
}

// アイコンアップロード用のmulter設定
const iconStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, iconsDir);
  },
  filename: (req, file, cb) => {
    // ユーザーIDを基にファイル名を生成（拡張子は保持）
    const userid = req.session.userid || 'unknown';
    const ext = path.extname(file.originalname).toLowerCase();
    const sanitizedUserid = sanitizeFilename(userid);
    const filename = `${sanitizedUserid}_${Date.now()}${ext}`;
    cb(null, filename);
  }
});

// アイコン用のファイルフィルタ（画像のみ許可）
const iconFileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('画像ファイルのみアップロードできます（JPEG, PNG, GIF, WebP）'));
  }
};

const iconUpload = multer({
  storage: iconStorage,
  fileFilter: iconFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

const dbPath = path.join(__dirname, "db", "users.db");
const sessionsDbPath = path.join(__dirname, "db", "sessions.sqlite");
console.log("[server.js] データベースパス:", dbPath);
console.log("[server.js] ファイル存在確認:", fs.existsSync(dbPath));
console.log("[server.js] sessions.sqliteパス:", sessionsDbPath);
console.log("[server.js] sessions.sqlite存在確認:", fs.existsSync(sessionsDbPath));
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("データベース接続エラー (server.js):", err);
    console.error("データベースパス:", dbPath);
  } else {
    console.log("[server.js] データベース接続成功");
  }
});
db.on('error', (err) => {
  console.error("❌ データベースエラー (server.js):", err.message);
  console.error("   エラーコード:", err.code);
  console.error("   エラー番号:", err.errno);
  console.error("   データベースパス:", dbPath);
  if (err.stack) {
    console.error("   スタックトレース:", err.stack);
  }
});
// SQLインジェクション練習用データベース（別ファイル）
const sqlDbPath = path.join(__dirname, "public", "files", "user_database.db");
const sqlDb = new sqlite3.Database(sqlDbPath);
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
app.use(cors(
  //脆弱性検査する際は以下のスコープをコメントアウト
  {
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
  }
));

// SQLiteStoreの初期化を試行
let sessionStore;
try {
  console.log("[server.js] SQLiteStoreを初期化します...");
  console.log("[server.js] sessions.sqliteの絶対パス:", path.resolve(sessionsDbPath));
  console.log("[server.js] dbディレクトリの絶対パス:", path.resolve(dbDir));
  
  // SQLiteStoreのオプションを設定
  // dbオプションにファイル名だけを指定し、dirオプションにディレクトリを指定
  const storeOptions = {
    db: 'sessions.sqlite',  // ファイル名のみ
    table: 'sessions',
    dir: dbDir,  // ディレクトリを指定
    errorHandler: (err) => {
      console.error("❌ SQLiteStoreエラー:", err.message);
      console.error("   エラーコード:", err.code);
      console.error("   エラー番号:", err.errno);
      console.error("   データベースパス:", path.join(dbDir, 'sessions.sqlite'));
      if (err.stack) {
        console.error("   スタックトレース:", err.stack);
      }
    }
  };
  
  sessionStore = new SQLiteStore(storeOptions);
  
  // SQLiteStoreの内部接続を監視
  if (sessionStore && sessionStore.db) {
    sessionStore.db.on('error', (err) => {
      console.error("❌ SQLiteStore内部データベースエラー:", err.message);
      console.error("   エラーコード:", err.code);
      console.error("   エラー番号:", err.errno);
      if (err.stack) {
        console.error("   スタックトレース:", err.stack);
      }
    });
  }
  
  console.log("✅ [server.js] SQLiteStore初期化成功");
} catch (err) {
  console.error("❌ SQLiteStore初期化エラー:", err.message);
  console.error("   スタックトレース:", err.stack);
  // エラーが発生してもセッションストアなしで続行（メモリストアにフォールバック）
  sessionStore = undefined;
}

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
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
  res.sendFile(path.join(__dirname, "public", "html", "index.html"));
});

// index.htmlへの直接アクセスも許可
app.get("/index.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "html", "index.html"));
});

// マイページ
app.get("/mypage", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "html", "mypage.html"));
});

// 新規登録フォーム
app.get("/register_form.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "html", "register_form.html"));
});

// ============================================
// SQLインジェクション練習用ルート（学習目的）
// ============================================

// SQLインジェクション練習用ページ
app.get(["/sql", "/sql_index", "/sqli"], (_req, res) => {
	res.sendFile(path.join(__dirname, "public", "html", "sql_index.html"));
});

// XSS練習用ページ
app.get(["/xss", "/xss_index"], (_req, res) => {
	res.sendFile(path.join(__dirname, "public", "html", "xss_index.html"));
});

// XSS攻撃成功ページ（リダイレクト先）
app.get("/xss/attack-success", (_req, res) => {
	res.send(`
		<!DOCTYPE html>
		<html lang="ja">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>XSS攻撃成功！</title>
			<style>
				* {
					margin: 0;
					padding: 0;
					box-sizing: border-box;
				}
				body {
					font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
					background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
					min-height: 100vh;
					display: flex;
					justify-content: center;
					align-items: center;
					padding: 20px;
				}
				.container {
					background: white;
					border-radius: 20px;
					padding: 50px;
					max-width: 600px;
					box-shadow: 0 20px 60px rgba(0,0,0,0.3);
					text-align: center;
					animation: slideIn 0.5s ease-out;
				}
				@keyframes slideIn {
					from {
						opacity: 0;
						transform: translateY(-30px);
					}
					to {
						opacity: 1;
						transform: translateY(0);
					}
				}
				h1 {
					color: #dc3545;
					font-size: 2.5em;
					margin-bottom: 20px;
					text-shadow: 2px 2px 4px rgba(0,0,0,0.1);
				}
				.success-icon {
					font-size: 5em;
					margin-bottom: 20px;
					animation: bounce 1s infinite;
				}
				@keyframes bounce {
					0%, 100% {
						transform: translateY(0);
					}
					50% {
						transform: translateY(-10px);
					}
				}
				.flag-box {
					background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
					color: white;
					padding: 30px;
					border-radius: 15px;
					margin: 30px 0;
					box-shadow: 0 10px 30px rgba(0,0,0,0.2);
				}
				.flag-box h2 {
					font-size: 1.5em;
					margin-bottom: 15px;
				}
				.flag {
					font-family: 'Courier New', monospace;
					font-size: 1.8em;
					font-weight: bold;
					background: rgba(255,255,255,0.2);
					padding: 15px;
					border-radius: 8px;
					letter-spacing: 2px;
					word-break: break-all;
				}
				.message {
					color: #333;
					font-size: 1.1em;
					line-height: 1.8;
					margin-top: 20px;
				}
				.warning {
					background: #fff3cd;
					border-left: 4px solid #ffc107;
					padding: 15px;
					margin-top: 30px;
					border-radius: 4px;
					text-align: left;
					color: #856404;
				}
				.warning strong {
					display: block;
					margin-bottom: 10px;
				}
			</style>
		</head>
		<body>
			<div class="container">
				<div class="success-icon">🎯</div>
				<h1>XSS攻撃成功！</h1>
				<div class="flag-box">
					<h2>🏆 フラグ</h2>
					<div class="flag">FLAG{xss_attack_success}</div>
				</div>
				<div class="message">
					<p><strong>おめでとうございます！</strong></p>
					<p>XSS攻撃により、このページにリダイレクトされました。</p>
					<p>実際の攻撃では、このように被害者を悪意のあるページに誘導して、</p>
					<p>情報を盗んだり、さらなる攻撃を行ったりします。</p>
				</div>
				<div class="warning">
					<strong>⚠️ セキュリティ警告</strong>
					<p>このページは学習目的で作成されています。実際のWebアプリケーションでは、XSS攻撃を防ぐために以下の対策が必要です：</p>
					<ul style="margin-left: 20px; margin-top: 10px;">
						<li>ユーザー入力をサニタイズする</li>
						<li>Content Security Policy (CSP) を設定する</li>
						<li>innerHTMLの代わりにtextContentを使用する</li>
						<li>適切なエスケープ処理を実装する</li>
					</ul>
				</div>
			</div>
		</body>
		</html>
	`);
});

// 隠しフラグページ（広告ページから発見できる）
app.get("/flag-hidden", (_req, res) => {
	res.sendFile(path.join(__dirname, "public", "html", "flag-hidden.html"));
});

// ============================================
// HTTPリクエスト/レスポンスにフラグを隠す問題用エンドポイント
// ============================================

// web6: HTTPレスポンスヘッダーにフラグを隠す
app.get("/web/header-flag", (_req, res) => {
	// カスタムヘッダーにフラグを設定
	res.setHeader("X-Flag", "FLAG{check_http_headers}");
	res.setHeader("X-Secret-Key", "FLAG{check_http_headers}");
	res.setHeader("Content-Type", "text/html; charset=utf-8");
	res.send(`
		<!DOCTYPE html>
		<html lang="ja">
		<head>
			<meta charset="UTF-8">
			<title>HTTPヘッダーを確認しよう</title>
			<style>
				body {
					font-family: Arial, sans-serif;
					max-width: 800px;
					margin: 50px auto;
					padding: 20px;
					background: #f5f5f5;
				}
				.container {
					background: white;
					padding: 30px;
					border-radius: 10px;
					box-shadow: 0 2px 10px rgba(0,0,0,0.1);
				}
				h1 { color: #333; }
				p { color: #666; line-height: 1.6; }
			</style>
		</head>
		<body>
			<div class="container">
				<h1>HTTPヘッダーを確認しよう</h1>
				<p>このページには何も表示されていませんが、HTTPレスポンスには重要な情報が含まれているかもしれません。</p>
				<p>ブラウザの開発者ツール（DevTools）を使って、HTTPレスポンスヘッダーを確認してみましょう。</p>
				<p><strong>ヒント:</strong> Networkタブでこのページのリクエストを選択し、Response Headersを確認してください。</p>
			</div>
		</body>
		</html>
	`);
});

// web7: リクエストヘッダーをチェックしてフラグを返す
app.get("/web/request-header-flag", (req, res) => {
	const userAgent = req.headers["user-agent"] || "";
	const customHeader = req.headers["x-secret-header"] || "";
	
	// 特定のUser-Agentまたはカスタムヘッダーをチェック
	if (userAgent.includes("CTF-Browser") || customHeader === "secret-key-123") {
		res.setHeader("X-Flag", "FLAG{modify_request_headers}");
		res.json({
			success: true,
			message: "正しいリクエストヘッダーが送信されました！",
			flag: "FLAG{modify_request_headers}"
		});
	} else {
		res.json({
			success: false,
			message: "このエンドポイントは特定のリクエストヘッダーを要求します。",
			hint: "User-Agentやカスタムヘッダーを変更してみましょう。"
		});
	}
});

// web8: レスポンスボディのHTMLコメントにフラグを隠す
app.get("/web/comment-flag", (_req, res) => {
	res.send(`
		<!DOCTYPE html>
		<html lang="ja">
		<head>
			<meta charset="UTF-8">
			<title>ソースコードを確認しよう</title>
			<style>
				body {
					font-family: Arial, sans-serif;
					max-width: 800px;
					margin: 50px auto;
					padding: 20px;
					background: #f5f5f5;
				}
				.container {
					background: white;
					padding: 30px;
					border-radius: 10px;
					box-shadow: 0 2px 10px rgba(0,0,0,0.1);
				}
				h1 { color: #333; }
				p { color: #666; line-height: 1.6; }
			</style>
		</head>
		<body>
			<div class="container">
				<h1>ソースコードを確認しよう</h1>
				<p>このページのHTMLソースコードを確認してみましょう。</p>
				<p>ブラウザで「ページのソースを表示」するか、開発者ツールのElementsタブを確認してください。</p>
				<!-- FLAG{check_html_comments} -->
				<!-- フラグはHTMLコメントの中に隠されています -->
			</div>
		</body>
		</html>
	`);
});

// web9: ETagヘッダーにフラグを隠す
app.get("/web/etag-flag", (_req, res) => {
	// ETagヘッダーにフラグを設定
	res.setHeader("ETag", '"FLAG{check_etag_header}"');
	res.setHeader("Cache-Control", "no-cache");
	res.send(`
		<!DOCTYPE html>
		<html lang="ja">
		<head>
			<meta charset="UTF-8">
			<title>ETagを確認しよう</title>
			<style>
				body {
					font-family: Arial, sans-serif;
					max-width: 800px;
					margin: 50px auto;
					padding: 20px;
					background: #f5f5f5;
				}
				.container {
					background: white;
					padding: 30px;
					border-radius: 10px;
					box-shadow: 0 2px 10px rgba(0,0,0,0.1);
				}
				h1 { color: #333; }
				p { color: #666; line-height: 1.6; }
			</style>
		</head>
		<body>
			<div class="container">
				<h1>ETagヘッダーを確認しよう</h1>
				<p>HTTPレスポンスには様々なヘッダーが含まれています。</p>
				<p>ETagヘッダーも確認してみましょう。</p>
			</div>
		</body>
		</html>
	`);
});

// SQLインジェクション練習用データベース初期化
sqlDb.serialize(() => {
	// usersテーブル（学習用）- emailとroleカラムを追加
	sqlDb.run(`CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT UNIQUE,
		password TEXT,
		email TEXT,
		role TEXT
	)`);

	// 既存テーブルにカラムがなければ追加（マイグレーション）
	sqlDb.run(`ALTER TABLE users ADD COLUMN email TEXT`, () => {});
	sqlDb.run(`ALTER TABLE users ADD COLUMN role TEXT`, () => {});

	// テストユーザー投入（存在しなければ）または既存データの更新
	sqlDb.get(`SELECT COUNT(*) AS cnt FROM users`, (err, row) => {
		if (err) {
			console.error("SQL練習DB初期化エラー:", err);
			return;
		}
		
		const seedUsers = [
			{ username: "admin", password: "password123", email: "admin@example.com", role: "administrator" },
			{ username: "alice", password: "alicepass", email: "alice@example.com", role: "user" },
			{ username: "bob", password: "bobpass", email: "bob@example.com", role: "user" },
			{ username: "charlie", password: "charliepass", email: "charlie@example.com", role: "user" },
			{ username: "david", password: "davidpass", email: "david@example.com", role: "user" },
			{ username: "eve", password: "evepass", email: "eve@example.com", role: "user" },
			{ username: "frank", password: "frankpass", email: "frank@example.com", role: "user" },
			{ username: "george", password: "georgepass", email: "george@example.com", role: "user" },
			{ username: "hannah", password: "hannahpass", email: "hannah@example.com", role: "user" },
			{ username: "ian", password: "ianpass", email: "ian@example.com", role: "user" },
			{ username: "jane", password: "janepass", email: "jane@example.com", role: "user" },
			{ username: "kevin", password: "kevinpass", email: "kevin@example.com", role: "user" },
			{ username: "linda", password: "lindapass", email: "linda@example.com", role: "user" },
			{ username: "mike", password: "mikepass", email: "mike@example.com", role: "user" },
			{ username: "natalie", password: "nataliepass", email: "natalie@example.com", role: "user" },
			{ username: "oliver", password: "oliverpass", email: "oliver@example.com", role: "user" },
			{ username: "pam", password: "pampass", email: "pam@example.com", role: "user" },
			{ username: "quincy", password: "quincypass", email: "quincy@example.com", role: "user" },
			{ username: "rachel", password: "rachelpass", email: "rachel@example.com", role: "user" },
			{ username: "sam", password: "sampass", email: "sam@example.com", role: "user" },
			{ username: "taylor", password: "taylorpass", email: "taylor@example.com", role: "user" },
			{ username: "uwe", password: "uwepass", email: "uwe@example.com", role: "user" },
			{ username: "victor", password: "victorpass", email: "victor@example.com", role: "user" },
			{ username: "wendy", password: "wendypass", email: "wendy@example.com", role: "user" },
			{ username: "xavier", password: "xavierpass", email: "xavier@example.com", role: "user" },
			{ username: "yolanda", password: "yolandapass", email: "yolanda@example.com", role: "user" },
			{ username: "zachary", password: "zacharypass", email: "zachary@example.com", role: "user" },
			{ username: "alex", password: "alexpass", email: "alex@example.com", role: "user" },
			{ username: "bella", password: "bellapass", email: "bella@example.com", role: "user" },
			{ username: "chris", password: "chrispass", email: "chris@example.com", role: "user" },
			{ username: "diana", password: "dianapass", email: "diana@example.com", role: "user" },
			{ username: "eric", password: "ericpass", email: "eric@example.com", role: "user" },
			{ username: "fiona", password: "fionapass", email: "fiona@example.com", role: "user" },
			{ username: "gavin", password: "gavinpass", email: "gavin@example.com", role: "user" },
			{ username: "helen", password: "helenpass", email: "helen@example.com", role: "user" },
			{ username: "isaac", password: "isaacpass", email: "isaac@example.com", role: "user" },
			{ username: "julia", password: "juliapass", email: "julia@example.com", role: "user" },
			{ username: "kyle", password: "kylepass", email: "kyle@example.com", role: "user" },
			{ username: "luna", password: "lunapass", email: "luna@example.com", role: "user" },
			{ username: "mason", password: "masonpass", email: "mason@example.com", role: "user" },
			{ username: "nina", password: "ninapass", email: "nina@example.com", role: "user" },
			{ username: "oscar", password: "oscarpass", email: "oscar@example.com", role: "user" },
			{ username: "paula", password: "paulapass", email: "paula@example.com", role: "user" },
			{ username: "quinn", password: "quinnpass", email: "quinn@example.com", role: "user" },
			{ username: "ruby", password: "rubypass", email: "ruby@example.com", role: "user" },
			{ username: "steve", password: "stevepass", email: "steve@example.com", role: "user" },
			{ username: "tina", password: "tinapass", email: "tina@example.com", role: "user" },
			{ username: "uma", password: "umapass", email: "uma@example.com", role: "user" },
			{ username: "violet", password: "violetpass", email: "violet@example.com", role: "user" },
			{ username: "william", password: "williampass", email: "william@example.com", role: "user" },
			{ username: "xena", password: "xenapass", email: "xena@example.com", role: "user" },
			{ username: "yuki", password: "yuki", email: "yuki@example.com", role: "user" },
			{ username: "yuta", password: "yuta", email: "yuta@example.com", role: "user" },
			{ username: "yusuke", password: "yusuke", email: "yusuke@example.com", role: "user" },
			{ username: "sakura", password: "FLAG{try-SQL}", email: "FLAG{try-SQL}@example.com", role: "user" },
			{ username: "ryo", password: "ryo", email: "ryo@example.com", role: "user" },
			{ username: "akira", password: "akira", email: "akira@example.com", role: "user" },
			{ username: "haruka", password: "haruka", email: "haruka@example.com", role: "user" },
			{ username: "kenji", password: "kenji", email: "kenji@example.com", role: "user" },
			{ username: "mai", password: "mai", email: "mai@example.com", role: "user" },
			{ username: "naoki", password: "naoki", email: "naoki@example.com", role: "user" },
			{ username: "satoshi", password: "satoshi", email: "satoshi@example.com", role: "user" },
			{ username: "tomoya", password: "tomoya", email: "tomoya@example.com", role: "user" },
			{ username: "yui", password: "yui", email: "yui@example.com", role: "user" },
			{ username: "aoi", password: "aoi", email: "aoi@example.com", role: "user" },
			{ username: "daiki", password: "daiki", email: "daiki@example.com", role: "user" },
			{ username: "emi", password: "emi", email: "emi@example.com", role: "user" },
			{ username: "hiroshi", password: "hiroshi", email: "hiroshi@example.com", role: "user" },
			{ username: "kaori", password: "kaori", email: "kaori@example.com", role: "user" },
			{ username: "masato", password: "masato", email: "masato@example.com", role: "user" },
			{ username: "nana", password: "nana", email: "nana@example.com", role: "user" },
			{ username: "osamu", password: "osamu", email: "osamu@example.com", role: "user" },
			{ username: "reina", password: "reina", email: "reina@example.com", role: "user" },
			{ username: "shota", password: "shota", email: "shota@example.com", role: "user" },
			{ username: "takeshi", password: "takeshi", email: "takeshi@example.com", role: "user" },
			{ username: "umi", password: "umi", email: "umi@example.com", role: "user" },
			{ username: "yoko", password: "yoko", email: "yoko@example.com", role: "user" },
			{ username: "zen", password: "zen", email: "zen@example.com", role: "user" }
		];
		
		// 全ユーザーをINSERT OR IGNOREで追加（既存ユーザーは無視、新規ユーザーは追加）
		const stmt = sqlDb.prepare(`INSERT OR IGNORE INTO users (username, password, email, role) VALUES (?, ?, ?, ?)`);
		for (const u of seedUsers) {
			stmt.run(u.username, u.password, u.email, u.role);
		}
		stmt.finalize();
		
		// 既存ユーザーのemailとroleを更新
		const updateStmt = sqlDb.prepare(`UPDATE users SET email = ?, role = ? WHERE username = ?`);
		for (const u of seedUsers) {
			updateStmt.run(u.email, u.role, u.username);
		}
		updateStmt.finalize();
		
		console.log("✅ SQL練習用ユーザーを投入/更新しました:", seedUsers.map(u => u.username).join(", "));
		//console.log("🗄️ SQL練習DBファイル:", sqlDbPath);
	});
});

// ログイン機能（SQLインジェクション脆弱性あり - 学習用）
app.post("/login", (req, res) => {
    const username = req.body.username || "";
    const password = req.body.password || "";

    // ❌ SQLインジェクションできる超危険なクエリ（練習用）
    const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;

    //console.log("実行されるSQL:", query);

    sqlDb.get(query, (err, row) => {
        if (err) {
            return res.json({
                success: false,
                message: "エラー: " + err.message,
                query: query
            });
        }
        if (row) {
            res.json({
                success: true,
                message: "ログイン成功",
                user: {
                    id: row.id,
                    username: row.username,
                    email: row.email || "",
                    role: row.role || "user"
                },
                query: query
            });
        } else {
            res.json({
                success: false,
                message: "ログイン失敗: ユーザー名またはパスワードが正しくありません",
                query: query
            });
        }
    });
});

// 検索機能（SQLインジェクション脆弱性あり - 学習用）
app.post("/search", (req, res) => {
    const searchTerm = req.body.search || "";

    // ❌ SQLインジェクションできる超危険なクエリ（練習用）
    const query = `SELECT * FROM users WHERE username LIKE '%${searchTerm}%' OR email LIKE '%${searchTerm}%'`;

    //console.log("実行されるSQL:", query);

    sqlDb.all(query, (err, rows) => {
        if (err) {
            return res.json({
                success: false,
                message: "エラー: " + err.message,
                query: query
            });
        }
        res.json({
            success: true,
            results: rows.map(row => ({
                id: row.id,
                username: row.username,
                email: row.email || "",
                role: row.role || "user"
            })),
            count: rows.length,
            query: query
        });
    });
});

// 全ユーザー一覧取得（SQLインジェクション練習用）
app.get("/users", (req, res) => {
    const query = `SELECT * FROM users`;

    sqlDb.all(query, (err, rows) => {
        if (err) {
            return res.json({
                success: false,
                message: "エラー: " + err.message
            });
        }
        res.json({
            success: true,
            users: rows.map(row => ({
                id: row.id,
                username: row.username,
                email: row.email || "",
                role: row.role || "user"
            }))
        });
    });
});

// ============================================
// XSS練習用ルート（学習目的）
// ============================================

// XSS練習用の投稿データ（メモリ上に保存）
const xssPosts = [];

// XSS練習用: フォーラム投稿（サニタイズなし - 学習用）
app.post("/xss/post", (req, res) => {
    const author = req.body.author || "";
    const content = req.body.content || "";

    if (!author || !content) {
        return res.json({
            success: false,
            message: "投稿者名と投稿内容を入力してください"
        });
    }

    // ❌ XSS脆弱性: サニタイズせずにそのまま保存（練習用）
    const post = {
        id: xssPosts.length + 1,
        author: author,  // サニタイズなし
        content: content,  // サニタイズなし
        timestamp: new Date().toISOString()
    };

    xssPosts.push(post);
    //console.log("📝 XSS練習用投稿:", post);

    res.json({
        success: true,
        message: "投稿が保存されました",
        post: post
    });
});

// XSS練習用: フォーラム投稿一覧取得（サニタイズなし - 学習用）
app.get("/xss/posts", (req, res) => {
    // ❌ XSS脆弱性: サニタイズせずにそのまま返す（練習用）
    res.json({
        success: true,
        posts: xssPosts.slice().reverse() // 新しい投稿が上に来るように（元の配列を変更しない）
    });
});

// ============================================
// パストラバーサル練習用ルート（学習目的 - 脆弱性あり）
// ============================================

// ❌ パストラバーサル脆弱性あり: サニタイズなしのファイルダウンロードエンドポイント（練習用）
app.get("/path-traversal/download", (req, res) => {
  const filePath = req.query.file || "";
  
  if (!filePath) {
    return res.status(400).json({ 
      error: "fileパラメータが必要です",
      hint: "例: /path-traversal/download?file=../flag.txt"
    });
  }
  
  // ❌ 脆弱性: パスのサニタイズを行わない
  // ❌ 脆弱性: パストラバーサルチェックを行わない
  const fullPath = path.join(__dirname, "public", "files", filePath);
  const resolvedPath = path.resolve(fullPath);
  const projectRoot = path.resolve(__dirname);
  
  // セキュリティ: 機密ファイルへのアクセスをブロック（練習用の制限）
  const blockedFiles = [
    'server.js',
    'users.db',
    'package.json',
    'package-lock.json',
    '.env',
    'sessions.sqlite',
    'server-sad.js',
    'routes',
    'node_modules',
    'data',
    'private'
  ];
  
  // ブロックされたファイル名が含まれているかチェック
  const fileName = path.basename(resolvedPath);
  const pathParts = resolvedPath.split(path.sep);
  
  for (const blocked of blockedFiles) {
    if (fileName === blocked || pathParts.includes(blocked)) {
      console.warn(`🚫 機密ファイルへのアクセス試行がブロックされました: ${filePath}`);
      return res.status(403).json({ 
        error: "このファイルへのアクセスは許可されていません",
        attemptedPath: filePath,
        hint: "練習用のフラグファイル（flag.txt、secret.txtなど）を探してみてください"
      });
    }
  }
  
  // プロジェクトルート外へのアクセスをブロック（セキュリティ向上）
  if (!resolvedPath.startsWith(projectRoot)) {
    console.warn(`🚫 プロジェクトルート外へのアクセス試行がブロックされました: ${filePath}`);
    return res.status(403).json({ 
      error: "プロジェクトルート外のファイルへのアクセスは許可されていません",
      attemptedPath: filePath
    });
  }
  
  //console.log("⚠️ パストラバーサル試行（脆弱エンドポイント）:", filePath);
  //console.log("⚠️ 解決されたパス:", resolvedPath);
  
  // ファイルの存在確認
  fs.access(resolvedPath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).json({ 
        error: "ファイルが見つかりません",
        attemptedPath: filePath,
        resolvedPath: resolvedPath
      });
    }
    
    // ファイルを送信
    res.sendFile(resolvedPath, (sendErr) => {
      if (sendErr) {
        console.error("ファイル送信エラー:", sendErr);
        if (!res.headersSent) {
          res.status(500).json({ error: "ファイルの送信に失敗しました" });
        }
      }
    });
  });
});

// パストラバーサル練習用ページ
app.get(["/path-traversal", "/path-traversal_index", "/pt"], (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "html", "path-traversal_index.html"));
});

// セキュリティ: ファイル名とカテゴリ名のサニタイゼーション関数
function sanitizePathComponent(component) {
  if (typeof component !== 'string') return '';
  // 危険な文字を削除: 英数字、アンダースコア、ハイフンのみ許可
  return component.replace(/[^a-zA-Z0-9_-]/g, '').replace(/\.\./g, '').substring(0, 100);
}

// セキュリティ: ファイルダウンロードエンドポイント（パストラバーサル対策）
app.get("/files/:category/:filename", (req, res) => {
  // セキュリティ: 認証チェック（ファイルダウンロードはログイン必須）
  if (!req.session.userid) {
    return res.status(401).json({ error: "ログインが必要です" });
  }
  
  // セキュリティ: カテゴリ名とファイル名をサニタイズ
  const sanitizedCategory = sanitizePathComponent(req.params.category);
  const sanitizedFilename = sanitizePathComponent(req.params.filename);
  
  // セキュリティ: サニタイズ後の値が空でないことを確認
  if (!sanitizedCategory || !sanitizedFilename) {
    return res.status(400).json({ error: "無効なパラメータです" });
  }
  
  // セキュリティ: 元の値とサニタイズ後の値が一致するか確認（不正な文字が含まれていないか）
  if (req.params.category !== sanitizedCategory || req.params.filename !== sanitizedFilename) {
    return res.status(400).json({ error: "無効なパラメータです" });
  }
  
  // セキュリティ: 許可されたディレクトリ内のファイルのみアクセス可能
  const filesDir = path.join(__dirname, "public", "files");
  const categoryDir = path.join(filesDir, sanitizedCategory);
  const filePath = path.join(categoryDir, sanitizedFilename);
  
  // セキュリティ: パストラバーサル対策 - 正規化されたパスが許可されたディレクトリ内にあることを確認
  const resolvedFilesDir = path.resolve(filesDir);
  const resolvedFilePath = path.resolve(filePath);
  
  if (!resolvedFilePath.startsWith(resolvedFilesDir)) {
    console.warn(`🚫 パストラバーサル試行: ${req.params.category}/${req.params.filename}`);
    return res.status(403).json({ error: "アクセスが拒否されました" });
  }
  
  // セキュリティ: カテゴリディレクトリが許可されたディレクトリ内にあることを確認
  const resolvedCategoryDir = path.resolve(categoryDir);
  if (!resolvedCategoryDir.startsWith(resolvedFilesDir)) {
    console.warn(`🚫 パストラバーサル試行（カテゴリ）: ${req.params.category}`);
    return res.status(403).json({ error: "アクセスが拒否されました" });
  }
  
  // ファイルの存在確認
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error("ファイルアクセスエラー:", err);
      return res.status(404).json({ error: "ファイルが見つかりません" });
    }
    
    // ファイルを送信
    res.sendFile(filePath, (sendErr) => {
      if (sendErr) {
        console.error("ファイル送信エラー:", sendErr);
        if (!res.headersSent) {
          res.status(500).json({ error: "ファイルの送信に失敗しました" });
        }
      }
    });
  });
});

// JSONデータを返すAPI（認証必須に変更）
// サーバーのIPアドレスを取得する関数（quizData.json用）
function getServerHostForQuiz() {
  // 環境変数が設定されている場合はそれを優先
  if (process.env.SERVER_HOST) {
    return process.env.SERVER_HOST;
  }
  
  // IPアドレスを取得
  const interfaces = os.networkInterfaces();
  const addresses = [];
  const preferredAddresses = []; // 192.168.x.xを優先
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // IPv4で、内部（非ループバック）アドレスのみ
      if (iface.family === 'IPv4' && !iface.internal) {
        const ip = iface.address;
        // 192.168.x.xを優先リストに追加
        if (ip.startsWith('192.168.')) {
          preferredAddresses.push(ip);
        } else {
          addresses.push(ip);
        }
      }
    }
  }
  
  // 優先アドレスがあればそれを返す、なければ通常のアドレスを返す
  const ipList = preferredAddresses.length > 0 ? preferredAddresses : addresses;
  return ipList.length > 0 ? ipList[0] : 'localhost';
}

// quizData.jsonのlocalhostをサーバーのIPアドレスに置き換える関数
function replaceLocalhostInQuizData(data) {
  const serverHost = getServerHostForQuiz();
  const dataString = JSON.stringify(data);
  const replacedString = dataString.replace(/http:\/\/localhost:(\d+)/g, `http://${serverHost}:$1`);
  return JSON.parse(replacedString);
}

// 答えを削除する関数（セキュリティ対策）
function removeAnswersFromQuizData(data) {
  const sanitized = JSON.parse(JSON.stringify(data)); // コピー
  for (const category in sanitized) {
    if (sanitized.hasOwnProperty(category)) {
      for (const qid in sanitized[category]) {
        if (sanitized[category].hasOwnProperty(qid)) {
          // answerフィールドを削除
          delete sanitized[category][qid].answer;
        }
      }
    }
  }
  return sanitized;
}

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
      const parsedData = JSON.parse(data);
      const replacedData = replaceLocalhostInQuizData(parsedData);
      // セキュリティ: 答えを削除してから送信
      const sanitizedData = removeAnswersFromQuizData(replacedData);
      res.json(sanitizedData);
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
      return res.json({ success: false, score: 0, studyTime: 0 });
    }
    
    // 学習時間の合計を取得
    db.get(
      "SELECT COALESCE(SUM(duration_ms), 0) as total_study_time FROM study_sessions WHERE userid = ?",
      [req.session.userid],
      (studyErr, studyRow) => {
        if (studyErr) {
          console.error("学習時間取得エラー:", studyErr);
          // 学習時間の取得に失敗してもスコアは返す
          return res.json({ success: true, score: row.score, studyTime: 0 });
        }
        const studyTime = studyRow ? (studyRow.total_study_time || 0) : 0;
        res.json({ success: true, score: row.score, studyTime: studyTime });
      }
    );
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
    score INTEGER,
    role TEXT DEFAULT 'user'
  )`, (err) => {
    if (err) {
      console.error("❌ usersテーブル作成エラー:", err.message);
      console.error("   エラーコード:", err.code);
      console.error("   スタックトレース:", err.stack);
    }
  });

  // 既存テーブルにroleカラムがなければ追加（マイグレーション）
  db.run(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'`, (err) => {
    // カラムが既に存在する場合はエラーになるが、無視する
    if (err && !err.message.includes('duplicate column name')) {
      console.error("❌ roleカラム追加エラー:", err.message);
      console.error("   エラーコード:", err.code);
      console.error("   スタックトレース:", err.stack);
    }
  });

  // 既存テーブルにicon_pathカラムがなければ追加（マイグレーション）
  db.run(`ALTER TABLE users ADD COLUMN icon_path TEXT`, (err) => {
    // カラムが既に存在する場合はエラーになるが、無視する
    if (err && !err.message.includes('duplicate column name')) {
      console.error("❌ icon_pathカラム追加エラー:", err.message);
      console.error("   エラーコード:", err.code);
      console.error("   スタックトレース:", err.stack);
    }
  });

  // 既存のadminユーザーにroleを設定（マイグレーション）
  db.run(`UPDATE users SET role = 'admin' WHERE userid = 'admin' AND (role IS NULL OR role = 'user')`, (err) => {
    if (err) {
      console.error("❌ adminユーザーのrole設定エラー:", err.message);
      console.error("   エラーコード:", err.code);
      console.error("   スタックトレース:", err.stack);
    } else {
      //console.log("✅ adminユーザーのroleを設定しました");
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS solved (
    userid TEXT,
    category TEXT,
    qid TEXT,
    PRIMARY KEY (userid, category, qid)
  )`, (err) => {
    if (err) {
      console.error("❌ solvedテーブル作成エラー:", err.message);
      console.error("   エラーコード:", err.code);
      console.error("   スタックトレース:", err.stack);
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS study_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userid TEXT,
    start_time TEXT,
    end_time TEXT,
    duration_ms INTEGER
  )`, (err) => {
    if (err) {
      console.error("❌ study_sessionsテーブル作成エラー:", err.message);
      console.error("   エラーコード:", err.code);
      console.error("   スタックトレース:", err.stack);
    }
  });

  // 実績システム用テーブル
  db.run(`CREATE TABLE IF NOT EXISTS user_achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userid TEXT,
    achievement_id TEXT,
    unlocked_at TEXT,
    progress INTEGER DEFAULT 0,
    max_progress INTEGER DEFAULT 1,
    UNIQUE(userid, achievement_id)
  )`, (err) => {
    if (err) {
      console.error("❌ user_achievementsテーブル作成エラー:", err.message);
      console.error("   エラーコード:", err.code);
      console.error("   スタックトレース:", err.stack);
    } else {
      console.log("✅ [server.js] データベース初期化完了");
    }
  });
});

//セッション確認API
app.get("/session-check", (req, res) => {
  if (req.session.userid) {
    // ログイン中ならユーザー情報を返す（roleとicon_pathも含む）
    db.get("SELECT username, role, icon_path FROM users WHERE userid = ?", [req.session.userid], (err, row) => {
      if (err || !row) {
        return res.json({ loggedIn: false });
      }
      // セッションのroleとデータベースのroleを同期（セキュリティ向上）
      const userRole = row.role || 'user';
      if (req.session.role !== userRole) {
        req.session.role = userRole; // セッションのroleを更新
      }
      res.json({ 
        loggedIn: true, 
        username: row.username,
        role: userRole,
        iconPath: row.icon_path || null
      });
    });
  } else {
    res.json({ loggedIn: false });
  }
});

// アイコンアップロードAPI
app.post("/api/upload-icon", iconUpload.single('icon'), (req, res) => {
  // セキュリティ: 認証チェック
  if (!req.session.userid) {
    return res.status(401).json({ success: false, message: "ログインが必要です" });
  }

  if (!req.file) {
    return res.status(400).json({ success: false, message: "ファイルがアップロードされませんでした" });
  }

  const iconPath = `/icons/${req.file.filename}`;

  // 古いアイコンを削除
  db.get("SELECT icon_path FROM users WHERE userid = ?", [req.session.userid], (err, row) => {
    if (err) {
      console.error("アイコン取得エラー:", err);
    } else if (row && row.icon_path) {
      // 旧アイコンが存在する場合は削除
      const oldIconPath = path.join(__dirname, "public", row.icon_path);
      if (fs.existsSync(oldIconPath)) {
        fs.unlink(oldIconPath, (unlinkErr) => {
          if (unlinkErr) {
            console.error("旧アイコン削除エラー:", unlinkErr);
          }
        });
      }
    }
  });

  // データベースにアイコンパスを保存
  db.run("UPDATE users SET icon_path = ? WHERE userid = ?", [iconPath, req.session.userid], (err) => {
    if (err) {
      console.error("アイコン保存エラー:", err);
      // アップロードしたファイルを削除
      fs.unlink(req.file.path, () => {});
      return res.status(500).json({ success: false, message: "アイコンの保存に失敗しました" });
    }
    res.json({ success: true, iconPath: iconPath });
  });
});

// アイコン取得API
app.get("/api/user-icon/:userid", (req, res) => {
  const userid = req.params.userid;
  db.get("SELECT icon_path FROM users WHERE userid = ?", [userid], (err, row) => {
    if (err) {
      console.error("アイコン取得エラー:", err);
      return res.status(500).json({ success: false, message: "アイコンの取得に失敗しました" });
    }
    if (row && row.icon_path) {
      res.json({ success: true, iconPath: row.icon_path });
    } else {
      res.json({ success: false, iconPath: null });
    }
  });
});

// 各ルート登録
const authRoutes = require("./routes/auth");
const quizRoutes = require("./routes/quiz");
const adminRoutes = require("./routes/admin");
const { router: achievementRoutes, checkAchievements } = require("./routes/achievements");

app.use("/auth", authRoutes);
app.use("/quiz", quizRoutes);
app.use("/admin", adminRoutes);
app.use("/achievements", achievementRoutes);
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

// ネットワークインターフェースのIPアドレスを取得
function getLocalIPAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  const preferredAddresses = []; // 192.168.x.xを優先
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // IPv4で、内部（非ループバック）アドレスのみ
      if (iface.family === 'IPv4' && !iface.internal) {
        const ip = iface.address;
        // 192.168.x.xを優先リストに追加
        if (ip.startsWith('192.168.')) {
          preferredAddresses.push(ip);
        } else {
          addresses.push(ip);
        }
      }
    }
  }
  
  // 優先アドレスがあればそれを返す、なければ通常のアドレスを返す
  return preferredAddresses.length > 0 ? preferredAddresses : addresses;
}

// LAN内のすべてのインターフェースでリッスン
server.listen(PORT, '0.0.0.0', () => {  
  const localIPs = getLocalIPAddresses();
  if (localIPs.length > 0) {
    // 最初のIPアドレス（主要なもの）を表示
    const mainIP = localIPs[0];
    console.log(`📡 LAN内の他のデバイスからアクセス可能です: http://${mainIP}:${PORT}`);
    
    // 複数のIPアドレスがある場合は、それも表示
    if (localIPs.length > 1) {
      console.log(`   （その他のIPアドレス: ${localIPs.slice(1).join(', ')}）`);
    }
  } else {
    console.log(`📡 LAN内の他のデバイスからアクセス可能です（IPアドレスを取得できませんでした）`);
  }
});
