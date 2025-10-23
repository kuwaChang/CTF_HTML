const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();
const quizPath = path.join(__dirname, "../data/quizData.json");

// 管理者チェック
function requireAdmin(req, res, next) {
  if (req.session.userid === "admin") next();
  else res.status(403).json({ message: "アクセス権がありません" });
}

// 全問題取得
router.get("/quizzes", requireAdmin, (req, res) => {
  const data = JSON.parse(fs.readFileSync(quizPath, "utf-8"));
  res.json(data);
});

// 問題追加
router.post("/add", requireAdmin, (req, res) => {
  const newQuiz = req.body;
  const data = JSON.parse(fs.readFileSync(quizPath, "utf-8"));
  data[newQuiz.category].push(newQuiz);
  fs.writeFileSync(quizPath, JSON.stringify(data, null, 2));
  res.json({ message: "問題を追加しました" });
});

module.exports = router;
