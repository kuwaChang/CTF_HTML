kono# CTF サーバー 環境構築手順

このドキュメントでは、本サーバーを構築・起動するために必要な環境構築手順を、具体的なコマンドとともにまとめています。

---

## 1. 前提環境

### 1.1 Node.js

- **推奨**: Node.js 18 LTS または 20 LTS  
- `bcrypt` と `sqlite3` はネイティブアドオンを使うため、対応する Node バージョンが必要です。

**インストール確認:**

```powershell
node -v
# 例: v20.10.0

npm -v
# 例: 10.2.0
```

**インストール（未導入の場合）:**

- [Node.js 公式](https://nodejs.org/) から LTS をダウンロードしてインストール  
  または  
- [nvm-windows](https://github.com/coreybutler/nvm-windows): `nvm install 20` → `nvm use 20`

### 1.2 Windows でネイティブモジュールをビルドする場合

`bcrypt` / `sqlite3` のビルドに **node-gyp** を使うため、次のいずれかが必要です。

- **Visual Studio Build Tools**（推奨）  
  - [Build Tools for Visual Studio](https://visualstudio.microsoft.com/ja/visual-cpp-build-tools/) をインストール  
  - ワークロードで「**C++ によるデスクトップ開発**」を選択  

- または **Python**（node-gyp が利用）  
  - 公式: [python.org](https://www.python.org/downloads/)  
  - インストール時に「Add Python to PATH」にチェック  

```powershell
# Python 確認（任意）
python --version
# または
py -3 --version
```

---

## 2. リポジトリの取得

```powershell
cd c:\Users\kokoh\CTF
git clone <リポジトリURL> CTF_HTML
cd CTF_HTML
```

（既にクローン済みの場合は `cd c:\Users\kokoh\CTF\CTF_HTML` でプロジェクトルートに移動）

---

## 3. メインサーバーのセットアップ

### 3.1 依存関係のインストール

プロジェクトルートで実行します。

```powershell
cd c:\Users\kokoh\CTF\CTF_HTML
npm install
```

エラーが出る場合は、ネットワークやプロキシ、Node バージョンを確認してください。  
`bcrypt` や `sqlite3` のビルドで失敗する場合は、上記「1.2 Windows でネイティブモジュールをビルドする場合」を確認してください。

### 3.2 ディレクトリ・データベースについて

次のディレクトリ・ファイルは **サーバー起動時に自動作成**されます（手動作成は不要です）。

| パス | 説明 |
|------|------|
| `db/` | メインDB・セッション用 |
| `db/users.db` | ユーザー・スコア・実績など（CREATE TABLE は server.js で実行） |
| `db/sessions.sqlite` | セッションストア（connect-sqlite3 が使用） |
| `db/chroma/` | ChromaDB の永続化用（Chroma を `--path` で使う場合） |
| `public/icons/` | ユーザーアイコン保存先 |
| `public/files/` | ファイルアップロード・SQL練習用DB配置先 |
| `public/files/user_database.db` | SQLインジェクション練習用（CREATE TABLE は server.js で実行） |

初回起動時にテーブルが存在しなければ作成され、既存の DB にはマイグレーション（カラム追加など）が行われます。

### 3.3 メインサーバーの起動

```powershell
node server.js
```

- デフォルトで **ポート 3333** でリッスンします。  
- 表示される LAN 用 URL（例: `http://192.168.x.x:3333`）でブラウザからアクセスできます。

**起動確認ログ例:**

```
🚀 サーバーをポート 3333 で起動中...
✅ サーバーが正常に起動しました！
📡 LAN内の他のデバイスからアクセス可能です: http://192.168.x.x:3333
```

---

## 4. オプション: AI チューター・知識ベース（Ollama / ChromaDB）

クイズの「チューター」や知識ベース検索を使う場合は、以下を用意します。

### 4.1 Ollama のインストールと起動

1. [Ollama](https://ollama.com/download) をインストールし、サービスまたはプロセスを起動する。
2. チューター用モデルと埋め込み用モデルをダウンロード:

```powershell
ollama pull llama3.2
ollama pull nomic-embed-text
```

3. 動作確認:

```powershell
ollama list
```

- デフォルトではアプリは `http://localhost:11434` に接続します。  
- 別ホスト/ポートの場合は環境変数で指定（後述）。

### 4.2 ChromaDB（知識ベースのベクトル検索）

知識ベース（RAG）を使う場合は、Chroma を別プロセスで起動します。

**方法A: Chroma を pip でインストールして起動（推奨）**

```powershell
# Python が入っている場合
pip install chromadb

# 永続化用ディレクトリを指定して起動（プロジェクトの db/chroma を使う場合）
cd c:\Users\kokoh\CTF\CTF_HTML
mkdir db\chroma 2>nul
chroma run --path ./db/chroma
```

- デフォルトで `http://localhost:8000` で待ち受けます。  
- アプリのデフォルト `CHROMA_URL` も `http://localhost:8000` です。

**方法B: Chroma を使わない**

- Chroma を起動しなければ、チューターは **Ollama のみ**で動作します（知識ベース検索はスキップされます）。  
- サーバーは起動時に Chroma 接続失敗を検出し、その旨をログに出して起動を続行します。

---

## 5. 環境変数（任意）

必要に応じて、起動前に環境変数を設定します。

| 変数名 | 説明 | デフォルト |
|--------|------|------------|
| `SESSION_SECRET` | セッション署名用シークレット | 起動時のランダム生成 |
| `SERVER_HOST` | クイズ用に返すサーバー host（例: 公開URLのホスト名） | 自機の LAN IP |
| `OLLAMA_BASE_URL` | Ollama API の URL | `http://localhost:11434` |
| `OLLAMA_MODEL` | チューター用 LLM モデル | `llama3.2` |
| `OLLAMA_EMBEDDING_MODEL` | 埋め込みモデル | `nomic-embed-text` |
| `CHROMA_URL` | ChromaDB の URL | `http://localhost:8000` |

**PowerShell での設定例（そのプロセスのみ）:**

```powershell
$env:SESSION_SECRET = "あなたの長いランダム文字列"
$env:SERVER_HOST = "192.168.1.100"
$env:OLLAMA_BASE_URL = "http://localhost:11434"
node server.js
```

本番では `.env` と `dotenv` を使うか、OS の環境変数に設定することを推奨します。

---

## 6. サブサーバー（攻撃者サーバー・XSS 用）

メインサーバーとは別に、次のサブサーバーがあります。

### 6.1 攻撃者サーバー（attack_server）

XSS で盗んだ Cookie を受け取る攻撃者用サーバーです。メインサーバー起動時に **自動で起動**されるため、通常は手動起動は不要です。  
手動で動かす場合:

```powershell
cd c:\Users\kokoh\CTF\CTF_HTML\attack_server
npm install
npm start
# または
node server.js
```

### 6.2 XSS 脆弱ショップ（xss）

XSS 練習用の脆弱なショップです。メイン画面から「個別ショッピングサーバー」として **セッションごとに動的に起動**されるため、通常は単体で常時起動する必要はありません。  
単体で開発する場合:

```powershell
cd c:\Users\kokoh\CTF\CTF_HTML\xss
npm install
npm start
# 開発時
npm run dev
```

---

## 7. SQL 練習用サーバー（sql-server.js）

`package.json` に定義されているスクリプトです。

```powershell
cd c:\Users\kokoh\CTF\CTF_HTML
npm run sql:dev
```

- このコマンドは `node sql-server.js` を実行します。  
- `sql-server.js` がリポジトリに存在する場合のみ利用できます。

---

## 8. よくあるトラブル

### ポート 3333 が使用中

```text
EADDRINUSE: ポート 3333 は既に使用されています。
```

- 別のアプリが 3333 を使っているか、既に本サーバーが起動しています。  
- タスクマネージャーや `netstat -ano | findstr 3333` でプロセスを確認し、終了するか、アプリ側でポートを変更してください。

### bcrypt / sqlite3 のビルドエラー

- Node のバージョンが 18/20 LTS であることを確認。  
- 「1.2」のとおり、Visual Studio Build Tools または Python を入れ、再度 `npm install` を実行。

### Ollama に接続できない

- `ollama list` が同じマシンで動くか確認。  
- ファイアウォールで 11434 が許可されているか確認。  
- 別ホストの場合は `OLLAMA_BASE_URL` を設定。

### ChromaDB に接続できない

- `chroma run --path ./db/chroma` が起動しているか確認。  
- 別ホスト/ポートの場合は `CHROMA_URL` を設定。  
- Chroma が無くてもサーバーは起動し、チューターは Ollama のみで動作します。

---

## 9. 手順の早見表

| 手順 | コマンド |
|------|----------|
| Node 確認 | `node -v` / `npm -v` |
| 依存インストール | `npm install` |
| メインサーバー起動 | `node server.js` |
| （任意）Ollama モデル | `ollama pull llama3.2` / `ollama pull nomic-embed-text` |
| （任意）Chroma 起動 | `chroma run --path ./db/chroma` |
| （任意）環境変数 | `$env:SESSION_SECRET = "…"; node server.js` |

以上で、このサーバーを構築・起動するための環境構築手順は一通りです。
