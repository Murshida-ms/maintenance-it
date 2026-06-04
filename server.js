require('dotenv').config();
const express = require('express');
const app = express();
const mysql = require("mysql2/promise");
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');
//const bcrypt = require('bcrypt');

// 1. Middleware ตั้งค่าการรับข้อมูล
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 2. เชื่อมต่อ Database
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
};

// 3. Middleware สำหรับ Session
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false
}));

let db;
async function initDB() {
    try {
        db = await mysql.createPool(dbConfig);
        console.log('Connected to MySQL Database');
    } catch (err) {
        console.error('Database connection failed:', err);
    }
}
initDB();

// ========== MIDDLEWARE: Auth Guard ==========

// ตรวจว่า login อยู่หรือเปล่า — ใช้คุมทุกหน้าที่ต้อง login
function isAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.redirect('/login');
}

// staff ทุก role เข้าได้หมด ไม่ต้องแยก isAdmin
function isStaff(req, res, next) {
  if (req.session && req.session.isStaff) return next();
  res.status(403).send(`
    <div style="font-family:sans-serif;text-align:center;padding:60px">
      <h2 style="color:#EF4444">🚫 ไม่มีสิทธิ์เข้าถึงหน้านี้</h2>
      <p style="color:#6B7280">หน้านี้สำหรับเจ้าหน้าที่เท่านั้น</p>
      <a href="/login" style="color:#7B2FF7;margin-top:16px;display:inline-block">← กลับหน้า Login</a>
    </div>`);
}

// --- ROUTES ---

app.get("/", (req, res) => {
  res.send("<h1>TaskFlow Pro Server is Running</h1>");
});

// --- API สำหรับตรวจสอบ Username ซ้ำ (เพิ่มใหม่) ---
app.get('/check-username', async (req, res) => {
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
        res.status(500).json({ error: 'Database Error' });
    }
});

// หน้า Register
app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'auth','register.html'));
});

// รับข้อมูล Register
app.post('/register', async (req, res) => {
    const { username, password, full_name, email } = req.body;
    try {
        const sql = "INSERT INTO users (username, password, full_name, email, role, sha1, status) VALUES (?, ?, ?, ?, ?, ?, 'active')";
        await db.query(sql, [username, password, full_name, email, crypto.createHash('sha1').update(username + password).digest('hex')]);
        
        // สมัครสำเร็จ -> ไปหน้า Login เลย (ไม่ต้องมี alert)
        res.redirect('/login'); 
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            // ถ้าชื่อซ้ำ -> ให้เด้งกลับหน้าเดิมเฉยๆ (หน้าบ้านเรามี JS ดักโ  ชว์ตัวแดงไว้อยู่แล้ว)
            res.redirect('/register?error=duplicate');
        } else {
            console.error(err);
            res.status(500).send("Server Error");
        }
    }
});

// หน้า Login
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'auth', 'login.html'));
});

// รับข้อมูล Login
app.post('/login', async (req, res) => {
  const { username, password, login_type } = req.body;
  try {

    // ===== ฝั่งเจ้าหน้าที่ → it_staff =====
    if (login_type === 'staff') {
      const [rows] = await db.query(
        `SELECT s.*, r.name AS role_name
         FROM it_staff s
         LEFT JOIN role r ON s.role = r.id
         WHERE s.username_staff = ? AND s.password_staff = ?`,
        [username, password]
      );

      if (rows.length === 0) {
        return res.redirect('/login?error=failed&tab=staff');
      }

      const staff = rows[0];
      req.session.userId   = staff.staff_id;
      req.session.fullName = staff.staff_name;
      req.session.username = staff.username_staff;
      req.session.role     = staff.role;
      req.session.roleName = staff.role_name || 'เจ้าหน้าที่';
      req.session.isStaff  = true;   // ✅ flag สำคัญ
      return res.redirect('/queue');

    // ===== ฝั่งผู้แจ้งงาน → users =====
    } else {
      const [rows] = await db.query(
        "SELECT * FROM users WHERE username = ? AND password = ?",
        [username, password]
      );

      if (rows.length === 0) {
        return res.redirect('/login?error=failed&tab=user');
      }

      const user = rows[0];
      req.session.userId   = user.user_id;
      req.session.fullName = user.full_name;
      req.session.username = user.username;
      req.session.role     = user.role;
      req.session.roleName = 'ผู้แจ้งงาน';
      req.session.isStaff  = false;  // ✅ flag สำคัญ
      return res.redirect('/index');
    }

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});

// API สำหรับดึงข้อมูล User ที่ Login อยู่
app.get('/api/me', (req, res) => {
  if (req.session && req.session.userId) {
    res.json({
      fullName: req.session.fullName,
      username: req.session.username || '',
      role:     req.session.role,
      roleName: req.session.roleName || '',
      isStaff:  req.session.isStaff || false,
    });
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
});

// ตั้งค่าการเก็บไฟล์
// แก้ destination ใน storage config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/'); // ← เปลี่ยนจาก 'uploads/' เป็น 'public/uploads/'
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// เพิ่ม fileFilter กันไฟล์อันตราย
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx/;
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.test(ext)) {
      cb(null, true);
    } else {
      cb(new Error('ไม่รองรับประเภทไฟล์นี้'));
    }
  }
});

// เปิดให้เข้าถึงโฟลเดอร์ uploads ผ่าน URL ได้ (เช่น http://localhost:4000/uploads/filename.jpg)
app.use('/uploads', express.static('public/uploads'));

// รับข้อมูลแจ้งงานใหม่ (submit-ticket) พร้อมไฟล์แนบ
app.post('/api/submit-ticket', upload.array('files'), async (req, res) => {
  const { title, detail, priority, note, assignee } = req.body;
  const reporterId   = req.session.userId || null;
  const reporterType = req.session.isStaff ? 'staff' : 'user';

  let attachment = null;
  if (req.files && req.files.length > 0) {
    attachment = JSON.stringify(req.files.map(f => f.filename));
  }

  try {
    const sql = `
      INSERT INTO it_maintenance
      (title, detail, priority, note, assignee, attachment, reporter_id, reporter_type, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())
    `;
    const [result] = await db.query(sql, [
      title, detail, priority, note, assignee,
      attachment, reporterId, reporterType
    ]);

    res.json({ success: true, ticketId: result.insertId });
  } catch (err) {
    console.error('Submit Error:', err);
    res.status(500).json({ error: 'ไม่สามารถบันทึกข้อมูลได้' });
  }
});

// อัปโหลดไฟล์เพิ่มเติมให้ Ticket ที่มีอยู่แล้ว
app.post('/api/tickets/:id/attachments', isAuth, upload.array('files'), async (req, res) => {
  const { id } = req.params;

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'ไม่มีไฟล์ที่อัปโหลด' });
  }

  try {
    // ดึง attachment เดิมออกมาก่อน
    const [rows] = await db.query(
      "SELECT attachment FROM it_maintenance WHERE id = ?", [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบ Ticket' });
    }

    // รวมไฟล์เก่า + ไฟล์ใหม่
    const oldFiles = JSON.parse(rows[0].attachment || '[]');
    const newFiles = req.files.map(f => f.filename);
    const merged   = [...oldFiles, ...newFiles];

    await db.query(
      "UPDATE it_maintenance SET attachment = ?, updated_at = NOW() WHERE id = ?",
      [JSON.stringify(merged), id]
    );

    res.json({
      success: true,
      files: newFiles.map(f => ({ filename: f, url: `/uploads/${f}` }))
    });
  } catch (err) {
    console.error('Upload Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// หมายเลข Ticket 
app.get('/api/next-ticket', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT MAX(id) as maxId FROM it_maintenance");
        const nextId = (rows[0].maxId || 0) + 1;
        const ticketNo = 'TK-' + String(nextId).padStart(4, '0');
        res.json({ ticketNo });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ดึงข้อมูลมาแสดง
app.get('/api/tickets', isAuth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT m.*,
             CASE 
               WHEN m.reporter_type = 'staff' THEN s.staff_name
               ELSE u.full_name
             END AS reporter_name
      FROM it_maintenance m
      LEFT JOIN users    u ON m.reporter_id = u.user_id    AND m.reporter_type = 'user'
      LEFT JOIN it_staff s ON m.reporter_id = s.staff_id   AND m.reporter_type = 'staff'
      WHERE m.reporter_id   = ?
        AND m.reporter_type = ?
      ORDER BY m.created_at DESC
    `, [req.session.userId, req.session.isStaff ? 'staff' : 'user']);

    const result = rows.map(row => {
      let attachments = [];
      try {
        const files = JSON.parse(row.attachment || '[]');
        attachments = files.map(filename => ({
          filename,
          name:  filename,
          url:   `/uploads/${filename}`,
          isPdf: filename.toLowerCase().endsWith('.pdf')
        }));
      } catch { attachments = []; }
      return { ...row, attachments };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// สำหรับหน้า /queue → เห็นทุก ticket (pending + inprogress)
app.get('/api/all-tickets', isAuth, isStaff, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT m.*,
             CASE 
               WHEN m.reporter_type = 'staff' THEN s.staff_name
               ELSE u.full_name
             END AS reporter_name
      FROM it_maintenance m
      LEFT JOIN users    u ON m.reporter_id = u.user_id    AND m.reporter_type = 'user'
      LEFT JOIN it_staff s ON m.reporter_id = s.staff_id   AND m.reporter_type = 'staff'
      ORDER BY m.created_at DESC
    `);

    const result = rows.map(row => {
      let attachments = [];
      try {
        const files = JSON.parse(row.attachment || '[]');
        attachments = files.map(filename => ({
          filename,
          name:  filename,
          url:   `/uploads/${filename}`,
          isPdf: filename.toLowerCase().endsWith('.pdf')
        }));
      } catch { attachments = []; }
      return { ...row, attachments };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// แก้ไขข้อมูล Ticket
app.put('/api/tickets/:id', async (req, res) => {
  const { id } = req.params;
  const { title, detail, note, priority, assignee, status } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'กรุณาระบุหัวข้อ' });
  }

  try {
    let sql, params;

    if (status === 'done') {
      
      sql = `UPDATE it_maintenance 
             SET title = ?, detail = ?, note = ?, priority = ?, assignee = ?, 
                 status = ?, closed_at = NOW(), updated_at = NOW()
             WHERE id = ?`;
      params = [title, detail, note, priority, assignee, status, id];
    } else if (status) {
      sql = `UPDATE it_maintenance 
             SET title = ?, detail = ?, note = ?, priority = ?, assignee = ?, 
                 status = ?, updated_at = NOW()
             WHERE id = ?`;
      params = [title, detail, note, priority, assignee, status, id];
    } else {
      sql = `UPDATE it_maintenance 
             SET title = ?, detail = ?, note = ?, priority = ?, assignee = ?,
                 updated_at = NOW()
             WHERE id = ?`;
      params = [title, detail, note, priority, assignee, id];
    }

    const [result] = await db.query(sql, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'ไม่พบ Ticket' });
    }

    res.json({ success: true, message: 'บันทึกเรียบร้อยแล้ว' });
  } catch (err) {
    console.error('Update Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ลบ Ticket
app.delete('/api/tickets/:id', isAuth, async (req, res) => {
  const { id } = req.params;
  try {
    // ดึง attachment ก่อนลบ เพื่อลบไฟล์ด้วย
    const [rows] = await db.query(
      "SELECT attachment FROM it_maintenance WHERE id = ?", [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบ Ticket' });
    }

    // ลบไฟล์แนบออกจาก server
    try {
      const files = JSON.parse(rows[0].attachment || '[]');
      files.forEach(filename => {
        const filePath = path.join(__dirname, 'public/uploads', filename);
        fs.unlink(filePath, () => {});
      });
    } catch {}

    // ลบ ticket
    await db.query("DELETE FROM it_maintenance WHERE id = ?", [id]);

    res.json({ success: true });
  } catch (err) {
    console.error('Delete Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// API STAFF 
app.get('/api/staff', isAuth, isStaff, async (req, res) => {
  try {
    // ✅ ดึงจาก it_staff จริงๆ
    const [rows] = await db.query(`
      SELECT
        s.staff_id,
        s.staff_name,
        s.username_staff,
        s.telegram_chat_id,
        s.role,
        r.name AS role_name,
        COUNT(CASE WHEN m.status IN ('pending','inprogress')
              THEN 1 END) AS active_tasks
      FROM it_staff s
      LEFT JOIN role r ON s.role = r.id
      LEFT JOIN it_maintenance m ON m.assignee = s.staff_name
      GROUP BY s.staff_id, s.staff_name, s.username_staff,
               s.telegram_chat_id, s.role, r.name
      ORDER BY active_tasks ASC, s.staff_name ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Staff เห็นเฉพาะงานที่ assign ให้ตัวเอง
app.get('/api/my-tasks', isAuth, isStaff, async (req, res) => {
  try {
    const staffName = req.session.fullName;
    const staffId   = req.session.userId;

    const [rows] = await db.query(`
      SELECT m.*,
             CASE 
               WHEN m.reporter_type = 'staff' THEN s.staff_name
               ELSE u.full_name
             END AS reporter_name
      FROM it_maintenance m
      LEFT JOIN users    u ON m.reporter_id = u.user_id    AND m.reporter_type = 'user'
      LEFT JOIN it_staff s ON m.reporter_id = s.staff_id   AND m.reporter_type = 'staff'
      WHERE m.assignee = ?
         OR (m.reporter_id = ? AND m.reporter_type = 'staff')
      ORDER BY m.created_at DESC
    `, [staffName, staffId]);

    const result = rows.map(row => {
      let attachments = [];
      try {
        const files = JSON.parse(row.attachment || '[]');
        attachments = files.map(filename => ({
          filename,
          name:  filename,
          url:   `/uploads/${filename}`,
          isPdf: filename.toLowerCase().endsWith('.pdf')
        }));
      } catch { attachments = []; }
      return { ...row, attachments };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== USER ROUTES =====
// USER (ผู้แจ้งงาน)
app.get('/index',    isAuth,          (req, res) => res.render('user/board',    { page: 'index' }));
app.get('/form',     isAuth,          (req, res) => res.render('user/form',     { page: 'form' }));
app.get('/timeline', isAuth,          (req, res) => res.render('user/timeline', { page: 'timeline' }));
app.get('/history',  isAuth,          (req, res) => res.render('user/history',  { page: 'history' }));

// STAFF — เข้าได้ทุกหน้า
app.get('/queue',    isAuth, isStaff, (req, res) => res.render('admin/queue',   { page: 'queue' }));
app.get('/manage',   isAuth, isStaff, (req, res) => res.render('admin/manage',  { page: 'manage' }));
app.get('/report',   isAuth, isStaff, (req, res) => res.render('admin/report',  { page: 'report' }));
app.get('/users',    isAuth, isStaff, (req, res) => res.render('admin/users',   { page: 'users' }));
app.get('/settings', isAuth, isStaff, (req, res) => res.render('admin/settings',{ page: 'settings' }));

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// Start Server
app.listen(4000, () => {
  console.log('Server running at http://localhost:4000');
});