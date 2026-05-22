# Web
## 基本用語
### User Agent
- ブラウザの情報（Chrome / Firefoxなど）をサーバに送るヘッダ
### DOM Tree
- HTMLをツリー構造で表したもの（JavaScriptが操作対象）
### APIエンドポイント
- サーバと通信するURL（/api/login など）

## 入力値系
### SQL Injection
#### 危険なコード例
```sql
SELECT * FROM users WHERE username = '$user' AND password = '$pass';
```
#### 攻撃例
```text
' OR 1 = 1 --
```

#### なぜ突破できるのか
```sql
SELECT * FROM users 
WHERE username = '' OR 1=1 --' 
AND password = '';
```
- `OR 1=1` は常に真
- `--` 以降はコメントアウト
- 条件が常に成立 → ログイン成功

#### 検証手順
1. `'` を入力 → エラー確認
2. `' OR 1=1 --` を試す
3. レスポンス変化を見る

#### 防御策
- プレースホルダ（Prepared Statement）
- 入力のサニタイズ

### XSS（Cross-Site Scripting）
#### 例
```html
<script>alert(Hello World)</script>
```

#### 検証手順
1. 入力欄にスクリプトを入れる
2. 実行されるか確認

#### 種類
- 反射型
- 保存型
- DOM型

#### 防御策
- エスケープ処理
- CSP（Content Security Policy）

## 認証・認可
### チェック項目
- ID変更（IDOR）
- セッション管理
- Cookie改ざん

### 例
```url
/user?id=1 → /user?id=2
```

## パラメータ改ざん
### 手順
1. URLパラメータ変更 
2. POSTデータ変更
3. hiddenフィールド確認

### 例
```html
<input type="hidden" name="role" value="user">
```
- adminに変更

## ディレクトリ探索
### 手順
```bash
ffuf -u http://target/FUZZ -w wordlist.txt
```

### 確認対象
- /admin
- /backup
- /config

## SSRF（Server-Side Request Forgery）
### 概要
- サーバにリクエストを送らせる攻撃

### 危険なコード例
```javascript
fetch(user_input)
```

### 攻撃例
```url
http://169.254.169.254/latest/meta-data/
```

### 危険な理由
#### 内部リソース例
- 外部から唖w癖ㇲできない情報に到達可能
   - 127.0.0.1（ローカル）
   - 169.254.169.254（クラウドメタデータ）
   - 社内API

#### 攻撃手順
1. URL入力欄を探す
2. 外部URLを試す
3. 内部IPに変更
4. レスポンス確認

#### 防御策
- allowlist：許可されたURLのみアクセス
- URLパース＋IPチェック：
```python
import ipaddress
```
- ブロック対象
   - 127.0.0.1
   - 169.254.169.254
   - private IP

- DNSリバインディング対策
   - IP固定
   - DNS再解決禁止
- プロトコル制限
   - `http/https`のみ許可

## 見るべきポイント
### HTML
- コメント
- hiddenフィールド
### JavaScript
- APIエンドポイント
- 認証処理
### Networkタブ
- 通信内容
- レスポンス
### Cookie
- セッションID
- フラグ（httpOnly / Secure）

## 典型的な攻撃フロー
1. ソース確認
2. 入力欄を探す
3. パラメータ改ざん
4. XSS / SQLi試す
5. API解析
6. SSRFや内部アクセス確認

## よくあるミス・落とし穴
1. ソースを見ない
   - 情報見逃し
2. 1箇所しか試さない
   - 他に脆弱点あり
3. 手動だけでやる
   - ツール併用が重要