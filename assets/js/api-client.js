/* ===================================================
 * api-client.js
 * 概要: バックエンドAPIとの通信を行うクライアントモジュール
 * 機能: データベースからの損傷データ取得、画像URL生成など
 * =================================================== */

const API_BASE_URL = window.location.origin + '/api';

/**
 * APIクライアント
 */
const ApiClient = {
  /**
   * 損傷レポート一覧を取得
   * @param {Object} params - クエリパラメータ
   * @returns {Promise<Object>} APIレスポンス
   */
  async getDamages(params = {}) {
    try {
      const queryString = new URLSearchParams(params).toString();
      const url = `${API_BASE_URL}/damages${queryString ? '?' + queryString : ''}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching damages:', error);
      throw error;
    }
  },

  /**
   * 特定の損傷レポートを取得
   * @param {string} id - 損傷ID
   * @returns {Promise<Object>} APIレスポンス
   */
  async getDamageById(id) {
    try {
      const response = await fetch(`${API_BASE_URL}/damages/${id}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Error fetching damage ${id}:`, error);
      throw error;
    }
  },

  /**
   * 近隣の損傷を検索
   * @param {number} lat - 緯度
   * @param {number} lng - 経度
   * @param {number} radius - 半径（メートル）
   * @param {string} damageType - 損傷タイプ（オプション）
   * @returns {Promise<Object>} APIレスポンス
   */
  async getNearbyDamages(lat, lng, radius = 1000, damageType = null) {
    try {
      const params = { lat, lng, radius };
      if (damageType) {
        params.damage_type = damageType;
      }

      const queryString = new URLSearchParams(params).toString();
      const response = await fetch(`${API_BASE_URL}/damages/nearby?${queryString}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching nearby damages:', error);
      throw error;
    }
  },

  /**
   * 統計情報を取得
   * @returns {Promise<Object>} APIレスポンス
   */
  async getStats() {
    try {
      const response = await fetch(`${API_BASE_URL}/damages/stats`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching stats:', error);
      throw error;
    }
  },

  /**
   * 新規損傷レポートを作成
   * @param {Object} data - 損傷データ
   * @returns {Promise<Object>} APIレスポンス
   */
  async createDamage(data) {
    try {
      const response = await fetch(`${API_BASE_URL}/damages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating damage:', error);
      throw error;
    }
  },

  /**
   * 画像URLを生成（非推奨：APIレスポンスから直接取得することを推奨）
   * @param {string} id - 損傷ID
   * @param {string} type - 画像タイプ ('original' or 'annotated')
   * @returns {string} 画像URL
   */
  getImageUrl(id, type = 'annotated') {
    // APIエンドポイント経由でリダイレクト
    return `${API_BASE_URL}/images/${id}/${type}`;
  }
};

/**
 * データベースのデータをフロントエンド形式に変換
 * @param {Object} dbData - データベースから取得したデータ
 * @returns {Object} フロントエンド形式のデータ
 */
function convertDbToFrontend(dbData) {
  // ローカルストレージから対応状況のオーバーライドを取得
  const SAVED_KEY = 'damagesStatusOverrides';
  const overrides = JSON.parse(localStorage.getItem(SAVED_KEY) || '{}');
  const override = overrides[dbData.id] || {};

  return {
    id: dbData.id,
    type: dbData.damage_type || '不明',
    vehicle: override.vehicle || 'データなし',
    lat: dbData.location.latitude,
    lng: dbData.location.longitude,
    gps: `${dbData.location.latitude},${dbData.location.longitude}`,
    severity: mapConfidenceToSeverity(dbData.confidence),
    size: dbData.size,
    voice: override.voice || '',
    voiceText: dbData.voice_memo || '',
    image: dbData.images?.annotated || ApiClient.getImageUrl(dbData.id, 'annotated'),
    inspectionTime: formatDateTime(dbData.captured_at),
    patrolTeam: override.patrolTeam || 'データなし',
    weather: override.weather || 'データなし',
    inspectionSection: override.inspectionSection || 'データなし',
    temporaryRepair: override.temporaryRepair || 'なし',
    status: override.status || 'pending',
    responseDate: override.responseDate || '',
    responseDetails: override.responseDetails || '',
    responseNotes: override.responseNotes || '',
    confidence: dbData.confidence,
    altitude: dbData.location.altitude,
    speed_kmh: dbData.speed_kmh,
    bbox: dbData.bbox
  };
}

/**
 * 信頼度を大きさに変換
 * @param {number} confidence - 信頼度 (0.0 ~ 1.0)
 * @returns {string} 大きさ ('大', '中', '小')
 */
function mapConfidenceToSeverity(confidence) {
  if (confidence == null) return '小';
  if (confidence >= 0.8) return '大';
  if (confidence >= 0.5) return '中';
  return '小';
}

/**
 * 日時をフォーマット
 * @param {string} dateTime - ISO形式の日時文字列
 * @returns {string} フォーマットされた日時 (YYYY-MM-DD HH:MM)
 */
function formatDateTime(dateTime) {
  if (!dateTime) return '';

  const date = new Date(dateTime);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * データベースから全損傷データを取得してフロントエンド形式に変換
 * @returns {Promise<Array>} フロントエンド形式の損傷データ配列
 */
async function loadDamagesFromApi() {
  try {
    // 全データを取得（ページネーションなし、limit=10000で大量取得）
    const response = await ApiClient.getDamages({ limit: 10000 });

    if (!response.success) {
      console.error('API returned error:', response.error);
      return [];
    }

    // データベースデータをフロントエンド形式に変換
    const damages = response.data.map(convertDbToFrontend);

    // 削除フラグが立っているものを除外
    const SAVED_KEY = 'damagesStatusOverrides';
    const overrides = JSON.parse(localStorage.getItem(SAVED_KEY) || '{}');

    return damages.filter(d => !(overrides[d.id] && overrides[d.id].deleted === true));
  } catch (error) {
    console.error('Error loading damages from API:', error);
    // エラー時は空配列を返す
    return [];
  }
}
