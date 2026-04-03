const { ChatOllama } = require("@langchain/ollama");
const vectorStore = require("./vectorStore");
const tutorQaLog = require("./tutorQaLog");
const fs = require("fs");
const path = require("path");

const MAX_ANSWER_LENGTH = 4000;

function logTutorExchange(userid, question, category, questionId, result) {
  tutorQaLog.append({
    userid,
    question,
    category: category || null,
    questionId: questionId || null,
    answer: result.answer,
    sources: result.sources || [],
    error: result.error || undefined
  });
}

function normalizeAnswerLength(answer) {
  if (answer.length <= MAX_ANSWER_LENGTH) return answer;
  return (
    answer.slice(0, MAX_ANSWER_LENGTH) +
    "\n\n（回答が長いため省略しました。必要なら「〇〇についてもう少し」と質問してください。）"
  );
}

/** LangChain のストリームチャンクから増分テキストを取り出す */
function chunkContentText(chunk) {
  if (!chunk) return "";
  const c = chunk.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((p) => (typeof p === "string" ? p : p && p.text ? p.text : ""))
      .join("");
  }
  return String(c || "");
}

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

  /**
   * RAG・問題コンテキスト・会話履歴から LLM 用メッセージと検索結果を組み立てる
   */
  async _buildMessagesAndDocs(userid, question, category, questionId) {
    let relevantDocs = [];
    try {
      relevantDocs = await vectorStore.search(question, 5);
    } catch (error) {
      console.error("知識ベース検索エラー:", error);
    }

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

    const contextText =
      relevantDocs.length > 0
        ? relevantDocs.map((doc, i) => `[参考資料${i + 1}]\n${doc.content}`).join("\n\n")
        : "参考資料は見つかりませんでした。";

    const history = this.getConversationHistory(userid);
    const historyMessages = history.map((h) => ({
      role: h.role === "user" ? "user" : "assistant",
      content: h.content
    }));

    const systemPrompt = `あなたはCTF（Capture The Flag）学習プラットフォームのAI先生です。
学習者に対して、以下の方針でサポートしてください：

1. **直接的な答えは教えない**: フラグや答えを直接教えるのではなく、ヒントや考え方を示す。
2. **段階的なヒント**: 学習者のレベルに合わせて、段階的にヒントを提供する。
3. **教育的な説明**: なぜその方法が有効なのか、背景知識も含めて説明する。
4. **励まし**: 学習者を励まし、モチベーションを維持する。
5. **ツールの紹介**: 必要に応じて、使用できるツールやコマンドを紹介する。

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

    const messages = [
      { role: "system", content: systemPrompt },
      ...historyMessages,
      { role: "user", content: question }
    ];

    return { messages, relevantDocs };
  }

  _sourcesFromDocs(relevantDocs) {
    return relevantDocs.map((doc) => ({
      category: doc.metadata.category,
      source: doc.metadata.source,
      relevance: (1 - doc.distance).toFixed(2)
    }));
  }

  async answerQuestion(userid, question, category = null, questionId = null) {
    if (!this.llm) {
      if (!this.initialize()) {
        const out = {
          answer:
            "申し訳ございません。ローカルLLM（Ollama）に接続できませんでした。\n\n以下の手順を確認してください：\n1. Ollamaが起動しているか確認: `ollama list`\n2. 必要なモデルがダウンロードされているか確認: `ollama pull llama3.2`\n3. Ollamaのインストール: https://ollama.com/download",
          sources: []
        };
        logTutorExchange(userid, question, category, questionId, out);
        return out;
      }
    }

    try {
      const { messages, relevantDocs } = await this._buildMessagesAndDocs(
        userid,
        question,
        category,
        questionId
      );

      const response = await this.llm.invoke(messages);

      let answer = response.content || "";
      if (typeof answer !== "string") {
        answer = Array.isArray(answer)
          ? answer.map((p) => (typeof p === "string" ? p : p.text || "")).join("")
          : String(answer || "");
      }
      answer = normalizeAnswerLength(answer);

      this.addToHistory(userid, "user", question);
      this.addToHistory(userid, "assistant", answer);

      const sources = this._sourcesFromDocs(relevantDocs);

      const out = {
        answer: answer,
        sources: sources
      };
      logTutorExchange(userid, question, category, questionId, out);
      return out;
    } catch (error) {
      console.error("❌ チューター回答生成エラー:", error);
      const out = {
        answer: "申し訳ございません。エラーが発生しました。もう一度お試しください。",
        sources: [],
        error: error.message
      };
      logTutorExchange(userid, question, category, questionId, out);
      return out;
    }
  }

  /**
   * NDJSON / fetch ストリーム用: { type, ... } を順に yield
   * type: sources | chunk | done | error
   */
  async *streamAnswerQuestion(userid, question, category = null, questionId = null) {
    if (!this.llm) {
      if (!this.initialize()) {
        const out = {
          answer:
            "申し訳ございません。ローカルLLM（Ollama）に接続できませんでした。\n\n以下の手順を確認してください：\n1. Ollamaが起動しているか確認: `ollama list`\n2. 必要なモデルがダウンロードされているか確認: `ollama pull llama3.2`\n3. Ollamaのインストール: https://ollama.com/download",
          sources: []
        };
        logTutorExchange(userid, question, category, questionId, out);
        yield { type: "error", answer: out.answer, sources: out.sources };
        return;
      }
    }

    let relevantDocs = [];
    try {
      const built = await this._buildMessagesAndDocs(userid, question, category, questionId);
      relevantDocs = built.relevantDocs;
      const sources = this._sourcesFromDocs(relevantDocs);
      yield { type: "sources", sources };

      const stream = await this.llm.stream(built.messages);
      let rawAnswer = "";
      for await (const chunk of stream) {
        const text = chunkContentText(chunk);
        if (text) {
          rawAnswer += text;
          yield { type: "chunk", text };
        }
      }

      let answer = normalizeAnswerLength(rawAnswer);

      this.addToHistory(userid, "user", question);
      this.addToHistory(userid, "assistant", answer);

      const out = { answer, sources };
      logTutorExchange(userid, question, category, questionId, out);
      yield { type: "done", answer };
    } catch (error) {
      console.error("❌ チューターストリームエラー:", error);
      const out = {
        answer: "申し訳ございません。エラーが発生しました。もう一度お試しください。",
        sources: [],
        error: error.message
      };
      logTutorExchange(userid, question, category, questionId, out);
      yield { type: "error", answer: out.answer, sources: [], error: error.message };
    }
  }

  async getHint(userid, category, questionId) {
    try {
      const quizData = JSON.parse(
        fs.readFileSync(path.join(__dirname, "../data/quizData.json"), "utf-8")
      );
      const problem = quizData[category]?.[questionId];

      if (!problem) {
        const out = {
          answer: "問題が見つかりませんでした。",
          sources: []
        };
        logTutorExchange(
          userid,
          `(hint) category=${category} questionId=${questionId}`,
          category,
          questionId,
          out
        );
        return out;
      }

      const question = `この問題のヒントを教えてください: ${problem.title}\n${problem.desc}`;
      return await this.answerQuestion(userid, question, category, questionId);
    } catch (error) {
      console.error("❌ ヒント取得エラー:", error);
      const out = {
        answer: "エラーが発生しました。",
        sources: [],
        error: error.message
      };
      logTutorExchange(userid, `(hint) category=${category} questionId=${questionId}`, category, questionId, out);
      return out;
    }
  }
}

module.exports = new TutorService();


