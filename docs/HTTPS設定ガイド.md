# HTTPS設定ガイド

## 警告について

ブラウザで以下のような警告が表示される場合があります：

```
The file at 'http://192.168.56.1/files/...' was loaded over an insecure connection. 
This file should be served over HTTPS.
```

これは、HTTPでファイルが読み込まれていることを警告しています。

## 対応方法

### 方法1: HTTPSを有効化する（推奨）

自己署名証明書を使用してHTTPSを有効化します。

#### ステップ1: SSL証明書の生成

```powershell
# PowerShellで実行
.\generate-ssl-cert.ps1
```

または、OpenSSLがインストールされている場合：

```powershell
# SSL証明書ディレクトリを作成
mkdir C:\nginx\ssl

# 証明書を生成
openssl req -x509 -nodes -days 365 -newkey rsa:2048 `
  -keyout C:\nginx\ssl\key.pem `
  -out C:\nginx\ssl\cert.pem `
  -subj "/CN=192.168.56.1/O=CTF Server/C=JP"
```

#### ステップ2: Nginx設定の更新

`nginx.conf` を開き、HTTPS設定部分のコメントを外します：

```nginx
# HTTPからHTTPSへのリダイレクト（オプション）
server {
    listen 80;
    server_name localhost 192.168.56.1;
    return 301 https://$server_name$request_uri;
}

# HTTPS設定
server {
    listen 443 ssl http2;
    server_name localhost 192.168.56.1;
    
    ssl_certificate C:/nginx/ssl/cert.pem;
    ssl_certificate_key C:/nginx/ssl/key.pem;
    
    # ... その他の設定（nginx.confを参照）
}
```

#### ステップ3: Nginxの再起動

```powershell
nginx -s reload
```

#### ステップ4: ブラウザでアクセス

- `https://192.168.56.1` にアクセス
- 自己署名証明書の警告が表示されます
- 「詳細設定」→「続行」を選択

### 方法2: 警告を無視する（開発環境の場合）

CTF環境などの開発環境では、この警告を無視しても問題ありません。

- 警告は表示されますが、機能には影響しません
- ブラウザのコンソールに警告が表示されるだけです

### 方法3: ブラウザの警告を抑制する（非推奨）

開発環境でのみ使用してください：

1. Chromeの場合：
   - アドレスバーに `chrome://flags/#allow-insecure-localhost` と入力
   - 「Allow invalid certificates for resources loaded from localhost」を有効化

2. Firefoxの場合：
   - `about:config` にアクセス
   - `security.tls.insecure_fallback_hosts` に `192.168.56.1` を追加

**注意**: 本番環境では使用しないでください。

---

## トラブルシューティング

### 証明書が見つからない

```
SSL_CTX_use_certificate_file() failed (SSL: error:02001002:system library:fopen:No such file or directory)
```

- 証明書ファイルのパスを確認
- Windowsのパス区切りは `/` または `\\` を使用（`C:\nginx\ssl\cert.pem` は `C:/nginx/ssl/cert.pem` と記述）

### ポート443が使用できない

```
bind() to 0.0.0.0:443 failed (10013: An attempt was made to access a socket in a way forbidden by its access permissions)
```

- 管理者権限でNginxを起動
- ファイアウォールでポート443を許可

```powershell
New-NetFirewallRule -DisplayName "Nginx HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
```

### 自己署名証明書の警告が消えない

- これは正常な動作です
- 自己署名証明書はブラウザで警告が表示されます
- 本番環境では正式な証明書（Let's Encryptなど）を使用してください

---

## 参考

- [Nginx SSL設定](https://nginx.org/en/docs/http/configuring_https_servers.html)
- [Let's Encrypt](https://letsencrypt.org/) - 無料のSSL証明書（本番環境用）

