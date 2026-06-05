const express = require('express');
const router = express.Router();
const { isLogin } = require('../middleware/auth');
// const formController = require('../controller/form');

// router.get('/', isLogin, formController.index);

router.get('/timeline',isLogin, (req, res) => {
    res.render('user/form', {
        page: 'timeline',
        user: req.session.user
    });
});

router.get('/history',isLogin, (req, res) => {
    res.render('user/form', {
        page: 'history',
        user: req.session.user
    });
});

module.exports = router;