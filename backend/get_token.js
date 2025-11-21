
import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import open from 'open';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from parent directory
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// --- ⚠️ Configuration: Get from .env file ---
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

// 2. Make sure this exact URL is listed under "Callback URL" in your APS App.
const REDIRECT_URI = 'http://localhost:8080/';

// 3. Define the permissions your script needs.
// To upload files and interact with Forma data, you'll need at least data:read and data:write.
const SCOPES = 'data:read data:write';
// --- End of Configuration ---

const app = express();
const port = 8080;
let server; // To hold the server instance

// Autodesk Authentication Endpoints
const AUTH_URL = 'https://developer.api.autodesk.com/authentication/v2/authorize';
const TOKEN_URL = 'https://developer.api.autodesk.com/authentication/v2/token';

// Validate configuration
if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('❌ Error: CLIENT_ID and CLIENT_SECRET must be set in .env file');
    process.exit(1);
}

/**
 * Generates a URL-safe random string for the code verifier.
 */
function base64URLEncode(str) {
    return str.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

/**
 * Hashes the code verifier using SHA256 to create the code challenge.
 */
function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest();
}

// 1. Generate the Code Verifier and Code Challenge for PKCE
const code_verifier = base64URLEncode(crypto.randomBytes(32));
const code_challenge = base64URLEncode(sha256(code_verifier));

// Start the local server to listen for the callback
server = app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
    
    // 2. Construct the Authorization URL
    const authParams = new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: SCOPES,
        prompt: 'login', // Forces the user to log in again
        code_challenge: code_challenge,
        code_challenge_method: 'S256'
    });

    const authorizationUrl = `${AUTH_URL}?${authParams.toString()}`;

    console.log('Opening your browser for Autodesk login...');
    console.log('If it does not open, please copy and paste this URL into your browser:');
    console.log(authorizationUrl);

    // 3. Open the user's browser to the authorization URL
    open(authorizationUrl);
});

// 4. Handle the callback from Autodesk
app.get('/', async (req, res) => {
    const authCode = req.query.code;

    if (!authCode) {
        res.status(400).send('Error: Authorization code not found.');
        return;
    }

    console.log('Authorization code received. Exchanging for a token...');
    res.send('Success! You can close this tab now. Check your terminal for the token.');

    try {
        // 5. Exchange the Authorization Code for an Access Token
        const tokenParams = new URLSearchParams({
            grant_type: 'authorization_code',
            code: authCode,
            redirect_uri: REDIRECT_URI,
            code_verifier: code_verifier
        });

        const response = await axios.post(TOKEN_URL, tokenParams.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                // Basic Authentication: base64(CLIENT_ID:CLIENT_SECRET)
                'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`
            }
        });

        const { access_token, refresh_token, expires_in } = response.data;

        console.log('\n--- 🔑 Your Forma API Token ---');
        console.log('Access Token (Bearer Token):');
        console.log(access_token);
        console.log(`\nExpires in: ${expires_in} seconds (approx. ${Math.floor(expires_in / 60)} minutes)`);
        
        if (refresh_token) {
            console.log('\n--- Refresh Token ---');
            console.log('Use this to get a new access token when the current one expires:');
            console.log(refresh_token);
        }

        // Auto-update .env file
        console.log('\n--- 💾 Updating .env file ---');
        const envPath = path.join(__dirname, '..', '.env');
        let envContent = fs.readFileSync(envPath, 'utf8');

        // Replace BEARER_TOKEN (for backend)
        envContent = envContent.replace(/BEARER_TOKEN=.*/g, `BEARER_TOKEN=${access_token}`);
        
        // Replace VITE_BEARER_TOKEN (for frontend fallback)
        envContent = envContent.replace(/VITE_BEARER_TOKEN=.*/g, `VITE_BEARER_TOKEN=${access_token}`);
        
        // Replace REFRESH_TOKEN if a new one was provided
        if (refresh_token) {
            envContent = envContent.replace(/REFRESH_TOKEN=.*/g, `REFRESH_TOKEN=${refresh_token}`);
        }

        fs.writeFileSync(envPath, envContent);
        console.log('✅ .env file updated with new tokens!');
        console.log('   - BEARER_TOKEN updated (backend)');
        console.log('   - VITE_BEARER_TOKEN updated (frontend)');
        if (refresh_token) {
            console.log('   - REFRESH_TOKEN updated');
        }
        console.log('\n💡 Remember to restart your servers to pick up the new tokens:');
        console.log('   Backend: cd backend && npm start');
        console.log('   Frontend: npm run dev');

    } catch (error) {
        console.error('\n--- ❌ Error fetching token ---');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        } else {
            console.error(error.message);
        }
    } finally {
        // 6. Shut down the local server
        console.log('\nShutting down local server.');
        server.close();
    }
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Error: Port ${port} is already in use. Please close the other application or change the port in the script.`);
    } else {
        console.error('Server error:', err);
    }
});
