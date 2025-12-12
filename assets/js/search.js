/* ===================================================
 * search.js
 * 概要: 損傷検索ページ (search.html) 用のスクリプト
 * 機能: Leafletマップ、フィルター、検索結果リスト、
 * 損傷詳細カードの表示と連動を制御する。
 * localStorageへの保存・読み込みも行う。
 * =================================================== */

// ★ ===== localStorage 保存・読み込み処理を追加 ===== ★
const SAVED_KEY = 'damagesStatusOverrides';

/**
 * damages.js のデータと localStorage の変更をマージして返す
 * @returns {Array<object>} マージ済み・フィルター済みの損傷データ配列
 */
function getMergedDamages() {
	const currentOverrides = JSON.parse(localStorage.getItem(SAVED_KEY) || '{}');
	// 削除フラグ（deleted: true）が立っているものを除外
	return damages.map(d => ({ ...d, ...(currentOverrides[d.id] || {}) }))
                .filter(d => !(d.deleted === true));
}

/**
 * 変更を localStorage に保存する
 * @param {number} id - 損傷ID
 * @param {object} payload - 保存するデータ
 * @returns {void}
 */
function saveOverride(id, payload) {
  console.log(`[LocalStorage] Saving ID ${id}:`, payload);
  const key = SAVED_KEY;
  const next = { ...(JSON.parse(localStorage.getItem(key) || '{}')) };
  next[id] = { ...(next[id]||{}), ...payload };
  localStorage.setItem(key, JSON.stringify(next));
}
// ★ ===== 処理ここまで ===== ★


// ★ 追加: getStatusLabel 関数を utils.js から移植
/**
 * ステータスのキーから日本語ラベルを取得
 * @param {string} status - ステータスキー
 * @returns {string} 日本語ラベル
 */
function getStatusLabel(status) {
  const labels = {
    'pending': '未対応',
    'in-progress': '対応中',
    'completed': '対応完了',
    'cancelled': '対応不要'
  };
  return labels[status] || '未対応';
}

/**
 * 損傷種別を英語から日本語に変換
 * @param {string} type - 損傷種別（英語）
 * @returns {string} 日本語ラベル
 */
function getDamageTypeLabel(type) {
  const typeMap = {
    'Longitudinal Crack': '縦状亀裂',
    'Transverse Crack': '横状亀裂',
    'Alligator Crack': '網状亀裂',
    'Potholes': 'ポットホール'
  };
  return typeMap[type] || type || '不明';
}

/**
 * ステータスボタンのスタイルを更新
 * @param {string} status - 現在のステータス
 */
function setStatusButtons(status) {
  const buttons = document.querySelectorAll('.search-status-btn');
  buttons.forEach(btn => {
    const active = btn.getAttribute('data-status') === status;
    btn.style.border = active ? '2px solid currentColor' : '1px solid #374151';
    btn.style.background = active ? '#1f2937' : '#111827';
    btn.style.color = active ? '#facc15' : '#f9fafb';
  });

  const responseDateInput = document.getElementById('search-responseDate');
  if (status === 'completed') {
    responseDateInput.removeAttribute('disabled');
  } else {
    responseDateInput.setAttribute('disabled', '');
    responseDateInput.value = '';
  }
}

/**
 * 今日の日付をYYYY-MM-DD形式で返す
 * @returns {string} 今日の日付
 */
function formatToday() {
  const d = new Date();
  const m = ('0' + (d.getMonth() + 1)).slice(-2);
  const day = ('0' + d.getDate()).slice(-2);
  return `${d.getFullYear()}-${m}-${day}`;
}

// ===== 道路損傷検索マップ（search.html用） =====
const selectedDamage = JSON.parse(localStorage.getItem("selectedDamage") || 'null');
const mapCenter = selectedDamage ? [selectedDamage.lat, selectedDamage.lng] : [35.5732, 139.3704];

// 現在表示中の損傷データを保持する変数
let currentDisplayedDamage = null;
let currentDamageId = null;
let currentStatus = 'pending';

const map = L.map('map').setView(mapCenter, 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let markers = {};
let selectedMarker = null;
let selectedResultDiv = null;
const monthFilter = document.getElementById("month-filter");
const severityFilter = document.getElementById("severity-filter");
const typeFilter = document.getElementById("type-filter");
const statusFilter = document.getElementById("status-filter");
const resultList = document.getElementById("result-list");
const resultCount = document.getElementById("result-count");
const resetBtn = document.getElementById("reset-filters");

// ★ 修正: getMergedDamages() を使用
const allDamages = getMergedDamages(); // 最初に1回取得

const monthOptions = [...new Set(allDamages.map(d => d.inspectionTime.substr(0,7)))]
  .sort((a,b) => a < b ? 1 : a > b ? -1 : 0);
monthOptions.forEach(m => { 
  const [year, month] = m.split('-');
  const formatted = `${year}年${parseInt(month,10)}月`;
  const o = document.createElement('option');
  o.value = m;       
  o.textContent = formatted; 
  monthFilter.appendChild(o); 
});

// ★ 修正箇所： sizeに基づいてフィルターオプションを作成
const sizeOrder = { "large": 1, "medium": 2, "small": 3 };
const sizeTextMap = { "large": "大", "medium": "中", "small": "小" };
const uniqueSizes = [...new Set(allDamages.map(d => d.size).filter(s => s != null))]
  .sort((a, b) => (sizeOrder[a] || 99) - (sizeOrder[b] || 99));

// サイズ不明のデータがあれば追加
if (allDamages.some(d => !d.size)) {
  uniqueSizes.push(null);
}

uniqueSizes.forEach(size => {
  const o = document.createElement('option');
  o.value = size || 'null';
  o.textContent = size ? sizeTextMap[size] : 'サイズ不明';
  severityFilter.appendChild(o);
});
// --- 修正ここまで ---

[...new Set(allDamages.map(d => d.type))].forEach(t => { 
  const o = document.createElement('option'); 
  o.textContent = t; 
  typeFilter.appendChild(o); 
});

// ===== 詳細表示関数 =====
function showDetail(d) {
  // 現在表示中の損傷データを保存
  currentDisplayedDamage = d;
  currentDamageId = d.id;
  currentStatus = d.status || 'pending';

  // ★ 1. パネル表示 (マップのコンテナサイズが変わる)
  document.getElementById("damage-card").classList.remove("hidden");
  document.getElementById("no-selection").classList.add("hidden");

  // ★ 2. invalidateSize() を flyTo の前に実行
  if (map.invalidateSize) {
      map.invalidateSize();
  }

  document.getElementById("type").textContent = getDamageTypeLabel(d.type);

  // sizeを日本語に変換
  let sizeText;
  if (d.size === 'large') {
    sizeText = '大';
  } else if (d.size === 'medium') {
    sizeText = '中';
  } else if (d.size === 'small') {
    sizeText = '小';
  } else {
    sizeText = 'サイズ不明';
  }
  document.getElementById("severity").textContent = sizeText;

  document.getElementById("date").textContent = d.inspectionTime;

  // 位置情報の表示
  if (d.lat != null && d.lng != null) {
    document.getElementById("gps").textContent = d.gps;
  } else {
    document.getElementById("gps").textContent = '位置データなし';
  }
  document.getElementById('patrolTeam').textContent = d.patrolTeam || '';
  document.getElementById('vehicle').textContent = d.vehicle || '';
  document.getElementById('weather').textContent = d.weather || '';

  // 画像表示（フォールバック付き）
  const imgEl = document.getElementById('damage-image');
  console.log('[showDetail] Image URL:', d.image);
  if (d.image) {
    // エラーハンドラーを先に設定
    imgEl.onerror = (e) => {
      console.error('[showDetail] Image load error:', e, 'URL:', imgEl.src);
      imgEl.src = 'assets/images/placeholder.png';
    };
    imgEl.onload = () => {
      console.log('[showDetail] Image loaded successfully');
    };

    imgEl.alt = d.type || '損傷画像';
    imgEl.src = d.image;
    imgEl.classList.remove('hidden');
  } else {
    console.warn('[showDetail] No image URL provided');
    imgEl.classList.add('hidden');
  }

  const voice = document.getElementById("voice");
  const voiceSection = voice.closest('.card-section');
  if(d.voice) { 
    voice.src = d.voice; 
    voiceSection.classList.remove('hidden');
  }
  else { 
    voiceSection.classList.add('hidden');
  }

  document.getElementById("voice-text").textContent = d.voiceText;
  const voiceTextSection = document.getElementById("voice-text").closest('.card-section');
  if (d.voiceText) {
    voiceTextSection.classList.remove('hidden');
  } else {
    voiceTextSection.classList.add('hidden');
  }


  // ===== 報告書作成ボタン =====
  const btn = document.getElementById("toReportBtn");
  btn.classList.remove("hidden");
  btn.onclick = () => {
    localStorage.setItem("selectedDamage", JSON.stringify(d));
    window.location.href = "report.html";
  };

  // ===== マップで表示ボタン =====
  const toMap = document.getElementById('toMapBtn');
  if (toMap) {
    toMap.classList.remove("hidden");
    toMap.onclick = () => {
      localStorage.setItem('selectedDamage', JSON.stringify(d));
      window.location.href = 'index.html';
    };
  }

  // ===== 削除ボタン =====
  const deleteBtn = document.getElementById('deleteDamageBtn');
  if (deleteBtn) {
    deleteBtn.classList.remove("hidden");
    deleteBtn.onclick = async () => {
        // ★ 修正: 確認メッセージを変更 (永続化されるため)
        if (confirm('この損傷データを削除しますか？\n（この操作は元に戻せません）')) {
            // ★ 修正: saveOverride を呼び出す
            saveOverride(d.id, { deleted: true });
            
            document.getElementById("damage-card").classList.add("hidden");
            document.getElementById("no-selection").classList.remove("hidden");
            
            btn.classList.add("hidden");
            toMap.classList.add("hidden");
            deleteBtn.classList.add("hidden");

            // ★ パネルを閉じたときにも invalidateSize が必要
            if (map.invalidateSize) {
                map.invalidateSize();
            }
            
            updateDisplay(); 
        }
    };
  }

  // ★ 3. flyTo を実行（位置データがある場合のみ）
  const mapOverlay = document.getElementById('map-overlay');

  if (d.lat != null && d.lng != null) {
    // 位置データあり：オーバーレイを非表示にして地図を表示
    if (mapOverlay) mapOverlay.classList.add('hidden');

    const targetZoom = Math.max(map.getZoom(), 16);
    if (map.flyTo) {
      map.flyTo([d.lat, d.lng], targetZoom, { duration: 0.5 });
    } else {
      map.setView([d.lat, d.lng], targetZoom);
    }

    // 既存の選択マーカー強調を解除
    if (selectedMarker && selectedMarker.setStyle) {
      selectedMarker.setStyle({ radius: 8, weight: 2 });
    }
    // 対象マーカーを強調
    const mk = markers[d.id];
    if (mk && mk.setStyle) {
      mk.setStyle({ radius: 11, weight: 4 });
      selectedMarker = mk;
    }
  } else {
    // 位置データなし：オーバーレイを表示
    if (mapOverlay) mapOverlay.classList.remove('hidden');
  }

  // リスト側の選択ハイライトを更新
  if (selectedResultDiv) selectedResultDiv.classList.remove('selected');
  const div = document.querySelector(`[data-damage-id="${d.id}"]`);
  if (div) { div.classList.add('selected'); selectedResultDiv = div; }

  // 音声メモフィールドを設定
  const searchResponseNotesInput = document.getElementById('search-responseNotes');
  if (searchResponseNotesInput) {
    // 特記事項: ユーザーが入力した値があればそれを、なければDBのボイスメモを表示
    searchResponseNotesInput.value = d.responseNotes || d.voiceText || '';
  }
}

// ===== マーカー表示 & 検索結果リスト =====
function updateDisplay() {
  Object.values(markers).forEach(m => map.removeLayer(m));
  markers = {};
  resultList.innerHTML = '';

  const month = monthFilter.value;
  const severity = severityFilter.value;
  const type = typeFilter.value;
  const status = statusFilter.value;

  // ★ 修正: getMergedDamages() を使用
  const allData = getMergedDamages();

  // フィルター条件に合うすべてのデータ（位置データなしも含む）
  const matched = allData.filter(d => {
    // フィルター条件
    if (month !== '全て' && d.inspectionTime.substr(0,7) !== month) return false;

    // sizeフィルター
    if (severity !== '全て') {
      if (severity === 'null') {
        if (d.size != null) return false;
      } else {
        if (d.size !== severity) return false;
      }
    }

    if (type !== '全て' && d.type !== type) return false;
    if (status !== '全て' && d.status !== status) return false;

    return true;
  });

  if (resultCount) resultCount.textContent = `(${matched.length}件)`;

  matched.forEach(d => {
    // 位置データがある場合のみマーカーを表示
    if (d.lat != null && d.lng != null) {
      // sizeに基づいて色を決定
      let color;
      if (d.size === 'large') {
        color = '#ef4444'; // 赤
      } else if (d.size === 'medium') {
        color = '#f59e0b'; // オレンジ
      } else if (d.size === 'small') {
        color = '#10b981'; // 緑
      } else {
        color = '#6b7280'; // 灰色
      }

      const marker = L.circleMarker([d.lat, d.lng], {
        radius: 8,
        color,
        fillColor: color,
        fillOpacity: 0.8,
        weight: 2
      }).addTo(map);
      marker.on('click', () => showDetail(d));
      markers[d.id] = marker;
    }

    // sizeを日本語に変換
    let sizeText;
    if (d.size === 'large') {
      sizeText = '大';
    } else if (d.size === 'medium') {
      sizeText = '中';
    } else if (d.size === 'small') {
      sizeText = '小';
    } else {
      sizeText = 'サイズ不明';
    }

    const div = document.createElement('div');
    div.className = 'result-item';
    div.textContent = `${getDamageTypeLabel(d.type)} / ${sizeText} / ${d.inspectionTime} / ${getStatusLabel(d.status)}`;
    div.setAttribute('data-damage-id', String(d.id));
    div.onclick = () => {
      showDetail(d);
    };
    resultList.appendChild(div);
    if (selectedDamage && selectedDamage.id === d.id) {
      if (selectedResultDiv) selectedResultDiv.classList.remove('selected');
      div.classList.add('selected');
      selectedResultDiv = div;
    }
  });
}

// ===== イベント =====
[monthFilter, severityFilter, typeFilter, statusFilter].forEach(el => {
  el.addEventListener("change", () => {
    localStorage.setItem("filterMonth", monthFilter.value);
    localStorage.setItem("filterSeverity", severityFilter.value);
    localStorage.setItem("filterType", typeFilter.value);
    localStorage.setItem("filterStatus", statusFilter.value);
    updateDisplay();
  });
});

// 保存されたフィルター復元（データに存在しない値はリセット）
const availableMonths = new Set(monthOptions.map(m => m.value));
const savedMonth = localStorage.getItem("filterMonth");
if (savedMonth && availableMonths.has(savedMonth)) {
  monthFilter.value = savedMonth;
} else {
  monthFilter.value = '全て';
  localStorage.setItem("filterMonth", '全て');
}

const availableSeverities = new Set([...document.querySelectorAll('#severity-filter option')].map(o => o.value));
const savedSeverity = localStorage.getItem("filterSeverity");
if (savedSeverity && availableSeverities.has(savedSeverity)) {
  severityFilter.value = savedSeverity;
} else {
  severityFilter.value = '全て';
  localStorage.setItem("filterSeverity", '全て');
}

const availableTypes = new Set([...document.querySelectorAll('#type-filter option')].map(o => o.value));
const savedType = localStorage.getItem("filterType");
if (savedType && availableTypes.has(savedType)) {
  typeFilter.value = savedType;
} else {
  typeFilter.value = '全て';
  localStorage.setItem("filterType", '全て');
}

const savedStatus = localStorage.getItem("filterStatus");
if (savedStatus && ['全て', 'pending', 'in-progress', 'completed', 'cancelled'].includes(savedStatus)) {
  statusFilter.value = savedStatus;
} else {
  statusFilter.value = '全て';
  localStorage.setItem("filterStatus", '全て');
}

// 初回表示
const allData = getMergedDamages();
const withLocation = allData.filter(d => d.lat != null && d.lng != null);
console.log(`[Search] Total damages: ${allData.length}, With location: ${withLocation.length}, Without location: ${allData.length - withLocation.length}`);
updateDisplay();
if (selectedDamage) {
  // ★ 修正: getMergedDamages() を使用
  const initial = getMergedDamages().find(x => x.id === selectedDamage.id);
  if (initial) {
    const div = document.querySelector(`[data-damage-id="${selectedDamage.id}"]`);
    if (div) {
      div.classList.add('selected');
      selectedResultDiv = div;
      showDetail(initial);
      try { div.scrollIntoView({ block: 'nearest' }); } catch(_) {}
    }
  }
}

// ===== サイドバー折りたたみ =====
const sidebar = document.getElementById("sidebar");
const toggle = document.getElementById("toggleSidebar");
if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    monthFilter.value = '全て';
    severityFilter.value = '全て';
    typeFilter.value = '全て';
    statusFilter.value = '全て';
    localStorage.setItem("filterMonth", '全て');
    localStorage.setItem("filterSeverity", '全て');
    localStorage.setItem("filterType", '全て');
    localStorage.setItem("filterStatus", '全て');
    updateDisplay();
    
    // ★ 修正: リセット時に詳細カードとボタンも非表示にする
    document.getElementById("damage-card").classList.add("hidden");
    document.getElementById("no-selection").classList.remove("hidden");
    document.getElementById("toReportBtn").classList.add("hidden");
    document.getElementById("toMapBtn").classList.add("hidden");
    document.getElementById("deleteDamageBtn").classList.add("hidden");
  });
}
if (localStorage.getItem('sidebarCollapsed') === '1') {
  sidebar.classList.add('sidebar-collapsed');
  document.querySelectorAll('.sidebar-text').forEach(e => e.classList.add('hidden-text'));
}
toggle.addEventListener("click", () => {
  const collapsed = sidebar.classList.toggle("sidebar-collapsed");
  document.querySelectorAll(".sidebar-text").forEach(e => e.classList.toggle("hidden-text"));
  localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0');
  
  // ★ サイドバー開閉時にも invalidateSize が必要
  // CSSアニメーション(width 0.3s)の完了を待つ
  setTimeout(() => {
      if (map.invalidateSize) {
          map.invalidateSize();
      }
  }, 350); // 300ms (CSS) + 50ms バッファ
});

// ===== 音声メモ保存のイベントリスナー =====
const searchSaveStatusBtn = document.getElementById('search-saveStatus');
if (searchSaveStatusBtn) {
  searchSaveStatusBtn.addEventListener('click', async () => {
    if (currentDamageId == null) return;

    const searchResponseNotesInput = document.getElementById('search-responseNotes');

    // 音声メモ（特記事項）のみlocalStorageに保存
    saveOverride(currentDamageId, {
      responseNotes: searchResponseNotesInput ? searchResponseNotesInput.value : '',
    });

    alert('音声メモを保存しました');

    // 現在表示中のデータを再取得して再表示
    const updatedDamage = getMergedDamages().find(x => x.id === currentDamageId);
    if (updatedDamage) {
      showDetail(updatedDamage);
    }
  });
}

// ===== 画像モーダル =====
const imageModal = document.getElementById('image-modal');
const modalImage = document.getElementById('modal-image');
const damageImage = document.getElementById('damage-image');
const closeModalBtn = document.getElementById('close-modal');
const toggleImageBtn = document.getElementById('toggle-image-type');

let isShowingOriginal = false; // 現在表示しているのが元画像かどうか
let currentAnnotatedUrl = '';
let currentOriginalUrl = '';

// 画像クリックでモーダルを開く（アノテーション画像を表示）
damageImage.addEventListener('click', () => {
  console.log('[Modal] Clicked. damageImage.src:', damageImage.src);
  console.log('[Modal] currentDisplayedDamage:', currentDisplayedDamage);
  if (damageImage.src && currentDisplayedDamage) {
    // 最初はアノテーション画像を表示
    currentAnnotatedUrl = damageImage.src;
    currentOriginalUrl = damageImage.src
      .replace('/images_annotated/', '/images_original/')
      .replace('_annotated.jpg', '_original.jpg');

    modalImage.src = currentAnnotatedUrl;
    isShowingOriginal = false;
    toggleImageBtn.textContent = '元画像を表示';
    imageModal.classList.remove('hidden');
  }
});

// 画像タイプ切り替えボタン
toggleImageBtn.addEventListener('click', () => {
  if (isShowingOriginal) {
    // 元画像 → アノテーション画像
    modalImage.src = currentAnnotatedUrl;
    toggleImageBtn.textContent = '元画像を表示';
    isShowingOriginal = false;
  } else {
    // アノテーション画像 → 元画像
    modalImage.src = currentOriginalUrl;
    toggleImageBtn.textContent = 'アノテーション画像を表示';
    isShowingOriginal = true;
  }
  // 切り替え時にズームをリセット
  resetImageZoom();
});

// 閉じるボタンでモーダルを閉じる
closeModalBtn.addEventListener('click', () => {
  imageModal.classList.add('hidden');
  resetImageZoom();
});

// モーダル背景クリックで閉じる
imageModal.addEventListener('click', (e) => {
  if (e.target === imageModal) {
    imageModal.classList.add('hidden');
    resetImageZoom();
  }
});

// ESCキーでモーダルを閉じる
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !imageModal.classList.contains('hidden')) {
    imageModal.classList.add('hidden');
    resetImageZoom();
  }
});

// ===== 画像ズーム・パン機能 =====
let scale = 1;
let translateX = 0;
let translateY = 0;
let isDragging = false;
let startX = 0;
let startY = 0;

function resetImageZoom() {
  scale = 1;
  translateX = 0;
  translateY = 0;
  updateImageTransform();
}

function updateImageTransform() {
  modalImage.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  modalImage.style.cursor = scale > 1 ? 'move' : 'zoom-in';
}

// マウスホイールでズーム
modalImage.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  scale = Math.max(0.5, Math.min(5, scale + delta));
  updateImageTransform();
});

// ダブルクリックでズームイン/リセット
modalImage.addEventListener('dblclick', (e) => {
  e.preventDefault();
  if (scale === 1) {
    scale = 2;
  } else {
    resetImageZoom();
  }
  updateImageTransform();
});

// ドラッグで移動
modalImage.addEventListener('mousedown', (e) => {
  if (scale > 1) {
    isDragging = true;
    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
    modalImage.style.cursor = 'grabbing';
  }
});

document.addEventListener('mousemove', (e) => {
  if (isDragging) {
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
    updateImageTransform();
  }
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    modalImage.style.cursor = scale > 1 ? 'move' : 'zoom-in';
  }
});

// モーダルを開くときにズームをリセット
damageImage.addEventListener('click', () => {
  resetImageZoom();
});