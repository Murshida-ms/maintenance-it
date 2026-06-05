const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const db = require('../config/database');
const { isLogin } = require('../middleware/auth');

// DASHBOARD
router.get('/index', isLogin, (req, res) => {

    res.render('user/board', {
        page: 'index',
        user: req.session.user
    });

});

// USERS PAGE
router.get('/users', isLogin, (req, res) => {

    res.render('user/users', {
        page: 'users',
        user: req.session.user
    });

});

// GET USERS
router.get('/api/getusers', async (req, res) => {

  try {

    const [rows] = await db.query(`
      SELECT
        u.user_id,
        u.username,
        u.password,
        u.full_name,
        u.email,
        u.role,
        r.name AS role_name,
        u.status,
        u.created_at
      FROM users u
      LEFT JOIN role r ON r.id = u.role
      ORDER BY u.user_id DESC
    `);

    res.json(rows);

  } catch (err) {

    console.log(err);

    res.status(500).json({
      success: false,
      message: 'โหลดข้อมูลไม่สำเร็จ'
    });

  }
});

// CREATE
router.post('/api/users', async (req, res) => {
  try {
    const {
      username,
      password,
      name,
      email,
      role,
      status
    } = req.body;
    // VALIDATE
    if (
      !username ||
      !password ||
      !name ||
      !email ||
      !role
    ) {
      return res.status(400).json({
        success: false,
        message: 'กรุณากรอกข้อมูลให้ครบ'
      });
    }
    // CHECK USERNAME DUPLICATE
    const [exists] = await db.query(
      'SELECT user_id FROM users WHERE username = ? LIMIT 1',
      [username]
    );
    if (exists.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'ชื่อผู้ใช้งานนี้ถูกใช้แล้ว'
      });
    }
    // HASH SHA1
    const sha1 = crypto
      .createHash('sha1')
      .update(password)
      .digest('hex');
    // INSERT USER
    await db.query(`
      INSERT INTO users (
        username,
        password,
        sha1,
        full_name,
        email,
        role,
        status,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      username,
      password,
      sha1,
      name,
      email,
      role,
      status
    ]);
    res.json({
      success: true,
      message: 'เพิ่มผู้ใช้งานสำเร็จ'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

// UPDATE
router.put('/api/users/:id', async (req, res) => {
  const { username, password, full_name, email, role, status } = req.body;
  const sha1 = crypto
      .createHash('sha1')
      .update(password)
      .digest('hex');
  await db.query(`
    UPDATE users
    SET username=?,
        password=?,
        sha1=?,
        full_name=?,
        email=?,
        role=?,
        status=?
    WHERE user_id=?
  `,[username,password,sha1,full_name,email,role,status,req.params.id]);
  res.json({ success:true });
});

// DELETE
router.delete('/api/users/:id', async (req, res) => {
  try {
    await db.query(
      'DELETE FROM users WHERE user_id=?',
      [req.params.id]
    );
    res.json({
      success: true
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาด'
    });
  }
});

router.get('/check-username', async (req, res) => {
    const { username } = req.query;
    try {
        const [rows] = await db.query("SELECT user_id FROM users WHERE username = ?", [username]);
        if (rows.length > 0) {
            res.json({ exists: true }); // มีคนใช้แล้ว
        } else {
            res.json({ exists: false }); // ยังไม่มีคนใช้
        }
    } catch (err) {
        console.error(err);
        // res.status(500).json({ error: 'Database Error' });
        res.status(500).send(err.message);
    }
});

module.exports = router;