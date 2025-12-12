# API連携ガイド - 道路損傷検出システム

## 目次
1. [データベース接続情報](#1-データベース接続情報)
2. [ストレージ接続情報](#2-ストレージ接続情報)
3. [データベーステーブル構造](#3-データベーステーブル構造)
4. [API実装時に必要なDB側の準備](#4-api実装時に必要なdb側の準備)
5. [API設計の推奨エンドポイント](#5-api設計の推奨エンドポイント)
6. [API実装時のクエリ例](#6-api実装時のクエリ例)
7. [画像配信方法](#7-画像配信方法)
8. [セキュリティ考慮事項](#8-セキュリティ考慮事項)

---

## 1. データベース接続情報

```
Host: 172.16.232.57
Port: 5432
Database: road_db
User: postgres
Password: 6531Adb
Client Encoding: UTF8
```

### 接続文字列例

**Python (psycopg2)**
```python
import psycopg2

conn = psycopg2.connect(
    host='172.16.232.57',
    port=5432,
    database='road_db',
    user='postgres',
    password='6531Adb',
    client_encoding='UTF8'
)
```

**Node.js (pg)**
```javascript
const { Client } = require('pg');

const client = new Client({
  host: '172.16.232.57',
  port: 5432,
  database: 'road_db',
  user: 'postgres',
  password: '6531Adb',
  client_encoding: 'UTF8'
});

await client.connect();
```

**接続URL形式**
```
postgresql://postgres:6531Adb@172.16.232.57:5432/road_db
```

---

## 2. ストレージ接続情報

### SMB/CIFS接続情報
```
Server: 172.16.232.57
Share: storage
Username: share
Password: 6531
SMB URL: smb://172.16.232.57/storage
```

### マウント方法

**macOS**
```bash
mount_smbfs //share:6531@172.16.232.57/storage /Volumes/storage
```

**Linux**
```bash
sudo mount -t cifs //172.16.232.57/storage /mnt/storage \
  -o username=share,password=6531,vers=3.0
```

**Windows**
```cmd
net use Z: \\172.16.232.57\storage /user:share 6531
```

### ストレージフォルダ構成
```
storage/
├── images_original/     # オリジナル画像
│   └── {detection_id}_original.jpg
└── images_annotated/    # アノテーション付き画像
    └── {detection_id}_annotated.jpg
```

**画像ファイル名例:**
- `01K4PVT8GRSH5FVBFN79Q1RY4C_original.jpg`
- `01K4PVT8GRSH5FVBFN79Q1RY4C_annotated.jpg`

---

## 3. データベーステーブル構造

### テーブル名: `damage_reports`

| カラム名 | 型 | NULL | 説明 |
|---------|-----|------|------|
| `id` | TEXT | NOT NULL | 検出ID（PRIMARY KEY） |
| `captured_at` | TIMESTAMPTZ | YES | 撮影日時 |
| `damage_type` | TEXT | YES | 損傷タイプ（例: クラック、ポットホール） |
| `confidence` | DOUBLE PRECISION | YES | 信頼度（0.0～1.0） |
| `geom` | geometry(Point, 4326) | YES | GPS座標（PostGIS形式） |
| `altitude` | DOUBLE PRECISION | YES | 高度（メートル） |
| `speed_kmh` | DOUBLE PRECISION | YES | 速度（km/h） |
| `image_path` | TEXT | YES | 画像パス（現在未使用） |
| `voice_memo` | TEXT | YES | 音声メモのテキスト |
| `bbox` | JSONB | YES | バウンディングボックス情報 |
| `raw_json` | JSONB | YES | 元のJSON全体 |

### データ例

```json
{
  "id": "01K4PVT8GRSH5FVBFN79Q1RY4C",
  "captured_at": "2025-11-25T15:30:45+09:00",
  "damage_type": "クラック",
  "confidence": 0.92,
  "geom": "POINT(139.7671 35.6812)",
  "altitude": 25.5,
  "speed_kmh": 15.2,
  "voice_memo": "大きなひび割れを発見",
  "bbox": {
    "x": 120,
    "y": 80,
    "width": 200,
    "height": 150
  }
}
```

### bbox（バウンディングボックス）の構造
```json
{
  "x": 100,        // 左上X座標（ピクセル）
  "y": 50,         // 左上Y座標（ピクセル）
  "width": 200,    // 幅（ピクセル）
  "height": 150    // 高さ（ピクセル）
}
```

---

## 4. API実装時に必要なDB側の準備

### 4.1 新規ユーザー作成（推奨）

セキュリティのため、API用の専用ユーザーを作成：

```sql
-- API用読み取り専用ユーザー
CREATE USER api_readonly WITH PASSWORD 'your_secure_password_here';
GRANT CONNECT ON DATABASE road_db TO api_readonly;
GRANT USAGE ON SCHEMA public TO api_readonly;
GRANT SELECT ON damage_reports TO api_readonly;

-- API用読み書きユーザー（データ追加が必要な場合）
CREATE USER api_readwrite WITH PASSWORD 'your_secure_password_here';
GRANT CONNECT ON DATABASE road_db TO api_readwrite;
GRANT USAGE ON SCHEMA public TO api_readwrite;
GRANT SELECT, INSERT, UPDATE ON damage_reports TO api_readwrite;
```

### 4.2 pg_hba.conf設定

PostgreSQLサーバー側で `/etc/postgresql/*/main/pg_hba.conf` を編集：

```conf
# API サーバーのIPアドレスを指定（例: 192.168.1.100）
host    road_db    api_readonly    192.168.1.100/32    md5
host    road_db    api_readwrite   192.168.1.100/32    md5

# または、ネットワーク全体を許可（開発環境の場合）
host    road_db    api_readonly    192.168.1.0/24      md5
host    road_db    api_readwrite   192.168.1.0/24      md5

# 外部から接続する場合（セキュリティ注意）
host    road_db    api_readonly    0.0.0.0/0           md5
```

設定後、PostgreSQLを再起動：
```bash
sudo systemctl reload postgresql
# または
sudo systemctl restart postgresql
```

### 4.3 インデックス作成（パフォーマンス向上）

```sql
-- 日時範囲検索用
CREATE INDEX IF NOT EXISTS idx_damage_reports_captured_at
ON damage_reports(captured_at);

-- 損傷タイプでフィルタ用
CREATE INDEX IF NOT EXISTS idx_damage_reports_damage_type
ON damage_reports(damage_type);

-- 地理空間検索用（PostGIS）- 最も重要
CREATE INDEX IF NOT EXISTS idx_damage_reports_geom
ON damage_reports USING GIST(geom);

-- 複合インデックス（損傷タイプ+日時）
CREATE INDEX IF NOT EXISTS idx_damage_reports_type_time
ON damage_reports(damage_type, captured_at);

-- 信頼度でフィルタ用
CREATE INDEX IF NOT EXISTS idx_damage_reports_confidence
ON damage_reports(confidence);
```

### 4.4 PostGIS拡張機能の確認

地理空間検索を使用するため、PostGISが有効になっていることを確認：

```sql
-- PostGISがインストールされているか確認
SELECT PostGIS_version();

-- もしインストールされていなければ
CREATE EXTENSION IF NOT EXISTS postgis;
```

---

## 5. API設計の推奨エンドポイント

### 基本エンドポイント

| メソッド | エンドポイント | 説明 |
|---------|---------------|------|
| GET | `/api/damages` | 損傷レポート一覧取得（ページネーション付き） |
| GET | `/api/damages/{id}` | 特定の損傷レポート詳細取得 |
| GET | `/api/damages/nearby` | 位置情報から近隣の損傷検索 |
| GET | `/api/damages/stats` | 統計情報取得 |
| GET | `/api/images/{id}/original` | オリジナル画像取得 |
| GET | `/api/images/{id}/annotated` | アノテーション画像取得 |
| POST | `/api/damages` | 新規損傷レポート登録 |
| PUT | `/api/damages/{id}` | 損傷レポート更新 |
| DELETE | `/api/damages/{id}` | 損傷レポート削除 |

### クエリパラメータ例

**GET /api/damages**
```
?page=1              # ページ番号（デフォルト: 1）
&limit=50            # 1ページあたりの件数（デフォルト: 50）
&damage_type=クラック  # 損傷タイプでフィルタ
&start_date=2025-11-01  # 開始日時
&end_date=2025-11-30    # 終了日時
&min_confidence=0.8     # 最小信頼度
&sort=captured_at       # ソート項目
&order=desc            # ソート順（asc/desc）
```

**GET /api/damages/nearby**
```
?lat=35.6812         # 緯度（必須）
&lng=139.7671        # 経度（必須）
&radius=1000         # 半径（メートル、デフォルト: 1000）
&damage_type=クラック  # 損傷タイプでフィルタ（任意）
```

### レスポンス例

**GET /api/damages**
```json
{
  "success": true,
  "data": [
    {
      "id": "01K4PVT8GRSH5FVBFN79Q1RY4C",
      "captured_at": "2025-11-25T15:30:45+09:00",
      "damage_type": "クラック",
      "confidence": 0.92,
      "location": {
        "latitude": 35.6812,
        "longitude": 139.7671,
        "altitude": 25.5
      },
      "speed_kmh": 15.2,
      "voice_memo": "大きなひび割れを発見",
      "bbox": {
        "x": 120,
        "y": 80,
        "width": 200,
        "height": 150
      },
      "images": {
        "original": "/api/images/01K4PVT8GRSH5FVBFN79Q1RY4C/original",
        "annotated": "/api/images/01K4PVT8GRSH5FVBFN79Q1RY4C/annotated"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "pages": 3
  }
}
```

**GET /api/damages/nearby**
```json
{
  "success": true,
  "data": [
    {
      "id": "01K4PVT8GRSH5FVBFN79Q1RY4C",
      "damage_type": "クラック",
      "confidence": 0.92,
      "location": {
        "latitude": 35.6812,
        "longitude": 139.7671
      },
      "distance_meters": 125.5,
      "captured_at": "2025-11-25T15:30:45+09:00"
    }
  ],
  "query": {
    "latitude": 35.6815,
    "longitude": 139.7675,
    "radius": 1000
  }
}
```

---

## 6. API実装時のクエリ例

### 6.1 全件取得（ページネーション付き）

```sql
SELECT
    id,
    captured_at,
    damage_type,
    confidence,
    ST_X(geom) as longitude,
    ST_Y(geom) as latitude,
    altitude,
    speed_kmh,
    voice_memo,
    bbox
FROM damage_reports
ORDER BY captured_at DESC
LIMIT $1 OFFSET $2;
```

**パラメータ:**
- `$1`: LIMIT（件数）
- `$2`: OFFSET（開始位置）

**Python実装例:**
```python
def get_damages(page=1, limit=50):
    offset = (page - 1) * limit
    cursor.execute("""
        SELECT
            id, captured_at, damage_type, confidence,
            ST_X(geom) as longitude,
            ST_Y(geom) as latitude,
            altitude, speed_kmh, voice_memo, bbox
        FROM damage_reports
        ORDER BY captured_at DESC
        LIMIT %s OFFSET %s
    """, (limit, offset))
    return cursor.fetchall()
```

### 6.2 総件数取得

```sql
SELECT COUNT(*) as total FROM damage_reports;
```

### 6.3 位置情報から半径内検索

```sql
SELECT
    id,
    damage_type,
    confidence,
    captured_at,
    ST_X(geom) as longitude,
    ST_Y(geom) as latitude,
    ST_Distance(
        geom::geography,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
    ) as distance_meters
FROM damage_reports
WHERE geom IS NOT NULL
AND ST_DWithin(
    geom::geography,
    ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
    $3
)
ORDER BY distance_meters;
```

**パラメータ:**
- `$1`: 経度 (longitude)
- `$2`: 緯度 (latitude)
- `$3`: 半径（メートル）

**Python実装例:**
```python
def get_nearby_damages(lat, lng, radius=1000):
    cursor.execute("""
        SELECT
            id, damage_type, confidence, captured_at,
            ST_X(geom) as longitude,
            ST_Y(geom) as latitude,
            ST_Distance(
                geom::geography,
                ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography
            ) as distance_meters
        FROM damage_reports
        WHERE geom IS NOT NULL
        AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
            %s
        )
        ORDER BY distance_meters
    """, (lng, lat, lng, lat, radius))
    return cursor.fetchall()
```

### 6.4 損傷タイプ別フィルタ

```sql
SELECT * FROM damage_reports
WHERE damage_type = $1
ORDER BY captured_at DESC
LIMIT $2 OFFSET $3;
```

**パラメータ:**
- `$1`: 損傷タイプ（例: 'クラック'）
- `$2`: LIMIT
- `$3`: OFFSET

### 6.5 日時範囲フィルタ

```sql
SELECT * FROM damage_reports
WHERE captured_at BETWEEN $1 AND $2
ORDER BY captured_at DESC;
```

**パラメータ:**
- `$1`: 開始日時
- `$2`: 終了日時

### 6.6 信頼度フィルタ

```sql
SELECT * FROM damage_reports
WHERE confidence >= $1
ORDER BY confidence DESC, captured_at DESC;
```

**パラメータ:**
- `$1`: 最小信頼度（例: 0.8）

### 6.7 複合フィルタ（損傷タイプ + 日時範囲 + 信頼度）

```sql
SELECT
    id, captured_at, damage_type, confidence,
    ST_X(geom) as longitude,
    ST_Y(geom) as latitude,
    altitude, speed_kmh, voice_memo, bbox
FROM damage_reports
WHERE
    ($1::text IS NULL OR damage_type = $1)
    AND ($2::timestamptz IS NULL OR captured_at >= $2)
    AND ($3::timestamptz IS NULL OR captured_at <= $3)
    AND ($4::double precision IS NULL OR confidence >= $4)
ORDER BY captured_at DESC
LIMIT $5 OFFSET $6;
```

**パラメータ:**
- `$1`: 損傷タイプ（NULL可）
- `$2`: 開始日時（NULL可）
- `$3`: 終了日時（NULL可）
- `$4`: 最小信頼度（NULL可）
- `$5`: LIMIT
- `$6`: OFFSET

### 6.8 統計情報取得

```sql
-- 損傷タイプ別の件数
SELECT
    damage_type,
    COUNT(*) as count,
    AVG(confidence) as avg_confidence,
    MIN(captured_at) as first_detected,
    MAX(captured_at) as last_detected
FROM damage_reports
GROUP BY damage_type
ORDER BY count DESC;
```

```sql
-- 日別の検出件数
SELECT
    DATE(captured_at) as date,
    COUNT(*) as count,
    COUNT(DISTINCT damage_type) as damage_types_count
FROM damage_reports
GROUP BY DATE(captured_at)
ORDER BY date DESC;
```

### 6.9 特定IDの詳細取得

```sql
SELECT
    id,
    captured_at,
    damage_type,
    confidence,
    ST_X(geom) as longitude,
    ST_Y(geom) as latitude,
    altitude,
    speed_kmh,
    voice_memo,
    bbox,
    raw_json
FROM damage_reports
WHERE id = $1;
```

**パラメータ:**
- `$1`: 検出ID

### 6.10 新規レコード挿入

```sql
INSERT INTO damage_reports (
    id, captured_at, damage_type, confidence,
    geom, altitude, speed_kmh,
    voice_memo, bbox, raw_json
) VALUES (
    $1, $2, $3, $4,
    ST_SetSRID(ST_MakePoint($5, $6), 4326), $7, $8,
    $9, $10, $11
);
```

**パラメータ:**
- `$1`: id
- `$2`: captured_at
- `$3`: damage_type
- `$4`: confidence
- `$5`: longitude
- `$6`: latitude
- `$7`: altitude
- `$8`: speed_kmh
- `$9`: voice_memo
- `$10`: bbox (JSON)
- `$11`: raw_json (JSON)

---

## 7. 画像配信方法

### 方法1: 静的ファイル配信（Nginx）

**Nginx設定例:**
```nginx
server {
    listen 80;
    server_name api.example.com;

    # SMBストレージをマウント
    # mount -t cifs //172.16.232.57/storage /mnt/storage -o username=share,password=6531

    location /api/images/ {
        alias /mnt/storage/;

        # セキュリティ設定
        autoindex off;
        add_header Cache-Control "public, max-age=3600";

        # CORS設定
        add_header Access-Control-Allow-Origin "*";
    }
}
```

**URL例:**
- `/api/images/images_original/01K4PVT8GRSH5FVBFN79Q1RY4C_original.jpg`
- `/api/images/images_annotated/01K4PVT8GRSH5FVBFN79Q1RY4C_annotated.jpg`

### 方法2: APIプロキシ経由配信

**Python Flask例:**
```python
from flask import Flask, send_file, abort
import os

app = Flask(__name__)
STORAGE_PATH = '/mnt/storage'

@app.route('/api/images/<detection_id>/<image_type>')
def get_image(detection_id, image_type):
    # image_type: 'original' or 'annotated'
    if image_type not in ['original', 'annotated']:
        abort(400)

    folder = f'images_{image_type}'
    filename = f'{detection_id}_{image_type}.jpg'
    filepath = os.path.join(STORAGE_PATH, folder, filename)

    if not os.path.exists(filepath):
        abort(404)

    return send_file(filepath, mimetype='image/jpeg')
```

**Node.js Express例:**
```javascript
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const STORAGE_PATH = '/mnt/storage';

app.get('/api/images/:id/:type', (req, res) => {
    const { id, type } = req.params;

    if (!['original', 'annotated'].includes(type)) {
        return res.status(400).send('Invalid image type');
    }

    const folder = `images_${type}`;
    const filename = `${id}_${type}.jpg`;
    const filepath = path.join(STORAGE_PATH, folder, filename);

    if (!fs.existsSync(filepath)) {
        return res.status(404).send('Image not found');
    }

    res.sendFile(filepath);
});
```

### 方法3: ダイレクトSMBアクセス（クライアント側）

HTML/JavaScriptから直接SMBにはアクセスできないため、推奨しません。
Webブラウザからは方法1または方法2を使用してください。

---

## 8. セキュリティ考慮事項

### 8.1 認証・認可

#### API Key認証
```python
from flask import request, abort

API_KEYS = {'your-api-key-here', 'another-key'}

def require_api_key(func):
    def wrapper(*args, **kwargs):
        api_key = request.headers.get('X-API-Key')
        if api_key not in API_KEYS:
            abort(401)
        return func(*args, **kwargs)
    return wrapper

@app.route('/api/damages')
@require_api_key
def get_damages():
    # ...
```

#### JWT認証
```python
import jwt
from flask import request, jsonify

SECRET_KEY = 'your-secret-key-here'

def verify_jwt():
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
        return payload
    except:
        abort(401)
```

### 8.2 HTTPS通信の使用

本番環境では必ずHTTPSを使用してください。

**Nginx設定例:**
```nginx
server {
    listen 443 ssl;
    server_name api.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # ...
}
```

### 8.3 SQLインジェクション対策

必ずプリペアドステートメントを使用してください。

**悪い例（脆弱）:**
```python
# ❌ SQLインジェクションの危険
cursor.execute(f"SELECT * FROM damage_reports WHERE id = '{user_input}'")
```

**良い例（安全）:**
```python
# ✅ プリペアドステートメントを使用
cursor.execute("SELECT * FROM damage_reports WHERE id = %s", (user_input,))
```

### 8.4 レート制限

DDoS攻撃を防ぐため、レート制限を実装してください。

**Flask-Limiter例:**
```python
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

limiter = Limiter(
    app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"]
)

@app.route('/api/damages')
@limiter.limit("10 per minute")
def get_damages():
    # ...
```

### 8.5 入力値のバリデーション

すべてのユーザー入力を検証してください。

**Python例:**
```python
from marshmallow import Schema, fields, validate, ValidationError

class NearbyQuerySchema(Schema):
    lat = fields.Float(required=True, validate=validate.Range(min=-90, max=90))
    lng = fields.Float(required=True, validate=validate.Range(min=-180, max=180))
    radius = fields.Integer(validate=validate.Range(min=1, max=50000))

@app.route('/api/damages/nearby')
def get_nearby():
    try:
        args = NearbyQuerySchema().load(request.args)
    except ValidationError as err:
        return jsonify({"error": err.messages}), 400

    # ...
```

### 8.6 データベースユーザーの権限最小化

```sql
-- 読み取り専用ユーザーには、SELECT権限のみ
REVOKE ALL ON damage_reports FROM api_readonly;
GRANT SELECT ON damage_reports TO api_readonly;

-- 書き込みユーザーには、必要な権限のみ
REVOKE ALL ON damage_reports FROM api_readwrite;
GRANT SELECT, INSERT, UPDATE ON damage_reports TO api_readwrite;
-- DELETE権限は付与しない（必要な場合のみ）
```

### 8.7 CORS設定

Webアプリケーションから呼び出す場合、適切なCORS設定が必要です。

**Flask-CORS例:**
```python
from flask_cors import CORS

# すべてのオリジンを許可（開発環境のみ）
CORS(app)

# 特定のオリジンのみ許可（本番環境推奨）
CORS(app, resources={
    r"/api/*": {
        "origins": ["https://yourdomain.com"],
        "methods": ["GET", "POST", "PUT", "DELETE"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})
```

### 8.8 環境変数の使用

パスワードなどの機密情報をコードに直接書かず、環境変数で管理してください。

**Python例:**
```python
import os

DB_CONFIG = {
    'host': os.getenv('DB_HOST', '172.16.232.57'),
    'port': int(os.getenv('DB_PORT', 5432)),
    'database': os.getenv('DB_NAME', 'road_db'),
    'user': os.getenv('DB_USER', 'api_readonly'),
    'password': os.getenv('DB_PASSWORD'),  # 必須
}
```

**.env ファイル:**
```
DB_HOST=172.16.232.57
DB_PORT=5432
DB_NAME=road_db
DB_USER=api_readonly
DB_PASSWORD=your_secure_password
```

### 8.9 エラーメッセージの適切な処理

詳細なエラーメッセージを外部に公開しないでください。

**良い例:**
```python
try:
    result = query_database()
    return jsonify({"success": True, "data": result})
except Exception as e:
    # ログには詳細を記録
    app.logger.error(f"Database error: {str(e)}")

    # クライアントには一般的なメッセージのみ
    return jsonify({
        "success": False,
        "error": "Internal server error"
    }), 500
```

---

## 9. フロントエンド実装例

### 9.1 HTML + JavaScript（Vanilla）

```html
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>道路損傷マップ</title>
    <style>
        .damage-item {
            border: 1px solid #ccc;
            padding: 10px;
            margin: 10px 0;
            border-radius: 5px;
        }
        .damage-item img {
            max-width: 300px;
            height: auto;
        }
    </style>
</head>
<body>
    <h1>道路損傷レポート</h1>
    <div id="damages-list"></div>

    <script>
        const API_BASE_URL = 'http://172.16.232.57:5000/api';

        async function fetchDamages() {
            try {
                const response = await fetch(`${API_BASE_URL}/damages?limit=10`);
                const result = await response.json();

                if (result.success) {
                    displayDamages(result.data);
                }
            } catch (error) {
                console.error('Error fetching damages:', error);
            }
        }

        function displayDamages(damages) {
            const container = document.getElementById('damages-list');
            container.innerHTML = '';

            damages.forEach(damage => {
                const item = document.createElement('div');
                item.className = 'damage-item';
                item.innerHTML = `
                    <h3>${damage.damage_type} (信頼度: ${(damage.confidence * 100).toFixed(1)}%)</h3>
                    <p>検出日時: ${new Date(damage.captured_at).toLocaleString('ja-JP')}</p>
                    <p>位置: ${damage.location.latitude}, ${damage.location.longitude}</p>
                    <p>音声メモ: ${damage.voice_memo || 'なし'}</p>
                    <img src="${API_BASE_URL}/images/${damage.id}/annotated"
                         alt="損傷画像"
                         onerror="this.src='placeholder.jpg'">
                `;
                container.appendChild(item);
            });
        }

        // ページ読み込み時に実行
        fetchDamages();
    </script>
</body>
</html>
```

### 9.2 近隣検索の実装例

```javascript
async function searchNearbyDamages(lat, lng, radius = 1000) {
    try {
        const response = await fetch(
            `${API_BASE_URL}/damages/nearby?lat=${lat}&lng=${lng}&radius=${radius}`
        );
        const result = await response.json();

        if (result.success) {
            console.log(`${result.data.length}件の損傷を発見`);
            return result.data;
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

// 使用例: 現在地から1km以内を検索
navigator.geolocation.getCurrentPosition(async (position) => {
    const damages = await searchNearbyDamages(
        position.coords.latitude,
        position.coords.longitude,
        1000
    );
    displayDamages(damages);
});
```

---

## 10. テスト用データ

### cURLコマンド例

```bash
# 全件取得
curl http://172.16.232.57:5000/api/damages?limit=5

# 特定IDの取得
curl http://172.16.232.57:5000/api/damages/01K4PVT8GRSH5FVBFN79Q1RY4C

# 近隣検索
curl "http://172.16.232.57:5000/api/damages/nearby?lat=35.6812&lng=139.7671&radius=1000"

# 画像取得
curl http://172.16.232.57:5000/api/images/01K4PVT8GRSH5FVBFN79Q1RY4C/original \
  --output image.jpg
```

---

## 付録: 環境別の推奨構成

### 開発環境
- HTTP接続OK
- CORS: すべて許可
- 認証: 簡易的（API Key程度）
- ログ: 詳細に記録

### 本番環境
- HTTPS必須
- CORS: 特定ドメインのみ許可
- 認証: JWT等の堅牢な認証
- レート制限: 有効化
- ログ: エラーのみ記録（個人情報を含めない）
- データベースユーザー: 読み取り専用を使用
- バックアップ: 定期的に実施

---

## お問い合わせ

システムに関する質問や問題が発生した場合は、管理者に連絡してください。

**データベースサーバー:** 172.16.232.57
**管理者:** [連絡先を記載]
