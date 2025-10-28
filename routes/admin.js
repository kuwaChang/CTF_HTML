const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const router = express.Router();

const quizPath = path.join(__dirname, "../data/quizData.json");
const uploadDir = path.join(__dirname, "../public/files");


// アップロード設定
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

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

// 管理者用API：全問題データ取得
router.get("/quizzes", requireAdmin, (req, res) => {
  const data = JSON.parse(fs.readFileSync(quizPath, "utf-8"));
  res.json(data);
});

// 管理者用API：問題追加
router.post("/add", requireAdmin, (req, res) => {
  const { category, qid, title, desc, hint, answer, point } = req.body;
  const data = JSON.parse(fs.readFileSync(quizPath, "utf-8"));
  if (!data[category]) data[category] = {};
  data[category][qid] = { title, desc, hint, answer, point };
  fs.writeFileSync(quizPath, JSON.stringify(data, null, 2));
  res.json({ message: "問題を追加しました" });
});

// 管理者用API：問題編集
router.post("/addQuiz", requireAdmin, upload.array("files"), (req, res) => {
  const { category, qid, title, desc, answer, hint, point } = req.body;
  const files = req.files ? req.files.map(f => f.originalname) : [];

  if (!category || !qid || !title || !answer)
    return res.status(400).json({ message: "必須項目が不足しています" });

  try {
    const data = JSON.parse(fs.readFileSync(quizPath, "utf8"));
        // ファイルがあればパスを保存
    const filePath = req.file ? `/uploads/${req.file.filename}` : null;

    // ✅ hintが文字列でも配列でも動くように修正！
    let hintArray = [];
    if (Array.isArray(hint)) {
      hintArray = hint;
    } else if (typeof hint === "string" && hint.trim() !== "") {
      hintArray = hint.split(",").map(h => h.trim());
    }

    // カテゴリがなければ作成
    if (!data[category]) data[category] = {};

    //問題データを追加
    data[category][qid] = {
      qid,
      answer,
      title,
      desc: desc || "",
      hint: hint ? hint.split(",").map(h => h.trim()) : [],
      point: Number(point) || 0,
      files: filePath ? [filePath] : []
    };

    fs.writeFileSync(quizPath, JSON.stringify(data, null, 2), "utf8");
    res.json({ message: "問題を追加しました" });
  } catch (err) {
    console.error("追加エラー:", err);
    res.status(500).json({ message: "保存エラー" });
  }
});

// 管理者用API：問題削除
router.delete("/deleteQuiz", requireAdmin, (req, res) => {
  const { category, qid } = req.body;

  if (!category || !qid)
    return res.status(400).json({ message: "カテゴリとIDが必要です" });

  try {
    const data = JSON.parse(fs.readFileSync(quizPath, "utf8"));
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
