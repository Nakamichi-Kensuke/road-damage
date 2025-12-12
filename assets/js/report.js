/* ===================================================
 * report.js
 * 概要: 報告書作成ページ (report.html) 用のスクリプト
 * 機能: localStorageから選択された損傷データを読み込み、
 * 帳票にデータを埋め込む。
 * PDF生成ボタン (html2canvas, jsPDF) の制御。
 * =================================================== */

window.addEventListener("DOMContentLoaded", () => {
  console.log('[Report] DOMContentLoaded fired');
  const damageJson = localStorage.getItem("selectedDamage");
  console.log('[Report] localStorage raw data:', damageJson);

  const damage = JSON.parse(damageJson);
  console.log('[Report] Parsed damage object:', damage);

  if (!damage) {
    alert("損傷情報が選択されていません。検索ページから選択してください。");
    window.location.href = "search.html";
    return;
  }

  // 英語→日本語マッピング
  const typeNameMap = {
    'Longitudinal Crack': '縦状亀裂',
    'Transverse Crack': '横状亀裂',
    'Alligator Crack': '網状亀裂',
    'Potholes': 'ポットホール'
  };

  // 基本情報
  console.log('[Report] Setting basic info...');
  console.log('[Report] damage.type:', damage.type);
  const damageTypeJp = typeNameMap[damage.type] || damage.type || '不明';
  console.log('[Report] damageTypeJp:', damageTypeJp);

  const rTypeEl = document.getElementById("r-type");
  console.log('[Report] r-type element:', rTypeEl);
  if (rTypeEl) {
    rTypeEl.textContent = damageTypeJp;
    console.log('[Report] r-type set to:', rTypeEl.textContent);
  }

  console.log('[Report] damage.severity:', damage.severity);
  const rSeverityEl = document.getElementById("r-severity");
  if (rSeverityEl) {
    rSeverityEl.textContent = damage.severity || '';
    console.log('[Report] r-severity set to:', rSeverityEl.textContent);
  }

  const rDateEl = document.getElementById("r-date");
  if (rDateEl) {
    rDateEl.textContent = damage.inspectionTime || '';
    console.log('[Report] r-date set to:', rDateEl.textContent);
  }

  const rGpsEl = document.getElementById("r-gps");
  if (rGpsEl) {
    rGpsEl.textContent = damage.gps || '';
    console.log('[Report] r-gps set to:', rGpsEl.textContent);
  }

  // 追加情報
  console.log('[Report] Setting additional info...');
  const rPatrolTeamEl = document.getElementById("r-patrolTeam");
  if (rPatrolTeamEl) {
    rPatrolTeamEl.textContent = damage.patrolTeam || '';
    console.log('[Report] r-patrolTeam set to:', rPatrolTeamEl.textContent);
  }

  const rVehicleEl = document.getElementById("r-vehicle");
  if (rVehicleEl) {
    rVehicleEl.textContent = damage.vehicle || '';
    console.log('[Report] r-vehicle set to:', rVehicleEl.textContent);
  }

  const rWeatherEl = document.getElementById("r-weather");
  if (rWeatherEl) {
    rWeatherEl.textContent = damage.weather || '';
    console.log('[Report] r-weather set to:', rWeatherEl.textContent);
  }

  // ボイスメモ
  console.log('[Report] Setting voice text...');
  const rVoiceTextEl = document.getElementById("r-voiceText");
  if (rVoiceTextEl) {
    rVoiceTextEl.textContent = damage.voiceText || '';
    console.log('[Report] r-voiceText set to:', rVoiceTextEl.textContent);
  }

  // 画像
  const rImage = document.getElementById("r-image");
  console.log('[Report] damage.image:', damage.image);
  if (damage.image) {
    rImage.onerror = (e) => {
      console.error('[Report] Image load error:', e, 'URL:', rImage.src);
      rImage.src = 'assets/images/placeholder.png';
      rImage.alt = "画像の読み込みに失敗しました";
    };
    rImage.onload = () => {
      console.log('[Report] Image loaded successfully');
    };
    rImage.src = damage.image;
  } else {
    console.warn('[Report] No image URL provided');
    rImage.src = "assets/images/placeholder.png";
  }

  // PDF生成
  document.getElementById("pdfBtn").onclick = () => {
    document.getElementById("reportDate").textContent = new Date().toLocaleDateString();  
    const report = document.getElementById("reportContent");
    html2canvas(report, { scale: 3, useCORS: true }).then(canvas => {
      const imgData = canvas.toDataURL("image/png");
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const pdfWidth = pageWidth - 2 * margin;
      const pdfHeight = pageHeight - 2 * margin;
      pdf.addImage(imgData, "PNG", margin, margin, pdfWidth, pdfHeight);
      const safeTs = (damage.inspectionTime || '').replace(/[:\s]/g, '_');
      pdf.save(`road_damage_report_${safeTs}.pdf`);
    });
  };

  // 戻る
  document.getElementById("backBtn").onclick = () => {
    if (window.history.length > 1) window.history.back();
    else window.location.href = "search.html";
  };
});