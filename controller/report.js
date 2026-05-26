const db = require('../config/database');

function parseJson(value, fallback) {
    try {
        return value ? JSON.parse(value) : fallback;
    } catch (err) {
        return fallback;
    }
}

function extractParams(report) {
    const savedParams = parseJson(report.report_params, []);

    if (savedParams.length > 0) {
        return savedParams;
    }

    const sql = report.report_sql || '';
    const names = [...new Set([...sql.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map(item => item[1]))];

    return names.map(name => ({
        name,
        label: name,
        type: name.toLowerCase().includes('date') ? 'date' : 'text'
    }));
}

function isSelectSql(sql) {
    const sqlTrim = (sql || '').trim().toLowerCase();
    const sqlWithoutTrailingSemicolon = sqlTrim.replace(/;+\s*$/, '');

    return sqlWithoutTrailingSemicolon.startsWith('select') && !sqlWithoutTrailingSemicolon.includes(';');
}

function bindSqlParams(sql, params, values) {
    const bindValues = [];
    const executableSql = sql.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) => {
        const param = params.find(item => item.name === name) || { type: 'text' };
        const value = values[name] ?? '';

        bindValues.push(param.type === 'number' && value !== '' ? Number(value) : value);

        return '?';
    });

    return {
        executableSql,
        bindValues
    };
}

function renderTextTemplate(text, values) {
    return (text || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) => values[name] ?? '');
}

function cleanInputValues(values) {
    const cleanValues = { ...(values || {}) };

    delete cleanValues._;

    return cleanValues;
}

async function getReport(id) {
    const [rows] = await db.query(`
        SELECT *
        FROM report_templates
        WHERE report_id = ?
    `, [id]);

    return rows[0];
}

async function runReportQuery(report, inputValues) {
    const sql = (report.report_sql || '').trim().replace(/;+\s*$/, '');

    if (!isSelectSql(sql)) {
        throw new Error('Only SELECT statement allowed');
    }

    const params = extractParams(report);
    const values = inputValues || {};
    const { executableSql, bindValues } = bindSqlParams(sql, params, values);
    const [rows] = await db.query(executableSql, bindValues);
    const layout = parseJson(report.report_layout, { columns: [] });
    const columns = layout.columns && layout.columns.length > 0
        ? layout.columns
        : (rows.length > 0 ? Object.keys(rows[0]) : []);

    return {
        params,
        rows,
        columns,
        filters: values
    };
}

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

exports.designer = async (req, res) => {
    const report = await getReport(req.params.id);

    if (!report) {
        return res.status(404).send('Report not found');
    }

    res.render('report/designer', {
        page: 'report',
        user: req.session.user,
        report,
        embed: req.query.embed === '1',
        params: extractParams(report),
        layout: parseJson(report.report_layout, { columns: [] })
    });
};

exports.run = async (req, res) => {
    try {
        const report = await getReport(req.params.id);

        if (!report) {
            return res.status(404).send('Report not found');
        }

        const params = extractParams(report);
        const hasFilters = Object.keys(req.query).length > 0;
        const filters = cleanInputValues(req.query);
        let rows = [];
        let columns = parseJson(report.report_layout, { columns: [] }).columns || [];
        let error = null;

        if (hasFilters) {
            try {
                const result = await runReportQuery(report, filters);
                rows = result.rows;
                columns = result.columns;
            } catch (err) {
                error = err.message;
            }
        }

        res.render('report/run', {
            page: 'report',
            user: req.session.user,
            report,
            params,
            rows,
            columns,
            filters,
            header: renderTextTemplate(report.report_header, filters),
            footer: renderTextTemplate(report.report_footer, filters),
            hasFilters,
            error
        });
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
};

exports.print = async (req, res) => {
    try {
        const report = await getReport(req.params.id);

        if (!report) {
            return res.status(404).send('Report not found');
        }

        const filters = cleanInputValues(req.query);
        const result = await runReportQuery(report, filters);

        res.render('report/dynamic-report', {
            report,
            rows: result.rows,
            columns: result.columns.map(column => ({
                field: column,
                label: column,
                align: 'text-left'
            })),
            filters,
            header: renderTextTemplate(report.report_header, filters),
            footer: renderTextTemplate(report.report_footer, filters),
            generatedAt: new Date().toLocaleString('th-TH')
        });
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
};

exports.testSQL = async (req, res) => {
    try {
        const { sql, params, values } = req.body;
        const safeSql = (sql || '').trim().replace(/;+\s*$/, '');

        if (!sql) {
            return res.status(400).json({
                success: false,
                message: 'SQL is required'
            });
        }

        if (!isSelectSql(sql)) {
            return res.status(400).json({
                success: false,
                message: 'Only SELECT statement allowed'
            });
        }

        const { executableSql, bindValues } = bindSqlParams(safeSql, params || [], values || {});
        const [rows] = await db.query(executableSql, bindValues);
        let columns = [];

        if (rows.length > 0) {
            columns = Object.keys(rows[0]);
        }

        res.json({
            success: true,
            columns,
            rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

exports.saveSQL = async (req, res) => {
    try {
        const reportId = req.params.id;
        const {
            report_sql,
            report_header,
            report_footer,
            report_params,
            report_layout
        } = req.body;

        await db.query(`
            UPDATE report_templates
            SET
                report_sql=?,
                report_header=?,
                report_footer=?,
                report_params=?,
                report_layout=?,
                updated_at=NOW()
            WHERE report_id=?
        `, [
            report_sql,
            report_header,
            report_footer,
            JSON.stringify(report_params),
            JSON.stringify(report_layout),
            reportId
        ]);

        res.json({
            success: true
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};
