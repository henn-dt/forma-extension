const passport = require('passport');
const flash = require('express-flash');
const session = require('express-session');
const methodOverride = require('method-override');

// Import Passport configuration
const initializePassport = require('./passport-config');
const directusService = require('./services/directus');

function setupAuth(app) {
    // Initialize Passport
    initializePassport(
        passport,
        email => directusService.getUserByEmail(email),
        id => directusService.getUserById(id)
    );

    // Session middleware
    app.use(flash());
    
    // For iframe contexts (like Forma), we need sameSite: 'none'
    // This requires secure: true in production (HTTPS)
    // For local development, Chrome may still block this - use Firefox or disable SameSite enforcement
    const isProduction = process.env.NODE_ENV === 'production';
    
    const sessionConfig = {
        secret: process.env.SESSION_SECRET || 'henn-secret-key-change-in-production',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: isProduction, // Must be true in production for sameSite: 'none'
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
            sameSite: 'none' // Required for cross-origin iframe cookies
        }
    };
    
    console.log('=== SESSION CONFIG ===');
    console.log('Environment:', isProduction ? 'PRODUCTION' : 'DEVELOPMENT');
    console.log('Session secret:', sessionConfig.secret ? '[SET]' : '[NOT SET]');
    console.log('Cookie settings:', sessionConfig.cookie);
    console.log('⚠️  sameSite: none requires HTTPS in production');
    console.log('⚠️  For local dev in Chrome, you may need to disable SameSite enforcement');
    
    app.use(session(sessionConfig));

    // Passport middleware
    app.use(passport.initialize());
    app.use(passport.session());
    app.use(methodOverride('_method'));

    console.log('✅ Authentication middleware initialized');
}

module.exports = setupAuth;
