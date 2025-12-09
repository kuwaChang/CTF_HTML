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

// レート制限(ブルートフォース対策)
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
  //脆弱性検査用のコメントアウト
  // {
  // origin: (origin, callback) => {
  //   // オリジンなし（直接アクセス）またはプライベートIPからのアクセスのみ許可
  //   if (!origin) return callback(null, true);
    
  //   // オリジンのホスト部分を抽出
  //   try {
  //     const url = new URL(origin);
  //     const hostname = url.hostname;
      
  //     // プライベートIPまたはlocalhostかチェック
  //     const isPrivate = hostname === 'localhost' || 
  //                      hostname === '127.0.0.1' ||
  //                      hostname.startsWith('192.168.') ||
  //                      hostname.startsWith('10.') ||
  //                      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);
      
  //     if (isPrivate) {
  //       callback(null, true);
  //     } else {
  //       callback(new Error('CORS: LAN内からのアクセスのみ許可されています'));
  //     }
  //   } catch (err) {
  //     callback(new Error('CORS: 無効なオリジン'));
  //   }
  // },
  // credentials: true,
  // methods: ['GET', 'POST', 'PUT', 'DELETE'],
  // allowedHeaders: ['Content-Type', 'Authorization']
  // }
));

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

// ============================================
// SQLインジェクション練習用ルート（学習目的）
// ============================================

// SQLインジェクション練習用ページ
app.get(["/sql", "/sql_index", "/sqli"], (_req, res) => {
	res.sendFile(path.join(__dirname, "public", "sql_index.html"));
});

// 隠しフラグページ（広告ページから発見できる）
app.get("/flag-hidden", (_req, res) => {
	res.sendFile(path.join(__dirname, "public", "flag-hidden.html"));
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
			{ username: "wendy", password: "wendypass", email: "wendy@example.com", role: "user" }
		];
		
		if (!row || row.cnt === 0) {
			// データが存在しない場合は新規投入
			const stmt = sqlDb.prepare(`INSERT OR IGNORE INTO users (username, password, email, role) VALUES (?, ?, ?, ?)`);
			for (const u of seedUsers) {
				stmt.run(u.username, u.password, u.email, u.role);
			}
			stmt.finalize();
			console.log("✅ SQL練習用ユーザーを投入しました:", seedUsers.map(u => u.username).join(", "));
		} else {
			// 既存データがある場合は、emailとroleを更新
			const updateStmt = sqlDb.prepare(`UPDATE users SET email = ?, role = ? WHERE username = ?`);
			for (const u of seedUsers) {
				updateStmt.run(u.email, u.role, u.username);
			}
			updateStmt.finalize();
			console.log("✅ SQL練習用ユーザーのemailとroleを更新しました");
		}
		console.log("🗄️ SQL練習DBファイル:", sqlDbPath);
	});
});

// ログイン機能（SQLインジェクション脆弱性あり - 学習用）
app.post("/login", (req, res) => {
    const username = req.body.username || "";
    const password = req.body.password || "";

    // ❌ SQLインジェクションできる超危険なクエリ（練習用）
    const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;

    console.log("実行されるSQL:", query);

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

    console.log("実行されるSQL:", query);

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
  )`);

  // 既存テーブルにroleカラムがなければ追加（マイグレーション）
  db.run(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'`, (err) => {
    // カラムが既に存在する場合はエラーになるが、無視する
    if (err && !err.message.includes('duplicate column name')) {
      console.error("roleカラム追加エラー:", err);
    }
  });

  // 既存のadminユーザーにroleを設定（マイグレーション）
  db.run(`UPDATE users SET role = 'admin' WHERE userid = 'admin' AND (role IS NULL OR role = 'user')`, (err) => {
    if (err) {
      console.error("adminユーザーのrole設定エラー:", err);
    } else {
      console.log("✅ adminユーザーのroleを設定しました");
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS solved (
    userid TEXT,
    category TEXT,
    qid TEXT,
    PRIMARY KEY (userid, category, qid)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS study_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userid TEXT,
    start_time TEXT,
    end_time TEXT,
    duration_ms INTEGER
  )`);
});


//セッション確認API
app.get("/session-check", (req, res) => {
  if (req.session.userid) {
    // ログイン中ならユーザー情報を返す（roleも含む）
    db.get("SELECT username, role FROM users WHERE userid = ?", [req.session.userid], (err, row) => {
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
        role: userRole
      });
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

// ネットワークインターフェースのIPアドレスを取得
const os = require("os");
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
