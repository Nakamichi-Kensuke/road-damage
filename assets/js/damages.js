/* ===================================================
 * damages.js
 * 概要: アプリケーション全体で使用する損傷データ
 * 機能: APIまたはダミーデータから道路損傷の情報を取得
 * =================================================== */

// グローバル変数として damages を定義（初期値は空配列）
let damages = [];

// APIからデータをロード（非同期）
// この関数は各ページの初期化前に呼び出される
async function initDamages() {
  // api-client.js がロードされているかチェック
  if (typeof loadDamagesFromApi !== 'undefined') {
    try {
      damages = await loadDamagesFromApi();
      console.log(`Loaded ${damages.length} damages from API`);
    } catch (error) {
      console.error('Failed to load damages from API, using fallback data:', error);
      damages = getFallbackDamages();
    }
  } else {
    console.warn('API client not loaded, using fallback data');
    damages = getFallbackDamages();
  }
}

// フォールバックデータ（APIが利用できない場合）
function getFallbackDamages() {
  return [
    {
      "id":"fallback-1",
      "type":"縦状亀裂",
      "vehicle":"A号車",
      "lat":35.5720,
      "lng":139.3680,
      "gps":"35.5720,139.3680",
      "severity":"中",
      "voice":"https://www2.cs.uic.edu/~i101/SoundFiles/StarWars60.wav",
      "voiceText":"今すぐ補修が必要。通学路で通行量が多い。",
      "image":"assets/images/hibiware1.jpg",
      "inspectionTime":"2025-08-05 09:30",
      "patrolTeam":"田中・佐藤",
      "weather":"晴れ",
      "inspectionSection":"○○区間",
      "temporaryRepair":"応急パッチ済",
      "status":"pending",
      "responseDate":"",
      "responseDetails":""
    },
    {
      "id":"fallback-2",
      "type":"ポットホール",
      "vehicle":"B号車",
      "lat":35.5970,
      "lng":139.3470,
      "gps":"35.5970,139.3470",
      "severity":"大",
      "voice":"",
      "voiceText":"穴が深く危険。",
      "image":"assets/images/pottoho-ru1.jpg",
      "inspectionTime":"2025-08-12 14:00",
      "patrolTeam":"鈴木・高橋",
      "weather":"雨",
      "inspectionSection":"△△区間",
      "temporaryRepair":"注意喚起表示設置",
      "status":"pending",
      "responseDate":"",
      "responseDetails":""
    },
    {
      "id":"fallback-3",
      "type":"横状亀裂",
      "vehicle":"C号車",
      "lat":35.5610,
      "lng":139.3930,
      "gps":"35.5610,139.3930",
      "severity":"小",
      "voice":"",
      "voiceText":"通行には影響なし。",
      "image":"assets/images/wadatibore1.jpg",
      "inspectionTime":"2025-09-03 10:15",
      "patrolTeam":"佐藤・小林",
      "weather":"曇り",
      "inspectionSection":"□□区間",
      "temporaryRepair":"特になし",
      "status":"pending",
      "responseDate":"",
      "responseDetails":""
    }
  ];
}