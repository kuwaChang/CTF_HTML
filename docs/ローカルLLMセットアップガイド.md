# ローカルLLMセットアップガイド

AIチューターをローカルLLM（Ollama）で動作させるためのセットアップガイドです。

## 概要

ローカルLLMを使用することで、OpenAI APIキーがなくても、インターネット接続なしでAIチューターを利用できます。Ollamaを使用してローカルでLLMと埋め込みモデルを実行します。

## 必要な環境

- Node.js (v16以上推奨)
- Ollama（ローカルLLM実行環境）

## セットアップ手順

### 1. Ollamaのインストール

#### Windows
1. https://ollama.com/download からOllamaをダウンロード
2. インストーラーを実行してインストール
3. Ollamaが自動的に起動します

#### Linux/Mac
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### 2. 必要なモデルのダウンロード

#### LLMモデル（チャット用）
```bash
# 推奨: llama3.2（軽量で高性能）
ollama pull llama3.2

# または、より大きなモデル（より高性能だが重い）
ollama pull llama3.1
ollama pull mistral
```

#### 埋め込みモデル（ベクトル検索用）
```bash
# 推奨: nomic-embed-text（軽量で高性能）
ollama pull nomic-embed-text

# または、より大きな埋め込みモデル
ollama pull mxbai-embed-large
```

### 3. 環境変数の設定

ローカルLLMを使用するように環境変数を設定します。

#### Windows (PowerShell)
```powershell
$env:USE_LOCAL_LLM="true"
$env:OLLAMA_BASE_URL="http://localhost:11434"
$env:OLLAMA_MODEL="llama3.2"
$env:OLLAMA_EMBEDDING_MODEL="nomic-embed-text"
```

#### Windows (コマンドプロンプト)
```cmd
set USE_LOCAL_LLM=true
set OLLAMA_BASE_URL=http://localhost:11434
set OLLAMA_MODEL=llama3.2
set OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

#### Linux/Mac
```bash
export USE_LOCAL_LLM=true
export OLLAMA_BASE_URL=http://localhost:11434
export OLLAMA_MODEL=llama3.2
export OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

#### .envファイルを使用する場合（推奨）

プロジェクトルートに`.env`ファイルを作成：

```
USE_LOCAL_LLM=true
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

`.env`ファイルを使用する場合は、`dotenv`パッケージをインストール：

```bash
npm install dotenv
```

`server.js`の先頭に以下を追加：

```javascript
require('dotenv').config();
```

### 4. 依存関係のインストール

```bash
npm install
```

以下のパッケージが追加されます：
- `@langchain/ollama`: Ollamaとの統合

### 5. Ollamaの起動確認

Ollamaが起動しているか確認：

```bash
ollama list
```

モデルが表示されれば正常です。

### 6. サーバーの起動

```bash
node server.js
```

初回起動時、知識ベースが自動的に初期化されます。これには数分かかる場合があります。

### 7. AIチューターへのアクセス

ブラウザで以下のURLにアクセス：

```
http://localhost:3333/tutor
```

ステータスバーに「準備完了 (ローカルLLM: llama3.2, 知識ベース: XX件)」と表示されれば正常です。

## 環境変数の説明

| 変数名 | 説明 | デフォルト値 |
|--------|------|-------------|
| `USE_LOCAL_LLM` | ローカルLLMを使用するかどうか | `false` |
| `OLLAMA_BASE_URL` | OllamaのベースURL | `http://localhost:11434` |
| `OLLAMA_MODEL` | 使用するLLMモデル名 | `llama3.2` |
| `OLLAMA_EMBEDDING_MODEL` | 使用する埋め込みモデル名 | `nomic-embed-text` |

## トラブルシューティング

### Ollamaが起動していない

**症状:** ステータスバーに「⚠️ Ollamaが起動していません」と表示される

**解決方法:**
1. Ollamaが起動しているか確認: `ollama list`
2. Ollamaを起動: Windowsの場合はスタートメニューから、Linux/Macの場合は `ollama serve`

### モデルが見つからない

**症状:** 「モデルが見つかりません」というエラー

**解決方法:**
1. モデルがダウンロードされているか確認: `ollama list`
2. モデルをダウンロード: `ollama pull llama3.2`

### 知識ベースの初期化に失敗する

**症状:** 「埋め込みモデルの初期化に失敗しました」というエラー

**解決方法:**
1. 埋め込みモデルがダウンロードされているか確認: `ollama list`
2. 埋め込みモデルをダウンロード: `ollama pull nomic-embed-text`
3. `OLLAMA_EMBEDDING_MODEL`環境変数が正しく設定されているか確認

### 応答が遅い

**原因:**
- モデルが大きい
- システムリソース（CPU/メモリ）が不足している

**解決方法:**
1. より軽量なモデルを使用（例: `llama3.2` → `llama3.2:1b`）
2. システムリソースを確認
3. 他のアプリケーションを閉じる

### メモリ不足

**症状:** Ollamaがクラッシュする、または応答が生成されない

**解決方法:**
1. より軽量なモデルを使用
2. システムのメモリを増やす
3. 他のアプリケーションを閉じる

## OpenAI APIとの切り替え

OpenAI APIを使用する場合は、`USE_LOCAL_LLM`を`false`に設定（または未設定）し、`OPENAI_API_KEY`を設定してください。

```bash
# OpenAI APIを使用
export USE_LOCAL_LLM=false
export OPENAI_API_KEY=your-api-key-here
```

## 推奨モデル

### LLMモデル（チャット用）

| モデル | サイズ | 推奨用途 |
|--------|--------|----------|
| `llama3.2:1b` | 1B | 軽量、高速、低リソース |
| `llama3.2` | 3B | バランス型（推奨） |
| `llama3.1:8b` | 8B | 高品質、高リソース |
| `mistral` | 7B | 高品質、多言語対応 |

### 埋め込みモデル（ベクトル検索用）

| モデル | サイズ | 推奨用途 |
|--------|--------|----------|
| `nomic-embed-text` | 137M | 軽量、高速（推奨） |
| `mxbai-embed-large` | 335M | 高精度、高リソース |

## パフォーマンスの最適化

### GPUを使用する場合

Ollamaは自動的にGPUを検出して使用します。NVIDIA GPUを使用している場合、CUDAがインストールされている必要があります。

### CPUのみの場合

CPUのみで実行する場合、軽量なモデルを使用することを推奨します：
- LLM: `llama3.2:1b` または `llama3.2`
- 埋め込み: `nomic-embed-text`

## セキュリティに関する注意

- ローカルLLMは完全にローカルで実行されるため、データが外部に送信されることはありません
- Ollamaはデフォルトで`localhost:11434`でリッスンします
- 本番環境で使用する場合は、適切なファイアウォール設定を行ってください





