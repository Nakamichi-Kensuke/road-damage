# 道路損傷検出システム - データベース/ストレージ統合版

このシステムは、PostgreSQLデータベースとSMBストレージを使用した道路損傷管理システムです。

## システム構成

- **フロントエンド**: HTML + JavaScript (Vanilla JS, Leaflet.js)
- **バックエンド**: Node.js + Express
- **データベース**: PostgreSQL + PostGIS
- **ストレージ**: SMB/CIFS共有ストレージ

## セットアップ手順

### 1. 必要なソフトウェア

- Node.js (v16以上)
- PostgreSQL (PostGIS拡張機能有効)
- SMBストレージへのアクセス権

### 2. データベース接続情報

`.env`ファイルに以下の情報が設定されています：

```
DB_HOST=172.16.232.57
DB_PORT=5432
DB_NAME=road_db
DB_USER=postgres
DB_PASSWORD=6531Adb
```

### 3. ストレージマウント

SMBストレージを以下の場所にマウントしてください：

#### macOS
```bash
mount_smbfs //share:6531@172.16.232.57/storage /Volumes/storage
```

その後、`.env`ファイルの`STORAGE_PATH`を更新：
```
STORAGE_PATH=/Volumes/storage
```

#### Linux
```bash
sudo mount -t cifs //172.16.232.57/storage /mnt/storage \
  -o username=share,password=6531,vers=3.0
```

`.env`ファイルの`STORAGE_PATH`は`/mnt/storage`のまま使用できます。

#### Windows
```cmd
net use Z: \\172.16.232.57\storage /user:share 6531
```

その後、`.env`ファイルの`STORAGE_PATH`を更新：
```
STORAGE_PATH=Z:
```

### 4. 依存パッケージのインストール

```bash
npm install
```

### 5. サーバーの起動

```bash
npm start
```

または開発モード（自動再起動）：

```bash
npm run dev
```

サーバーは `http://localhost:3000` で起動します。

### 6. ブラウザでアクセス

ブラウザで以下のURLにアクセスしてください：

- マップ表示: `http://localhost:3000/index.html`
- ダッシュボード: `http://localhost:3000/dashboard.html`
- 損傷検索: `http://localhost:3000/search.html`
- 報告書作成: `http://localhost:3000/report.html`

## API エンドポイント

### 損傷レポート一覧取得
```
GET /api/damages
Query params: page, limit, damage_type, start_date, end_date, min_confidence, sort, order
```

### 特定の損傷レポート取得
```
GET /api/damages/:id
```

### 近隣の損傷検索
```
GET /api/damages/nearby
Query params: lat (required), lng (required), radius, damage_type
```

### 統計情報取得
```
GET /api/damages/stats
```

### 画像取得
```
GET /api/images/:id/original  - オリジナル画像
GET /api/images/:id/annotated - アノテーション付き画像
```

### 新規損傷レポート登録
```
POST /api/damages
Content-Type: application/json
Body: { id, captured_at, damage_type, confidence, longitude, latitude, ... }
```

## データベーステーブル構造

詳細は `assets/API_INTEGRATION_GUIDE.md` を参照してください。

### 主要カラム

- `id`: 検出ID（PRIMARY KEY）
- `captured_at`: 撮影日時
- `damage_type`: 損傷タイプ
- `confidence`: 信頼度（0.0～1.0）
- `geom`: GPS座標（PostGIS Point型）
- `altitude`: 高度
- `speed_kmh`: 速度
- `voice_memo`: 音声メモのテキスト
- `bbox`: バウンディングボックス（JSONB）

## ストレージフォルダ構成

```
storage/
├── images_original/     # オリジナル画像
│   └── {detection_id}_original.jpg
└── images_annotated/    # アノテーション付き画像
    └── {detection_id}_annotated.jpg
```

## トラブルシューティング

### データベース接続エラー

1. PostgreSQLサーバーが起動しているか確認
2. `.env`ファイルの接続情報が正しいか確認
3. ファイアウォールでポート5432が開放されているか確認

### 画像が表示されない

1. SMBストレージが正しくマウントされているか確認
2. `.env`ファイルの`STORAGE_PATH`が正しいか確認
3. 画像ファイルが`images_original/`と`images_annotated/`に存在するか確認

### APIがデータを返さない

1. ブラウザの開発者ツール（F12）でコンソールエラーを確認
2. サーバーのログを確認（ターミナル）
3. データベースにデータが存在するか確認：
   ```sql
   SELECT COUNT(*) FROM damage_reports;
   ```

## 開発者向け情報

### ファイル構成

```
.
├── server.js                    # バックエンドAPIサーバー
├── package.json                 # Node.js依存関係
├── .env                         # 環境変数設定
├── index.html                   # マップ表示ページ
├── dashboard.html               # ダッシュボードページ
├── search.html                  # 損傷検索ページ
├── report.html                  # 報告書作成ページ
└── assets/
    ├── js/
    │   ├── api-client.js        # APIクライアント
    │   ├── damages.js           # データ管理
    │   ├── map.js               # マップ機能
    │   ├── dashboard.js         # ダッシュボード機能
    │   ├── search.js            # 検索機能
    │   └── report.js            # 報告書機能
    ├── css/
    │   ├── style.css            # 共通スタイル
    │   └── report.css           # 報告書スタイル
    └── API_INTEGRATION_GUIDE.md # API統合ガイド
```

### データフロー

1. ブラウザがHTMLページをロード
2. `api-client.js`がロードされる
3. `damages.js`の`initDamages()`が実行され、APIからデータ取得
4. 各ページのJSが初期化され、データを表示
5. ユーザーの操作はlocalStorageに保存（対応状況など）
6. 画像は`/api/images/:id/:type`経由で取得

## ライセンス

このプロジェクトは教育目的で作成されています。

## お問い合わせ

システムに関する質問や問題が発生した場合は、プロジェクト管理者に連絡してください。
