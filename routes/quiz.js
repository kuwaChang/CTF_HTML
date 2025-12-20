const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const sqlite3 = require("sqlite3").verbose();
const router = express.Router();

// dbフォルダが存在しない場合は作成
const dbDir = path.join(__dirname, "../db");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(__dirname, "../db/users.db");
console.log("[quiz.js] データベースパス:", dbPath);
console.log("[quiz.js] ファイル存在確認:", fs.existsSync(dbPath));
console.log("[quiz.js] ディレクトリ存在確認:", fs.existsSync(path.dirname(dbPath)));
let db;
try {
  db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
      console.error("❌ データベース接続エラー (quiz.js):", err.message);
      console.error("   エラーコード:", err.code);
      console.error("   エラー番号:", err.errno);
      console.error("   データベースパス:", dbPath);
      console.error("   スタックトレース:", err.stack);
    } else {
      console.log("✅ [quiz.js] データベース接続成功");
    }
  });
} catch (err) {
  console.error("❌ データベース作成時の例外 (quiz.js):", err.message);
  console.error("   スタックトレース:", err.stack);
  throw err;
}
db.on('error', (err) => {
  console.error("❌ データベースエラー (quiz.js):", err.message);
  console.error("   エラーコード:", err.code);
  console.error("   エラー番号:", err.errno);
  console.error("   データベースパス:", dbPath);
  if (err.stack) {
    console.error("   スタックトレース:", err.stack);
  }
});
const quizPath = path.join(__dirname, "../data/quizData.json");

// サーバーのIPアドレスを取得する関数
function getServerHost() {
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
  const serverHost = getServerHost();
  const dataString = JSON.stringify(data);
  const replacedString = dataString.replace(/http:\/\/localhost:(\d+)/g, `http://${serverHost}:$1`);
  return JSON.parse(replacedString);
}

function requireLogin(req, res, next) {
  if (!req.session.userid) return res.status(401).json({ message: "ログインが必要です" });
  next();
}

// 全問題を返す
router.get("/all", requireLogin, (req, res) => {
  const data = JSON.parse(fs.readFileSync(quizPath, "utf-8"));
  const replacedData = replaceLocalhostInQuizData(data);
  res.json(replacedData);
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


// 座標が許容範囲内かチェック（生の座標用）
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
  const { category, qid, answer, answerType: clientAnswerType, point } = req.body;
  const userid = req.session.userid;
  const rawData = JSON.parse(fs.readFileSync(quizPath, "utf-8"));
  const data = replaceLocalhostInQuizData(rawData);
  const question = data[category]?.[qid];
  
  if (!question) return res.status(404).json({ message: "問題が見つかりません" });
  
  // 問題のcategoryIdを取得（実績チェック用）
  const questionCategoryId = question.categoryId || null;
  
  const correct = question.answer;
  const answerType = question.answerType || "flag"; // デフォルトはflag形式
  let isCorrect = false;

  if (answerType === "coordinates") {
    // 座標形式の検証（生の座標で比較）
    const tolerance = question.coordinateTolerance || 0.001;
    // 複数の正解をサポート（配列の場合）
    if (Array.isArray(correct)) {
      isCorrect = correct.some(corr => checkCoordinates(answer, corr.trim(), tolerance));
    } else {
      isCorrect = checkCoordinates(answer, correct.trim(), tolerance);
    }
  } else {
    // 通常のFLAG形式の検証（生の答えを直接比較）
    // 複数の正解をサポート（配列の場合）
    if (Array.isArray(correct)) {
      isCorrect = correct.some(corr => answer.trim() === corr.trim());
    } else {
      isCorrect = answer.trim() === correct.trim();
    }
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
        
        // 実績チェック
        const { checkAchievements } = require("./achievements");
        checkAchievements(userid, "solve_count", { solved: true })
          .then(unlocked => {
            if (unlocked.length > 0) {
              // 実績解除通知はクライアント側で処理
            }
          })
          .catch(err => console.error("実績チェックエラー:", err));
        
        // カテゴリー別実績チェック（categoryIdを使用）
        if (questionCategoryId) {
          checkAchievements(userid, "category_solve", { solved: true, category: questionCategoryId })
            .then(unlocked => {
              if (unlocked.length > 0) {
                // 実績解除通知はクライアント側で処理
              }
            })
            .catch(err => console.error("実績チェックエラー:", err));
        }
        
        // 全カテゴリー制覇チェック
        checkAchievements(userid, "all_categories", { solved: true })
          .then(unlocked => {
            if (unlocked.length > 0) {
              // 実績解除通知はクライアント側で処理
            }
          })
          .catch(err => console.error("実績チェックエラー:", err));
      });
      
      // スコア実績チェック
      db.get("SELECT score FROM users WHERE userid = ?", [userid], (err, scoreRow) => {
        if (!err && scoreRow) {
          const { checkAchievements } = require("./achievements");
          checkAchievements(userid, "score", { score: scoreRow.score + point })
            .catch(err => console.error("実績チェックエラー:", err));
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

// ファイルダウンロード用エンドポイント
router.get("/file/:category/:filename", requireLogin, (req, res) => {
  const { category, filename } = req.params;
  const filesDir = path.join(__dirname, "../public/files");
  
  // セキュリティ: ファイル名のサニタイゼーション
  const sanitizeFilename = (name) => {
    return name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.\./g, '')
      .replace(/^\.+/, '')
      .substring(0, 255);
  };
  
  const safeFilename = sanitizeFilename(filename);
  const safeCategory = sanitizeFilename(category);
  
  // 複数のパスを試す（カテゴリー名とディレクトリ名の不一致に対応）
  const possiblePaths = [
    path.join(filesDir, safeCategory, safeFilename), // カテゴリー名でディレクトリを探す
    path.join(filesDir, safeFilename), // ルートディレクトリ
  ];
  
  // カテゴリー名のマッピング（Easy1 -> beginner1 など）
  const categoryMapping = {
    "Easy1": "beginner1",
    "Easy2": "beginner2",
  };
  
  if (categoryMapping[safeCategory]) {
    possiblePaths.unshift(path.join(filesDir, categoryMapping[safeCategory], safeFilename));
  }
  
  // ファイルを探す
  let fileFound = false;
  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      // セキュリティ: パストラバーサル対策（filesDir内か確認）
      const resolvedPath = path.resolve(filePath);
      const resolvedDir = path.resolve(filesDir);
      if (!resolvedPath.startsWith(resolvedDir)) {
        return res.status(403).json({ message: "アクセスが拒否されました" });
      }
      
      res.sendFile(resolvedPath);
      fileFound = true;
      break;
    }
  }
  
  if (!fileFound) {
    res.status(404).json({ message: "ファイルが見つかりません" });
  }
});

// ランキング
router.get("/ranking", (req, res) => {
  db.all("SELECT userid, SUM(point) as total FROM solves GROUP BY userid ORDER BY total DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ message: "ランキング取得失敗" });
    res.json(rows);
  });
});

module.exports = router;
