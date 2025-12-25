# SSL証明書生成スクリプト（Windows PowerShell）
# 自己署名証明書を生成してHTTPSを有効化します

# 証明書の保存先ディレクトリ
$certDir = "C:\nginx\ssl"
$certFile = "$certDir\cert.pem"
$keyFile = "$certDir\key.pem"

# ディレクトリが存在しない場合は作成
if (-not (Test-Path $certDir)) {
    New-Item -ItemType Directory -Path $certDir -Force
    Write-Host "✅ SSL証明書ディレクトリを作成しました: $certDir"
}

# OpenSSLがインストールされているか確認
$opensslPath = Get-Command openssl -ErrorAction SilentlyContinue

if (-not $opensslPath) {
    Write-Host "❌ OpenSSLが見つかりません。"
    Write-Host ""
    Write-Host "OpenSSLのインストール方法:"
    Write-Host "1. Chocolateyを使用: choco install openssl"
    Write-Host "2. Git for Windowsに含まれています: C:\Program Files\Git\usr\bin\openssl.exe"
    Write-Host "3. または、以下のコマンドで手動で証明書を生成してください:"
    Write-Host ""
    Write-Host "   openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout $keyFile -out $certFile -subj `/CN=192.168.56.1`"
    exit 1
}

# 証明書を生成
Write-Host "🔐 SSL証明書を生成しています..."
& openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout $keyFile -out $certFile -subj "/CN=192.168.56.1/O=CTF Server/C=JP"

if (Test-Path $certFile -and Test-Path $keyFile) {
    Write-Host "✅ SSL証明書を生成しました:"
    Write-Host "   証明書: $certFile"
    Write-Host "   秘密鍵: $keyFile"
    Write-Host ""
    Write-Host "⚠️  これは自己署名証明書です。ブラウザで警告が表示されますが、"
    Write-Host "   「詳細設定」→「続行」を選択してアクセスできます。"
} else {
    Write-Host "❌ 証明書の生成に失敗しました"
    exit 1
}

