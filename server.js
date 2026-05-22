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

// --- ROUTES ---

// หน้าแรก
app.get("/", (req, res) => {
  res.send("<h1>TaskFlow Pro Server is Running</h1>");
});

// --- API สำหรับตรวจสอบ Username ซ้ำ (เพิ่มใหม่) ---
app.get('/check-username', async (req, res) => {
    const { username } = req.query;
    try {
        const [rows] = await db.query("SELECT id FROM users WHERE username = ?", [username]);
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
        const sql = "INSERT INTO users (username, password, full_name, email) VALUES (?, ?, ?, ?)";
        await db.query(sql, [username, password, full_name, email]);
        
        // สมัครสำเร็จ -> ไปหน้า Login เลย (ไม่ต้องมี alert)
        res.redirect('/login'); 
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            // ถ้าชื่อซ้ำ -> ให้เด้งกลับหน้าเดิมเฉยๆ (หน้าบ้านเรามี JS ดักโชว์ตัวแดงไว้อยู่แล้ว)
            res.redirect('/register?error=duplicate');
        } else {
            console.error(err);
            res.status(500).send("Server Error");
        }
    }
});

// หน้า Login
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'auth', 'login.ejs'));
});

// รับข้อมูล Login
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [rows] = await db.query("SELECT * FROM users WHERE username = ? AND password = ?", [username, password]);
        
        if (rows.length > 0) {
            // แก้ไขให้ตรงกับโครงสร้างตารางของคุณ (user_id)
            req.session.userId = rows[0].user_id; 
            req.session.fullName = rows[0].full_name;
            
            res.redirect('/index'); 
        } else {
            res.redirect('/login?error=failed'); 
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

// หน้าหลัก user
app.get('/index', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'user', 'board.html'));
});

// API สำหรับดึงข้อมูล User ที่ Login อยู่
app.get('/api/me', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({
            fullName: req.session.fullName,
            role: "-"
        });
    } else {
        res.status(401).json({ error: "Unauthorized" });
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
app.use('/uploads', express.static('public/uploads'));

// รับข้อมูลแจ้งงานใหม่ (submit-ticket) พร้อมไฟล์แนบ
app.post('/api/submit-ticket', upload.array('files'), async (req, res) => {
    const { title, detail, priority, note, assignee } = req.body;
    const files = req.files;

    // ดึง userId จาก session
    const reporterId = req.session.userId || null;

    let attachment = null;
    if (files && files.length > 0) {
        attachment = JSON.stringify(files.map(file => file.filename));
    }

    try {
        const sql = `
        INSERT INTO it_maintenance
        (title, detail, priority, note, assignee, attachment, reporter_id, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NOW())
        `;

        const [result] = await db.query(sql, [
            title, detail, priority, note, assignee,
            attachment,
            reporterId  // บันทึก reporter_id
        ]);

        res.json({ success: true, message: "บันทึกข้อมูลเรียบร้อยแล้ว", ticketId: result.insertId });
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
app.get('/form', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'user', 'form.html'));
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
        // JOIN users เพื่อดึง full_name ของผู้แจ้ง
        const [rows] = await db.query(`
            SELECT m.*, u.full_name AS reporter_name
            FROM it_maintenance m
            LEFT JOIN users u ON m.reporter_id = u.user_id
            ORDER BY m.created_at DESC
        `);
        res.json(rows);
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

        if (status) {
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
    res.sendFile(path.join(__dirname, 'views', 'admin','manage.html'));
});

// หน้า มอบหมาย
app.get('/queue', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'admin','queue.html'));
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