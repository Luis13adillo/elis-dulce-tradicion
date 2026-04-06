import express from 'express';
import { Resend } from 'resend';
import db from '../db/sqlite-connection.js';

const router = express.Router();

// Lazy initialization of Resend client
let resendClient = null;
function getResendClient() {
  if (!resendClient && process.env.RESEND_API_KEY) {
    try {
      resendClient = new Resend(process.env.RESEND_API_KEY);
      console.log('✅ Resend client initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Resend client:', error);
    }
  }
  return resendClient;
}

// Subscribe to newsletter
router.post('/subscribe', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    
    console.log(`📧 Newsletter subscription request: ${email}`);
    
    // Store in database (optional - for tracking)
    try {
      // Check if email already exists
      const existing = db.prepare('SELECT * FROM newsletter_subscribers WHERE email = ?').get(email);
      
      if (!existing) {
        db.prepare(`
          INSERT INTO newsletter_subscribers (email, subscribed_at, status)
          VALUES (?, datetime('now'), 'active')
        `).run(email);
        console.log(`   ✅ Email saved to database: ${email}`);
      } else {
        console.log(`   ℹ️  Email already subscribed: ${email}`);
      }
    } catch (dbError) {
      // Table might not exist, that's okay - we'll still send the email
      console.log('   ⚠️  Database table not found, skipping database save');
    }
    
    // Send welcome email via Resend
    const resend = getResendClient();
    if (resend && process.env.RESEND_FROM_EMAIL) {
      try {
        const newsletterHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400&family=Nunito:wght@400;600;700&display=swap');
    body { margin: 0; padding: 0; background-color: #f0ebe0; }
  </style>
</head>
<body style="margin:0;padding:20px 0;background-color:#f0ebe0;font-family:'Nunito',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;border-radius:14px;overflow:hidden;box-shadow:0 6px 32px rgba(0,0,0,0.18);">

    <!-- Header -->
    <div style="background:linear-gradient(160deg,#1A1A2E 0%,#0d0d1a 100%);padding:30px 40px 24px;text-align:center;border-bottom:3px solid #C6A649;">
      <img src="https://elisbakery.com/logo.png" alt="Eli's Dulce Tradición" width="80" height="80"
           style="display:block;margin:0 auto 12px;width:80px;height:80px;object-fit:contain;border-radius:50%;border:2px solid #C6A649;" />
      <div style="color:#C6A649;font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;letter-spacing:1px;line-height:1.2;">
        Eli's Dulce Tradición
      </div>
      <div style="color:rgba(198,166,73,0.6);font-size:11px;letter-spacing:3px;text-transform:uppercase;margin-top:5px;">
        Custom Cakes &bull; Norristown, PA
      </div>
    </div>

    <!-- Title Band -->
    <div style="background:linear-gradient(135deg,#C6A649 0%,#d4af37 50%,#b8902f 100%);padding:20px 40px;text-align:center;">
      <h1 style="color:#1A1A2E;margin:0;font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-size:23px;font-weight:700;letter-spacing:0.5px;line-height:1.3;">
        🎂 Welcome to Our Newsletter!
      </h1>
    </div>

    <!-- Body -->
    <div style="background:#ffffff;padding:36px 40px;border-left:1px solid #e8dcc8;border-right:1px solid #e8dcc8;">
      <p style="font-size:15px;color:#555;margin:0 0 20px;">
        Thank you for subscribing! You'll be the first to know about our sweet creations and special offers.
      </p>

      <div style="background:#faf8f4;border-radius:10px;padding:20px 24px;margin:0 0 24px;border-left:4px solid #C6A649;">
        <p style="color:#777;font-size:13px;margin:0 0 10px;font-weight:700;">As a subscriber you'll receive:</p>
        <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;">
          <tr><td style="padding:6px 0;color:#1A1A2E;font-size:14px;">🎂 &nbsp;New cake flavors and seasonal specials</td></tr>
          <tr><td style="padding:6px 0;color:#1A1A2E;font-size:14px;">🎉 &nbsp;Exclusive promotions and discounts</td></tr>
          <tr><td style="padding:6px 0;color:#1A1A2E;font-size:14px;">📸 &nbsp;Behind-the-scenes bakery updates</td></tr>
          <tr><td style="padding:6px 0;color:#1A1A2E;font-size:14px;">📅 &nbsp;Upcoming events and celebrations</td></tr>
        </table>
      </div>

      <div style="text-align:center;margin:28px 0 0;">
        <a href="https://elisbakery.com" style="background:linear-gradient(135deg,#C6A649 0%,#d4af37 100%);color:#1A1A2E;padding:14px 36px;text-decoration:none;border-radius:7px;display:inline-block;font-weight:700;font-size:15px;letter-spacing:0.5px;">
          Visit Our Website &rarr;
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:linear-gradient(160deg,#1A1A2E 0%,#0d0d1a 100%);padding:26px 40px;text-align:center;border-top:3px solid #C6A649;border-radius:0 0 14px 14px;">
      <div style="color:#C6A649;font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:13px;margin-bottom:10px;letter-spacing:1px;">
        Dulce Tradición &bull; Est. 1990
      </div>
      <div style="color:rgba(255,255,255,0.65);font-size:12px;line-height:2;margin-bottom:6px;">
        📞 (610) 279-6200 &nbsp;&bull;&nbsp; ✉️ orders@elisbakery.com
      </div>
      <div style="color:rgba(255,255,255,0.4);font-size:11px;margin-bottom:14px;">
        324 W Marshall St, Norristown, PA 19401
      </div>
      <div style="border-top:1px solid rgba(198,166,73,0.25);padding-top:12px;">
        <a href="https://elisbakery.com" style="color:#C6A649;text-decoration:none;font-size:12px;letter-spacing:0.5px;">elisbakery.com</a>
      </div>
    </div>

  </div>
</body>
</html>`;

        const emailResult = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL,
          to: email,
          subject: "Welcome to Eli's Dulce Tradición!",
          html: newsletterHtml,
        });
        
        console.log(`   ✅ Welcome email sent via Resend: ${emailResult.id}`);
      } catch (emailError) {
        console.error('   ❌ Failed to send email via Resend:', emailError);
        // Don't fail the request if email fails
      }
    } else {
      console.log('   ⚠️  Resend not configured, skipping email send');
    }
    
    res.json({ 
      success: true, 
      message: 'Successfully subscribed to newsletter' 
    });
  } catch (error) {
    console.error('Error subscribing to newsletter:', error);
    res.status(500).json({ error: 'Failed to subscribe to newsletter' });
  }
});

export default router;

