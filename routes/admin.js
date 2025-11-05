const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
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
  destination: uploadDir,
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

// 管理者認証ミドルウェア
function requireAdmin(req, res, next) {
  if (req.session.userid === "admin") {
    console.log("✅ 管理者認証OK");
    next();
  }
  else {
    console.log("❌ 認証失敗:", req.session.userid);
    res.status(403).send("アクセス権がありません（管理者専用）");
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
          fs.unlinkSync(path.join(uploadDir, file.filename));
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
module.exports = router;
