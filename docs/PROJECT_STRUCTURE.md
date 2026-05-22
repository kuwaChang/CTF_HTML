# プロジェクト構成

Node.js / Express でよく使われるディレクトリ名に整理した構成です。

## ディレクトリ一覧

| パス | 役割 |
|------|------|
| `src/` | アプリケーション本体（サーバー・ルート・サービス） |
| `src/config/paths.js` | プロジェクト内のパス定数（変更時はここを更新） |
| `config/` | JSON 設定（クイズ・実績・シナリオ） |
| `content/knowledge/` | AIチューター用ナレッジ（Markdown） |
| `content/drafts/` | ナレッジ草案・メモ |
| `storage/` | SQLite・セッション・Chroma・Q&Aキュー |
| `views/pages/` | 公開HTML（URLは従来どおり `/html/...`） |
| `views/admin/` | 管理者画面 |
| `public/` | 静的アセット（css, js, images, lib） |
| `public/uploads/` | 配布ファイル・アップロード（URLは `/files/...`） |
| `labs/attack-server/` | 攻撃演習用サブサーバー |
| `labs/xss/` | XSS演習用サブサーバー |
| `scripts/` | 運用スクリプト |
| `docs/` | ドキュメント |
| `temp/` | コード実行の一時ディレクトリ |

## 旧パスとの対応

| 旧 | 新 |
|----|-----|
| `server.js`（ルート） | `src/server.js`（`node server.js` は互換用ラッパー） |
| `routes/` | `src/routes/` |
| `services/` | `src/services/` |
| `db/` | `storage/` |
| `data/*.json` | `config/` |
| `data/knowledge/` | `content/knowledge/` |
| `data/tempData/` | `content/drafts/` |
| `public/html/` | `views/pages/` |
| `private/` | `views/admin/` |
| `public/files/` | `public/uploads/` |
| `attack_server/` | `labs/attack-server/` |
| `xss/` | `labs/xss/` |

## 起動

```powershell
npm start
# または
node src/server.js
# 後方互換
node server.js
```

## 注意（CTF）

学習用の URL は維持しています。

- `/files/...` → `public/uploads/`
- `/html/...` → `views/pages/`

Chroma を使う場合:

```powershell
chroma run --path ./storage/chroma
```
