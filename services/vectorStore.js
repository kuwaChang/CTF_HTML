const { ChromaClient } = require("chromadb");
const { OpenAIEmbeddings } = require("@langchain/openai");
const { OllamaEmbeddings } = require("@langchain/ollama");
const fs = require("fs");
const path = require("path");

/**
 * 簡易テキストスプリッター（@langchain/community の ESM/dist 問題を避けるため自前実装）
 * chunkSize / chunkOverlap で RecursiveCharacterTextSplitter と同様に分割する
 */
function splitTextIntoChunks(text, chunkSize = 1000, chunkOverlap = 200) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);
    if (end < text.length) {
      const slice = text.slice(start, end);
      const lastNewline = slice.lastIndexOf("\n");
      const lastSpace = slice.lastIndexOf(" ");
      const breakAt = lastNewline >= 0 ? lastNewline + 1 : (lastSpace >= 0 ? lastSpace + 1 : slice.length);
      end = start + breakAt;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    start = end - (end - start > chunkOverlap ? chunkOverlap : 0);
  }
  return chunks;
}

// ChromaDBのデータ保存用ディレクトリ（Chromaサーバーを --path で起動する場合に使用）
const chromaDir = path.join(__dirname, "../db/chroma");
if (!fs.existsSync(chromaDir)) {
  fs.mkdirSync(chromaDir, { recursive: true });
}

// ChromaDBのJSクライアントは path に「HTTPのURL」を指定する必要があります。
// ローカルで永続化する場合は別ターミナルで: chroma run --path ./db/chroma
const CHROMA_URL = process.env.CHROMA_URL || "http://localhost:8000";

class VectorStoreService {
  constructor() {
    try {
      this.client = new ChromaClient({
        path: CHROMA_URL
      });
    } catch (error) {
      console.error("❌ ChromaClient初期化エラー:", error);
      console.warn("⚠️ ChromaDBの初期化に失敗しましたが、サーバーは起動を続行します。");
      this.client = null;
    }
    this.collectionName = "ctf_knowledge";
    this.embeddings = null;
    this.collection = null;
    this.initialized = false;
    this.embeddingType = null;
    this.connectionFailed = false; // Chroma接続失敗を1回だけ検出し、以降は検索をスキップ
  }

  async initialize() {
    if (this.initialized) {
      return;
    }
    if (this.connectionFailed) {
      return; // 過去に接続失敗している場合はスキップ（LLMのみで継続）
    }
    if (!this.client) {
      throw new Error("ChromaClientが初期化されていません。");
    }

    try {
      // デフォルトでローカル埋め込みモデル（Ollama）を使用
      // USE_OPENAI=true の場合のみOpenAI埋め込みモデルを使用
      const useOpenAI = process.env.USE_OPENAI === "true" || process.env.USE_OPENAI === "1";
      const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
      const ollamaEmbeddingModel = process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text";

      if (!useOpenAI) {
        // ローカル埋め込みモデル（Ollama）を使用（デフォルト）
        try {
          this.embeddings = new OllamaEmbeddings({
            baseUrl: ollamaBaseUrl,
            model: ollamaEmbeddingModel,
          });
          this.embeddingType = "ollama";
          console.log(`✅ ローカル埋め込みモデル（Ollama）を初期化しました: ${ollamaEmbeddingModel} at ${ollamaBaseUrl}`);
        } catch (error) {
          console.error("❌ Ollama埋め込みモデル初期化エラー:", error);
          console.warn("⚠️ Ollamaが起動していない可能性があります。");
          console.warn("💡 Ollamaのインストール: https://ollama.com/download");
          console.warn(`💡 埋め込みモデルのダウンロード: ollama pull ${ollamaEmbeddingModel}`);
          throw error;
        }
      } else {
        // OpenAI Embeddingsの初期化（オプション）
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          console.warn("⚠️ USE_OPENAI=true が設定されていますが、OPENAI_API_KEYが設定されていません。");
          console.warn("💡 ローカル埋め込みモデルを使用する場合は、USE_OPENAIを設定しないでください。");
          // APIキーがない場合は後でエラーハンドリング
        } else {
          this.embeddings = new OpenAIEmbeddings({
            openAIApiKey: apiKey,
            modelName: "text-embedding-3-small"
          });
          this.embeddingType = "openai";
          console.log("✅ OpenAI埋め込みモデルを初期化しました");
        }
      }

      // コレクションの取得または作成
      try {
        this.collection = await this.client.getOrCreateCollection({
          name: this.collectionName,
          metadata: { description: "CTF知識ベース" }
        });
        console.log("✅ ChromaDBコレクション準備完了");
      } catch (error) {
        console.error("❌ ChromaDBコレクション作成エラー:", error);
        this.connectionFailed = true;
        console.warn("💡 Chroma未使用: チューターはLLMのみで動作します。知識ベースを使う場合は chroma run --path ./db/chroma でサーバーを起動してください。");
        throw error;
      }

      this.initialized = true;
    } catch (error) {
      console.error("❌ VectorStore初期化エラー:", error);
      throw error;
    }
  }

  async loadKnowledgeBase() {
    await this.initialize();
    if (this.connectionFailed || !this.collection) {
      return; // Chroma未接続のためスキップ（チューターはLLMのみで動作）
    }

    if (!this.embeddings) {
      const useOpenAI = process.env.USE_OPENAI === "true" || process.env.USE_OPENAI === "1";
      if (useOpenAI) {
        throw new Error("OpenAI APIキーが設定されていません。");
      } else {
        throw new Error("ローカル埋め込みモデル（Ollama）の初期化に失敗しました。Ollamaが起動しているか確認してください。\n\n解決方法:\n1. Ollamaが起動しているか確認: `ollama list`\n2. 埋め込みモデルをダウンロード: `ollama pull nomic-embed-text`\n3. Ollamaのインストール: https://ollama.com/download");
      }
    }

    const knowledgeDir = path.join(__dirname, "../data/knowledge");
    const files = fs.readdirSync(knowledgeDir).filter(f => f.endsWith(".md"));

    // 既存のデータを確認
    const existingCount = await this.collection.count();
    if (existingCount > 0) {
      console.log(`📚 既存の知識ベースが見つかりました（${existingCount}件）`);
      return;
    }

    console.log("📚 知識ベースを読み込み中...");

    const CHUNK_SIZE = 1000;
    const CHUNK_OVERLAP = 200;

    const allChunks = [];
    const allMetadata = [];

    for (const file of files) {
      const filePath = path.join(knowledgeDir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const category = path.basename(file, ".md");

      const chunks = splitTextIntoChunks(content, CHUNK_SIZE, CHUNK_OVERLAP);

      for (let i = 0; i < chunks.length; i++) {
        allChunks.push(chunks[i]);
        allMetadata.push({
          source: file,
          category: category,
          chunkIndex: i
        });
      }
    }

    console.log(`📝 ${allChunks.length}個のチャンクを生成しました`);

    // 埋め込みベクトルの生成
    console.log("🔄 埋め込みベクトルを生成中...");
    const embeddings = await this.embeddings.embedDocuments(allChunks);

    // ChromaDBに保存
    const ids = allChunks.map((_, i) => `${Date.now()}_${i}`);
    
    await this.collection.add({
      ids: ids,
      embeddings: embeddings,
      documents: allChunks,
      metadatas: allMetadata
    });

    console.log("✅ 知識ベースのインデックス化が完了しました");
  }

  async search(query, topK = 3) {
    if (this.connectionFailed || !this.client) {
      return []; // Chroma未接続時は空で返し、LLMのみで回答
    }
    await this.initialize();

    if (!this.embeddings) {
      const useOpenAI = process.env.USE_OPENAI === "true" || process.env.USE_OPENAI === "1";
      if (useOpenAI) {
        throw new Error("OpenAI APIキーが設定されていません。");
      } else {
        throw new Error("ローカル埋め込みモデル（Ollama）の初期化に失敗しました。Ollamaが起動しているか確認してください。");
      }
    }

    try {
      // クエリの埋め込みベクトルを生成
      const queryEmbedding = await this.embeddings.embedQuery(query);

      // 類似度検索
      const results = await this.collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: topK
      });

      return results.documents[0].map((doc, i) => ({
        content: doc,
        metadata: results.metadatas[0][i],
        distance: results.distances[0][i]
      }));
    } catch (error) {
      console.error("❌ 検索エラー:", error);
      throw error;
    }
  }

  async clear() {
    await this.initialize();
    try {
      await this.client.deleteCollection({ name: this.collectionName });
      console.log("✅ コレクションを削除しました");
    } catch (error) {
      console.error("❌ コレクション削除エラー:", error);
    }
  }
}

module.exports = new VectorStoreService();

