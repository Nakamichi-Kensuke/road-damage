const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  client_encoding: 'UTF8',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Database connected successfully at:', res.rows[0].now);
  }
});

// Cloudflare R2 Storage
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

// ===== API Endpoints =====

/**
 * GET /api/damages
 * 損傷レポート一覧取得（ページネーション付き）
 * Query params: page, limit, damage_type, start_date, end_date, min_confidence, sort, order
 */
app.get('/api/damages', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      damage_type,
      start_date,
      end_date,
      min_confidence,
      sort = 'captured_at',
      order = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    const params = [];
    let paramIndex = 1;
    let whereConditions = [];

    // Build WHERE conditions
    if (damage_type) {
      whereConditions.push(`damage_type = $${paramIndex++}`);
      params.push(damage_type);
    }
    if (start_date) {
      whereConditions.push(`captured_at >= $${paramIndex++}`);
      params.push(start_date);
    }
    if (end_date) {
      whereConditions.push(`captured_at <= $${paramIndex++}`);
      params.push(end_date);
    }
    if (min_confidence) {
      whereConditions.push(`confidence >= $${paramIndex++}`);
      params.push(parseFloat(min_confidence));
    }

    const whereClause = whereConditions.length > 0
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    // Count total records
    const countQuery = `SELECT COUNT(*) as total FROM public.damage_reports ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Fetch data with pagination
    const dataQuery = `
      SELECT
        id,
        captured_at,
        damage_type,
        confidence,
        public.ST_X(geom) as longitude,
        public.ST_Y(geom) as latitude,
        altitude,
        speed_kmh,
        voice_memo,
        bbox,
        size
      FROM public.damage_reports
      ${whereClause}
      ORDER BY ${sort} ${order}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(parseInt(limit), offset);

    const result = await pool.query(dataQuery, params);

    // Format response
    const data = result.rows.map(row => ({
      id: row.id,
      captured_at: row.captured_at,
      damage_type: row.damage_type,
      confidence: row.confidence,
      location: {
        latitude: row.latitude,
        longitude: row.longitude,
        altitude: row.altitude
      },
      speed_kmh: row.speed_kmh,
      voice_memo: row.voice_memo,
      bbox: row.bbox,
      size: row.size,
      images: {
        original: `${R2_PUBLIC_URL}/images_original/${row.id}_original.jpg`,
        annotated: `${R2_PUBLIC_URL}/images_annotated/${row.id}_annotated.jpg`
      }
    }));

    res.json({
      success: true,
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching damages:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/damages/nearby
 * 位置情報から近隣の損傷検索
 * Query params: lat (required), lng (required), radius (default: 1000m)
 * NOTE: This must be defined BEFORE /api/damages/:id
 */
app.get('/api/damages/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = 1000, damage_type } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required'
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const radiusMeters = parseFloat(radius);

    if (isNaN(latitude) || isNaN(longitude) || isNaN(radiusMeters)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid parameters'
      });
    }

    const params = [longitude, latitude, longitude, latitude, radiusMeters];
    let damageTypeCondition = '';

    if (damage_type) {
      damageTypeCondition = 'AND damage_type = $6';
      params.push(damage_type);
    }

    const query = `
      SELECT
        id,
        damage_type,
        confidence,
        captured_at,
        public.ST_X(geom) as longitude,
        public.ST_Y(geom) as latitude,
        ST_Distance(
          geom::geography,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
        ) as distance_meters
      FROM public.damage_reports
      WHERE geom IS NOT NULL
        AND ST_DWithin(
          geom::geography,
          ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
          $5
        )
        ${damageTypeCondition}
      ORDER BY distance_meters
    `;

    const result = await pool.query(query, params);

    const data = result.rows.map(row => ({
      id: row.id,
      damage_type: row.damage_type,
      confidence: row.confidence,
      location: {
        latitude: row.latitude,
        longitude: row.longitude
      },
      distance_meters: parseFloat(row.distance_meters).toFixed(1),
      captured_at: row.captured_at
    }));

    res.json({
      success: true,
      data,
      query: {
        latitude,
        longitude,
        radius: radiusMeters
      }
    });
  } catch (error) {
    console.error('Error searching nearby damages:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/damages/stats
 * 統計情報取得
 */
app.get('/api/damages/stats', async (req, res) => {
  try {
    // Get damage type statistics
    const typeStatsQuery = `
      SELECT
        damage_type,
        COUNT(*) as count,
        AVG(confidence) as avg_confidence,
        MIN(captured_at) as first_detected,
        MAX(captured_at) as last_detected
      FROM public.damage_reports
      GROUP BY damage_type
      ORDER BY count DESC
    `;
    const typeStatsResult = await pool.query(typeStatsQuery);

    // Get daily statistics
    const dailyStatsQuery = `
      SELECT
        DATE(captured_at) as date,
        COUNT(*) as count,
        COUNT(DISTINCT damage_type) as damage_types_count
      FROM public.damage_reports
      GROUP BY DATE(captured_at)
      ORDER BY date DESC
      LIMIT 30
    `;
    const dailyStatsResult = await pool.query(dailyStatsQuery);

    // Get total count
    const totalQuery = `SELECT COUNT(*) as total FROM public.damage_reports`;
    const totalResult = await pool.query(totalQuery);

    res.json({
      success: true,
      data: {
        total: parseInt(totalResult.rows[0].total),
        by_type: typeStatsResult.rows,
        by_date: dailyStatsResult.rows
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/damages/:id
 * 特定の損傷レポート詳細取得
 * NOTE: This must be defined AFTER specific routes like /nearby and /stats
 */
app.get('/api/damages/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT
        id,
        captured_at,
        damage_type,
        confidence,
        public.ST_X(geom) as longitude,
        public.ST_Y(geom) as latitude,
        altitude,
        speed_kmh,
        voice_memo,
        bbox,
        raw_json,
        size
      FROM public.damage_reports
      WHERE id = $1
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Damage report not found'
      });
    }

    const row = result.rows[0];
    const data = {
      id: row.id,
      captured_at: row.captured_at,
      damage_type: row.damage_type,
      confidence: row.confidence,
      location: {
        latitude: row.latitude,
        longitude: row.longitude,
        altitude: row.altitude
      },
      speed_kmh: row.speed_kmh,
      voice_memo: row.voice_memo,
      bbox: row.bbox,
      raw_json: row.raw_json,
      size: row.size,
      images: {
        original: `${R2_PUBLIC_URL}/images_original/${row.id}_original.jpg`,
        annotated: `${R2_PUBLIC_URL}/images_annotated/${row.id}_annotated.jpg`
      }
    };

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error fetching damage by id:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/images/:id/:type
 * 画像取得 (original or annotated)
 * ストリーミング方式でSMBストレージから画像を配信
 */
app.get('/api/images/:id/:type', (req, res) => {
  const { id, type } = req.params;

  if (!['original', 'annotated'].includes(type)) {
    return res.status(400).send('Invalid image type');
  }

  // Cloudflare R2の公開URLにリダイレクト
  const folder = `images_${type}`;
  const filename = `${id}_${type}.jpg`;
  const imageUrl = `${R2_PUBLIC_URL}/${folder}/${filename}`;

  res.redirect(imageUrl);
});

/**
 * POST /api/damages
 * 新規損傷レポート登録
 */
app.post('/api/damages', async (req, res) => {
  try {
    const {
      id,
      captured_at,
      damage_type,
      confidence,
      longitude,
      latitude,
      altitude,
      speed_kmh,
      voice_memo,
      bbox,
      raw_json
    } = req.body;

    if (!id || !longitude || !latitude) {
      return res.status(400).json({
        success: false,
        error: 'ID, longitude, and latitude are required'
      });
    }

    const query = `
      INSERT INTO public.damage_reports (
        id, captured_at, damage_type, confidence,
        geom, altitude, speed_kmh,
        voice_memo, bbox, raw_json
      ) VALUES (
        $1, $2, $3, $4,
        ST_SetSRID(ST_MakePoint($5, $6), 4326), $7, $8,
        $9, $10, $11
      )
      RETURNING id
    `;

    const params = [
      id,
      captured_at || new Date(),
      damage_type,
      confidence,
      longitude,
      latitude,
      altitude,
      speed_kmh,
      voice_memo,
      bbox ? JSON.stringify(bbox) : null,
      raw_json ? JSON.stringify(raw_json) : null
    ];

    const result = await pool.query(query, params);

    res.status(201).json({
      success: true,
      data: {
        id: result.rows[0].id
      }
    });
  } catch (error) {
    console.error('Error creating damage report:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Serve HTML files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  pool.end(() => {
    console.log('Database pool closed');
  });
});
