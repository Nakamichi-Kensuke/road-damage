# 実装ログ - データベース統合

## 実装日
2025-12-03

## 実装内容

### 1. データベース統合
- PostgreSQLデータベースとの接続実装
- ホスト: 172.16.232.57:5432
- データベース: road_db
- 81件の損傷データを取得

### 2. APIサーバー構築
- Node.js + Express でバックエンドAPI作成
- ポート: 3000

#### APIエンドポイント
- `GET /api/damages` - 損傷一覧取得（ページネーション対応）
- `GET /api/damages/:id` - 特定損傷の詳細取得
- `GET /api/damages/nearby` - 近隣損傷検索（位置情報ベース）
- `GET /api/damages/stats` - 統計情報取得
- `GET /api/images/:id/:type` - 画像取得（original/annotated）
- `POST /api/damages` - 新規損傷登録

### 3. フロントエンド統合
- `api-client.js` - APIクライアントモジュール作成
- `damages.js` - 静的データから動的API取得に変更
- `convertDbToFrontend()` - DB形式からフロントエンド形式への変換関数

#### データ変換仕様
- `confidence` (0.0-1.0) → `severity` (大/中/小)
  - 0.8以上: 大
  - 0.5以上: 中
  - 0.5未満: 小
- `voice_memo` → `voiceText` → 特記事項フィールドに表示

### 4. 画像表示
- デフォルト画像: annotated（アノテーション付き）
- 画像パス: `/api/images/{ULID}/annotated`

#### ストレージ問題と解決
**問題**: macOSのセキュリティ制限により、SMBマウント (`/Users/kensuke/mnt/storage`) からNode.jsが直接ファイルを読めない（EPERMエラー）

**解決策**: ローカルストレージにコピー
- ストレージパス: `/Users/kensuke/大学/プロ演3後/dashboard-report13/storage_local/`
- Finder経由で手動コピーが必要
- 詳細: `STORAGE_SETUP.md` 参照

### 5. マップ表示
- ピンの色分け:
  - 大（confidence >= 0.8）: 赤 (#ef4444)
  - 中（confidence >= 0.5）: オレンジ (#f59e0b)
  - 小（confidence < 0.5）: 緑 (#10b981)

### 6. 特記事項フィールド
- ユーザーが入力した `responseNotes` を優先表示
- 未入力の場合は、DBの `voice_memo` を自動表示

## 変更ファイル一覧

### 新規作成
- `server.js` - バックエンドAPIサーバー
- `package.json` - Node.js依存関係
- `.env` - 環境変数設定
- `assets/js/api-client.js` - APIクライアント
- `STORAGE_SETUP.md` - ストレージセットアップ手順
- `SETUP_COMPLETE.md` - セットアップ完了ガイド
- `sync-images.sh` - 画像同期スクリプト

### 更新
- `assets/js/damages.js` - 静的データ→API取得に変更
- `assets/js/map.js` - ボイスメモ表示ロジック追加
- `index.html` - スクリプト読み込み順序変更
- `dashboard.html` - スクリプト読み込み順序変更
- `search.html` - スクリプト読み込み順序変更

## 技術スタック
- **バックエンド**: Node.js, Express, pg (PostgreSQL client)
- **データベース**: PostgreSQL + PostGIS
- **フロントエンド**: Vanilla JavaScript, Leaflet.js
- **ストレージ**: SMB/CIFS → ローカルコピー

## 既知の問題
1. **画像の手動同期が必要**
   - SMBストレージからの自動同期ができない
   - 新しい画像が追加されたら手動コピーが必要

2. **ルート定義順序の重要性**
   - `/api/damages/nearby` と `/api/damages/stats` は `/api/damages/:id` より前に定義する必要がある
   - そうしないと "nearby" や "stats" が ID として解釈される

## 起動方法

```bash
# 依存パッケージインストール
npm install

# サーバー起動
npm start

# または開発モード（自動再起動）
npm run dev
```

ブラウザで `http://localhost:3000` にアクセス

## データベーススキーマ

### damage_reports テーブル
- `id` (TEXT, PRIMARY KEY) - ULID形式の検出ID
- `captured_at` (TIMESTAMP) - 撮影日時
- `damage_type` (TEXT) - 損傷タイプ
- `confidence` (REAL) - 信頼度 (0.0-1.0)
- `geom` (GEOMETRY Point) - GPS座標 (PostGIS)
- `altitude` (REAL) - 高度
- `speed_kmh` (REAL) - 速度
- `voice_memo` (TEXT) - 音声メモのテキスト
- `bbox` (JSONB) - バウンディングボックス
- `raw_json` (JSONB) - 元のJSONデータ

## 今後の改善案
1. 画像の自動同期メカニズム
2. リアルタイムデータ更新（WebSocket）
3. ユーザー認証・権限管理
4. 画像のクラウドストレージ移行
5. データベースへのsize情報追加

## 参考ドキュメント
- `assets/API_INTEGRATION_GUIDE.md` - API統合ガイド
- `README.md` - プロジェクト概要
- `STORAGE_SETUP.md` - ストレージ問題の詳細
