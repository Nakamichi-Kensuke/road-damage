#!/bin/bash
# 画像同期スクリプト
# SMBストレージから画像をローカルにコピーします
# macOSのセキュリティ制限により、FinderまたはGUI経由で実行する必要があります

SOURCE_DIR="/Users/kensuke/mnt/storage"
DEST_DIR="/Users/kensuke/大学/プロ演3後/dashboard-report13/storage_local"

echo "画像同期を開始します..."
echo "Source: $SOURCE_DIR"
echo "Destination: $DEST_DIR"

# ディレクトリ作成
mkdir -p "$DEST_DIR/images_original"
mkdir -p "$DEST_DIR/images_annotated"

# rsyncで画像をコピー（macOSの制限により動作しない可能性があります）
if rsync -av --progress "$SOURCE_DIR/images_original/" "$DEST_DIR/images_original/" 2>/dev/null; then
    echo "✓ オリジナル画像の同期完了"
else
    echo "✗ オリジナル画像の同期失敗 (権限エラーの可能性)"
fi

if rsync -av --progress "$SOURCE_DIR/images_annotated/" "$DEST_DIR/images_annotated/" 2>/dev/null; then
    echo "✓ アノテーション画像の同期完了"
else
    echo "✗ アノテーション画像の同期失敗 (権限エラーの可能性)"
fi

# 同期された画像数を表示
ORIG_COUNT=$(find "$DEST_DIR/images_original" -name "*.jpg" 2>/dev/null | wc -l)
ANNOT_COUNT=$(find "$DEST_DIR/images_annotated" -name "*.jpg" 2>/dev/null | wc -l)

echo ""
echo "同期結果:"
echo "  オリジナル画像: $ORIG_COUNT 枚"
echo "  アノテーション画像: $ANNOT_COUNT 枚"
echo ""
echo "注意: macOSのセキュリティ制限により、ターミナルから同期できない場合は"
echo "      Finderで手動コピーしてください:"
echo "      $SOURCE_DIR/images_* → $DEST_DIR/"
