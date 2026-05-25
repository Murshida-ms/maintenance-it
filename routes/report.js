const express = require('express');

const router = express.Router();

const { isLogin } = require('../middleware/auth');

const reportController = require('../controller/report');

router.get('/', isLogin, reportController.index);

router.post('/create', isLogin, reportController.create);

router.post('/update/:id', isLogin, reportController.update);

router.post('/delete/:id', isLogin, reportController.delete);

router.get('/designer/:id', isLogin, reportController.designer);

module.exports = router;