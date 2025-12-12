# セッションログ - 道路管理システム開発記録

**日付**: 2025-12-13
**作業内容**: データベース移行、Vercelデプロイ、モバイル対応機能追加

---

## 1. データベース移行 (ローカル → Neon PostgreSQL)

### 背景
- ローカルネットワーク上のPostgreSQLサーバー (172.16.232.57) から、クラウドDB (Neon PostgreSQL) への移行
- 目的: 公開URLでどこからでもアクセス可能にするため

### 実施内容

#### 1.1 データベースエクスポート
```bash
pg_dump -h 172.16.232.57 -U postgres -d road_db --no-owner --no-privileges > road_db_export.sql
```
- データ件数: **136レコード**
- ファイルサイズ: 73KB

#### 1.2 Neonデータベース作成
- プロバイダー: Neon PostgreSQL
- 接続URL:
  ```
  postgresql://neondb_owner:npg_j3GmftBdFXr5@ep-quiet-band-a115uk6t-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
  ```

#### 1.3 データインポート
```bash
psql 'postgresql://neondb_owner:npg_j3GmftBdFXr5@ep-quiet-band-a115uk6t-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require' -f road_db_export.sql
```

#### 1.4 コード修正

**`.env` の更新:**
```env
# Database Configuration (Neon PostgreSQL - クラウドDB)
DB_HOST=ep-quiet-band-a115uk6t-pooler.ap-southeast-1.aws.neon.tech
DB_PORT=5432
DB_NAME=neondb
DB_USER=neondb_owner
DB_PASSWORD=npg_j3GmftBdFXr5
DB_SSL=true
```

**`server.js` の修正 (SSL対応):**
```javascript
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  client_encoding: 'UTF8',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});
```

**PostGIS関数の修正:**
- すべてのPostGIS関数呼び出しに `public.` プレフィックスを追加
- 例: `ST_X(geom)` → `public.ST_X(geom)`
- テーブル参照も修正: `damage_reports` → `public.damage_reports`

---

## 2. GitHubリポジトリ作成とVercelデプロイ

### 2.1 GitHubリポジトリ作成
```bash
git init
git add .
git commit -m "Initial commit: Road damage management system"
git remote add origin https://github.com/Nakamichi-Kensuke/road-damage.git
git push -u origin main
```

#### 発生した問題と解決

**問題1: 大容量ファイルのプッシュエラー**
- エラー: `HTTP 400 - Request too large`
- 原因: `storage_local/` に画像ファイル272枚 (136枚の注釈済み + 136枚のオリジナル)
- 解決策:
  1. `.gitignore` に `storage_local/` を追加
  2. 既存のGit履歴からも削除: `git rm -r --cached storage_local`
  3. 新しいリポジトリを作成してプッシュ

### 2.2 Vercelデプロイ設定

#### `server.js` の修正 (Vercel serverless対応)
```javascript
// Start server (only in local environment, not in Vercel)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Export for Vercel serverless
module.exports = app;
```

#### `vercel.json` の作成
```json
{
  "version": 2,
  "builds": [
    {
      "src": "server.js",
      "use": "@vercel/node"
    },
    {
      "src": "**/*.html",
      "use": "@vercel/static"
    },
    {
      "src": "assets/**",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/server.js"
    },
    {
      "src": "/(.*\\.(css|js|jpg|png|svg|gif|ico|json))",
      "dest": "/$1"
    },
    {
      "src": "/(.*\\.html)?",
      "dest": "/$1"
    },
    {
      "src": "/",
      "dest": "/index.html"
    }
  ]
}
```

#### Vercel環境変数の設定
以下の環境変数をVercel Dashboardで設定:

| 変数名 | 値 |
|--------|-----|
| `DB_HOST` | `ep-quiet-band-a115uk6t-pooler.ap-southeast-1.aws.neon.tech` |
| `DB_PORT` | `5432` |
| `DB_NAME` | `neondb` |
| `DB_USER` | `neondb_owner` |
| `DB_PASSWORD` | `npg_j3GmftBdFXr5` |
| `DB_SSL` | `true` |
| `R2_PUBLIC_URL` | `https://pub-63d9f2bae118422fb1ea52e61aaf5ca9.r2.dev` |
| `PORT` | `3000` |

#### 発生した問題と解決

**問題2: 環境変数の設定ミス**
- エラー: `password authentication failed for user 'npg_j3GmftBdFXr5'`
- 原因: `DB_USER` と `DB_PASSWORD` の値が逆になっていた
- 解決策: Vercel Dashboardで環境変数を正しく設定し直してRedeploy

**結果**: デプロイ成功 ✅

---

## 3. モバイル対応機能の追加

### 3.1 実装した機能

#### リサイズ可能なパネル
**ファイル**: `assets/js/resizable-panels.js`

**機能**:
- 左右のパネル間にドラッグ可能な境界線を追加
- マウス & タッチ操作の両方に対応
- パネル幅をlocalStorageに保存して永続化
- Leafletマップのサイズを自動更新

**対象ページ**:
- `index.html` (マップ表示ページ)
- `search.html` (損傷検索ページ)

**使い方**:
1. 左右パネルの間の境界線をクリック/タッチ
2. ドラッグして好みのサイズに調整
3. 幅は自動的に保存され、次回アクセス時も維持される

#### タッチ対応画像モーダル
**ファイル**: `assets/js/touch-image-modal.js`

**機能**:
- **ピンチズーム**: 2本指でピンチイン/アウト (1x〜5x)
- **ダブルタップズーム**: ダブルタップで2.5倍ズーム、もう一度で元に戻る
- **ドラッグ移動**: ズーム時に画像をドラッグして表示位置を調整
- **ホイールズーム**: PCではマウスホイールでズーム可能

**対象ページ**:
- `index.html` (画像モーダル)
- `search.html` (画像モーダル)

**使い方**:
- **スマホ/タブレット**: ピンチ、ダブルタップ、ドラッグ
- **PC**: ホイール、ダブルクリック、ドラッグ

#### レスポンシブCSS
**ファイル**: `assets/css/style.css` (追加箇所: 310-410行目)

**改善内容**:
- タブレット (〜1024px): サイドバーを狭く (12rem)
- スマホ横画面 (〜768px): コンパクトレイアウト、小さいフォント
- スマホ縦画面 (〜640px): サイドバーを隠して画面スペースを確保

### 3.2 コード変更

#### `index.html`
```html
<!-- Before -->
<div class="flex flex-1 gap-4 p-4">
  <div class="flex-1 flex">
    <div id="map"></div>
  </div>
  <aside id="status-panel"></aside>
</div>

<!-- After -->
<div class="flex flex-1 gap-0 p-4">
  <div id="map-container" class="flex-1 flex">
    <div id="map"></div>
  </div>
  <!-- リサイズ可能な境界線はJSで追加されます -->
  <aside id="status-panel" class="flex-1"></aside>
</div>

<script>
  // リサイズ機能とタッチモーダルを初期化
  new ResizablePanels('map-container', 'status-panel', 'index-panel-widths');
  new TouchImageModal('image-modal', 'modal-image');
</script>
```

#### `search.html`
```html
<!-- Before -->
<div class="flex flex-1 gap-4">
  <div class="flex-1 flex flex-col gap-4">...</div>
  <div class="flex-1 flex flex-col gap-4">...</div>
</div>

<!-- After -->
<div class="flex flex-1 gap-0">
  <div id="search-left-panel" class="flex-1 flex flex-col gap-4">...</div>
  <!-- リサイズ可能な境界線はJSで追加されます -->
  <div id="search-right-panel" class="flex-1 flex flex-col gap-4">...</div>
</div>

<script>
  // リサイズ機能とタッチモーダルを初期化
  new ResizablePanels('search-left-panel', 'search-right-panel', 'search-panel-widths');
  new TouchImageModal('image-modal', 'modal-image');
</script>
```

---

## 4. デプロイ履歴

### コミット1: 初回デプロイ
```bash
git commit -m "Initial commit: Road damage management system"
git push
```

### コミット2: Vercel設定修正
```bash
git commit -m "Fix: Add static file builds and routing to vercel.json"
git push
```

### コミット3: モバイル機能追加
```bash
git commit -m "Add mobile-friendly features: resizable panels and touch image zoom

- Add resizable panels with draggable dividers for index.html and search.html
- Add touch-enabled image modal with pinch-to-zoom, double-tap, and pan
- Add mobile and tablet responsive CSS improvements
- Panel widths are saved to localStorage for persistence

🤖 Generated with Claude Code

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
git push
```

---

## 5. 現在の構成

### データベース
- **プロバイダー**: Neon PostgreSQL (クラウド)
- **レコード数**: 136件
- **PostGIS**: 有効

### ストレージ
- **画像**: Cloudflare R2
- **URL**: `https://pub-63d9f2bae118422fb1ea52e61aaf5ca9.r2.dev`

### ホスティング
- **プラットフォーム**: Vercel
- **リポジトリ**: https://github.com/Nakamichi-Kensuke/road-damage
- **デプロイURL**: (Vercel Dashboard参照)

### 主要ファイル構成
```
dashboard-report13/
├── index.html              # マップ表示 (リサイズパネル対応)
├── search.html             # 損傷検索 (リサイズパネル対応)
├── dashboard.html          # ダッシュボード
├── report.html             # 報告書作成
├── server.js               # Express API (Vercel serverless対応)
├── vercel.json             # Vercel設定
├── .env                    # 環境変数 (Neon DB接続情報)
├── .gitignore              # storage_local/ を除外
├── assets/
│   ├── css/
│   │   └── style.css       # レスポンシブCSS追加
│   └── js/
│       ├── resizable-panels.js      # NEW: パネルリサイズ機能
│       ├── touch-image-modal.js     # NEW: タッチ対応画像モーダル
│       ├── api-client.js
│       ├── damages.js
│       ├── map.js
│       ├── search.js
│       ├── dashboard.js
│       └── report.js
└── package.json
```

---

## 6. トラブルシューティング記録

### 問題1: pg_dump バージョン不一致
**エラー**: `サーバーバージョンの不一致のため処理を中断します`
**解決**: PostgreSQL 18をインストール
```bash
brew install postgresql@18
/opt/homebrew/opt/postgresql@18/bin/pg_dump --version
```

### 問題2: GitHubプッシュ失敗 (大容量ファイル)
**エラー**: `HTTP 400 curl 22 The requested URL returned error: 400`
**解決**: storage_local/ を.gitignoreに追加して履歴から削除

### 問題3: Vercel環境変数のSecret参照エラー
**エラー**: `Environment Variable "DB_HOST" references Secret "db_host", which does not exist`
**解決**: vercel.jsonから`env`セクションを削除、Vercel Dashboardで直接設定

### 問題4: PostGIS関数が見つからない
**エラー**: `error: function st_x(public.geometry) does not exist`
**解決**: すべてのPostGIS関数に`public.`プレフィックスを追加

### 問題5: 認証エラー (DB接続)
**エラー**: `password authentication failed for user 'npg_j3GmftBdFXr5'`
**原因**: DB_USERとDB_PASSWORDの値が逆
**解決**: Vercel環境変数を正しく設定し直し

---

## 7. 今後の拡張案

### 短期的改善
- [ ] オフラインモード対応 (Service Worker)
- [ ] 画像の遅延読み込み (Lazy Loading)
- [ ] PWA対応 (アプリ化)

### 中期的改善
- [ ] ユーザー認証機能
- [ ] リアルタイム通知 (WebSocket)
- [ ] 複数ユーザーでの同時編集

### 長期的改善
- [ ] 機械学習による損傷検出の自動化
- [ ] ドローン撮影データの統合
- [ ] GIS分析機能の追加

---

## 8. 参考資料

### 使用技術
- **フロントエンド**: HTML, CSS (Tailwind), JavaScript
- **バックエンド**: Node.js, Express.js
- **データベース**: PostgreSQL + PostGIS (Neon)
- **ストレージ**: Cloudflare R2
- **ホスティング**: Vercel (Serverless)
- **地図**: Leaflet.js, OpenStreetMap

### 外部サービス
- [Neon PostgreSQL](https://neon.tech/)
- [Cloudflare R2](https://www.cloudflare.com/products/r2/)
- [Vercel](https://vercel.com/)
- [GitHub](https://github.com/)

---

**最終更新**: 2025-12-13
**作成者**: Claude Sonnet 4.5 (Anthropic)
