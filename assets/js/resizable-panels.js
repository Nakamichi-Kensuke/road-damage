/**
 * リサイズ可能なパネル機能
 * 左右のパネル間にドラッグ可能な境界線を追加
 */

class ResizablePanels {
  constructor(leftPanelId, rightPanelId, storageKey = 'panel-widths') {
    this.leftPanel = document.getElementById(leftPanelId);
    this.rightPanel = document.getElementById(rightPanelId);
    this.storageKey = storageKey;
    this.isDragging = false;
    this.startX = 0;
    this.startLeftWidth = 0;
    this.startRightWidth = 0;

    if (!this.leftPanel || !this.rightPanel) {
      console.error('Panels not found:', leftPanelId, rightPanelId);
      return;
    }

    this.init();
  }

  init() {
    // 境界線を作成
    this.divider = document.createElement('div');
    this.divider.className = 'panel-divider';
    this.divider.innerHTML = '<div class="panel-divider-handle"></div>';

    // 左パネルの後に境界線を挿入
    this.leftPanel.parentNode.insertBefore(this.divider, this.leftPanel.nextSibling);

    // 保存されている幅を復元
    this.restoreWidths();

    // イベントリスナーを設定
    this.setupEventListeners();
  }

  setupEventListeners() {
    // マウスイベント
    this.divider.addEventListener('mousedown', this.onDragStart.bind(this));
    document.addEventListener('mousemove', this.onDrag.bind(this));
    document.addEventListener('mouseup', this.onDragEnd.bind(this));

    // タッチイベント
    this.divider.addEventListener('touchstart', this.onDragStart.bind(this), { passive: false });
    document.addEventListener('touchmove', this.onDrag.bind(this), { passive: false });
    document.addEventListener('touchend', this.onDragEnd.bind(this));

    // ウィンドウリサイズ時にマップを更新
    window.addEventListener('resize', () => {
      if (window.map && window.map.invalidateSize) {
        window.map.invalidateSize();
      }
    });
  }

  onDragStart(e) {
    e.preventDefault();
    this.isDragging = true;

    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    this.startX = clientX;
    this.startLeftWidth = this.leftPanel.offsetWidth;
    this.startRightWidth = this.rightPanel.offsetWidth;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    this.divider.classList.add('dragging');
  }

  onDrag(e) {
    if (!this.isDragging) return;
    e.preventDefault();

    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const deltaX = clientX - this.startX;

    const containerWidth = this.leftPanel.parentElement.offsetWidth;
    const minWidth = 200; // 最小幅
    const maxLeftWidth = containerWidth - minWidth - 10; // 境界線の幅を考慮

    let newLeftWidth = this.startLeftWidth + deltaX;
    newLeftWidth = Math.max(minWidth, Math.min(newLeftWidth, maxLeftWidth));

    const leftPercent = (newLeftWidth / containerWidth) * 100;
    const rightPercent = 100 - leftPercent;

    this.leftPanel.style.flex = `0 0 ${leftPercent}%`;
    this.rightPanel.style.flex = `0 0 ${rightPercent}%`;

    // Leafletマップのサイズを更新
    if (window.map && window.map.invalidateSize) {
      window.map.invalidateSize();
    }
  }

  onDragEnd() {
    if (!this.isDragging) return;

    this.isDragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    this.divider.classList.remove('dragging');

    // 幅を保存
    this.saveWidths();
  }

  saveWidths() {
    const leftFlex = this.leftPanel.style.flex;
    const rightFlex = this.rightPanel.style.flex;

    localStorage.setItem(this.storageKey, JSON.stringify({
      left: leftFlex,
      right: rightFlex
    }));
  }

  restoreWidths() {
    const saved = localStorage.getItem(this.storageKey);
    if (!saved) return;

    try {
      const { left, right } = JSON.parse(saved);
      if (left && right) {
        this.leftPanel.style.flex = left;
        this.rightPanel.style.flex = right;
      }
    } catch (e) {
      console.error('Failed to restore panel widths:', e);
    }
  }
}

// グローバルに公開
window.ResizablePanels = ResizablePanels;
