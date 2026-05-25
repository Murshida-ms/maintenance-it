const db = require('../config/database');

// INDEX
exports.index = async (req, res) => {

    const [reports] = await db.query(`
        SELECT *
        FROM report_templates
        ORDER BY report_id DESC
    `);

    res.render('report/index', {
        page: 'report',
        user: req.session.user,
        reports
    });

};

// CREATE
exports.create = async (req, res) => {

    const {
        report_name,
        report_description,
        report_sql
    } = req.body;

    await db.query(`
        INSERT INTO report_templates (
            report_name,
            report_description,
            report_sql
        )
        VALUES (?,?,?)
    `, [
        report_name,
        report_description,
        report_sql
    ]);

    res.redirect('/report');

};

// UPDATE
exports.update = async (req, res) => {

    const id = req.params.id;

    const {
        report_name,
        report_description,
        report_sql
    } = req.body;

    await db.query(`
        UPDATE report_templates
        SET
            report_name = ?,
            report_description = ?,
            report_sql = ?
        WHERE report_id = ?
    `, [
        report_name,
        report_description,
        report_sql,
        id
    ]);

    res.redirect('/report');

};

// DELETE
exports.delete = async (req, res) => {

    const id = req.params.id;

    await db.query(`
        DELETE FROM report_templates
        WHERE report_id = ?
    `, [id]);

    res.json({
        success: true
    });

};

// DESIGNER
exports.designer = async (req, res) => {

    const id = req.params.id;

    const [rows] = await db.query(`
        SELECT *
        FROM report_templates
        WHERE report_id = ?
    `, [id]);

    const report = rows[0];

    res.render('report/designer', {
        page: 'report',
        user: req.session.user,
        report
    });

};