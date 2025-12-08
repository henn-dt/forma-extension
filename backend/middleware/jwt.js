const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'henn-jwt-secret-change-in-production';
const JWT_EXPIRES_IN = '24h'; // Token valid for 24 hours

/**
 * Create a JWT token for a user
 */
function createToken(user) {
    const payload = {
        id: user.id,
        email: user.email,
        name: user.name
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify JWT token from Authorization header
 * Supports both: "Bearer <token>" and just "<token>"
 */
function verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

/**
 * Middleware to authenticate requests using JWT
 * Checks Authorization header: "Bearer <token>"
 * On success, sets req.user with decoded token payload
 */
function authenticateJWT(req, res, next) {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader) {
        return res.status(401).json({ authenticated: false, error: 'No token provided' });
    }
    
    // Support both "Bearer <token>" and just "<token>"
    const token = authHeader.startsWith('Bearer ') 
        ? authHeader.slice(7) 
        : authHeader;
    
    try {
        const decoded = verifyToken(token);
        req.user = decoded;
        next();
    } catch (err) {
        console.log('JWT verification failed:', err.message);
        return res.status(401).json({ authenticated: false, error: 'Invalid or expired token' });
    }
}

/**
 * Middleware that checks JWT OR session (for gradual migration)
 * Prefers JWT if Authorization header is present
 */
function authenticateAny(req, res, next) {
    const authHeader = req.headers['authorization'];
    
    // If Authorization header present, use JWT
    if (authHeader) {
        const token = authHeader.startsWith('Bearer ') 
            ? authHeader.slice(7) 
            : authHeader;
        
        try {
            const decoded = verifyToken(token);
            req.user = decoded;
            return next();
        } catch (err) {
            // JWT invalid, fall through to session check
        }
    }
    
    // Fall back to session-based auth
    if (req.isAuthenticated && req.isAuthenticated()) {
        return next();
    }
    
    return res.status(401).json({ authenticated: false, error: 'Unauthorized' });
}

module.exports = {
    createToken,
    verifyToken,
    authenticateJWT,
    authenticateAny,
    JWT_SECRET
};
