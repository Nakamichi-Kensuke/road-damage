/**
 * タッチ操作対応の画像モーダル
 * ピンチでズーム、ダブルタップでズーム、ドラッグで移動
 */

class TouchImageModal {
  constructor(modalId, imageId) {
    this.modal = document.getElementById(modalId);
    this.image = document.getElementById(imageId);

    if (!this.modal || !this.image) {
      console.error('Modal or image not found:', modalId, imageId);
      return;
    }

    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.lastTapTime = 0;
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    this.lastDistance = 0;
    this.minScale = 1;
    this.maxScale = 5;

    this.init();
  }

  init() {
    // タッチイベント
    this.image.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
    this.image.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
    this.image.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: false });

    // マウスイベント (PC対応)
    this.image.addEventListener('mousedown', this.onMouseDown.bind(this));
    document.addEventListener('mousemove', this.onMouseMove.bind(this));
    document.addEventListener('mouseup', this.onMouseUp.bind(this));

    // ホイールでズーム
    this.image.addEventListener('wheel', this.onWheel.bind(this), { passive: false });

    // モーダルが開いたときにリセット
    const observer = new MutationObserver(() => {
      if (!this.modal.classList.contains('hidden')) {
        this.reset();
      }
    });
    observer.observe(this.modal, { attributes: true, attributeFilter: ['class'] });
  }

  onTouchStart(e) {
    if (e.touches.length === 1) {
      // シングルタッチ: ダブルタップまたはドラッグ開始
      const now = Date.now();
      if (now - this.lastTapTime < 300) {
        // ダブルタップ
        this.handleDoubleTap(e.touches[0]);
        e.preventDefault();
        return;
      }
      this.lastTapTime = now;

      if (this.scale > 1) {
        // ズーム中はドラッグ可能
        this.isDragging = true;
        this.startX = e.touches[0].clientX - this.translateX;
        this.startY = e.touches[0].clientY - this.translateY;
      }
    } else if (e.touches.length === 2) {
      // ピンチズーム開始
      this.lastDistance = this.getDistance(e.touches[0], e.touches[1]);
    }
    e.preventDefault();
  }

  onTouchMove(e) {
    if (e.touches.length === 1 && this.isDragging && this.scale > 1) {
      // ドラッグ
      this.translateX = e.touches[0].clientX - this.startX;
      this.translateY = e.touches[0].clientY - this.startY;
      this.updateTransform();
    } else if (e.touches.length === 2) {
      // ピンチズーム
      const distance = this.getDistance(e.touches[0], e.touches[1]);
      const delta = distance / this.lastDistance;
      this.scale *= delta;
      this.scale = Math.max(this.minScale, Math.min(this.scale, this.maxScale));
      this.lastDistance = distance;
      this.updateTransform();
    }
    e.preventDefault();
  }

  onTouchEnd(e) {
    this.isDragging = false;
    if (this.scale < 1) {
      this.reset();
    }
  }

  onMouseDown(e) {
    if (this.scale > 1) {
      this.isDragging = true;
      this.startX = e.clientX - this.translateX;
      this.startY = e.clientY - this.translateY;
      e.preventDefault();
    }
  }

  onMouseMove(e) {
    if (this.isDragging && this.scale > 1) {
      this.translateX = e.clientX - this.startX;
      this.translateY = e.clientY - this.startY;
      this.updateTransform();
    }
  }

  onMouseUp() {
    this.isDragging = false;
  }

  onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    this.scale *= delta;
    this.scale = Math.max(this.minScale, Math.min(this.scale, this.maxScale));

    if (this.scale === 1) {
      this.translateX = 0;
      this.translateY = 0;
    }

    this.updateTransform();
  }

  handleDoubleTap(touch) {
    if (this.scale === 1) {
      // ズームイン
      this.scale = 2.5;

      // タップ位置を中心にズーム
      const rect = this.image.getBoundingClientRect();
      const x = touch.clientX - rect.left - rect.width / 2;
      const y = touch.clientY - rect.top - rect.height / 2;
      this.translateX = -x * (this.scale - 1);
      this.translateY = -y * (this.scale - 1);
    } else {
      // ズームアウト
      this.reset();
    }
    this.updateTransform();
  }

  getDistance(touch1, touch2) {
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  updateTransform() {
    this.image.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
    this.image.style.transition = 'none';
  }

  reset() {
    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.image.style.transform = '';
    this.image.style.transition = 'transform 0.3s ease';
  }
}

// グローバルに公開
window.TouchImageModal = TouchImageModal;
