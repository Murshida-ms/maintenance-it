const db = require('../config/database');

exports.designer = async (req, res) => {

    const reportId = req.params.id;

    const [rows] = await db.query(`
        SELECT *
        FROM report_templates
        WHERE report_id=?
    `,[reportId]);

    const report = rows[0];

    res.render('report/designer',{

        page:'report',

        report,

        params:
            report.report_params
                ? JSON.parse(report.report_params)
                : [],

        layout:
            report.report_layout
                ? JSON.parse(report.report_layout)
                : { columns:[] }

    });

};