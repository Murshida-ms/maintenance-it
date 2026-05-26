const db = require('../config/database');
const ejs = require('ejs');
const helper = require('../helpers/helper');

exports.index = async(req,res)=>{

    const [reports] =
        await db.query(`
            SELECT *
            FROM report_templates2
            ORDER BY report_id DESC
        `);

    res.render(
        'report2/index',
        {
            page:'report2',
            reports
        }
    );

};

exports.create = async(req,res)=>{

    const {
        report_name,
        report_description
    } = req.body;

    await db.query(`
        INSERT INTO report_templates2
        (
            report_name,
            report_description
        )
        VALUES (?,?)
    `,[
        report_name,
        report_description
    ]);

    res.redirect('/report2');
};

exports.setting = async(req,res)=>{

    const id =
        req.params.id;

    const [rows] =
        await db.query(`
            SELECT *
            FROM report_templates2
            WHERE report_id=?
        `,[id]);

    res.render(
        'report2/setting',
        {
            report:rows[0]
        }
    );

};

exports.save = async(req,res)=>{

    try{

        const id =
            req.params.id;

        const {
            report_sql,
            report_template,
            report_params
        } = req.body;

        await db.query(`
            UPDATE report_templates2
            SET
                report_sql=?,
                report_template=?,
                report_params=?,
                updated_at=NOW()
            WHERE report_id=?
        `,[
            report_sql,
            report_template,
            JSON.stringify(
                report_params
            ),
            id
        ]);

        res.json({
            success:true
        });

    }
    catch(err){

        res.json({
            success:false,
            message:err.message
        });

    }

};

exports.testSQL = async(req,res)=>{

    try{

        const { sql } =
            req.body;

        const [rows] =
            await db.query(sql);

        res.json({

            success:true,

            rows

        });

    }catch(err){

        res.json({

            success:false,

            message:
                err.message

        });

    }

};

exports.delete = async(req, res) => {
    const id = req.params.id;

    await db.query(`
        DELETE FROM report_templates2
        WHERE report_id = ?
    `, [id]);

    res.json({
        success: true
    });
};

exports.preview = async(req,res)=>{

    try{

        const {
            report_sql,
            report_template
        } = req.body;

        const [rows] =
            await db.query(report_sql);

        const html =
            ejs.render(
                report_template2,
                {
                    rows,
                    params:{},
                    ...helper
                }
            );

        res.json({

            success:true,

            html

        });

    }
    catch(err){

        res.json({

            success:false,

            message:err.message

        });

    }

};

exports.run = async(req,res)=>{

    const id =
        req.params.id;

    const [rows] =
        await db.query(`
            SELECT *
            FROM report_templates2
            WHERE report_id=?
        `,[id]);

    const report =
        rows[0];

    let sql =
        report.report_sql;

    const params =
        req.query;

    Object.keys(params)
    .forEach(key=>{

        sql =
            sql.replaceAll(
                `{${key}}`,
                params[key]
            );

    });

    const [data] =
        await db.query(sql);

    const html =
        ejs.render(
            report.report_template,
            {
                rows:data,
                params,
                ...helper
            }
        );

    res.send(html);

};