const express = require("express");
const router = express.Router();
const db = require("../utils/db");
const quizAnswers = require("../data/quizAnswers");

// ログイン済みチェック
function requireLogin(req, res, next) {
  if (!req.session.userid) return res.json({ correct: false, message: "ログインしてください" });
  next();
}

router.post("/check", requireLogin, (req, res) => {
  const { category, qid, answer } = req.body;
  const userid = req.session.userid;
  const correctAnswer = quizAnswers[category]?.[qid];

  if (!correctAnswer)
    return res.json({ correct: false, message: "問題が存在しません" });

  if (String(answer).trim().toLowerCase() === String(correctAnswer).trim().toLowerCase()) {
    const point = 10;
    db.run("UPDATE users SET score = score + ? WHERE userid = ?", [point, userid], err => {
      if (err) return res.json({ correct: false, message: "スコア更新失敗" });
      db.get("SELECT score FROM users WHERE userid = ?", [userid], (err, row) => {
        res.json({ correct: true, message: "正解！", point, score: row.score });
      });
    });
  } else {
    db.get("SELECT score FROM users WHERE userid = ?", [userid], (err, row) => {
      res.json({ correct: false, message: "不正解...", point: 0, score: row ? row.score : 0 });
    });
  }
});

module.exports = router;
