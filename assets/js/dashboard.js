/* ===================================================
 * dashboard.js
 * 概要: ダッシュボードページ (dashboard.html) 用のスクリプト
 * 機能: 損傷データを集計し、統計カード、
 * ドーナツチャート、リストを動的に生成・描画する。
 * localStorageからのデータ読み込みも行う。
 * =================================================== */

// ★ ===== localStorage 読み込み処理を追加 ===== ★
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
// ★ ===== 処理ここまで ===== ★


// ダッシュボード描画
(function(){
  const root = document.getElementById('dashboard-root');
  if(!root) return;

  // ===== データ処理 =====
  const mergedDamages = getMergedDamages(); // ★ 修正: getMergedDamages() を使用
  const getDamagesBySeverity = (sev) => mergedDamages.filter(d => d.severity === sev);
  const getDamagesByType = (type) => mergedDamages.filter(d => d.type === type);

  const high = getDamagesBySeverity('大');
  const mid = getDamagesBySeverity('中');
  const low = getDamagesBySeverity('小');

  // ===== ヘルパー関数 =====
  function h(html){ 
    const t=document.createElement('template'); 
    t.innerHTML=html.trim(); 
    return t.content.firstChild; 
  }

  /**
   * SVGドーナツチャートと凡例を作成する関数 (createElementNS を使用)
   * @param {Array<{label: string, value: number, color: string}>} data - データの配列
   * @param {string} totalLabel - (オプション) チャート中央に表示する合計ラベル
   */
  function createDonutChart(data, totalLabel = '合計') {
    const container = h(`<div class="donut-chart-container"></div>`);
    const inner = h(`<div class="donut-chart-inner"></div>`);
    const legend = h(`<div class="donut-legend"></div>`);
    
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("class", "donut-chart-svg");

    const radius = 40; // 半径
    const circumference = 2 * Math.PI * radius; // 円周
    const strokeWidth = 18; // 線の太さ
    
    let total = 0;
    data.forEach(d => total += d.value);
    
    // 背景の薄い円
    const bgCircle = document.createElementNS(svgNS, "circle");
    bgCircle.setAttribute("r", String(radius));
    bgCircle.setAttribute("cx", "50");
    bgCircle.setAttribute("cy", "50");
    bgCircle.setAttribute("fill", "transparent");
    bgCircle.setAttribute("stroke", "#374151"); 
    bgCircle.setAttribute("stroke-width", String(strokeWidth));
    svg.appendChild(bgCircle);
    
    let offset = 0;
    data.forEach(item => {
      if (item.value <= 0) return;
      
      const percent = item.value / total;
      const dasharray = `${percent * circumference} ${circumference}`;
      
      const segment = document.createElementNS(svgNS, "circle");
      segment.setAttribute("r", String(radius));
      segment.setAttribute("cx", "50");
      segment.setAttribute("cy", "50");
      segment.setAttribute("fill", "transparent");
      segment.setAttribute("stroke", item.color);
      segment.setAttribute("stroke-width", String(strokeWidth));
      segment.setAttribute("stroke-dasharray", dasharray);
      segment.setAttribute("stroke-dashoffset", String(-offset * circumference));
      segment.setAttribute("class", "donut-chart-segment");
      svg.appendChild(segment);
      
      // 凡例
      const legendItem = h(`
        <div class="donut-legend-item">
          <div class="donut-legend-dot" style="background-color: ${item.color};"></div>
          <span class="donut-legend-label">${item.label}</span>
          <span class="donut-legend-value">${item.value}件</span>
        </div>
      `);
      legend.appendChild(legendItem);
      
      offset += percent;
    });
    
    // 中央のテキスト (Total)
    const textTotal = document.createElementNS(svgNS, "text");
    textTotal.setAttribute("x", "50");
    textTotal.setAttribute("y", "50");
    textTotal.setAttribute("dominant-baseline", "central");
    textTotal.setAttribute("text-anchor", "middle");
    textTotal.setAttribute("font-size", "18");
    textTotal.setAttribute("font-weight", "bold");
    textTotal.setAttribute("fill", "#f9fafb"); 
    textTotal.setAttribute("class", "donut-chart-text");
    textTotal.textContent = String(total);
    svg.appendChild(textTotal);

    // 中央のテキスト (Label)
    const textLabel = document.createElementNS(svgNS, "text");
    textLabel.setAttribute("x", "50");
    textLabel.setAttribute("y", "65");
    textLabel.setAttribute("dominant-baseline", "central");
    textLabel.setAttribute("text-anchor", "middle");
    textLabel.setAttribute("font-size", "10");
    textLabel.setAttribute("fill", "#9ca3af"); 
    textLabel.setAttribute("class", "donut-chart-text");
    textLabel.textContent = totalLabel;
    svg.appendChild(textLabel);

    inner.appendChild(svg);
    inner.appendChild(legend);
    container.appendChild(inner);
    return container;
  }

  // ===== 1. ヘッダー =====
  root.appendChild(h(`
    <div class="fade-in">
      <h1 class="text-2xl font-bold text-gray-100">道路管理ダッシュボード</h1>
      <p class="text-gray-300 mt-1">道路損傷の状況と統計情報を表示します。</p>
    </div>
  `));

  // ===== 2. 統計サマリー (Stats) =====
  const completedCount = mergedDamages.filter(d => d.status === 'completed').length;
  const completionRate = mergedDamages.length ? Math.round((completedCount / mergedDamages.length) * 100) : 0;

  const stats = [
    { label: '総損傷数', value: mergedDamages.length, borderColor: 'border-blue-500', description: '全損傷の合計' },
    { label: '高緊急度 (大)', value: high.length, borderColor: 'border-red-500', description: '即時対応が必要' },
    { label: '中緊急度 (中)', value: mid.length, borderColor: 'border-orange-500', description: '計画的な対応が必要' },
    { label: '低緊急度 (小)', value: low.length, borderColor: 'border-green-500', description: '監視継続' },
    { label: '対応率', value: completionRate + '%', borderColor: 'border-emerald-500', description: `完了 ${completedCount}件` }, 
  ];
  
  const statsGrid = h(`<div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4"></div>`);
  stats.forEach((stat, i) => {
    statsGrid.appendChild(h(`
      <div class="bg-gray-800 rounded-lg shadow-lg p-4 border-l-4 ${stat.borderColor} hover:bg-gray-700 transition-colors fade-in delay-${i+1}">
        <p class="text-gray-400 text-xs mb-0">${stat.label}</p>
        <p class="text-2xl font-bold text-white">${stat.value}</p>
        <p class="text-xs text-gray-500 mt-1">${stat.description}</p>
      </div>
    `));
  });
  root.appendChild(statsGrid);

  // ===== 3. 分析セクション (チャート類) =====
  const analysisGrid = h(`<div class="grid grid-cols-1 lg:grid-cols-3 gap-4"></div>`);

  // --- 3a. 損傷種別 (ドーナツ) ---
  const typeMap = [
    { type: 'Longitudinal Crack', label: '縦状亀裂', color: '#3b82f6' }, // blue-500
    { type: 'Potholes', label: 'ポットホール', color: '#ef4444' }, // red-500
    { type: 'Transverse Crack', label: '横状亀裂', color: '#f97316' }, // orange-500
    { type: 'Alligator Crack', label: '網状亀裂', color: '#a855f7' }, // purple-500
  ];
  const typeData = typeMap.map(t => ({
      label: t.label,
      value: getDamagesByType(t.type).length,
      color: t.color
    })).filter(d => d.value > 0);

  const typeCard = h(`<div class="bg-gray-800 rounded-xl shadow-lg p-4 fade-in delay-5"></div>`);
  typeCard.appendChild(h(`<h2 class="text-lg font-bold text-white mb-3">損傷種別分布</h2>`));
  typeCard.appendChild(createDonutChart(typeData, '種別'));
  analysisGrid.appendChild(typeCard);

  // --- 3b. 対応状況 (ドーナツ) ---
  const statusMap = [
    { key: 'pending', label: '未対応', color: '#6b7280' }, // gray-500
    { key: 'in-progress', label: '対応中', color: '#3b82f6' }, // blue-500
    { key: 'completed', label: '対応完了', color: '#22c55e' }, // green-500
    { key: 'cancelled', label: '対応不要', color: '#ef4444' }, // red-500
  ];
  const statusCounts = mergedDamages.reduce((acc, d) => {
      acc[d.status] = (acc[d.status] || 0) + 1; 
      return acc; 
  }, {});
  const statusData = statusMap.map(s => ({
    label: s.label,
    value: statusCounts[s.key] || 0,
    color: s.color
  })).filter(d => d.value > 0);
  
  const statusCard = h(`<div class="bg-gray-800 rounded-xl shadow-lg p-4 fade-in delay-6"></div>`);
  statusCard.appendChild(h(`<h2 class="text-lg font-bold text-white mb-3">対応状況内訳</h2>`));
  statusCard.appendChild(createDonutChart(statusData, '状況'));
  analysisGrid.appendChild(statusCard);

  // --- 3c. 月別推移 (リスト) ---
  const monthlyData = mergedDamages.reduce((acc, d) => {
    const m = d.inspectionTime.substring(0,7);
    acc[m] = (acc[m] || 0) + 1;
    return acc;
  }, {});
  const monthlyTrend = Object.entries(monthlyData)
    .sort((a,b) => a[0].localeCompare(b[0]))
    .map(([month, count]) => ({ month, count }));
  const maxMonthly = Math.max(...monthlyTrend.map(d => d.count), 1);

  const trendCard = h(`<div class="bg-gray-800 rounded-xl shadow-lg p-4 fade-in delay-7"></div>`);
  trendCard.appendChild(h(`<h2 class="text-lg font-bold text-white mb-3">月別 損傷発生推移</h2>`));
  const trendListEl = h(`<div class="space-y-2 max-h-[240px] overflow-y-auto pr-2"></div>`);
  monthlyTrend.forEach(item => {
    const width = Math.round((item.count / maxMonthly) * 100);
    trendListEl.appendChild(h(`
      <div class="flex items-center justify-between">
        <span class="text-sm text-gray-400">${item.month}</span>
        <div class="flex items-center gap-2">
          <div class="w-24 md:w-32 bg-gray-700 rounded-full h-2">
            <div class="bg-blue-500 h-2 rounded-full" style="width:${width}%"></div>
          </div>
          <span class="text-sm font-medium text-white w-8 text-right">${item.count}</span>
        </div>
      </div>
    `));
  });
  trendCard.appendChild(trendListEl);
  analysisGrid.appendChild(trendCard);
  
  root.appendChild(analysisGrid);

  // ===== 4. 緊急対応リスト (大) =====
  const urgentCard = h(`<div class="bg-gray-800 rounded-xl shadow-lg p-4 fade-in delay-8 border border-gray-700"></div>`);
  urgentCard.appendChild(h(`<h2 class="text-lg font-bold text-red-400 mb-3">緊急対応が必要な損傷 (大)</h2>`));
  const urgentGrid = h(`<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[250px] overflow-y-auto pr-2"></div>`);
  
  if (high.length > 0) {
    high.forEach(d => {
      const tile = h(`
        <div class="bg-gray-900 rounded-lg p-3 border border-gray-700 cursor-pointer hover:bg-gray-700" data-damage-id="${d.id}">
          <div class="flex items-center justify-between mb-1">
            <span class="font-medium text-white text-sm truncate">${d.type}</span>
            <span class="px-2 py-1 text-xs font-medium rounded-full bg-red-200 text-red-900">大</span>
          </div>
          <p class="text-xs text-gray-400 mb-1 truncate">${d.voiceText || '（音声メモなし）'}</p>
          <div class="flex items-center justify-between text-xs text-gray-500">
            <span>${d.inspectionTime}</span>
            <span>${d.patrolTeam || ''}</span>
          </div>
        </div>
      `);
      tile.addEventListener('click', () => {
        localStorage.setItem('selectedDamage', JSON.stringify(d));
        window.location.href = 'search.html';
      });
      urgentGrid.appendChild(tile);
    });
  } else {
    urgentGrid.appendChild(h(`<p class="text-gray-400 p-4">現在、緊急対応が必要な損傷はありません。</p>`));
  }
  urgentCard.appendChild(urgentGrid);
  root.appendChild(urgentCard);

  // ===== 5. 最近の損傷報告 (リスト) =====
  // ★ 修正: アニメーションクラスを 'fade-in delay-8' に修正
  const recentCard = h(`<div class="bg-gray-800 rounded-xl shadow-lg p-4 border border-gray-700 fade-in delay-8"></div>`);
  recentCard.appendChild(h(`<h2 class="text-lg font-bold text-white mb-3">最近の損傷報告</h2>`));
  const recentList = h(`<div class="space-y-2"></div>`);
  
  const recent = [...mergedDamages]
    .sort((a,b) => new Date(b.inspectionTime).getTime() - new Date(a.inspectionTime).getTime())
    .slice(0,5);

  recent.forEach(d => {
    const sevBadge = d.severity === '大' ? 'bg-red-200 text-red-900' : d.severity === '中' ? 'bg-orange-200 text-orange-900' : 'bg-green-200 text-green-900';
    const card = h(`
      <div class="flex items-center justify-between p-3 bg-gray-900 rounded-lg cursor-pointer hover:bg-gray-700" data-damage-id="${d.id}">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <span class="px-2 py-1 text-xs font-medium rounded-full ${sevBadge}">${d.severity}</span>
            <span class="font-medium text-white text-sm">${d.type}</span>
          </div>
          <div class="flex items-center gap-3 text-xs text-gray-400">
            <div class="flex items-center gap-1">${d.inspectionTime}</div>
            <div class="flex items-center gap-1">${d.patrolTeam || ''}</div>
          </div>
        </div>
        <div class="text-right">
          <p class="text-xs text-gray-400">${d.vehicle || ''}</p>
          <p class="text-xs text-gray-500">${d.weather || ''}</p>
        </div>
      </div>
    `);
    card.addEventListener('click', () => {
      localStorage.setItem('selectedDamage', JSON.stringify(d));
      window.location.href = 'search.html';
    });
    recentList.appendChild(card);
  });
  recentCard.appendChild(recentList);
  root.appendChild(recentCard);


  // ===== サイドバー制御 =====
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('toggleSidebar');
  if (localStorage.getItem('sidebarCollapsed') === '1') {
    sidebar.classList.add('sidebar-collapsed');
    document.querySelectorAll('.sidebar-text').forEach(e => e.classList.add('hidden-text'));
  }
  toggle.addEventListener('click', () => {
    const collapsed = sidebar.classList.toggle('sidebar-collapsed');
    document.querySelectorAll('.sidebar-text').forEach(e => e.classList.toggle('hidden-text'));
    localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0');
  });
})();