const express = require('express');
const router = express.Router();

const db = require('../config/database');

// GET TICKETS
router.get('/api/tickets', async (req, res) => {

    try {

        const [rows] = await db.query(`
            SELECT *
            FROM it_maintenance
            ORDER BY created_at DESC
        `);

        res.json(rows);

    } catch (err) {

        res.status(500).json({
            error: err.message
        });

    }

});

module.exports = router;