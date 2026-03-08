const { ChatOllama } = require("@langchain/ollama");
const vectorStore = require("./vectorStore");
const fs = require("fs");
const path = require("path");

class TutorService {
  constructor() {
    this.llm = null;
    this.conversationHistory = new Map(); // userid -> history[]
  }

  initialize() {
    const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    const ollamaModel = process.env.OLLAMA_MODEL || "llama3.2";

    try {
      this.llm = new ChatOllama({
        baseUrl: ollamaBaseUrl,
        model: ollamaModel,
        temperature: 0.7,
        numPredict: 1024,
      });
      console.log(`✅ ローカルLLM（Ollama）を初期化しました: ${ollamaModel} at ${ollamaBaseUrl}`);
      return true;
    } catch (error) {
      console.error("❌ Ollama初期化エラー:", error);
      console.warn("⚠️ Ollamaが起動していない可能性があります。Ollamaを起動してください。");
      console.warn("💡 Ollamaのインストール: https://ollama.com/download");
      console.warn(`💡 モデルのダウンロード: ollama pull ${ollamaModel}`);
      return false;
    }
  }

  getConversationHistory(userid) {
    if (!this.conversationHistory.has(userid)) {
      this.conversationHistory.set(userid, []);
    }
    return this.conversationHistory.get(userid);
  }

  addToHistory(userid, role, content) {
    const history = this.getConversationHistory(userid);
    history.push({ role, content });
    // 履歴を最新20件に制限
    if (history.length > 20) {
      history.shift();
    }
  }

  clearHistory(userid) {
    this.conversationHistory.delete(userid);
  }

  async answerQuestion(userid, question, category = null, questionId = null) {
    if (!this.llm) {
      if (!this.initialize()) {
        return {
          answer: "申し訳ございません。ローカルLLM（Ollama）に接続できませんでした。\n\n以下の手順を確認してください：\n1. Ollamaが起動しているか確認: `ollama list`\n2. 必要なモデルがダウンロードされているか確認: `ollama pull llama3.2`\n3. Ollamaのインストール: https://ollama.com/download",
          sources: []
        };
      }
    }

    try {
      // 関連する知識を検索（5件取得してLLMが複数ソースを統合しやすくする）
      let relevantDocs = [];
      try {
        relevantDocs = await vectorStore.search(question, 5);
      } catch (error) {
        console.error("知識ベース検索エラー:", error);
        // 検索に失敗しても続行
      }

      // 問題の詳細情報を取得（オプション）
      let problemContext = "";
      if (category && questionId) {
        try {
          const quizData = JSON.parse(
            fs.readFileSync(path.join(__dirname, "../data/quizData.json"), "utf-8")
          );
          const problem = quizData[category]?.[questionId];
          if (problem) {
            problemContext = `\n\n現在取り組んでいる問題:\nタイトル: ${problem.title}\n説明: ${problem.desc}\nカテゴリー: ${problem.categoryId || category}`;
          }
        } catch (error) {
          console.error("問題情報取得エラー:", error);
        }
      }

      // 関連文書のコンテキストを構築
      const contextText = relevantDocs.length > 0
        ? relevantDocs.map((doc, i) => `[参考資料${i + 1}]\n${doc.content}`).join("\n\n")
        : "参考資料は見つかりませんでした。";

      // 会話履歴を取得
      const history = this.getConversationHistory(userid);
      const historyMessages = history.map(h => ({
        role: h.role === "user" ? "user" : "assistant",
        content: h.content
      }));

      // システムプロンプト
      const systemPrompt = `あなたはCTF（Capture The Flag）学習プラットフォームのAIチューターです。
学習者に対して、以下の方針でサポートしてください：

1. **直接的な答えは教えない**: フラグや答えを直接教えるのではなく、ヒントや考え方を示す
2. **段階的なヒント**: 学習者のレベルに合わせて、段階的にヒントを提供する
3. **教育的な説明**: なぜその方法が有効なのか、背景知識も含めて説明する
4. **励まし**: 学習者を励まし、モチベーションを維持する
5. **ツールの紹介**: 必要に応じて、使用できるツールやコマンドを紹介する

参考資料は内容を理解したうえで、要約・統合し、学習者に合わせた自分の言葉で説明してください。資料の丸写しやそのままのコピーは避けてください。
回答は簡潔に（目安: 800字程度）。同じ形式の項目を大量に列挙せず、必要な要点だけを5〜10項目程度にまとめてください。番号付きリストが長く続く場合は打ち切ってください。

【文章の書き方・読みやすさ】
- 段落は短くし、2〜3文ごとに改行を入れて区切ること。
- 複数の手順やポイントがある場合は、行頭に「・」や「-」をつけた箇条書きにすること。
- 重要な語句は**で囲むなどして強調してよい（Markdown形式で返してよい）。
- 長い一文は避け、読んですぐ分かる短い文で書くこと。
- 回答全体が一塊の長文にならないよう、見た目で構造が分かるようにすること。
${problemContext}

参考資料:
${contextText}`;

      // メッセージを構築（Ollama用：システムプロンプトを最初のメッセージに含める）
      const messages = [
        { role: "system", content: systemPrompt },
        ...historyMessages,
        { role: "user", content: question }
      ];

      // LLMに質問
      const response = await this.llm.invoke(messages);

      let answer = response.content || "";
      const MAX_ANSWER_LENGTH = 4000;
      if (answer.length > MAX_ANSWER_LENGTH) {
        answer = answer.slice(0, MAX_ANSWER_LENGTH) + "\n\n（回答が長いため省略しました。必要なら「〇〇についてもう少し」と質問してください。）";
      }

      // 履歴に追加
      this.addToHistory(userid, "user", question);
      this.addToHistory(userid, "assistant", answer);

      // ソース情報を整理
      const sources = relevantDocs.map(doc => ({
        category: doc.metadata.category,
        source: doc.metadata.source,
        relevance: (1 - doc.distance).toFixed(2) // 距離を関連度に変換
      }));

      return {
        answer: answer,
        sources: sources
      };
    } catch (error) {
      console.error("❌ チューター回答生成エラー:", error);
      return {
        answer: "申し訳ございません。エラーが発生しました。もう一度お試しください。",
        sources: [],
        error: error.message
      };
    }
  }

  async getHint(userid, category, questionId) {
    try {
      const quizData = JSON.parse(
        fs.readFileSync(path.join(__dirname, "../data/quizData.json"), "utf-8")
      );
      const problem = quizData[category]?.[questionId];

      if (!problem) {
        return {
          answer: "問題が見つかりませんでした。",
          sources: []
        };
      }

      const question = `この問題のヒントを教えてください: ${problem.title}\n${problem.desc}`;
      return await this.answerQuestion(userid, question, category, questionId);
    } catch (error) {
      console.error("❌ ヒント取得エラー:", error);
      return {
        answer: "エラーが発生しました。",
        sources: []
      };
    }
  }
}

module.exports = new TutorService();


