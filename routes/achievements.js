const express = require("express");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const router = express.Router();

// dbフォルダが存在しない場合は作成
const dbDir = path.join(__dirname, "../db");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(__dirname, "../db/users.db");
const achievementsPath = path.join(__dirname, "../data/achievements.json");

// データベース接続
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error("❌ データベース接続エラー (achievements.js):", err.message);
  }
});

function requireLogin(req, res, next) {
  if (!req.session.userid) return res.status(401).json({ message: "ログインが必要です" });
  next();
}

// 実績定義を読み込む
function loadAchievements() {
  try {
    const data = fs.readFileSync(achievementsPath, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error("実績定義読み込みエラー:", err);
    return {};
  }
}

// Promise化されたデータベースクエリ
function dbGet(query, params) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(query, params) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function dbRun(query, params) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

// 実績の進捗を更新
async function updateAchievementProgress(userid, achievementId, progress, maxProgress) {
  try {
    const row = await dbGet(
      "SELECT * FROM user_achievements WHERE userid = ? AND achievement_id = ?",
      [userid, achievementId]
    );

    const now = new Date().toISOString();
    if (row) {
      // 既に存在する場合は進捗を更新
      const newProgress = Math.max(row.progress, progress);
      if (newProgress >= maxProgress && !row.unlocked_at) {
        // 実績解除
        await dbRun(
          "UPDATE user_achievements SET progress = ?, max_progress = ?, unlocked_at = ? WHERE userid = ? AND achievement_id = ?",
          [newProgress, maxProgress, now, userid, achievementId]
        );
        return { unlocked: true, achievementId };
      } else {
        // 進捗のみ更新
        await dbRun(
          "UPDATE user_achievements SET progress = ?, max_progress = ? WHERE userid = ? AND achievement_id = ?",
          [newProgress, maxProgress, userid, achievementId]
        );
        return { unlocked: false, achievementId, progress: newProgress, maxProgress };
      }
    } else {
      // 新規作成
      if (progress >= maxProgress) {
        // すぐに解除
        await dbRun(
          "INSERT INTO user_achievements (userid, achievement_id, progress, max_progress, unlocked_at) VALUES (?, ?, ?, ?, ?)",
          [userid, achievementId, progress, maxProgress, now]
        );
        return { unlocked: true, achievementId };
      } else {
        // 進捗のみ記録
        await dbRun(
          "INSERT INTO user_achievements (userid, achievement_id, progress, max_progress) VALUES (?, ?, ?, ?)",
          [userid, achievementId, progress, maxProgress]
        );
        return { unlocked: false, achievementId, progress, maxProgress };
      }
    }
  } catch (err) {
    console.error(`実績進捗更新エラー (${achievementId}):`, err);
    throw err;
  }
}

// 実績チェック関数（外部から呼び出し可能）
async function checkAchievements(userid, eventType, eventData) {
  const achievements = loadAchievements();
  const unlockedAchievements = [];

  for (const [achievementId, achievement] of Object.entries(achievements)) {
    if (achievement.type !== eventType) continue;

    try {
      let progress = 0;
      let maxProgress = 1;

      switch (achievement.type) {
        case "solve_count":
          // 解いた問題数のカウント
          if (eventData.solved) {
            const row = await dbGet(
              "SELECT COUNT(*) as count FROM solved WHERE userid = ?",
              [userid]
            );
            if (row) {
              progress = row.count;
              maxProgress = achievement.condition.count;
              const result = await updateAchievementProgress(userid, achievementId, progress, maxProgress);
              if (result.unlocked) {
                unlockedAchievements.push(achievement);
              }
            }
          }
          break;

        case "category_solve":
          // カテゴリー別の問題数（categoryIdでカウント）
          if (eventData.solved && eventData.category === achievement.condition.category) {
            // 問題データを読み込んで、categoryIdが一致する問題を探す
            const quizData = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/quizData.json"), "utf-8"));
            const targetCategoryId = achievement.condition.category;
            
            // 解いた問題リストを取得
            const solvedRows = await dbAll(
              "SELECT category, qid FROM solved WHERE userid = ?",
              [userid]
            );
            
            // categoryIdが一致する問題をカウント
            let count = 0;
            for (const solvedRow of solvedRows) {
              const question = quizData[solvedRow.category]?.[solvedRow.qid];
              if (question && question.categoryId === targetCategoryId) {
                count++;
              }
            }
            
            progress = count;
            maxProgress = achievement.condition.count;
            const result = await updateAchievementProgress(userid, achievementId, progress, maxProgress);
            if (result.unlocked) {
              unlockedAchievements.push(achievement);
            }
          }
          break;

        case "score":
          // スコア達成
          const scoreRow = await dbGet(
            "SELECT score FROM users WHERE userid = ?",
            [userid]
          );
          if (scoreRow && scoreRow.score >= achievement.condition.score) {
            progress = achievement.condition.score;
            maxProgress = achievement.condition.score;
            const result = await updateAchievementProgress(userid, achievementId, progress, maxProgress);
            if (result.unlocked) {
              unlockedAchievements.push(achievement);
            }
          }
          break;

        case "all_categories":
          // 全カテゴリー制覇
          if (eventData.solved) {
            const rows = await dbAll(
              "SELECT DISTINCT category FROM solved WHERE userid = ?",
              [userid]
            );
            const solvedCategories = rows.map(r => r.category);
            const requiredCategories = achievement.condition.categories;
            const allSolved = requiredCategories.every(cat => solvedCategories.includes(cat));
            
            if (allSolved) {
              progress = requiredCategories.length;
              maxProgress = requiredCategories.length;
              const result = await updateAchievementProgress(userid, achievementId, progress, maxProgress);
              if (result.unlocked) {
                unlockedAchievements.push(achievement);
              }
            }
          }
          break;

        case "login_streak":
          // 連続ログイン日数
          if (eventData.logged_in) {
            // ログイン履歴テーブルから連続日数を計算
            // まず、usersテーブルにlast_loginカラムがあるか確認し、なければlogin_logsテーブルを使用
            try {
              // login_logsテーブルから最新のログイン日を取得
              const loginRows = await dbAll(
                "SELECT login_date FROM login_logs WHERE userid = ? ORDER BY login_date DESC",
                [userid]
              );
              
              let streak = 0;
              if (loginRows.length > 0) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                
                let expectedDate = new Date(today);
                let foundToday = false;
                
                // 今日ログインしているか確認
                for (const row of loginRows) {
                  const loginDate = new Date(row.login_date);
                  loginDate.setHours(0, 0, 0, 0);
                  
                  if (loginDate.getTime() === today.getTime()) {
                    foundToday = true;
                    streak = 1;
                    expectedDate = new Date(today);
                    expectedDate.setDate(expectedDate.getDate() - 1);
                    break;
                  }
                }
                
                // 連続日数を計算
                if (foundToday) {
                  for (let i = foundToday ? 1 : 0; i < loginRows.length; i++) {
                    const loginDate = new Date(loginRows[i].login_date);
                    loginDate.setHours(0, 0, 0, 0);
                    
                    if (loginDate.getTime() === expectedDate.getTime()) {
                      streak++;
                      expectedDate.setDate(expectedDate.getDate() - 1);
                    } else if (loginDate < expectedDate) {
                      // 連続が途切れた
                      break;
                    }
                  }
                }
              } else {
                // 初回ログイン
                streak = 1;
              }
              
              progress = streak;
              maxProgress = achievement.condition.days;
              const result = await updateAchievementProgress(userid, achievementId, progress, maxProgress);
              if (result.unlocked) {
                unlockedAchievements.push(achievement);
              }
            } catch (err) {
              // テーブルが存在しない場合はスキップ
              console.error(`ログイン履歴取得エラー (${achievementId}):`, err);
            }
          }
          break;

        case "study_time":
          // 累計学習時間
          if (eventData.study_time_updated) {
            try {
              const studyRows = await dbAll(
                "SELECT SUM(duration_ms) as total_ms FROM study_sessions WHERE userid = ?",
                [userid]
              );
              
              if (studyRows && studyRows[0] && studyRows[0].total_ms) {
                const totalHours = studyRows[0].total_ms / (1000 * 60 * 60); // ミリ秒を時間に変換
                progress = totalHours;
                maxProgress = achievement.condition.hours;
                const result = await updateAchievementProgress(userid, achievementId, progress, maxProgress);
                if (result.unlocked) {
                  unlockedAchievements.push(achievement);
                }
              }
            } catch (err) {
              console.error(`学習時間取得エラー (${achievementId}):`, err);
            }
          }
          break;

        case "no_hint_solve":
          // ヒントを使わずに解いた問題数
          if (eventData.solved && !eventData.used_hint) {
            try {
              // solvedテーブルにused_hintカラムがある場合
              const noHintRows = await dbAll(
                "SELECT COUNT(*) as count FROM solved WHERE userid = ? AND (used_hint = 0 OR used_hint IS NULL)",
                [userid]
              );
              
              if (noHintRows && noHintRows[0]) {
                progress = noHintRows[0].count;
                maxProgress = achievement.condition.count;
                const result = await updateAchievementProgress(userid, achievementId, progress, maxProgress);
                if (result.unlocked) {
                  unlockedAchievements.push(achievement);
                }
              }
            } catch (err) {
              // カラムが存在しない場合は、全ての解答をカウント（後方互換性）
              console.error(`ヒントなし解答カウントエラー (${achievementId}):`, err);
            }
          }
          break;
      }
    } catch (err) {
      console.error(`実績チェックエラー (${achievementId}):`, err);
    }
  }

  return unlockedAchievements;
}

// ユーザーの実績一覧を取得
router.get("/list", requireLogin, async (req, res) => {
  const userid = req.session.userid;
  const achievements = loadAchievements();
  
  try {
    const rows = await dbAll(
      "SELECT achievement_id, progress, max_progress, unlocked_at FROM user_achievements WHERE userid = ?",
      [userid]
    );

    const userAchievements = {};
    rows.forEach(row => {
      userAchievements[row.achievement_id] = {
        progress: row.progress,
        maxProgress: row.max_progress,
        unlocked: !!row.unlocked_at,
        unlockedAt: row.unlocked_at
      };
    });

    // 問題データを読み込む（進捗再計算用）
    const quizData = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/quizData.json"), "utf-8"));
    
    // 解いた問題リストを取得
    const solvedRows = await dbAll(
      "SELECT category, qid FROM solved WHERE userid = ?",
      [userid]
    );
    
    // スコアを取得
    const scoreRow = await dbGet("SELECT score FROM users WHERE userid = ?", [userid]);
    const currentScore = scoreRow ? scoreRow.score : 0;

    // 全実績を返す（進捗情報を含む）
    const result = {};
    for (const [id, achievement] of Object.entries(achievements)) {
      let progress = 0;
      let maxProgress = 1;
      let unlocked = false;
      let unlockedAt = null;
      
      // データベースから既存の進捗を取得
      if (userAchievements[id]) {
        progress = userAchievements[id].progress;
        maxProgress = userAchievements[id].maxProgress;
        unlocked = userAchievements[id].unlocked;
        unlockedAt = userAchievements[id].unlockedAt;
      }
      
      // 実績タイプに応じて進捗を再計算
      switch (achievement.type) {
        case "solve_count":
          progress = solvedRows.length;
          maxProgress = achievement.condition.count;
          break;
          
        case "category_solve":
          // categoryIdが一致する問題をカウント
          const targetCategoryId = achievement.condition.category;
          let categoryCount = 0;
          for (const solvedRow of solvedRows) {
            const question = quizData[solvedRow.category]?.[solvedRow.qid];
            if (question && question.categoryId === targetCategoryId) {
              categoryCount++;
            }
          }
          progress = categoryCount;
          maxProgress = achievement.condition.count;
          break;
          
        case "score":
          progress = Math.min(currentScore, achievement.condition.score);
          maxProgress = achievement.condition.score;
          break;
          
        case "all_categories":
          const solvedCategoryIds = new Set();
          for (const solvedRow of solvedRows) {
            const question = quizData[solvedRow.category]?.[solvedRow.qid];
            if (question && question.categoryId) {
              solvedCategoryIds.add(question.categoryId);
            }
          }
          const requiredCategories = achievement.condition.categories;
          const solvedCount = requiredCategories.filter(cat => solvedCategoryIds.has(cat)).length;
          progress = solvedCount;
          maxProgress = requiredCategories.length;
          break;

        case "login_streak":
          // 連続ログイン日数の計算
          try {
            const loginRows = await dbAll(
              "SELECT login_date FROM login_logs WHERE userid = ? ORDER BY login_date DESC",
              [userid]
            );
            
            let streak = 0;
            if (loginRows.length > 0) {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              
              let expectedDate = new Date(today);
              let foundToday = false;
              
              // 今日ログインしているか確認
              for (const row of loginRows) {
                const loginDate = new Date(row.login_date);
                loginDate.setHours(0, 0, 0, 0);
                
                if (loginDate.getTime() === today.getTime()) {
                  foundToday = true;
                  streak = 1;
                  expectedDate = new Date(today);
                  expectedDate.setDate(expectedDate.getDate() - 1);
                  break;
                }
              }
              
              // 連続日数を計算
              if (foundToday) {
                for (let i = 1; i < loginRows.length; i++) {
                  const loginDate = new Date(loginRows[i].login_date);
                  loginDate.setHours(0, 0, 0, 0);
                  
                  if (loginDate.getTime() === expectedDate.getTime()) {
                    streak++;
                    expectedDate.setDate(expectedDate.getDate() - 1);
                  } else if (loginDate < expectedDate) {
                    // 連続が途切れた
                    break;
                  }
                }
              }
            }
            
            progress = streak;
            maxProgress = achievement.condition.days;
          } catch (err) {
            // テーブルが存在しない場合は進捗0のまま
            console.error(`ログイン履歴取得エラー (進捗計算):`, err);
            progress = 0;
            maxProgress = achievement.condition.days;
          }
          break;

        case "study_time":
          // 累計学習時間の計算
          try {
            const studyRows = await dbAll(
              "SELECT SUM(duration_ms) as total_ms FROM study_sessions WHERE userid = ?",
              [userid]
            );
            
            if (studyRows && studyRows[0] && studyRows[0].total_ms) {
              const totalHours = studyRows[0].total_ms / (1000 * 60 * 60); // ミリ秒を時間に変換
              progress = totalHours;
            } else {
              progress = 0;
            }
            maxProgress = achievement.condition.hours;
          } catch (err) {
            console.error(`学習時間取得エラー (進捗計算):`, err);
            progress = 0;
            maxProgress = achievement.condition.hours;
          }
          break;

        case "no_hint_solve":
          // ヒントを使わずに解いた問題数の計算
          try {
            const noHintRows = await dbAll(
              "SELECT COUNT(*) as count FROM solved WHERE userid = ? AND (used_hint = 0 OR used_hint IS NULL)",
              [userid]
            );
            
            if (noHintRows && noHintRows[0]) {
              progress = noHintRows[0].count;
            } else {
              progress = 0;
            }
            maxProgress = achievement.condition.count;
          } catch (err) {
            // カラムが存在しない場合は、全ての解答をカウント（後方互換性）
            console.error(`ヒントなし解答カウントエラー (進捗計算):`, err);
            progress = 0;
            maxProgress = achievement.condition.count;
          }
          break;
      }
      
      // 解除状態を更新
      if (progress >= maxProgress && !unlocked) {
        unlocked = true;
        unlockedAt = new Date().toISOString();
        // データベースも更新
        await updateAchievementProgress(userid, id, progress, maxProgress);
      } else if (progress < maxProgress && unlocked) {
        // 解除済みのまま（一度解除されたら解除状態を維持）
      } else {
        // 進捗を更新（解除されていない場合でも）
        await updateAchievementProgress(userid, id, progress, maxProgress);
      }
      
      result[id] = {
        ...achievement,
        progress: progress,
        maxProgress: maxProgress,
        unlocked: unlocked,
        unlockedAt: unlockedAt
      };
    }

    res.json(result);
  } catch (err) {
    console.error("実績取得エラー:", err);
    res.status(500).json({ message: "エラーが発生しました" });
  }
});

// 実績定義を取得（管理者用）
router.get("/definitions", requireLogin, (req, res) => {
  const achievements = loadAchievements();
  res.json(achievements);
});

// 実績チェックを手動実行（デバッグ用）
router.post("/check", requireLogin, async (req, res) => {
  const userid = req.session.userid;
  const { eventType, eventData } = req.body;
  
  try {
    const unlocked = await checkAchievements(userid, eventType, eventData);
    res.json({ unlocked: unlocked.map(a => a.id) });
  } catch (err) {
    console.error("実績チェックエラー:", err);
    res.status(500).json({ message: "エラーが発生しました" });
  }
});

// 外部から呼び出し可能にする
module.exports = { router, checkAchievements };
