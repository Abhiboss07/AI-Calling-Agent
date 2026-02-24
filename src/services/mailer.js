const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// Create reusable transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD
  }
});

/**
 * Send verification code email
 * @param {string} email - Recipient email
 * @param {string} code - 6-digit verification code
 * @param {string} name - User's name
 */
// Sanitize HTML to prevent XSS in emails
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendVerificationCode(email, code, name = 'User') {
  const safeName = escapeHtml(name);
  const safeCode = escapeHtml(code);
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background:#f8f9fa;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
      <div style="max-width:480px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
        <!-- Header -->
        <div style="background:linear-gradient(135deg,#2563EB,#60A5FA);padding:32px;text-align:center;">
          <div style="width:48px;height:48px;background:rgba(255,255,255,0.2);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
            <span style="font-size:24px;color:white;">🏠</span>
          </div>
          <h1 style="color:white;margin:0;font-size:20px;font-weight:700;">Estate Agent</h1>
          <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:13px;">AI Calling Dashboard</p>
        </div>

        <!-- Body -->
        <div style="padding:32px;">
          <h2 style="color:#111827;margin:0 0 8px;font-size:18px;">Hello ${safeName},</h2>
          <p style="color:#6b7280;margin:0 0 24px;font-size:14px;line-height:1.6;">
            Use the verification code below to complete your registration.
          </p>

          <!-- Code -->
          <div style="background:#EFF6FF;border:2px solid #2563EB;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
            <div style="font-size:32px;font-weight:800;letter-spacing:8px;color:#2563EB;">${safeCode}</div>
          </div>

          <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.5;">
            This code expires in <strong>10 minutes</strong>. If you didn't request this, please ignore this email.
          </p>
        </div>

        <!-- Footer -->
        <div style="background:#f8f9fa;padding:16px 32px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="color:#9ca3af;font-size:11px;margin:0;">© ${new Date().getFullYear()} Estate Agent. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: `"Estate Agent" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject: `${code} — Your Estate Agent Verification Code`,
      html
    });
    logger.log(`Verification email sent to ${email}`);
    return true;
  } catch (err) {
    logger.error('Failed to send verification email', err.message);
    throw new Error('Failed to send verification email. Please check SMTP settings.');
  }
}

module.exports = { sendVerificationCode };
