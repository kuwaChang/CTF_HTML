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

// 座標の距離を計算（ハーバサイン公式）
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // 地球の半径（km）
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // 距離（km）
}

// 座標が許容範囲内かチェック
function checkCoordinates(userAnswer, correctAnswer, tolerance = 0.001) {
  try {
    const userCoords = userAnswer.split(',').map(c => parseFloat(c.trim()));
    const correctCoords = correctAnswer.split(',').map(c => parseFloat(c.trim()));
    
    if (userCoords.length !== 2 || correctCoords.length !== 2) return false;
    if (isNaN(userCoords[0]) || isNaN(userCoords[1]) || 
        isNaN(correctCoords[0]) || isNaN(correctCoords[1])) return false;
    
    // 緯度経度の差分をチェック（簡易版）
    const latDiff = Math.abs(userCoords[0] - correctCoords[0]);
    const lonDiff = Math.abs(userCoords[1] - correctCoords[1]);
    
    // tolerance（デフォルト0.001度 ≈ 約111m）以内なら正解
    return latDiff <= tolerance && lonDiff <= tolerance;
  } catch (e) {
    return false;
  }
}

// 正解判定
router.post("/checkAnswer", requireLogin, (req, res) => {
  const { category, qid, answer, point } = req.body;
  const userid = req.session.userid;
  const data = JSON.parse(fs.readFileSync(quizPath, "utf-8"));
  const question = data[category]?.[qid];
  
  if (!question) return res.status(404).json({ message: "問題が見つかりません" });
  
  const correct = question.answer;
  const answerType = question.answerType || "flag"; // デフォルトはflag形式
  let isCorrect = false;

  if (answerType === "coordinates") {
    // 座標形式の検証
    const tolerance = question.coordinateTolerance || 0.001;
    isCorrect = checkCoordinates(answer.trim(), correct.trim(), tolerance);
  } else {
    // 通常のFLAG形式の検証
    isCorrect = answer.trim() === correct.trim();
  }

  if (isCorrect) {
    db.get("SELECT * FROM solved WHERE userid=? AND category=? AND qid=?", [userid, category, qid], (err, row) => {
      if (err) {
        console.error("DB error:", err);
        return res.status(500).json({ message: "DBエラー" });
      }
      if (row) {
        return res.json({ correct: true, alreadySolved: true, message: "既に解答済みです" });
      }

      db.run("INSERT INTO solved VALUES (?, ?, ?)", [userid, category, qid], (err) => {
        if (err) {
          console.error("DB insert error:", err);
          return res.status(500).json({ message: "DBエラー" });
        }
      });
      db.run("UPDATE users SET score = score + ? WHERE userid = ?", [point, userid], (err) => {
        if (err) {
          console.error("DB update error:", err);
          return res.status(500).json({ message: "DBエラー" });
        }
      });
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
