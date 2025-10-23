const express = require("express");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const router = express.Router();

const db = new sqlite3.Database(path.join(__dirname, "../users.db"));
const quizPath = path.join(__dirname, "../data/quizData.json");

function requireLogin(req, res, next) {
  if (!req.session.userid) return res.status(401).json({ message: "ログインが必要です" });
  next();
}

// 全問題を返す
router.get("/all", requireLogin, (req, res) => {
  const data = JSON.parse(fs.readFileSync(quizPath, "utf-8"));
  res.json(data);
});

// 正解判定
router.post("/check", requireLogin, (req, res) => {
  const { category, qid, answer, point } = req.body;
  const userid = req.session.userid;
  const data = JSON.parse(fs.readFileSync(quizPath, "utf-8"));
  const correct = data[category]?.[qid]?.answer;

  if (!correct) return res.status(404).json({ message: "問題が見つかりません" });

  if (answer.trim() === correct.trim()) {
    db.get("SELECT * FROM solved WHERE userid=? AND category=? AND qid=?", [userid, category, qid], (err, row) => {
      if (row) return res.json({ correct: true, message: "既に解答済みです" });

      db.run("INSERT INTO solved VALUES (?, ?, ?)", [userid, category, qid]);
      db.run("UPDATE users SET score = score + ? WHERE userid = ?", [point, userid]);
      res.json({ correct: true, message: "正解！" });
    });
  } else {
    res.json({ correct: false, message: "不正解..." });
  }
});

// 解いた問題一覧
router.get("/solvedList", requireLogin, (req, res) => {
  db.all("SELECT category, qid FROM solved WHERE userid = ?", [req.session.userid], (err, rows) => {
    if (err) return res.status(500).json({ message: "DBエラー" });
    res.json(rows);
  });
});

// ランキング
router.get("/ranking", (req, res) => {
  db.all("SELECT userid, SUM(point) as total FROM solves GROUP BY userid ORDER BY total DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ message: "ランキング取得失敗" });
    res.json(rows);
  });
});

module.exports = router;
