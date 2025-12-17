const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const sqlite3 = require("sqlite3").verbose();
const router = express.Router();

// セキュリティ: ファイル名のサニタイゼーション関数（先に定義）
function sanitizeFilename(filename) {
  // 危険な文字を削除または置換
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_') // 英数字、ドット、アンダースコア、ハイフンのみ許可
    .replace(/\.\./g, '') // パストラバーサル対策
    .replace(/^\.+/, '') // 先頭のドットを削除
    .substring(0, 255); // ファイル名長制限
}

const quizPath = path.join(__dirname, "../data/quizData.json");
const uploadDir = path.join(__dirname, "../public/files");

// dbフォルダが存在しない場合は作成
const dbDir = path.join(__dirname, "../db");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(__dirname, "../db/users.db");
console.log("[admin.js] データベースパス:", dbPath);
console.log("[admin.js] ファイル存在確認:", fs.existsSync(dbPath));
console.log("[admin.js] ディレクトリ存在確認:", fs.existsSync(path.dirname(dbPath)));
let db;
try {
  db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
      console.error("❌ データベース接続エラー (admin.js):", err.message);
      console.error("   エラーコード:", err.code);
      console.error("   エラー番号:", err.errno);
      console.error("   データベースパス:", dbPath);
      console.error("   スタックトレース:", err.stack);
    } else {
      console.log("✅ [admin.js] データベース接続成功");
    }
  });
} catch (err) {
  console.error("❌ データベース作成時の例外 (admin.js):", err.message);
  console.error("   スタックトレース:", err.stack);
  throw err;
}
db.on('error', (err) => {
  console.error("❌ データベースエラー (admin.js):", err.message);
  console.error("   エラーコード:", err.code);
  console.error("   エラー番号:", err.errno);
  console.error("   データベースパス:", dbPath);
  if (err.stack) {
    console.error("   スタックトレース:", err.stack);
  }
});


// セキュリティ: 許可するファイル拡張子
const ALLOWED_EXTENSIONS = ['.txt', '.zip', '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.json', '.xml', '.csv'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// セキュリティ: ファイル拡張子チェック
function isValidFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}

// アップロード設定
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // カテゴリー別のディレクトリに保存
    let category = req.body.category;
    
    // quizDataがJSON文字列の場合はパース
    if (!category && req.body.quizData) {
      try {
        const quizData = JSON.parse(req.body.quizData);
        category = quizData.category;
      } catch (e) {
        // パースに失敗した場合はデフォルト
      }
    }
    
    const safeCategory = category ? sanitizeFilename(category) : 'default';
    const categoryDir = path.join(uploadDir, safeCategory);
    
    // ディレクトリが存在しない場合は作成
    if (!fs.existsSync(categoryDir)) {
      fs.mkdirSync(categoryDir, { recursive: true });
    }
    
    cb(null, categoryDir);
  },
  filename: (req, file, cb) => {
    // セキュリティ: ファイル名をサニタイズ
    const sanitized = sanitizeFilename(file.originalname);
    cb(null, sanitized);
  }
});

// セキュリティ: ファイルフィルタ追加
const fileFilter = (req, file, cb) => {
  if (!isValidFile(file.originalname)) {
    return cb(new Error(`許可されていないファイル形式です。許可: ${ALLOWED_EXTENSIONS.join(', ')}`));
  }
  cb(null, true);
};

const upload = multer({ 
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 10 // 最大10ファイルまで
  }
});

// 管理者認証ミドルウェア（roleベース認証）
function requireAdmin(req, res, next) {
  // セキュリティ: ログイン状態を確認
  if (!req.session.userid) {
    console.log("❌ 認証失敗: ログインしていません");
    return res.status(401).json({ error: "ログインが必要です" });
  }
  
  // セキュリティ: roleベースの認証（データベースから取得したroleを使用）
  if (req.session.role === "admin") {
    console.log("✅ 管理者認証OK:", req.session.userid);
    next();
  }
  else {
    console.log("❌ 認証失敗: 管理者権限がありません", { userid: req.session.userid, role: req.session.role });
    res.status(403).json({ error: "アクセス権がありません（管理者専用）" });
  }
}

// 管理者用ページ表示
router.get("/", requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "../private/admin.html"));
});

// 管理者ページ用のCSSファイル提供
router.get("/style.css", requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "../private/style.css"));
});

// 管理者用API：全問題データ取得
router.get("/quizzes", requireAdmin, (req, res) => {
  const data = JSON.parse(fs.readFileSync(quizPath, "utf-8"));
  res.json(data);
});

// 管理者用API：問題追加・編集
router.post("/addQuiz", requireAdmin, upload.array("files"), (req, res) => {
  // セキュリティ: ファイルアップロードエラーの処理
  if (req.fileValidationError) {
    return res.status(400).json({ message: req.fileValidationError });
  }
  
  // セキュリティ: ファイル名の検証（二重チェック）
  if (req.files && req.files.length > 0) {
    for (const file of req.files) {
      const sanitized = sanitizeFilename(file.originalname);
      if (file.filename !== sanitized || !isValidFile(file.originalname)) {
        // 不正なファイル名のファイルを削除
        try {
          // file.destination が設定されている場合はそれを使用、なければ uploadDir を使用
          const filePath = file.destination ? path.join(file.destination, file.filename) : path.join(uploadDir, file.filename);
          fs.unlinkSync(filePath);
        } catch (e) {
          console.error("ファイル削除エラー:", e);
        }
        return res.status(400).json({ message: "無効なファイル名です" });
      }
    }
  }
  let quizData;
  
  // フォームデータからJSONを取得
  if (req.body.quizData) {
    try {
      quizData = JSON.parse(req.body.quizData);
    } catch (e) {
      return res.status(400).json({ message: "データ形式が不正です" });
    }
  } else {
    // 後方互換性のため、直接リクエストボディから取得
    const { category, qid, title, desc, answer, point, answerType, coordinateTolerance, explanation } = req.body;
    const hints = Array.isArray(req.body.hint) ? req.body.hint : 
                  (req.body.hint ? (typeof req.body.hint === "string" ? req.body.hint.split(",") : [req.body.hint]) : []);
    
    quizData = {
      category,
      qid,
      title,
      desc,
      answer,
      point: parseInt(point) || 0,
      hint: hints.map(h => h.trim()).filter(h => h.length > 0),
      answerType,
      coordinateTolerance: coordinateTolerance ? parseFloat(coordinateTolerance) : undefined,
      explanation
    };
  }

  const { category, qid, title, desc, answer, point } = quizData;

  // セキュリティ: 入力値のサニタイゼーションとバリデーション
  const sanitizeInput = (input, maxLength = 1000) => {
    if (typeof input !== 'string') return '';
    return input.trim().substring(0, maxLength);
  };
  
  // 必須項目のバリデーション
  if (!category || !qid || !title || !desc || !answer || point === undefined) {
    return res.status(400).json({ message: "必須項目（カテゴリ、問題ID、タイトル、説明文、答えフラグ、ポイント）が不足しています" });
  }
  
  // セキュリティ: 入力値のサニタイゼーション
  quizData.category = sanitizeInput(quizData.category, 50);
  quizData.qid = sanitizeInput(quizData.qid, 50);
  quizData.title = sanitizeInput(quizData.title, 200);
  quizData.desc = sanitizeInput(quizData.desc, 5000);
  quizData.answer = sanitizeInput(quizData.answer, 500);

  try {
    const data = JSON.parse(fs.readFileSync(quizPath, "utf8"));

    // セキュリティ: ファイルがあればサニタイズされたファイル名を取得
    const fileNames = req.files ? req.files.map(f => sanitizeFilename(f.filename || f.originalname)) : [];
    
    // セキュリティ: カテゴリ名もサニタイズ（パストラバーサル対策）
    const sanitizedCategory = sanitizeFilename(category);
    if (category !== sanitizedCategory) {
      return res.status(400).json({ message: "無効なカテゴリ名です" });
    }
    
    // カテゴリがなければ作成
    if (!data[category]) data[category] = {};

    // 問題データを構築
    const questionData = {
      answer: answer.trim(),
      title: title.trim(),
      desc: desc.trim(),
      point: parseInt(point) || 0
    };

    // 任意項目：答えの形式
    if (quizData.answerType && quizData.answerType !== "flag") {
      questionData.answerType = quizData.answerType;
      if (quizData.answerType === "coordinates" && quizData.coordinateTolerance) {
        questionData.coordinateTolerance = parseFloat(quizData.coordinateTolerance);
      }
    }

    // 任意項目：ヒント
    if (quizData.hint && Array.isArray(quizData.hint) && quizData.hint.length > 0) {
      questionData.hint = quizData.hint.filter(h => h && h.trim().length > 0);
    }

    // 任意項目：ファイル
    if (fileNames.length > 0) {
      questionData.files = fileNames;
    } else if (data[category][qid] && data[category][qid].files) {
      // 既存の問題で、ファイルが指定されていない場合は既存のファイルを維持
      questionData.files = data[category][qid].files;
    } else {
      questionData.files = [];
    }

    // 任意項目：解説URL
    if (quizData.explanation && quizData.explanation.trim().length > 0) {
      questionData.explanation = quizData.explanation.trim();
    }

    // 問題データを保存
    data[category][qid] = questionData;

    fs.writeFileSync(quizPath, JSON.stringify(data, null, 2), "utf8");
    res.json({ message: "問題を保存しました" });
  } catch (err) {
    console.error("保存エラー:", err);
    // セキュリティ: エラー詳細をクライアントに返さない
    res.status(500).json({ message: "保存中にエラーが発生しました" });
  }
});

// 管理者用API：問題削除
router.delete("/deleteQuiz", requireAdmin, (req, res) => {
  let { category, qid } = req.body;

  if (!category || !qid)
    return res.status(400).json({ message: "カテゴリとIDが必要です" });
  
  // セキュリティ: 入力値のサニタイゼーション（検証用）
  const sanitizedCategory = sanitizeFilename(String(category));
  const sanitizedQid = sanitizeFilename(String(qid));
  
  // セキュリティ: サニタイズ後の値と元の値が一致するかチェック（不正な文字が含まれていないか確認）
  if (category !== sanitizedCategory || qid !== sanitizedQid) {
    return res.status(400).json({ message: "無効なカテゴリまたはIDです" });
  }
  
  // セキュリティ: サニタイズ済みなので元の値を使用しても安全
  category = sanitizedCategory;
  qid = sanitizedQid;

  try {
    const data = JSON.parse(fs.readFileSync(quizPath, "utf8"));
    // セキュリティ: サニタイズされた値を使用
    if (data[category]?.[qid]) {
      delete data[category][qid];
      fs.writeFileSync(quizPath, JSON.stringify(data, null, 2), "utf8");
      res.json({ message: "問題を削除しました" });
    } else {
      res.status(404).json({ message: "該当の問題が見つかりません" });
    }
  } catch (err) {
    console.error("削除エラー:", err);
    res.status(500).json({ message: "削除中にエラーが発生しました" });
  }
});

// セキュリティ: 入力値のサニタイゼーションとバリデーション
function sanitizeInput(input, maxLength = 100) {
  if (typeof input !== 'string') return '';
  return input.trim().substring(0, maxLength);
}

function validateUserId(userid) {
  // 英数字とアンダースコアのみ許可、3-20文字
  return /^[a-zA-Z0-9_]{3,20}$/.test(userid);
}

function validateRole(role) {
  // 許可されたroleのみ
  return ['user', 'admin'].includes(role);
}

// 管理者用API：ユーザー一覧取得
router.get("/users", requireAdmin, (req, res) => {
  db.all(
    "SELECT userid, username, score, role FROM users ORDER BY userid",
    [],
    (err, rows) => {
      if (err) {
        console.error("ユーザー一覧取得エラー:", err);
        return res.status(500).json({ message: "ユーザー一覧の取得に失敗しました" });
      }
      // セキュリティ: パスワードは返さない
      res.json(rows.map(row => ({
        userid: row.userid,
        username: row.username,
        score: row.score || 0,
        role: row.role || 'user'
      })));
    }
  );
});

// 管理者用API：ユーザーのrole変更
router.put("/users/:userid/role", requireAdmin, (req, res) => {
  let { userid } = req.params;
  let { role } = req.body;

  // セキュリティ: 入力値のサニタイゼーション
  userid = sanitizeInput(userid, 20);
  role = sanitizeInput(role, 20);

  // セキュリティ: 入力値のバリデーション
  if (!validateUserId(userid)) {
    return res.status(400).json({ message: "無効なユーザーIDです" });
  }

  if (!validateRole(role)) {
    return res.status(400).json({ message: "無効なroleです。許可された値: user, admin" });
  }

  // セキュリティ: 自分自身のroleを変更しようとしている場合は警告（ただし許可）
  if (userid === req.session.userid && role !== 'admin') {
    // 警告はするが、変更自体は許可（管理者が意図的に変更する場合もあるため）
    console.warn(`⚠️ 警告: 管理者 ${req.session.userid} が自分のroleを ${role} に変更しようとしています`);
  }

  // セキュリティ: SQLインジェクション対策（パラメータ化クエリを使用）
  db.run(
    "UPDATE users SET role = ? WHERE userid = ?",
    [role, userid],
    function(err) {
      if (err) {
        console.error("role変更エラー:", err);
        return res.status(500).json({ message: "roleの変更に失敗しました" });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ message: "ユーザーが見つかりません" });
      }

      res.json({ message: `ユーザー ${userid} のroleを ${role} に変更しました` });
    }
  );
});

module.exports = router;
