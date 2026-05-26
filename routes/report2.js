const express = require('express');
const router = express.Router();
const { isLogin } = require('../middleware/auth');
const report2 = require('../controller/report2');

router.get('/report2',isLogin,report2.index);
router.post('/report2/create',isLogin,report2.create);
router.get('/report2/setting/:id',isLogin,report2.setting);
router.post('/report2/save/:id',isLogin,report2.save);
router.post('/report2/test-sql',isLogin,report2.testSQL);
router.post('/report2/delete/:id',isLogin,report2.delete);
router.post('/report2/preview/:id',isLogin,report2.preview);
router.get('/report2/run/:id',isLogin,report2.run);

module.exports = router;