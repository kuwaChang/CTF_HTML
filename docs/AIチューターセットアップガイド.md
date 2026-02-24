# AIチューターセットアップガイド

RAG（Retrieval-Augmented Generation）ベースのAIチューター機能のセットアップ方法を説明します。

## 概要

AIチューターは、CTFの問題を解く際に、学習者に対してヒントや考え方を提供する機能です。直接的な答えは教えず、段階的なヒントを提供することで、学習者の理解を深めます。

**このシステムはデフォルトで完全ローカル（Ollama）で動作します。** OpenAI APIは使用しません。

## 必要な環境

- Node.js (v16以上推奨)
- **Ollama（ローカルLLM実行環境）**

> 💡 **完全ローカルセットアップ**: 詳細は[完全ローカルセットアップガイド](./AIチューター完全ローカルセットアップガイド.md)を参照してください。
> 
> 💡 **OpenAI APIを使用する場合（オプション）**: `USE_OPENAI=true` と `OPENAI_API_KEY` を設定することで、OpenAI APIを使用することもできます。

## セットアップ手順

### 1. 依存関係のインストール

```bash
npm install
```

以下のパッケージが追加されます：
- `@langchain/openai`: OpenAI APIとの統合
- `@langchain/community`: LangChainコミュニティ機能
- `@langchain/ollama`: Ollama（ローカルLLM）との統合
- `langchain`: LangChainコアライブラリ
- `chromadb`: ベクトルデータベース

### 2. LLMの設定

**デフォルトではローカルLLM（Ollama）が使用されます。環境変数の設定は不要です。**

#### オプションA: ローカルLLMを使用（デフォルト・推奨）

環境変数の設定は不要です。Ollamaをインストールしてモデルをダウンロードするだけで使用できます。

詳細なセットアップ手順は[完全ローカルセットアップガイド](./AIチューター完全ローカルセットアップガイド.md)を参照してください。

#### オプションB: OpenAI APIを使用（オプション）

OpenAI APIを使用する場合は、以下の環境変数を設定します。

環境変数にOpenAI APIキーを設定します。

#### Windows (PowerShell)
```powershell
$env:OPENAI_API_KEY="your-api-key-here"
```

#### Windows (コマンドプロンプト)
```cmd
set OPENAI_API_KEY=your-api-key-here
```

#### Linux/Mac
```bash
export OPENAI_API_KEY="your-api-key-here"
```

#### .envファイルを使用する場合（推奨）

プロジェクトルートに`.env`ファイルを作成し、以下の内容を記述：

```
OPENAI_API_KEY=your-api-key-here
```

`.env`ファイルを使用する場合は、`dotenv`パッケージをインストールして読み込む必要があります：

```bash
npm install dotenv
```

`server.js`の先頭に以下を追加：

```javascript
require('dotenv').config();
```


### 3. サーバーの起動

```bash
node server.js
```

初回起動時、知識ベースが自動的に初期化されます。これには数分かかる場合があります。

### 4. AIチューターへのアクセス

ブラウザで以下のURLにアクセス：

```
http://localhost:3333/tutor
```

## 機能説明

### 基本的な使い方

1. **質問を入力**: チャット画面のテキストエリアに質問を入力
2. **送信**: 「送信」ボタンをクリック、またはEnterキーを押す
3. **回答を確認**: AIチューターからの回答と参考資料を確認

### クイックアクション

以下のボタンからよく使う質問を素早く送信できます：

- 💡 **解き方を聞く**: 問題の解き方について質問
- 🛠️ **ツールを聞く**: 使用すべきツールについて質問
- 📚 **基礎知識を聞く**: カテゴリーの基礎知識について質問

### 問題ページからの連携

問題ページからAIチューターにアクセスする場合、URLパラメータで問題情報を渡せます：

```
http://localhost:3333/tutor?category=Easy1&questionId=beginner1
```

この場合、AIチューターは現在取り組んでいる問題の情報を考慮して回答します。

### 会話履歴

- 会話履歴は最新20件まで保持されます
- 「会話履歴をクリア」ボタンで履歴をリセットできます

## 知識ベース

知識ベースは以下のカテゴリーで構成されています：

- **crypto.md**: 暗号学の基礎知識（ROT13、Base64、モールス信号など）
- **web.md**: Webセキュリティの基礎知識（SQLインジェクション、XSSなど）
- **forensics.md**: フォレンジックの基礎知識（ファイル検索、メタデータなど）
- **osint.md**: OSINTの基礎知識（画像検索、座標特定など）
- **general.md**: CTF一般知識

知識ベースは`data/knowledge/`ディレクトリに保存されています。

## APIエンドポイント

### POST /tutor/ask

質問に答えるエンドポイント。

**リクエスト:**
```json
{
  "question": "ROT13暗号の解き方を教えてください",
  "category": "Easy1",
  "questionId": "beginner1"
}
```

**レスポンス:**
```json
{
  "answer": "ROT13は...",
  "sources": [
    {
      "category": "crypto",
      "source": "crypto.md",
      "relevance": "0.95"
    }
  ]
}
```

### POST /tutor/hint

問題のヒントを取得するエンドポイント。

**リクエスト:**
```json
{
  "category": "Easy1",
  "questionId": "beginner1"
}
```

### POST /tutor/clear

会話履歴をクリアするエンドポイント。

### GET /tutor/status

AIチューターのステータスを確認するエンドポイント。

**レスポンス:**
```json
{
  "apiKeySet": true,
  "knowledgeBaseInitialized": true,
  "knowledgeBaseCount": 25,
  "ready": true
}
```

### POST /tutor/rebuild

知識ベースを再構築するエンドポイント（管理者用）。

## トラブルシューティング

### APIキーが設定されていない

**症状:** ステータスバーに「⚠️ OPENAI_API_KEYが設定されていません」と表示される

**解決方法:**
1. 環境変数`OPENAI_API_KEY`が正しく設定されているか確認
2. サーバーを再起動

### 知識ベースが初期化されない

**症状:** ステータスバーに「知識ベースを初期化中...」と表示され続ける

**解決方法:**
1. `db/chroma`ディレクトリの権限を確認
2. サーバーログでエラーメッセージを確認
3. `/tutor/rebuild`エンドポイントで再構築を試す

### 回答が生成されない

**症状:** 質問を送信しても回答が返ってこない

**解決方法:**
1. ブラウザの開発者ツール（F12）でエラーを確認
2. サーバーログでエラーメッセージを確認
3. OpenAI APIキーが有効か確認
4. APIの使用制限に達していないか確認

### ChromaDBのエラー

**症状:** ChromaDB関連のエラーが発生する

**解決方法:**
1. `db/chroma`ディレクトリを削除して再初期化
2. ChromaDBのバージョンを確認: `npm list chromadb`

## カスタマイズ

### 知識ベースの追加

`data/knowledge/`ディレクトリにMarkdownファイルを追加すると、自動的に知識ベースに含まれます。

### プロンプトの変更

`services/tutorService.js`の`answerQuestion`メソッド内の`systemPrompt`を編集することで、AIチューターの回答スタイルを変更できます。

### モデルの変更

`services/tutorService.js`の`initialize`メソッドで、使用するGPTモデルを変更できます：

```javascript
this.llm = new ChatOpenAI({
  openAIApiKey: apiKey,
  modelName: "gpt-4o", // または "gpt-3.5-turbo"
  temperature: 0.7,
  maxTokens: 1000
});
```

## セキュリティに関する注意

- OpenAI APIキーは環境変数で管理し、コードに直接記述しないでください
- `.env`ファイルを`.gitignore`に追加してください
- 本番環境では、APIキーの漏洩に注意してください

## ライセンス

この機能は、CTF学習プラットフォームの一部として提供されています。


