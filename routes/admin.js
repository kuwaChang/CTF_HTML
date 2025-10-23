const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();

const quizPath = path.join(__dirname, "../data/quizData.json");

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

router.get("/", requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "../private/admin.html"));
});

router.get("/quizzes", requireAdmin, (req, res) => {
  const data = JSON.parse(fs.readFileSync(quizPath, "utf-8"));
  res.json(data);
});

router.post("/add", requireAdmin, (req, res) => {
  const { category, qid, title, desc, hint, answer, point } = req.body;
  const data = JSON.parse(fs.readFileSync(quizPath, "utf-8"));
  if (!data[category]) data[category] = {};
  data[category][qid] = { title, desc, hint, answer, point };
  fs.writeFileSync(quizPath, JSON.stringify(data, null, 2));
  res.json({ message: "問題を追加しました" });
});

module.exports = router;
