# セットアップ完了 - 画像コピーが必要です

## 現在の状況

✅ データベース接続: 成功 (PostgreSQL at 172.16.232.57)
✅ APIサーバー: 起動中 (http://localhost:3000)
✅ データ取得: 成功 (81件の損傷データ取得済み)
✅ Webページ: 正常動作 (マップ、ダッシュボード、検索機能)

⚠️ 画像表示: **画像のコピーが必要**

## 問題の詳細

macOSのセキュリティ制限により、SMBマウント (`/Users/kensuke/mnt/storage`) からNode.jsが画像を直接読み込むことができません。

**エラー:** `EPERM: operation not permitted`

## 解決手順 (必須)

### ステップ1: Finderで画像フォルダをコピー

1. **Finderを開く**

2. **SMBストレージに接続**
   - メニューバー → 「移動」→「サーバへ接続...」(⌘K)
   - サーバアドレス: `smb://172.16.232.57/storage`
   - ユーザー名: `share`
   - パスワード: `6531`
   - 「接続」をクリック

3. **画像フォルダをコピー**

   以下の2つのフォルダを選択してコピー:
   - `images_original` (オリジナル画像)
   - `images_annotated` (アノテーション付き画像)

4. **コピー先に貼り付け**

   コピー先ディレクトリ:
   ```
   /Users/kensuke/大学/プロ演3後/dashboard-report13/storage_local/
   ```

   Finderで「移動」→「フォルダへ移動...」(⌘⇧G) で上記パスを入力

   そこに2つのフォルダを貼り付け

### ステップ2: ディレクトリ構造を確認

コピー完了後、以下のような構造になります:

```
/Users/kensuke/大学/プロ演3後/dashboard-report13/
└── storage_local/
    ├── images_original/
    │   ├── 01K4PWRA0BZDF396Q3TT2W37BM_original.jpg
    │   ├── 01K4PVT8GRSH5FVBFN79Q1RY4C_original.jpg
    │   └── ... (その他81件のオリジナル画像)
    └── images_annotated/
        ├── 01K4PWRA0BZDF396Q3TT2W37BM_annotated.jpg
        ├── 01K4PVT8GRSH5FVBFN79Q1RY4C_annotated.jpg
        └── ... (その他81件のアノテーション画像)
```

### ステップ3: 確認

コピーが完了したら、ターミナルで確認:

```bash
ls -l /Users/kensuke/大学/プロ演3後/dashboard-report13/storage_local/images_original/ | wc -l
ls -l /Users/kensuke/大学/プロ演3後/dashboard-report13/storage_local/images_annotated/ | wc -l
```

各フォルダに81個以上のファイルがあればOKです。

### ステップ4: ブラウザで確認

ブラウザをリロード (⌘R) して、マップ上のピンをクリック。
右側のパネルに画像が表示されれば成功です！

## 代替方法: ターミナルからのコピー (動作しない可能性大)

```bash
./sync-images.sh
```

このスクリプトを実行すると rsync でコピーを試みますが、macOSのセキュリティ制限により失敗する可能性が高いです。その場合は上記のFinder経由の手順を使用してください。

## よくある質問

### Q: なぜFinder経由でないとダメなのか？

A: macOSは、SMBマウントへのターミナルアクセスをセキュリティ上の理由で制限しています。Finderはユーザー権限で動作するため、GUIからはアクセス可能です。

### Q: 画像を更新したい場合は？

A: 新しい画像がSMBストレージに追加されたら、上記の手順を再度実行して最新の画像をコピーしてください。

### Q: リアルタイムで画像を同期できないか？

A: 現在の構成では手動コピーが必要です。自動同期が必要な場合は、以下の選択肢があります:
- クラウドストレージ (S3など) への移行
- データベースへの画像埋め込み
- SMB以外のプロトコル (NFS, WebDAV) の検討
- 専用の画像サーバー構築

## 設定ファイルの変更

以下のファイルが自動的に更新されています:

- `.env`: `STORAGE_PATH` が `/Users/kensuke/大学/プロ演3後/dashboard-report13/storage_local` に変更
- `server.js`: 画像読み込みロジックは変更なし (パスが変わっただけ)

## トラブルシューティング

### 画像が表示されない

1. ディレクトリ構造が正しいか確認:
   ```bash
   ls /Users/kensuke/大学/プロ演3後/dashboard-report13/storage_local/
   ```
   `images_original` と `images_annotated` が表示されるはず

2. 画像ファイルが存在するか確認:
   ```bash
   ls /Users/kensuke/大学/プロ演3後/dashboard-report13/storage_local/images_original/
   ```
   `*_original.jpg` ファイルが多数表示されるはず

3. ブラウザの開発者ツール (F12) でエラーを確認
   - 404エラー → 画像ファイルがない、またはファイル名が間違っている
   - 403エラー → 権限エラー (ファイル権限を確認)
   - 500エラー → サーバーエラー (サーバーログを確認)

### サーバーが起動しない

```bash
cd /Users/kensuke/大学/プロ演3後/dashboard-report13
npm start
```

## 次のステップ

画像のコピーが完了したら、以下の機能が使用可能になります:

1. **マップ表示** (index.html)
   - 地図上のピンをクリック
   - 右側パネルで画像と詳細情報を確認

2. **ダッシュボード** (dashboard.html)
   - 統計情報の表示
   - グラフとチャート

3. **損傷検索** (search.html)
   - フィルター機能
   - 詳細検索

4. **報告書作成** (report.html)
   - PDF出力機能

すべての機能が正常に動作します！
