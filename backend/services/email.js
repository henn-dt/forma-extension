const nodemailer = require('nodemailer');

/**
 * Email Service for sending password reset emails
 * 
 * For Microsoft 365 / Outlook, you need to:
 * 1. Use your company email (name.surname@henn.com)
 * 2. Generate an App Password (if MFA is enabled) or use your regular password
 * 
 * To generate an App Password for Microsoft 365:
 * 1. Go to https://account.microsoft.com/security
 * 2. Select "Security" > "Advanced security options"
 * 3. Under "App passwords", click "Create a new app password"
 * 4. Copy the generated password and use it as EMAIL_PASSWORD in .env
 */

// Create transporter for Microsoft 365 / Outlook
const createTransporter = () => {
    return nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.office365.com',
        port: parseInt(process.env.EMAIL_PORT) || 587,
        secure: false, // true for 465, false for other ports (STARTTLS)
        auth: {
            user: process.env.EMAIL_USER, // your-name@henn.com
            pass: process.env.EMAIL_PASSWORD, // your password or app password
        },
        tls: {
            ciphers: 'SSLv3',
            rejectUnauthorized: false
        }
    });
};

/**
 * Send password reset email
 * @param {string} toEmail - Recipient email address
 * @param {string} resetUrl - Password reset URL with token
 * @returns {Promise<object>} - Nodemailer send result
 */
async function sendPasswordResetEmail(toEmail, resetUrl) {
    // Check if email is configured
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
        console.warn('⚠️ Email not configured. Set EMAIL_USER and EMAIL_PASSWORD in .env');
        console.log('📧 Password reset URL (copy manually):', resetUrl);
        return { 
            success: true, 
            message: 'Email not configured - URL logged to console',
            resetUrl 
        };
    }

    const transporter = createTransporter();

    const mailOptions = {
        from: `"HENN Tree Detection" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: 'Reset Your Password - HENN Tree Detection',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { text-align: center; margin-bottom: 30px; }
                    .logo { font-size: 24px; font-weight: bold; color: #1a1a1a; }
                    .button { 
                        display: inline-block; 
                        background: #9cff80; 
                        color: #1a1a1a; 
                        padding: 14px 28px; 
                        text-decoration: none; 
                        border-radius: 8px; 
                        font-weight: bold;
                        margin: 20px 0;
                    }
                    .button:hover { background: #8ae670; }
                    .footer { margin-top: 30px; font-size: 12px; color: #666; text-align: center; }
                    .warning { color: #666; font-size: 14px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="logo">HENN</div>
                    </div>
                    
                    <h2>Password Reset Request</h2>
                    
                    <p>Hello,</p>
                    
                    <p>We received a request to reset your password for the HENN Tree Detection extension. Click the button below to set a new password:</p>
                    
                    <p style="text-align: center;">
                        <a href="${resetUrl}" class="button">Reset Password</a>
                    </p>
                    
                    <p class="warning">This link will expire in <strong>1 hour</strong>.</p>
                    
                    <p class="warning">If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.</p>
                    
                    <p>If the button doesn't work, copy and paste this link into your browser:</p>
                    <p style="word-break: break-all; color: #666; font-size: 12px;">${resetUrl}</p>
                    
                    <div class="footer">
                        <p>© ${new Date().getFullYear()} HENN. All rights reserved.</p>
                        <p>This is an automated message, please do not reply.</p>
                    </div>
                </div>
            </body>
            </html>
        `,
        text: `
Password Reset Request

Hello,

We received a request to reset your password for the HENN Tree Detection extension.

Click this link to reset your password:
${resetUrl}

This link will expire in 1 hour.

If you didn't request this password reset, you can safely ignore this email.

© ${new Date().getFullYear()} HENN. All rights reserved.
        `
    };

    try {
        console.log('📧 Sending password reset email to:', toEmail);
        const result = await transporter.sendMail(mailOptions);
        console.log('✅ Email sent successfully:', result.messageId);
        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error('❌ Failed to send email:', error.message);
        
        // Still log the URL so user can manually share it
        console.log('📧 Password reset URL (send manually):', resetUrl);
        
        throw error;
    }
}

/**
 * Test email configuration
 * @returns {Promise<boolean>} - Whether the test was successful
 */
async function testEmailConfig() {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
        console.log('❌ Email not configured. Add to .env:');
        console.log('   EMAIL_USER=your-name@henn.com');
        console.log('   EMAIL_PASSWORD=your-app-password');
        return false;
    }

    const transporter = createTransporter();
    
    try {
        await transporter.verify();
        console.log('✅ Email configuration is valid');
        return true;
    } catch (error) {
        console.error('❌ Email configuration error:', error.message);
        return false;
    }
}

module.exports = {
    sendPasswordResetEmail,
    testEmailConfig
};
