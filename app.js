require('dotenv').config();

const express = require('express');
const app = express();

const path = require('path');
const session = require('express-session');

// ROUTES
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const ticketRoutes = require('./routes/ticket');
const reportRoutes = require('./routes/report');
const formRoutes = require('./routes/form');
const extRoutes = require('./routes/ext');
const report2Routes = require('./routes/report2');

// MIDDLEWARE
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const helper = require('./helpers/helper');
app.locals.formatDate = helper.formatDate;
app.locals.formatDateTime = helper.formatDateTime;
app.locals.number = helper.number;
app.locals.currency = helper.currency;

app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false
}));

app.use((req, res, next) => {

    res.locals.user = req.session.user || null;

    next();
});

// USE ROUTES
app.use(authRoutes);
app.use(userRoutes);
app.use(ticketRoutes);
// app.use(reportRoutes);
app.use('/report', reportRoutes);
app.use(formRoutes);
app.use(extRoutes);
app.use(report2Routes);

// HOME
app.get('/', (req, res) => {
    res.redirect('/login');
});

// START SERVER
app.listen(4000, () => {
    console.log('Server running at http://localhost:4000');
});