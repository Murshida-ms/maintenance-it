const express = require('express');
const router = express.Router();
const { isLogin } = require('../middleware/auth');
// const formController = require('../controller/form');

// router.get('/', isLogin, formController.index);

router.get('/form',isLogin, (req, res) => {
    res.render('user/form', {
        page: 'form',
        user: req.session.user
    });
});

module.exports = router;