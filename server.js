require('dotenv').config();
const express = require('express');
const app = express();
const mysql = require("mysql2/promise");
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const crypto = require('crypto');
const dayjs = require('dayjs');
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

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

let db;
async function initDB() {
    try {
        db = await mysql.createPool(dbConfig);
        //console.log('Connected to MySQL Database');
    } catch (err) {
        console.error('Database connection failed:', err);
    }
}
initDB();

function isLogin(req, res, next){
    if(!req.session.user){
        return res.redirect('/login');
    }
    next();
}

// --- ROUTES ---

// หน้าแรก
app.get("/", (req, res) => {
//   res.send("<h1>TaskFlow Pro Server is Running</h1>");
//   res.sendFile(path.join(__dirname, 'views', 'login.html'));
  res.render('login');
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
        // res.status(500).json({ error: 'Database Error' });
        res.status(500).send(err.message);
    }
});

// หน้า Register
app.get('/register', (req, res) => {
    // res.sendFile(path.join(__dirname, 'views', 'register.html'));
    res.render('register');
});

// รับข้อมูล Register
app.post('/register', async (req, res) => {

    const { username, password, full_name, email } = req.body;
    try {

        // bcrypt
        //const hashedPassword = await bcrypt.hash(password, 10);
        // sha1
        const sha1 = crypto
            .createHash('sha1')
            .update(password)
            .digest('hex');

        const sql = `
            INSERT INTO users
            (username, password, sha1, full_name, email,role,status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        await db.query(sql, [
            username,
            password,
            sha1,
            full_name,
            email,
            5,
            'active'
        ]);

        res.redirect('/login');

    } catch (err) {

        console.error(err);

        if (err.code === 'ER_DUP_ENTRY') {

            return res.redirect('/register?error=duplicate');
        }
        res.status(500).send(err.message);
    }
});

// หน้า Login
app.get('/login', (req, res) => {
    // res.sendFile(path.join(__dirname, 'views', 'login.html'));
    res.render('login');
});

// รับข้อมูล Login
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const sha1Password = crypto
    .createHash('sha1')
    .update(password)
    .digest('hex');
    try {
        const [rows] = await db.query("SELECT u.user_id,u.username,u.full_name,u.role,r.name AS role_name FROM users u JOIN role r ON u.role = r.id  WHERE u.username = ? AND u.sha1 = ?", [username, sha1Password]);
        
        if (rows.length > 0) {
            // ✅ แก้ไขให้ตรงกับโครงสร้างตารางของคุณ (user_id)
             const user = rows[0];
            // เก็บ session object
            req.session.user = {
                id: user.user_id,
                username: user.username,
                fullName: user.full_name,
                role: user.role,
                roleName: user.role_name
            };
            
            // res.redirect('/index'); 
            return res.redirect('/index');
        } else {
            // res.redirect('/login?error=failed'); 
            return res.redirect('/login?error=failed');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

// หน้าหลัก user
app.get('/index', isLogin, (req, res) => {
    // res.sendFile(path.join(__dirname, 'views', 'user', 'board.html'));
    // res.render('user/board');
    res.render('user/board', {
        page: 'index',
        user: req.session.user
    });
});

// API สำหรับดึงข้อมูล User ที่ Login อยู่
app.get('/api/me', (req, res) => {

    if (req.session.user) {

        res.json({
            fullName: req.session.user.fullName,
            role: req.session.user.roleName
        });

    } else {

        res.status(401).json({
            error: "Unauthorized"
        });
    }
});

// ตั้งค่าการเก็บไฟล์
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // ไฟล์จะไปอยู่ที่โฟลเดอร์ uploads/
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname)); // ตั้งชื่อไฟล์ใหม่กันชื่อซ้ำ
  }
});
const upload = multer({ storage: storage });

// เปิดให้เข้าถึงโฟลเดอร์ uploads ผ่าน URL ได้ (เช่น http://localhost:4000/uploads/filename.jpg)
app.use('/uploads', express.static('uploads'));

// รับข้อมูลแจ้งงานใหม่ (submit-ticket) ยังไม่ทำพร้อมไฟล์แนบ
app.post('/api/submit-ticket', upload.none(), async (req, res) =>{
    // รับค่าจาก Body (Form)
    const { title, detail, priority, note, assignee } = req.body;

    try {
        // SQL matching กับตาราง it_maintenance ล่าสุดของคุณ
        const sql = `INSERT INTO it_maintenance (title, detail, priority, note, assignee, status, created_at) 
                     VALUES (?, ?, ?, ?, ?, 'pending', NOW())`;
        
        const [result] = await db.query(sql, [title, detail, priority, note, assignee]);
        
        res.json({ 
            success: true, 
            message: "บันทึกข้อมูลเรียบร้อยแล้ว",
            ticketId: result.insertId 
        });
    } catch (err) {
        console.error("Database Error:", err);
        res.status(500).json({ error: "ไม่สามารถบันทึกข้อมูลได้" });
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

// หน้า form แจ้งงานใหม่
app.get('/form',isLogin, (req, res) => {
    // res.sendFile(path.join(__dirname, 'views', 'user', 'form.html'));
    // res.render('user/form');
    res.render('user/form', {
        page: 'form',
        user: req.session.user
    });
});

// หน้า timeline 
app.get('/timeline', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'user', 'timeline.html'));
});

// หน้า history
app.get('/history', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'user', 'history.html'));
});

// ดึงข้อมูลมาแสดง
app.get('/api/tickets', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM it_maintenance ORDER BY created_at DESC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// แก้ไขข้อมูล Ticket
app.put('/api/tickets/:id', async (req, res) => {
    const { id } = req.params;
    const { title, detail, note, priority, assignee } = req.body;

    if (!title) {
        return res.status(400).json({ error: 'กรุณาระบุหัวข้อ' });
    }

    try {
        const sql = `UPDATE it_maintenance 
                     SET title = ?, detail = ?, note = ?, priority = ?, assignee = ?, updated_at = NOW()
                     WHERE id = ? AND status IN ('pending', 'inprogress')`;
        const [result] = await db.query(sql, [title, detail, note, priority, assignee, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'ไม่พบ Ticket หรือไม่สามารถแก้ไขได้' });
        }

        res.json({ success: true, message: 'บันทึกเรียบร้อยแล้ว' });
    } catch (err) {
        console.error('Update Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ลบ Ticket
app.delete('/api/tickets/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await db.query(
            "DELETE FROM it_maintenance WHERE id = ?",
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'ไม่พบ Ticket' });
        }

        res.json({ success: true, message: 'ลบ Ticket เรียบร้อยแล้ว' });
    } catch (err) {
        console.error('Delete Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// หน้า manage
app.get('/manage', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'manage.html'));
});

// หน้า มอบหมาย
app.get('/queue', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'queue.html'));
});

app.get('/report',isLogin, (req, res) => {
    // res.sendFile(path.join(__dirname, 'views', 'login.html'));
    // res.render('user/report');
    res.render('user/report', {
        page: 'report',
        user: req.session.user
    });
});

app.get('/users',isLogin, (req, res) => {
    res.render('user/users', {
        page: 'users',
        user: req.session.user
    });
});

// GET USERS
app.get('/api/getusers', async (req, res) => {

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
app.post('/api/users', async (req, res) => {
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
app.put('/api/users/:id', async (req, res) => {
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
app.delete('/api/users/:id', async (req, res) => {
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

app.get('/dynamic-report', isLogin, async (req, res) => {

    // ตัวอย่าง query
    const [results] = await db.query(`
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

    res.render('dynamic-report', {

        report: {
            report_name: 'รายงานผู้ป่วยเบาหวาน',
            report_description: 'แสดงข้อมูลผู้ป่วยที่ได้รับการวินิจฉัยโรคเบาหวาน'
        },

        generatedAt: dayjs().format('DD/MM/YYYY HH:mm'),

        filters: {
            วันที่เริ่มต้น: '01/01/2026',
            วันที่สิ้นสุด: '31/01/2026'
        },

        columns: [
            {
                label: 'ลำดับ',
                type: 'running',
                align: 'text-center'
            },
            {
                label: 'HN',
                field: 'hn'
            },
            {
                label: 'ชื่อ-สกุล',
                field: 'patient_name'
            },
            {
                label: 'อายุ',
                field: 'age_y',
                format: 'number',
                align: 'text-center'
            },
            {
                label: 'ยอดค่าใช้จ่าย',
                field: 'income',
                format: 'decimal',
                align: 'text-right'
            }
        ],

        rows: results

    });

});

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