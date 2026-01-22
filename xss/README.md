# XSS脆弱性のあるショッピングサイト

Amazon風のショッピングサイトを模した、意図的にXSS（Cross-Site Scripting）脆弱性を含むWebアプリケーションです。セキュリティ学習やCTF練習用に使用してください。

## ⚠️ 警告

**このアプリケーションは教育目的のみで使用してください。本番環境や公開サーバーでは絶対に使用しないでください。**

## 機能

- 商品一覧表示
- 商品検索（XSS脆弱性あり）
- 商品詳細表示
- レビュー投稿・表示（XSS脆弱性あり）

## XSS脆弱性の箇所

### 1. 商品検索機能
検索クエリがサニタイズされずにそのままHTMLに出力されます。

**脆弱なコード:**
```ejs
<%= searchQuery %>
```

**攻撃例:**
```
<script>alert('XSS')</script>
<img src=x onerror="alert('XSS')">
```

### 2. レビュー投稿機能
レビューの著者名とコメントがサニタイズされずにそのまま保存・表示されます。

**脆弱なコード:**
```ejs
<strong><%= review.author %></strong>
<div class="review-comment"><%= review.comment %></div>
```

**攻撃例:**
- 著者名: `<script>alert('XSS')</script>`
- コメント: `<img src=x onerror="alert('XSS')">`

## セットアップ

### 必要な環境
- Node.js (v14以上)
- npm

### インストール

1. 依存パッケージをインストール:
```bash
npm install
```

2. サーバーを起動:
```bash
npm start
```

開発モード（自動リロード）で起動する場合:
```bash
npm run dev
```

3. ブラウザでアクセス:
```
http://localhost:3000
```

## 使用方法

### XSS攻撃を試す

1. **検索機能でのXSS:**
   - トップページの検索ボックスに以下を入力:
   ```
   <script>alert('XSS攻撃成功！')</script>
   ```
   - または:
   ```
   <img src=x onerror="alert('XSS攻撃成功！')">
   ```

2. **レビュー投稿でのXSS:**
   - 任意の商品詳細ページに移動
   - レビュー投稿フォームで以下を入力:
     - お名前: `<script>alert('XSS攻撃成功！')</script>`
     - コメント: `<img src=x onerror="alert('XSS攻撃成功！')">`
   - 「レビューを投稿」をクリック

## セキュアな実装方法

実際のアプリケーションでは、以下の対策を実装してください:

1. **出力エスケープ:**
   - EJSでは `<%-` の代わりに `<%=` を使用（自動エスケープ）
   - ただし、このアプリでは意図的に `<%=` を使用していますが、ユーザー入力をそのまま渡しているため脆弱です

2. **入力検証:**
   - サーバー側で入力値を検証・サニタイズ
   - Content Security Policy (CSP) の実装

3. **ライブラリの使用:**
   - DOMPurify などのサニタイゼーションライブラリ
   - express-validator などのバリデーションライブラリ

## ライセンス

MIT License
