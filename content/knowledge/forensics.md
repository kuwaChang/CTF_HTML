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