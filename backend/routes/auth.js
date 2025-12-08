const express = require('express');
const router = express.Router();
const passport = require('passport');
const crypto = require('crypto');
const { createToken, verifyToken } = require('../middleware/jwt');

// Import directus service
const directusService = require('../services/directus');

// Login
router.post('/login', (req, res, next) => {
    console.log('=== LOGIN REQUEST ===');
    console.log('Request body:', { email: req.body.email, rememberMe: req.body.rememberMe });
    console.log('Session ID before auth:', req.sessionID);
    console.log('Session before auth:', req.session);
    
    passport.authenticate('local', (err, user, info) => {
        if (err) {
            console.error('Passport error:', err);
            return next(err);
        }
        if (!user) {
            console.log('Auth failed:', info?.message);
            return res.status(401).json({ error: info.message || 'Invalid credentials' });
        }

        console.log('User authenticated:', user.email);
        
        req.logIn(user, (err) => {
            if (err) {
                console.error('req.logIn error:', err);
                return next(err);
            }

            console.log('Session ID after login:', req.sessionID);
            console.log('Session after login:', req.session);
            console.log('req.user after login:', req.user?.email);
            console.log('req.isAuthenticated():', req.isAuthenticated());

            // Handle "Remember Me"
            if (req.body.rememberMe) {
                req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
            } else {
                req.session.cookie.expires = false; // Session cookie
            }

            // Force session save before responding
            req.session.save((saveErr) => {
                if (saveErr) {
                    console.error('Session save error:', saveErr);
                    return next(saveErr);
                }
                
                console.log('Session saved successfully');
                console.log('Session cookie settings:', req.session.cookie);
                
                // Create JWT token for the user
                const token = createToken(user);
                console.log('JWT token created for user:', user.email);
                
                return res.json({
                    success: true,
                    token, // Include JWT token in response
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email
                    }
                });
            });
        });
    })(req, res, next);
});

// Register
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Name, email and password are required' });
        }

        // Check if user exists
        const existingUser = await directusService.getUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        // DO NOT hash the password - Directus handles password hashing automatically
        // Send the raw password and Directus will hash it with its own hashing logic
        const newUser = await directusService.createUser({
            name,
            email,
            password: password
        });

        res.json({ success: true, message: 'Registration successful. Please login.' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

// Logout
router.post('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        req.session.destroy();
        res.json({ success: true, message: 'Logged out successfully' });
    });
});

// Forgot Password - triggers Directus Flow to send reset email
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        console.log('=== FORGOT PASSWORD REQUEST ===');
        console.log('Email:', email);

        // Check if user exists
        const user = await directusService.getUserByEmail(email);
        
        // Always return success to prevent email enumeration attacks
        // But only actually send email if user exists
        if (user) {
            // Generate a secure reset token
            const resetToken = crypto.randomBytes(32).toString('hex');
            const resetTokenExpiry = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now

            // Store the reset token in Directus (update user record)
            await directusService.updateUserResetToken(user.id, resetToken, resetTokenExpiry);
            console.log('Reset token stored for user:', email);

            // Trigger Directus Flow to send email
            // The flow will be triggered via a webhook or we send email directly
            await directusService.triggerPasswordResetEmail(email, resetToken);
            console.log('Password reset email triggered for:', email);
        } else {
            console.log('No user found with email:', email, '(not revealing to client)');
        }

        // Always return success (security best practice)
        res.json({ 
            success: true, 
            message: 'If an account exists with that email, a reset link has been sent.' 
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Failed to process request. Please try again.' });
    }
});

// Reset Password - validates token and updates password
router.post('/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return res.status(400).json({ error: 'Token and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        console.log('=== RESET PASSWORD REQUEST ===');

        // Find user by reset token
        const user = await directusService.getUserByResetToken(token);

        if (!user) {
            console.log('Invalid or expired reset token');
            return res.status(400).json({ error: 'Invalid or expired token' });
        }

        // Check if token has expired
        if (new Date(user.reset_token_expiry) < new Date()) {
            console.log('Reset token has expired');
            return res.status(400).json({ error: 'Invalid or expired token' });
        }

        // Update password and clear reset token
        // Let Directus hash the password (same as registration)
        await directusService.updateUserPassword(user.id, password);
        console.log('Password updated for user:', user.email);

        res.json({ success: true, message: 'Password reset successful' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Failed to reset password. Please try again.' });
    }
});

// Get Current User - supports both JWT and session
router.get('/user', (req, res) => {
    console.log('=== GET /api/user ===');
    
    // Check for JWT token first (preferred for iframe)
    const authHeader = req.headers['authorization'];
    if (authHeader) {
        const token = authHeader.startsWith('Bearer ') 
            ? authHeader.slice(7) 
            : authHeader;
        
        try {
            const decoded = verifyToken(token);
            console.log('JWT verified for user:', decoded.email);
            return res.json({
                authenticated: true,
                user: {
                    id: decoded.id,
                    name: decoded.name,
                    email: decoded.email
                }
            });
        } catch (err) {
            console.log('JWT verification failed:', err.message);
            // Fall through to session check
        }
    }
    
    // Fall back to session-based auth
    console.log('Checking session auth...');
    console.log('Session ID:', req.sessionID);
    console.log('req.user:', req.user);
    console.log('req.isAuthenticated():', req.isAuthenticated());
    
    if (req.isAuthenticated()) {
        res.json({
            authenticated: true,
            user: {
                id: req.user.id,
                name: req.user.name,
                email: req.user.email
            }
        });
    } else {
        res.json({ authenticated: false });
    }
});

// Middleware to check if authenticated (supports JWT or session)
function checkAuthenticated(req, res, next) {
    // Check JWT first
    const authHeader = req.headers['authorization'];
    if (authHeader) {
        const token = authHeader.startsWith('Bearer ') 
            ? authHeader.slice(7) 
            : authHeader;
        
        try {
            const decoded = verifyToken(token);
            req.user = decoded;
            return next();
        } catch (err) {
            // Fall through to session check
        }
    }
    
    // Fall back to session
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized. Please login.' });
}

module.exports = { router, checkAuthenticated };
