# ストレージセットアップ手順

## 問題

macOSのセキュリティ制限により、ターミナルおよびNode.jsから `/Users/kensuke/mnt/storage` のSMBマウントにアクセスできません。

エラー: `EPERM: operation not permitted`

## 解決方法

画像をローカルディレクトリにコピーして使用します。

### 手順1: Finderで画像をコピー

1. Finderを開く
2. メニューバーから「移動」→「サーバへ接続...」(⌘K)
3. サーバアドレスを入力: `smb://172.16.232.57/storage`
4. ユーザー名: `share`、パスワード: `6531` で接続
5. 以下のフォルダをコピー:
   - `images_original` フォルダ全体
   - `images_annotated` フォルダ全体

6. コピー先: `/Users/kensuke/大学/プロ演3後/dashboard-report13/storage_local/`

### 手順2: ディレクトリ構造の確認

コピー後のディレクトリ構造:

```
/Users/kensuke/大学/プロ演3後/dashboard-report13/
└── storage_local/
    ├── images_original/
    │   ├── 01K4PWRA0BZDF396Q3TT2W37BM_original.jpg
    │   ├── 01K4PVT8GRSH5FVBFN79Q1RY4C_original.jpg
    │   └── ... (その他の画像)
    └── images_annotated/
        ├── 01K4PWRA0BZDF396Q3TT2W37BM_annotated.jpg
        ├── 01K4PVT8GRSH5FVBFN79Q1RY4C_annotated.jpg
        └── ... (その他の画像)
```

### 手順3: サーバーを再起動

画像をコピーした後、サーバーを再起動します:

```bash
# Ctrl+C で既存のサーバーを停止
# その後、再起動
npm start
```

## 代替方法: ターミナルからのコピー (動作しない可能性あり)

```bash
./sync-images.sh
```

このスクリプトは rsync を使用して画像をコピーしようとしますが、macOSのセキュリティ制限により失敗する可能性があります。その場合は上記のFinder経由の手順を使用してください。

## トラブルシューティング

### 「Operation not permitted」エラーが出る

- macOSの「システム環境設定」→「セキュリティとプライバシー」→「プライバシー」タブ
- 「フルディスクアクセス」でターミナルアプリに権限を付与
- ただし、SMBマウントの場合、これでも解決しない場合があります

### Finderでもアクセスできない

1. SMBマウントを再接続:
   ```bash
   umount /Users/kensuke/mnt/storage
   mount_smbfs //share:6531@172.16.232.57/storage /Users/kensuke/mnt/storage
   ```

2. Finderの「サーバへ接続」から再度接続を試みる

## 画像の更新

新しい画像がSMBストレージに追加された場合:

1. 上記の手順1を再度実行して最新の画像をコピー
2. サーバーを再起動 (必要な場合)

## 注意事項

- この方法では、画像のリアルタイム同期はされません
- 定期的に手動で画像をコピーする必要があります
- 本番環境では、より適切なストレージソリューション(例: 直接データベースに画像を保存、S3などのオブジェクトストレージ使用)を検討してください
