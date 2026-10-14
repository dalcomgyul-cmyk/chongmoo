const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const session = require('express-session');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'chongmoo-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8, httpOnly: true, secure: false }
}));

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    next();
  } else {
    res.status(401).json({ error: 'unauthorized' });
  }
}

app.use(express.static('public', {
  index: 'index.html',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('admin.html')) {
      res.setHeader('x-admin-protected', 'true');
    }
  }
}));

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});
// 로그인 시도 횟수 제한
const loginAttempts = new Map();

function checkLoginLimit(ip) {
  const now = Date.now();
  const attempts = loginAttempts.get(ip) || { count: 0, resetAt: now + 60000 };
  if (now > attempts.resetAt) {
    attempts.count = 0;
    attempts.resetAt = now + 60000;
  }
  attempts.count++;
  loginAttempts.set(ip, attempts);
  return attempts.count <= 5; // 1분에 5회 제한
}
// ===== 관리자 로그인 =====
app.post('/api/admin/login', async (req, res) => {
  const ip = req.ip;
  if (!checkLoginLimit(ip)) {
    return res.status(429).json({ error: '너무 많은 시도입니다. 잠시 후 다시 시도해주세요.' });
  }
  const { password } = req.body;
  try {
    const [rows] = await pool.query(
      "SELECT setting_value FROM settings WHERE setting_key = 'admin_password'"
    );
    const adminPassword = rows[0]?.setting_value || process.env.ADMIN_PASSWORD;
    if (password === adminPassword) {
      req.session.isAdmin = true;
      res.json({ success: true });
    } else {
      res.status(401).json({ error: '비밀번호가 틀렸어요!' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/change-password', async (req, res) => {
  if (!req.session || !req.session.isAdmin) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const { currentPassword, newPassword } = req.body;
  try {
    const [rows] = await pool.query(
      "SELECT setting_value FROM settings WHERE setting_key = 'admin_password'"
    );
    const adminPassword = rows[0]?.setting_value || '04010502';
    if (currentPassword !== adminPassword) {
      return res.status(401).json({ error: '현재 비밀번호가 틀렸어요!' });
    }
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ error: '새 비밀번호는 4자 이상이어야 해요!' });
    }
    await pool.query(
      "UPDATE settings SET setting_value = ? WHERE setting_key = 'admin_password'",
      [newPassword]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/admin/check', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

app.post('/api/admin/change-password', (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!req.session || !req.session.isAdmin) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (currentPassword !== req.session.adminPassword && currentPassword !== '04010502') {
    return res.status(401).json({ error: '현재 비밀번호가 틀렸어요!' });
  }
  req.session.adminPassword = newPassword;
  res.json({ success: true });
});

app.get('/admin.html', (req, res) => {
  if (req.session && req.session.isAdmin) {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  } else {
    res.redirect('/?unauthorized=true');
  }
});

// ===== 팀 & 멤버 =====
app.get('/api/members', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT m.id, m.name, m.rank, m.workplace, t.name as team_name
      FROM members m
      LEFT JOIN teams t ON m.team_id = t.id
      ORDER BY t.id, m.id
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/members', async (req, res) => {
  const { team_id, name, rank, workplace } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO members (team_id, name, rank, workplace) VALUES (?, ?, ?, ?)',
      [team_id, name, rank, workplace]
    );
    res.json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/events/:id', async (req, res) => {
  const { title, restaurant, restaurant_url, restaurant_address, is_coffee_enabled, is_closed } = req.body;
  try {
    await pool.query(
      'UPDATE events SET title=?, restaurant=?, restaurant_url=?, restaurant_address=?, is_coffee_enabled=?, is_closed=? WHERE id=?',
      [title, restaurant, restaurant_url, restaurant_address, is_coffee_enabled, is_closed, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/members/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM members WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 팀 =====
app.get('/api/teams', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM teams ORDER BY id');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/teams', async (req, res) => {
  const { name } = req.body;
  try {
    const [result] = await pool.query('INSERT INTO teams (name) VALUES (?)', [name]);
    res.json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/teams/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM teams WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 이벤트 =====
app.get('/api/events/latest', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM events ORDER BY created_at DESC LIMIT 1');
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/events', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM events ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/events', async (req, res) => {
  const { title, restaurant, restaurant_url, restaurant_address, is_coffee_enabled } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO events (title, restaurant, restaurant_url, restaurant_address, is_coffee_enabled) VALUES (?, ?, ?, ?, ?)',
      [title, restaurant, restaurant_url, restaurant_address, is_coffee_enabled]
    );
    const eventId = result.insertId;
    const [defaults] = await pool.query('SELECT * FROM default_coffee_menus ORDER BY sort_order');
    for (const menu of defaults) {
      await pool.query('INSERT INTO coffee_menus (event_id, name) VALUES (?, ?)', [eventId, menu.name]);
    }
    res.json({ id: eventId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM responses WHERE event_id = ?', [req.params.id]);
    await pool.query('DELETE FROM coffee_menus WHERE event_id = ?', [req.params.id]);
    await pool.query('DELETE FROM events WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 커피 메뉴 =====
app.get('/api/coffee-menus/:eventId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM coffee_menus WHERE event_id = ?',
      [req.params.eventId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/coffee-menus', async (req, res) => {
  const { event_id, name } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO coffee_menus (event_id, name) VALUES (?, ?)',
      [event_id, name]
    );
    res.json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/coffee-menus/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM coffee_menus WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 기본 커피 메뉴 =====
app.get('/api/default-coffee-menus', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM default_coffee_menus ORDER BY sort_order');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/default-coffee-menus', async (req, res) => {
  const { name } = req.body;
  try {
    const [rows] = await pool.query('SELECT MAX(sort_order) as max FROM default_coffee_menus');
    const nextOrder = (rows[0].max || 0) + 1;
    const [result] = await pool.query(
      'INSERT INTO default_coffee_menus (name, sort_order) VALUES (?, ?)',
      [name, nextOrder]
    );
    res.json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/default-coffee-menus/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM default_coffee_menus WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 커스텀 항목 =====
app.get('/api/custom-fields/:eventId', async (req, res) => {
  try {
    const [fields] = await pool.query(
      'SELECT * FROM custom_fields WHERE event_id = ? ORDER BY sort_order',
      [req.params.eventId]
    );
    for (const field of fields) {
      const [options] = await pool.query(
        'SELECT * FROM custom_field_options WHERE field_id = ? ORDER BY sort_order',
        [field.id]
      );
      field.options = options;
    }
    res.json(fields);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/custom-fields', async (req, res) => {
  const { event_id, field_name } = req.body;
  try {
    const [rows] = await pool.query(
      'SELECT MAX(sort_order) as max FROM custom_fields WHERE event_id = ?',
      [event_id]
    );
    const nextOrder = (rows[0].max || 0) + 1;
    const [result] = await pool.query(
      'INSERT INTO custom_fields (event_id, field_name, sort_order) VALUES (?, ?, ?)',
      [event_id, field_name, nextOrder]
    );
    res.json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/custom-fields/:id', async (req, res) => {
  try {
    const [options] = await pool.query(
      'SELECT id FROM custom_field_options WHERE field_id = ?',
      [req.params.id]
    );
    for (const opt of options) {
      await pool.query('DELETE FROM custom_responses WHERE option_id = ?', [opt.id]);
    }
    await pool.query('DELETE FROM custom_field_options WHERE field_id = ?', [req.params.id]);
    await pool.query('DELETE FROM custom_fields WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/custom-field-options', async (req, res) => {
  const { field_id, option_name } = req.body;
  try {
    const [rows] = await pool.query(
      'SELECT MAX(sort_order) as max FROM custom_field_options WHERE field_id = ?',
      [field_id]
    );
    const nextOrder = (rows[0].max || 0) + 1;
    const [result] = await pool.query(
      'INSERT INTO custom_field_options (field_id, option_name, sort_order) VALUES (?, ?, ?)',
      [field_id, option_name, nextOrder]
    );
    res.json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/custom-field-options/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM custom_responses WHERE option_id = ?', [req.params.id]);
    await pool.query('DELETE FROM custom_field_options WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/custom-responses', async (req, res) => {
  const { event_id, member_id, field_id, option_id } = req.body;
  try {
    await pool.query(`
      INSERT INTO custom_responses (event_id, member_id, field_id, option_id)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE option_id = VALUES(option_id)
    `, [event_id, member_id, field_id, option_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/custom-responses/:eventId/:memberId', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT cr.*, cfo.option_name, cf.field_name
      FROM custom_responses cr
      JOIN custom_field_options cfo ON cr.option_id = cfo.id
      JOIN custom_fields cf ON cr.field_id = cf.id
      WHERE cr.event_id = ? AND cr.member_id = ?
    `, [req.params.eventId, req.params.memberId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/custom-responses/:eventId', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT cr.*, cfo.option_name, cf.field_name, m.name as member_name
      FROM custom_responses cr
      JOIN custom_field_options cfo ON cr.option_id = cfo.id
      JOIN custom_fields cf ON cr.field_id = cf.id
      JOIN members m ON cr.member_id = m.id
      WHERE cr.event_id = ?
    `, [req.params.eventId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 응답 =====
app.get('/api/responses/:eventId', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT r.*, m.name as member_name, m.rank, m.workplace,
             t.name as team_name, c.name as coffee_name
      FROM responses r
      JOIN members m ON r.member_id = m.id
      LEFT JOIN teams t ON m.team_id = t.id
      LEFT JOIN coffee_menus c ON r.coffee_menu_id = c.id
      WHERE r.event_id = ?
      ORDER BY t.id, m.id
    `, [req.params.eventId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/responses', async (req, res) => {
  const { event_id, member_id, is_attending, coffee_menu_id, hot_ice, note } = req.body;
  try {
    await pool.query(`
      INSERT INTO responses (event_id, member_id, is_attending, coffee_menu_id, hot_ice, note)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        is_attending = VALUES(is_attending),
        coffee_menu_id = VALUES(coffee_menu_id),
        hot_ice = VALUES(hot_ice),
        note = VALUES(note)
    `, [event_id, member_id, is_attending, coffee_menu_id, hot_ice, note]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 배차 =====
app.get('/api/dispatches/:eventId', async (req, res) => {
  try {
    const [dispatches] = await pool.query(
      'SELECT * FROM dispatches WHERE event_id = ? ORDER BY created_at DESC',
      [req.params.eventId]
    );
    const result = [];
    for (const dispatch of dispatches) {
      const [cars] = await pool.query(
        `SELECT dc.*, m.name as driver_name, m.rank as driver_rank
         FROM dispatch_cars dc
         JOIN members m ON dc.driver_member_id = m.id
         WHERE dc.dispatch_id = ?`,
        [dispatch.id]
      );
      const carsWithPassengers = [];
      for (const car of cars) {
        const [passengers] = await pool.query(
          `SELECT dp.*, m.name as member_name, m.rank as member_rank
           FROM dispatch_passengers dp
           JOIN members m ON dp.member_id = m.id
           WHERE dp.dispatch_car_id = ?`,
          [car.id]
        );
        carsWithPassengers.push({ ...car, passengers });
      }
      result.push({ ...dispatch, cars: carsWithPassengers });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/dispatches', async (req, res) => {
  const { event_id, cars } = req.body;
  try {
    const [dispatchResult] = await pool.query(
      'INSERT INTO dispatches (event_id) VALUES (?)',
      [event_id]
    );
    const dispatchId = dispatchResult.insertId;
    for (const car of cars) {
      const [carResult] = await pool.query(
        'INSERT INTO dispatch_cars (dispatch_id, driver_member_id, capacity) VALUES (?, ?, ?)',
        [dispatchId, car.driver_member_id, car.capacity]
      );
      const carId = carResult.insertId;
      for (const passengerId of car.passengers) {
        await pool.query(
          'INSERT INTO dispatch_passengers (dispatch_car_id, member_id) VALUES (?, ?)',
          [carId, passengerId]
        );
      }
    }
    res.json({ id: dispatchId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/dispatches/:id', async (req, res) => {
  try {
    const [cars] = await pool.query(
      'SELECT id FROM dispatch_cars WHERE dispatch_id = ?',
      [req.params.id]
    );
    for (const car of cars) {
      await pool.query('DELETE FROM dispatch_passengers WHERE dispatch_car_id = ?', [car.id]);
    }
    await pool.query('DELETE FROM dispatch_cars WHERE dispatch_id = ?', [req.params.id]);
    await pool.query('DELETE FROM dispatches WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 날짜 조사 =====
app.get('/api/date-surveys', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, title,
        DATE_FORMAT(start_date, '%Y-%m-%d') as start_date,
        DATE_FORMAT(end_date, '%Y-%m-%d') as end_date,
        is_closed, created_at
      FROM date_surveys ORDER BY created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/date-surveys/latest', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, title,
        DATE_FORMAT(start_date, '%Y-%m-%d') as start_date,
        DATE_FORMAT(end_date, '%Y-%m-%d') as end_date,
        is_closed, created_at
      FROM date_surveys WHERE is_closed = 0 ORDER BY created_at DESC LIMIT 1
    `);
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/date-surveys', async (req, res) => {
  const { title, start_date, end_date } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO date_surveys (title, start_date, end_date) VALUES (?, ?, ?)',
      [title, start_date, end_date]
    );
    res.json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/date-surveys/:id', async (req, res) => {
  const { title, start_date, end_date, is_closed } = req.body;
  try {
    await pool.query(
      'UPDATE date_surveys SET title=?, start_date=?, end_date=?, is_closed=? WHERE id=?',
      [title, start_date, end_date, is_closed, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/date-surveys/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM date_survey_responses WHERE survey_id = ?', [req.params.id]);
    await pool.query('DELETE FROM date_survey_targets WHERE survey_id = ?', [req.params.id]);
    await pool.query('DELETE FROM date_surveys WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/date-survey-responses/:surveyId', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT dr.member_id, DATE_FORMAT(dr.available_date, '%Y-%m-%d') as available_date,
             m.name as member_name, m.rank, t.name as team_name
      FROM date_survey_responses dr
      JOIN members m ON dr.member_id = m.id
      LEFT JOIN teams t ON m.team_id = t.id
      WHERE dr.survey_id = ?
      ORDER BY dr.available_date, t.id, m.id
    `, [req.params.surveyId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/date-survey-responses', async (req, res) => {
  const { survey_id, member_id, dates } = req.body;
  try {
    await pool.query('DELETE FROM date_survey_responses WHERE survey_id = ? AND member_id = ?', [survey_id, member_id]);
    for (const date of dates) {
      // timezone 문제 방지: 날짜 문자열 그대로 저장
      await pool.query(
        'INSERT INTO date_survey_responses (survey_id, member_id, available_date) VALUES (?, ?, ?)',
        [survey_id, member_id, date]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/date-survey-responses/:surveyId/member/:memberId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT DATE_FORMAT(available_date, "%Y-%m-%d") as available_date FROM date_survey_responses WHERE survey_id = ? AND member_id = ?',
      [req.params.surveyId, req.params.memberId]
    );
    res.json(rows.map(r => r.available_date));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 날짜 조사 대상 =====
app.get('/api/date-survey-targets/:surveyId', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT dt.*, m.name as member_name, m.rank, t.name as team_name
      FROM date_survey_targets dt
      JOIN members m ON dt.member_id = m.id
      LEFT JOIN teams t ON m.team_id = t.id
      WHERE dt.survey_id = ?
      ORDER BY t.id, m.id
    `, [req.params.surveyId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/date-survey-targets', async (req, res) => {
  const { survey_id, member_ids } = req.body;
  try {
    await pool.query('DELETE FROM date_survey_targets WHERE survey_id = ?', [survey_id]);
    for (const member_id of member_ids) {
      await pool.query(
        'INSERT INTO date_survey_targets (survey_id, member_id) VALUES (?, ?)',
        [survey_id, member_id]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 서버 시작
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});