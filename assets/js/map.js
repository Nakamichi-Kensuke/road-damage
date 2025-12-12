/* ===================================================
 * map.js
 * 概要: マップ表示ページ (index.html) 用のスクリプト
 * 機能: Leafletマップの初期化、フィルター機能、
 * マーカー表示、対応状況パネルの制御
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

// ===== 道路損傷マップ（index.html用） =====

// 選択された損傷があればその位置を中心に、それ以外は相模原市中心
const selectedDamage = JSON.parse(localStorage.getItem("selectedDamage") || 'null');
const mapCenter = selectedDamage ? [selectedDamage.lat, selectedDamage.lng] : [35.5732, 139.3704];

// ===== Leaflet マップ初期化 =====
const map = L.map('map').setView(mapCenter, 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// ===== マーカー管理 =====
let markers = {};
const monthFilter = document.getElementById("month-filter");
const severityFilter = document.getElementById("severity-filter");
const typeFilter = document.getElementById("type-filter");
const statusFilter = document.getElementById("status-filter");

// ===== パネル要素参照 =====
const statusPanel = document.getElementById('status-panel');
const statusMeta = document.getElementById('status-meta');
const responseDateInput = document.getElementById('responseDate');
const responseDetailsInput = document.getElementById('responseDetails');
const responseNotesInput = document.getElementById('responseNotes');
const saveStatusBtn = document.getElementById('saveStatus');
const closeStatusBtn = document.getElementById('closeStatus');
const toSearchBtn = document.getElementById('toSearch');
const deleteDamageBtn = document.getElementById('deleteDamage');
let currentDamageId = null;
let currentStatus = 'pending';
let selectedMarker = null;
let currentDisplayedDamage = null;


function setStatusButtons(status){
	const buttons = document.querySelectorAll('#status-panel .status-btn');
	buttons.forEach(btn => {
		const active = btn.getAttribute('data-status') === status;
		btn.style.border = active ? '2px solid currentColor' : '1px solid #374151';
		btn.style.background = active ? '#1f2937' : '#111827';
		btn.style.color = active ? '#facc15' : '#f9fafb';
	});
	if (status === 'completed') {
		responseDateInput.removeAttribute('disabled');
	} else {
		responseDateInput.setAttribute('disabled','');
		responseDateInput.value = '';
	}
}

function formatToday(){
	const d = new Date();
	const m = ('0' + (d.getMonth()+1)).slice(-2);
	const day = ('0' + d.getDate()).slice(-2);
	return `${d.getFullYear()}-${m}-${day}`;
}

function openStatusPanel(d){
	currentDisplayedDamage = d;
	currentDamageId = d.id;
	currentStatus = d.status || 'pending';

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

    statusMeta.textContent = `#${d.id} ${getDamageTypeLabel(d.type)} / ${sizeText} / ${d.inspectionTime}`;
	responseDateInput.value = d.responseDate || '';
	responseDetailsInput.value = d.responseDetails || '';
	// 特記事項: ユーザーが入力した値があればそれを、なければDBのボイスメモを表示
	responseNotesInput.value = d.responseNotes || d.voiceText || '';
	setStatusButtons(currentStatus);

	// ★ 1. パネル表示 (マップのコンテナサイズが変わる)
    statusPanel.style.display = 'flex'; 

    // ★ 復元： 画像表示ロジック
    const imgEl = document.getElementById('status-image');
    if (imgEl) {
      if (d.image) {
        imgEl.style.display = 'block';
        imgEl.alt = d.type || '損傷画像';
        // エラー時はaltテキストを表示（スペースは維持）
        imgEl.onerror = () => {
          imgEl.alt = '画像読み込みエラー';
          imgEl.onerror = null; // イベントハンドラを削除
          console.warn(`Failed to load image: ${d.image}`);
        };
        imgEl.src = d.image;
      } else {
        imgEl.style.display = 'block';
        imgEl.alt = '画像なし';
        imgEl.src = '';
      }
    }

    // ★ 2. invalidateSize() を flyTo の前に実行
    // これで Leaflet はコンテナサイズが変更されたことを認識する
    if (map.invalidateSize) {
        map.invalidateSize();
    }

	// マーカー強調
	if (selectedMarker && selectedMarker.setStyle) {
		selectedMarker.setStyle({ radius: 8, weight: 2 });
	}
	const mk = markers[d.id];
	if (mk && mk.setStyle) {
		mk.setStyle({ radius: 12, weight: 4 });
		selectedMarker = mk;
	}
  
    // ★ 3. flyTo を実行
    // (invalidateSize により、新しいマップの中心に正しく移動する)
    const targetZoom = Math.max(map.getZoom(), 16);
    if (map.flyTo) {
        map.flyTo([d.lat, d.lng], targetZoom, { duration: 0.5 });
    } else {
        map.setView([d.lat, d.lng], targetZoom);
    }
  
    // ★ 削除： 補正パン (panBy) のロジックは不要
}

// ステータスボタンイベント
if (statusPanel) {
	statusPanel.querySelectorAll('.status-btn').forEach(btn => {
		btn.addEventListener('click', () => {
			currentStatus = btn.getAttribute('data-status');
			setStatusButtons(currentStatus);
		});
	});
	if (saveStatusBtn) {
		saveStatusBtn.addEventListener('click', async () => {
			if (currentDamageId == null) return;
			let dateToSave = responseDateInput.value;
			if (currentStatus === 'completed' && !dateToSave) {
				dateToSave = formatToday();
				responseDateInput.value = dateToSave;
			}
            
            // ★ 修正: saveOverride を呼び出す
            saveOverride(currentDamageId, {
                status: currentStatus,
                responseDate: currentStatus === 'completed' ? dateToSave : '',
                responseDetails: responseDetailsInput.value,
                responseNotes: responseNotesInput.value,
            });
			updateMarkers();
		});
	}
	if (closeStatusBtn) {
		closeStatusBtn.addEventListener('click', () => {
			statusPanel.style.display = 'none';
            // ★ パネルを閉じたときにも invalidateSize が必要
            if (map.invalidateSize) {
                map.invalidateSize();
            }
		});
	}
	if (toSearchBtn) {
		toSearchBtn.addEventListener('click', () => {
			if (currentDamageId == null) return;
            // ★ 修正: getMergedDamages() からデータを取得
			const d = getMergedDamages().find(x => x.id === currentDamageId);
			if (d) {
				localStorage.setItem('selectedDamage', JSON.stringify(d));
				window.location.href = 'search.html';
			}
		});
	}
    if (deleteDamageBtn) {
        deleteDamageBtn.addEventListener('click', async () => {
            if (currentDamageId == null) return;
            // ★ 修正: 確認メッセージを変更 (永続化されるため)
            if (confirm('この損傷データを削除しますか？\n（この操作は元に戻せません）')) {
                // ★ 修正: saveOverride を呼び出す
                saveOverride(currentDamageId, { deleted: true }); 
                
                statusPanel.style.display = 'none';
                // ★ パネルを閉じたときにも invalidateSize が必要
                if (map.invalidateSize) {
                    map.invalidateSize();
                }
                updateMarkers();
            }
        });
    }
}

// ★ 修正: getMergedDamages() を使用
const allDamages = getMergedDamages(); // 最初に一回だけ取得

const monthOptions = [...new Set(allDamages.map(d => (d.inspectionTime || '').substr(0,7)))]
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

// ===== マーカーを更新する関数（最適化版） =====
function updateMarkers() {
  const month = monthFilter.value;
  const severity = severityFilter.value;
  const type = typeFilter.value;
  const status = statusFilter.value;

  // ★ 修正: getMergedDamages() を使用
  const latest = getMergedDamages(); // フィルターのたびに最新を取得

  // フィルタリング条件に合うデータのIDセットを作成
  const visibleIds = new Set(
    latest.filter(d => {
      // 位置データが必須（マップに表示するため）
      if (d.lat == null || d.lng == null) return false;

      // フィルター条件
      if (month !== '全て' && (d.inspectionTime || '').substr(0,7) !== month) return false;

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
    }).map(d => d.id)
  );

  // 不要なマーカーを削除（表示すべきでないもの）
  Object.keys(markers).forEach(id => {
    if (!visibleIds.has(id)) {
      map.removeLayer(markers[id]);
      delete markers[id];
    }
  });

  // 新しいマーカーを追加または更新
  latest.forEach(d => {
    if (!visibleIds.has(d.id)) return; // フィルター条件に合わない場合はスキップ

    // sizeに基づいて色を決定
    let color;
    if (d.size === 'large') {
      color = '#ef4444'; // 赤 (large)
    } else if (d.size === 'medium') {
      color = '#f59e0b'; // オレンジ (medium)
    } else if (d.size === 'small') {
      color = '#10b981'; // 緑 (small)
    } else {
      color = '#6b7280'; // 灰色 (sizeなし)
    }

    // 既存マーカーがあれば色を更新、なければ新規作成
    if (markers[d.id]) {
      markers[d.id].setStyle({ color, fillColor: color });
    } else {
      const marker = L.circleMarker([d.lat, d.lng], {
        radius: 8,
        color,
        fillColor: color,
        fillOpacity: 0.8,
        weight: 2
      }).addTo(map);
      marker.on('click', () => {
        // ★ 修正: getMergedDamages() を使用
        const current = getMergedDamages().find(x => x.id === d.id) || d;
        openStatusPanel(current);
      });
      markers[d.id] = marker;
    }
  });
}

// ===== 詳細ページへ遷移（検索へ） =====
function selectDamage(id) {
  // ★ 修正: getMergedDamages() を使用
  const d = getMergedDamages().find(x => x.id === id);
  if (d) {
    localStorage.setItem("selectedDamage", JSON.stringify(d));
    window.location.href = "search.html";
  }
}

// ===== フィルター変更イベント（既存） =====
[monthFilter, severityFilter, typeFilter, statusFilter].forEach(el => {
  el.addEventListener("change", () => {
    localStorage.setItem("filterMonth", monthFilter.value);
    localStorage.setItem("filterSeverity", severityFilter.value);
    localStorage.setItem("filterType", typeFilter.value);
    localStorage.setItem("filterStatus", statusFilter.value);
    updateMarkers();
  });
});

// ===== リセットボタン機能 =====
const resetBtn = document.getElementById('reset-filters');
if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    if (monthFilter) monthFilter.value = '全て';
    if (severityFilter) severityFilter.value = '全て';
    if (typeFilter) typeFilter.value = '全て';
    if (statusFilter) statusFilter.value = '全て';

    localStorage.setItem("filterMonth", '全て');
    localStorage.setItem("filterSeverity", '全て');
    localStorage.setItem("filterType", '全て');
    localStorage.setItem("filterStatus", '全て');

    if (typeof selectedMarker !== 'undefined' && selectedMarker && selectedMarker.setStyle) {
      selectedMarker.setStyle({ radius: 8, weight: 2 });
      selectedMarker = null;
    }
    const infoPanel = document.getElementById("status-panel");
    if (infoPanel) {
        infoPanel.style.display = "none";
        // ★ パネルを閉じたときにも invalidateSize が必要
        if (map.invalidateSize) {
            map.invalidateSize();
        }
    }

    if (typeof map !== 'undefined' && map.setView) {
      map.setView([35.5732, 139.3704], 13);
    }
    updateMarkers();
  });
}


// ===== 保存されたフィルターを復元（データに存在しない値はリセット） =====
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

// ===== 初期マーカー表示 =====
const allData = getMergedDamages();
const withLocation = allData.filter(d => d.lat != null && d.lng != null);
console.log(`Total damages: ${allData.length}, With location: ${withLocation.length}, Without location: ${allData.length - withLocation.length}`);
updateMarkers();

// 選択済み損傷がある場合、マーカー更新後にパネルを開く
if (selectedDamage) {
    // ★ 修正: getMergedDamages() を使用
	const d = getMergedDamages().find(x => x.id === selectedDamage.id);
	if (d) {
	    openStatusPanel(d);
	}
}

// ===== サイドバー折りたたみ =====
const sidebar = document.getElementById("sidebar");
const toggle = document.getElementById("toggleSidebar");
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

// ===== 画像モーダル =====
const imageModal = document.getElementById('image-modal');
const modalImage = document.getElementById('modal-image');
const statusImage = document.getElementById('status-image');
const closeModalBtn = document.getElementById('close-modal');
const toggleImageBtn = document.getElementById('toggle-image-type');

let isShowingOriginal = false;
let currentAnnotatedUrl = '';
let currentOriginalUrl = '';

// 画像クリックでモーダルを開く（アノテーション画像を表示）
statusImage.addEventListener('click', () => {
  if (statusImage.src && currentDisplayedDamage) {
    currentAnnotatedUrl = statusImage.src;
    currentOriginalUrl = statusImage.src
      .replace('/images_annotated/', '/images_original/')
      .replace('_annotated.jpg', '_original.jpg');

    modalImage.src = currentAnnotatedUrl;
    isShowingOriginal = false;
    toggleImageBtn.textContent = '元画像を表示';
    imageModal.classList.remove('hidden');
    resetImageZoom();
  }
});

// 画像タイプ切り替えボタン
toggleImageBtn.addEventListener('click', () => {
  if (isShowingOriginal) {
    modalImage.src = currentAnnotatedUrl;
    toggleImageBtn.textContent = '元画像を表示';
    isShowingOriginal = false;
  } else {
    modalImage.src = currentOriginalUrl;
    toggleImageBtn.textContent = 'アノテーション画像を表示';
    isShowingOriginal = true;
  }
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