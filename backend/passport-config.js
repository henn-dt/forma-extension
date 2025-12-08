const LocalStrategy = require('passport-local').Strategy
const argon2 = require('argon2')

function initialize(passport, getUserByEmail, getUserById) {
    const authenticateUser = async (email, password, done) => {
        try {
            const user = await getUserByEmail(email)
            console.log('Authenticating user:', email);

            if (user == null) {
                console.log('No user found with email:', email);
                return done(null, false, { message: 'No user with that email' })
            }

            // Verify password using Argon2
            // Since this is a custom collection, Directus doesn't provide a login API for it.
            // We must verify the hash locally. Directus uses Argon2 by default.
            let isMatch = false;
            if (user.password) {
                try {
                    // Directus stores hash in standard MCF format which argon2.verify can handle
                    isMatch = await argon2.verify(user.password, password);
                } catch (err) {
                    console.error('Argon2 verification error:', err);
                    isMatch = false;
                }
            }

            if (isMatch) {
                console.log('Password matched for user:', email);
                return done(null, user)
            } else {
                console.log('Password incorrect for user:', email);
                return done(null, false, { message: 'Password incorrect' })
            }
        } catch (e) {
            console.error('Error during authentication:', e);
            return done(e)
        }
    }

    passport.use(new LocalStrategy({ usernameField: 'email' }, authenticateUser))
    passport.serializeUser((user, done) => done(null, user.id))
    passport.deserializeUser(async (id, done) => {
        try {
            const user = await getUserById(id);
            done(null, user);
        } catch (error) {
            done(error, null);
        }
    })
}

module.exports = initialize
