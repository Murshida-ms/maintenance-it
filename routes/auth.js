const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const db = require('../config/database');

// LOGIN PAGE
router.get('/login', (req, res) => {
    res.render('login');
});

// LOGIN
router.post('/login', async (req, res) => {

    const { username, password } = req.body;

    const sha1Password = crypto
        .createHash('sha1')
        .update(password)
        .digest('hex');

    try {

        const [rows] = await db.query(`
            SELECT
                u.user_id,
                u.username,
                u.full_name,
                u.role,
                r.name AS role_name
            FROM users u
            JOIN role r ON u.role = r.id
            WHERE u.username = ?
            AND u.sha1 = ?
        `, [username, sha1Password]);

        if (rows.length > 0) {

            const user = rows[0];

            req.session.user = {
                id: user.user_id,
                username: user.username,
                fullName: user.full_name,
                role: user.role,
                roleName: user.role_name
            };

            return res.redirect('/index');
        }

        res.redirect('/login?error=failed');

    } catch (err) {

        console.log(err);

        res.status(500).send(err.message);
    }
});

// LOGOUT
router.get('/logout', (req, res) => {

    req.session.destroy(() => {
        res.redirect('/login');
    });

});

// API สำหรับดึงข้อมูล User ที่ Login อยู่
router.get('/api/me', (req, res) => {

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

module.exports = router;