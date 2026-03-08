const express = require("express");
const router = express.Router();
const tutorService = require("../services/tutorService");
const vectorStore = require("../services/vectorStore");

// ログイン必須ミドルウェア
function requireLogin(req, res, next) {
  if (!req.session.userid) {
    return res.status(401).json({ message: "ログインが必要です" });
  }
  next();
}

// 知識ベースの初期化（初回のみ）
let knowledgeBaseInitialized = false;
async function ensureKnowledgeBase() {
  if (!knowledgeBaseInitialized) {
    try {
      await vectorStore.loadKnowledgeBase();
      knowledgeBaseInitialized = true;
    } catch (error) {
      console.error("❌ 知識ベース初期化エラー:", error);
      // エラーが発生しても続行（APIキーがない場合など）
    }
  }
}

// 質問に答える
router.post("/ask", requireLogin, async (req, res) => {
  try {
    await ensureKnowledgeBase();

    const { question, category, questionId } = req.body;
    const userid = req.session.userid;

    if (!question || question.trim() === "") {
      return res.status(400).json({ message: "質問を入力してください" });
    }

    const result = await tutorService.answerQuestion(
      userid,
      question.trim(),
      category || null,
      questionId || null
    );

    res.json(result);
  } catch (error) {
    console.error("❌ チューター質問エラー:", error);
    res.status(500).json({
      answer: "エラーが発生しました。もう一度お試しください。",
      sources: [],
      error: error.message
    });
  }
});

// 問題のヒントを取得
router.post("/hint", requireLogin, async (req, res) => {
  try {
    await ensureKnowledgeBase();

    const { category, questionId } = req.body;
    const userid = req.session.userid;

    if (!category || !questionId) {
      return res.status(400).json({ message: "categoryとquestionIdが必要です" });
    }

    const result = await tutorService.getHint(userid, category, questionId);
    res.json(result);
  } catch (error) {
    console.error("❌ ヒント取得エラー:", error);
    res.status(500).json({
      answer: "エラーが発生しました。",
      sources: []
    });
  }
});

// 会話履歴をクリア
router.post("/clear", requireLogin, (req, res) => {
  const userid = req.session.userid;
  tutorService.clearHistory(userid);
  res.json({ message: "会話履歴をクリアしました" });
});

// 知識ベースの再構築（管理者用）
router.post("/rebuild", requireLogin, async (req, res) => {
  // 管理者権限チェック（簡易版）
  // 実際の実装では、適切な権限チェックを実装してください
  const userid = req.session.userid;
  
  try {
    // 既存のコレクションをクリア
    await vectorStore.clear();
    knowledgeBaseInitialized = false;
    
    // 再構築
    await vectorStore.loadKnowledgeBase();
    knowledgeBaseInitialized = true;
    
    res.json({ message: "知識ベースを再構築しました" });
  } catch (error) {
    console.error("❌ 知識ベース再構築エラー:", error);
    res.status(500).json({
      message: "知識ベースの再構築に失敗しました",
      error: error.message
    });
  }
});

// ステータス確認（初回で知識ベース初期化を開始するため ensureKnowledgeBase を呼ぶ）
router.get("/status", requireLogin, async (req, res) => {
  try {
    await ensureKnowledgeBase();
    const kbInitialized = knowledgeBaseInitialized;
    
    let kbCount = 0;
    let llmReady = false;
    let embeddingReady = false;
    
    if (kbInitialized) {
      try {
        await vectorStore.initialize();
        kbCount = await vectorStore.collection.count();
        embeddingReady = !!vectorStore.embeddings;
      } catch (error) {
        // エラーは無視
      }
    }

    // ローカルLLM（Ollama）の状態を確認
    try {
      const http = require('http');
      const url = require('url');
      const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
      const parsedUrl = url.parse(`${ollamaBaseUrl}/api/tags`);
      
      await new Promise((resolve) => {
        const req = http.get({
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || 11434,
          path: parsedUrl.path,
          timeout: 2000
        }, (res) => {
          if (res.statusCode === 200) {
            llmReady = true;
          }
          resolve();
        });
        req.on('error', () => {
          llmReady = false;
          resolve();
        });
        req.on('timeout', () => {
          req.destroy();
          llmReady = false;
          resolve();
        });
      });
    } catch (error) {
      llmReady = false;
    }

    res.json({
      llmReady,
      embeddingReady,
      knowledgeBaseInitialized: kbInitialized,
      knowledgeBaseCount: kbCount,
      ready: llmReady && embeddingReady && kbInitialized,
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
      ollamaModel: process.env.OLLAMA_MODEL || "llama3.2"
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

module.exports = router;


