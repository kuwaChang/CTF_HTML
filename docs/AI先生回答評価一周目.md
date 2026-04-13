# AI先生回答評価一周目
これはAI先生の回答に足りなかったものをマークダウン形式で書いたものである

---

# OSINT
## OSINTとは何か
オープン・ソース・インテリジェンス（英: Open-Source Intelligence）とは、  
**合法的に入手可能な公開情報を収集・分析し、価値ある情報を導き出す手法**である。  

略称は **OSINT（オシント）**。  
また、**Open-Source Investigation（公開情報調査）**とも呼ばれる。

## CTFでよく問われる具体的な対象

### 画像解析（フォレンジック系の基本）

#### 何を見る？
- 画像の中に隠されたデータ
- ファイル構造（ヘッダ・フッタ・チャンク）
- 見た目では分からない埋め込み情報

#### よくある問題
- 画像内にフラグが埋め込まれている
- LSB（最下位ビット）によるステガノグラフィ
- 画像の末尾にZIPやテキストが付加されている

#### よく使うツール
- `strings`：文字列抽出
- `binwalk`：埋め込みファイル検出
- `stegsolve`：可視化・ビット解析
- `zsteg`：PNG/BMPのステガノ検出

### 位置特定（OSINTの定番）

#### 何を見る？
- 建物・看板・言語
- 地形（山、海、川）
- 車のナンバー・道路標識
- 電柱・信号機・道路の特徴

#### よくある問題
- 「この写真はどこで撮られたか？」
- 「この建物の名前は？」
- 「この場所の座標を答えよ」

#### よく使うツール
- Google Maps / Street View
- Google Lens / 画像検索
- OpenStreetMap

### メタデータ（EXIFなど）

#### 何を見る？
- 撮影日時
- GPS座標（緯度・経度）
- 使用カメラ・デバイス情報

#### よくある問題
- EXIFのGPSから撮影場所を特定
- 撮影時間から行動を推測
- 編集履歴から改ざんを疑う

#### ツール
- `exiftool`

### ファイル解析（中身を見る）

#### 何を見る？
- 実際のファイル形式（拡張子との不一致）
- ファイル内部構造（ヘッダ・マジックナンバー）
- 埋め込みデータや分割データ

#### よくある問題
- `.jpg`に見せかけた`.zip`
- 1つのファイルに複数のファイルが埋め込まれている
- 壊れたファイルの修復

#### ツール
- `file`：ファイル形式判定
- `binwalk`：埋め込み抽出
- `xxd` / `hexdump`：バイナリ解析
- `foremost` / `scalpel`：ファイルカービング

### 文字列・エンコード（超頻出）

#### 何を見る？
- 意味のありそうな文字列
- 規則性のある英数字列
- フラグ形式（例：FLAG{...}）

#### よくある問題
- Base64 / Base32 / Base58
- ROT13 / Caesar暗号
- Hex / URLエンコード

#### ツール
- `strings`
- CyberChef
- `base64` コマンド
- `xxd`

###Web情報（OSINT）

#### 何を見る？
- HTMLソースコード
- コメントアウトされた情報
- robots.txt
- JavaScriptファイル
- 通信内容（Networkタブ）

#### よくある問題
- ソースコードにフラグが隠れている
- robots.txtから隠しディレクトリ発見
- APIレスポンスにヒントがある

#### ツール
- ブラウザ開発者ツール（F12）
- curl / wget
- Burp Suite
- dirsearch / gobuster

## 重要な考え方（初心者向け）

### 1. まず全部出す
- strings
- exif
- file

### 2. 違和感を探す
- 不自然なデータ
- 変な文字列
- 拡張子と中身のズレ

### 3. 仮説 → 検証
- 「Base64っぽい」→ デコード
- 「zipっぽい」→ 解凍

## 最低限の初動テンプレ

1. `file` → ファイルの正体確認  
2. `strings` → 文字列抽出  
3. `exiftool` → メタデータ確認  
4. `binwalk` → 埋め込み探索  

## OSINT / フォレンジック 手順まとめ（ツール付き）

### 使用ツール
- Google Images（画像検索）
- TinEye
- Yandex Images（建物・人物に強い）

### 手順
1. 画像をアップロードして検索
2. 「完全一致」と「類似画像」を確認
3. 最も古い投稿を探す（初出）
4. 別角度の画像を収集
5. 写っている要素（建物・看板など）を特定

### ポイント
- GoogleだけでなくYandexも使う
- 「最初にどこで出たか」が重要

## 2. 位置特定（ジオロケーション）

### 使用ツール
- Google Maps
- Google Street View
- GeoGuessr（練習用）

### 手順
1. 画像からヒント抽出
   - 言語
   - ナンバープレート
   - 電柱・信号
2. 地域を仮決め
3. Mapsで候補探索
4. Street Viewで一致確認
5. 建物配置・道路・影を照合

### ポイント
- 影の向き → 方角推定
- 看板の電話番号 → 地域特定

## 3. メタデータ解析（EXIF）

### 使用ツール
- ExifTool

### 手順
```bash
exiftool image.jpg
```
### 確認項目
- GPS情報
- 撮影日時
- カメラ機種
- 編集履歴

### 応用
```bash
exiftool -gps* image.png
```

### ポイント
- SNSはEXIF情報削除されがち
- 加工履歴が残ることがある

## ドメイン調査（WHOIS/DNS）

### 仕様ツール
- whois
- nslookup
- dig

### 手順
```bash
whois example.com
```

### 確認項目
- 登録者情報
- 作成日
- ネームサーバ

### 追加調査
```bash
nslookup example.com
dig example.com
```

### ポイント
- ドメインの新旧で信頼性判断
- 同一IPの日かのサイトも確認

## ユーザ名調査
### 使用ツール
- sherlock
- Namechk

### 手順
```bash
python sherlock username
```

### 手順詳細
1. 同一IDのSNSを列挙
2. 投稿内容・時間帯を確認
3. 共通情報（地域・趣味）を抽出

### ポイント
- IDの使いまわしが多い
- Github/Redditも重要

## ステガノグラフィ調査
### 使用ツール
- binwalk
- strings
- zsteg

### 手順
構造確認
```bash
binwalk image.png
```

文字列抽出
```bash
strings image.png
```

LSB解析
```bash
zsteg image.png
```

### ポイント
- 末尾にZIPがついていることが多い
- PNGは特に疑う

## ファイルフォレンジック
### 使用ツール
- file 
- xxd
- hexdunp

### 手順
ファイル種別確認
```bash 
file suspicious.bin
```

ヘッダ確認
```bash
xxd suspicious.bin | head
```

拡張子を変更して確認

### ポイント
- 拡張子偽装に注意
- マジックナンバー確認が重要

## OCR（Optical Character Recognition）とは
- 画像の中の文字をテキストに変換する技術

### 代表ツール
- Tesseract OCR
```bash
tesseract image.png output
```
| OCR       | ステガノ       |
| --------- | ---------- |
| 見えてる文字を読む | 見えないデータを探す |

## OSINTの適切な利用
### 原則
- 公開情報のみを使う
- 目的を明確にする
- 必要最低限の収集にとどめる
- 結果の扱いに責任を持つ

### プライバシー配慮の基本
1. 個人特定を安易にしない
   - 本名・住所・勤務先などを結びつけない
   - 不要なら匿名化する
2. 二次利用に注意
   - 集めた情報を**再配布しない**
   - スクショやログの扱いに注意
3. 文脈を歪めない
   - 発言の切り取り
   - 古い情報を現在の事実として扱わない
4. 本人の意図を考える
   - 後悔されていても「拡散前提」とは限らない
   例：
   - 小規模SNS
   - 個人ブログ
   - 限定公開に近い投稿

### 守るべきもの
- 利用規約
- 著作権
- 個人情報保護
- 不正アクセス禁止法

## EXIF情報とは
EXIF（Exchangeable Image File Format）とは、画像ファイルに埋め込まれているメタデータ（付加情報）のこと

### 代表的な情報
- GPS位置情報（緯度・経度）
- 撮影日時
- カメラ機種（iPhone・Canonなど）
- 撮影設定（ISO・シャッター速度など）
- 編集ソフト（Photoshopなど）
   - 例
```bash
File Name       : image.jpg
DateTimeOriginal: 2024:03:10 14:32:10
Make            : Apple
Model           : iPhone 13
GPS Latitude    : 35.6895 N
GPS Longitude   : 139.6917 E
```

### 確認方法
代表ツール`ExifTool`
```bash
exiftool image.png
```

### 注意点
1. EXIFは削除されることが多い
   - Twitter/Discord/LINEは消される
2. 偽装できる
   - EXIFは**書き換え可能**
3. プライバシーリスク
   - 位置情報がそのまま漏れる

---

# Crypto 
## 暗号/エンコード/ハッシュの違い
### 定義
| 種類 | 説明 | 鍵 | 復元 |
|------|------|----|------|
| 暗号 | データを秘密にする | あり | 可能 |
| エンコード | 表現変換 | なし | 可能 |
| ハッシュ | 一方向変換 | なし | 不可 |

---

### Base64は暗号ではない

#### 理由
- 鍵が存在しない
- 誰でも復号可能

#### 例
```text
SGVsbG8= -> Hello
```

#### 判断特徴
- 英数字 + `+ /`
- 末尾に`=`がある

### 判別方法（最初にやること）
- 文字種（英数字のみか）
- 長さ（固定長かどうか）
- `=`があるか
- 16進数か
- 規則性があるか

| 文字列 | 推測 |
| -------------------------------- | ------ |
| SGVsbG8=                         | Base64 |
| 5f4dcc3b5aa765d61d8327deb882cf99 | MD5    |
| Uifsf                            | Caesar |

### 解読の基本フロー
1. 形式を観察
2. エンコードならでコードする
3. ハッシュならクラックする
4. 古典暗号なら総当たり・解析する
5. RSAなどは数学的攻撃する

### 使用ツール
CyberChef
- GUIで変換・解析が可能
- Magic機能で自動判別

Base64コマンド
```bash
echo "SGVsbG8=" | base64 -d
```

hashcat
```bash
hashcat -m 0 hash.txt wordlist.txt
```

strings
```bash
strings file.bin
```

## ハッシュとクラック
### ハッシュとは
- 一方向関数
- 元に戻せない

### 攻撃手法
#### 辞書攻撃
- 候補リストを総当たり

#### レインボーテーブル
- 事前計算済みの対応表を使用

#### 例
```text
5f4dcc3b5aa765d61d8327deb882cf99 → password
```

## シーザー暗号（Caesar）
### 概要
- アルファベットを一定数ずらす
#### 例
```text
ABC → DEF（+3）
```

### 解き方
1. 0-25まで総当たり
2. 英単語になるモノを探す
#### サンプルコード
```python
//Pythonコード
for i in range(26):
   result = ""
```

### ポイント
- 最も単純な暗号
- まず最初に試すべき

## ヴィジュネル暗号（Vigenère）
### 概要
- キーを使った多表式暗号
#### 例
```text
KEY = ABC
```

### 解き方
1. 鍵長を推定
2. 各列をシーザー（Caesar）として解く

### 鍵長推定手法
- Kasiski検査
- IC（一致指数）

### ポイント
- 繰り返しパターンを探す
- シーザー（Caesar）の応用

## RSA暗号
### 基本構造
公開鍵：
```text
(n, e)
```

秘密鍵：
```text
d
```

### 数学的基礎
#### mod（剰余）
```text
7 mod 3 = 1
```

#### mod逆元
```text
e × d ≡ 1 (mod φ(n))
```

### 暗号化
```text
c = m^e mod n
```

### 復号
```text
m = c^d mod n
```

## 鍵長が短いと危険な理由
### 本質
```text
カギの強さ = 探索空間 = 2^n
```
#### 例
| 鍵長     | 探索空間  |
| ------ | ----- |
| 32bit  | 2^32  |
| 128bit | 2^128 |

#### RSAの場合
```text
n = p × q
```
- 小さいと**素因数分解**が容易

## 代表的な攻撃
### 総当たり
- 全パターン試す

### 数論攻撃
- 素因数分解
- 小さい指数攻撃

#### 実例
- `n`が小さい -> factorbdで分解可能

## 解き方の方向性
### 見た目
#### Base64っぽい
- デコード
#### ハッシュっぽい
- hashcat / 辞書攻撃
#### 英文が崩れている
- Caesar / Vigenère
#### 数字が長い
- RSA

# Forensics
## 最初の手順
1. ハッシュ値を取得
```bash
sha256sum evidence.img
```
- 同一ファイルかどうかの検証

2. ファイル種別確認
```bash
file evidence.bin
```

3. 構造確認（パーティション等）
```bash
fdisk -l evidence.img
mmls evidence.img
```
4. 文字列抽出
5. 埋め込みデータ確認

## 整合性（Integrity）とは
### 定義
- データが改ざんされていないこと

### 確認方法
- ハッシュ値比較
- ファイルサイズ一致
- メタデータ一致

## 改ざん検知
### 手法
#### ハッシュ値比較
```bash
sha256sum original.img
sha256sum suspect.img
```
#### メタデータ不整合
- 作成日時 > 更新日時 -> 不自然
- 編集履歴あり

#### タイムスタンプ矛盾（MAC times）
| 種類 | 意味       |
| -- | -------- |
| M  | Modified |
| A  | Accessed |
| C  | Changed  |

## タイムライン分析
- **何がいつ**起きたかを特定する
### 注意点
- タイムゾーン差
- ログ間の時刻のずれ
- システム時計の誤差

### 手順
1. 書くログの時刻を統一（UTC推奨）
2. イベントを時系列に並べる
3. 不自然な順序を検出

## メモリダンプ解析
### 目的
- 実行中のプロセスの確認
- ネットワーク接続
- 認証情報の抽出
- 復号前データ（平文）

### 抽出できる情報
- プロセス一覧
- DLL/モジュール
- コマンド履歴
- レジストリ情報
- 資格情報（パスワードなど）
- ネットワーク接続

### ツール例
- volatility
- strings

#### 例
```bash
strings memory.dump | grep password
```

## ファイル解析
### 最初に試すコマンド
```bash
file sample.bin
strings sample.bin
binwalk sample.bin
```
- file：種別判定
- strings：可読文字抽出
- binwalk：埋め込み検出

## ステガノグラフィ解析
### 最初に試すコマンド
```bash
binwalk image.png
strings image.png
```

### LSB解析
```bash
zsteg image.png
```

### steghide
```bash
steghide extract -sf image.jpg
```

### ポイント
- PNGはLSBが多い
- JPEGはsteghideが多い

## ディスクイメージ解析
### 構造確認
```bash
fdisk -l disk.img
mmls disk.img
```

### マウント
```bash
mount -o loop disk.img /mnt
```

### ポイント
- 隠しパーティションに注意
- 削除ファイル復元あり

## チューン・オブ・カストディ
### 定義
- 証拠の取得から保管までの記録

### 重要性
- 証拠の信頼性確保
- 改ざん防止

### 記録内容
- 取得日時
- 取得者
- ハッシュ値
- 保管所

## よくある落とし穴
1. ハッシュを取らない
- 改ざん検証できない
2. 原本を直接操作
- 証拠破壊
3. タイムゾーン無視
- 時系列崩壊
4. ツール未使用
- 見落とし増加

## 解き方の方向性
1. バイナリのとき
- `file`/`strings`/`binwalk`
2. 画像のとき
- `EXIF`/`zsteg`
3. ディスクのとき
- `mmls`/`mount`
4. メモリのとき
- `strings`/`volatility`

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

# Meta
## CTF基本フロー
1. 観測
2. 仮説立案
3. 検証
4. ログ取得
5. 再現性確認

## 仮説とは何か
### 定義
- 「こうすれば解けるのではないか？」という**予測**
### 例
- 「Base64っぽい」　-> デコードしてみる

### 仮説の立て方
1. 観測から特徴を抽出
2. 類似パターンを思い出す
3. 最も簡単な仮説を選ぶ

## 初心者が陥りやすいミス
1. 思い込み
   - Cryptoだと思い込む
2. 試行ログを残さない
   - 同じことを繰り返す

## リカバリ手順
### 進まない場合
1. 別カテゴリを疑う
2. 入力データを見直す
3. ツールを変える
4. writeupを調べる
### 具体例
- Crypto → Forensicsを疑う
- PNG → binwalk試す