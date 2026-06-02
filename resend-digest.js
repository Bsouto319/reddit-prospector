/**
 * Reenvia o digest com os prospects já salvos no Supabase.
 * Útil para testar o email ou reenviar com template atualizado.
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

const SCHEDULE_URL = 'https://leads.btechsouto.shop/schedule/cp-cabinets';
const WEBSITE_URL  = 'https://cpcabinets.com';
const CP_CLIENT_ID = '5221cab9-a741-4ddc-a752-2359826fba95';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function run() {
  const { data, error } = await supabase
    .from('outbound_prospects')
    .select('*')
    .eq('client_id', CP_CLIENT_ID)
    .eq('dm_sent', false)
    .order('intent_score', { ascending: false });

  if (error) { console.error(error.message); return; }
  const prospects = data || [];
  if (!prospects.length) { console.log('No prospects to send.'); return; }

  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const cards = prospects.map(p => {
    const scoreColor  = p.intent_score >= 8 ? '#16a34a' : '#d97706';
    const scoreBg     = p.intent_score >= 8 ? '#f0fdf4' : '#fffbeb';
    const scoreBorder = p.intent_score >= 8 ? '#bbf7d0' : '#fde68a';
    const postLink    = p.post_url || `https://reddit.com`;
    const dmUrl       = `https://www.reddit.com/message/compose/?to=${p.username}&subject=Your+kitchen+project`;

    return `
    <div style="border:1px solid ${scoreBorder};border-radius:12px;padding:20px;margin-bottom:16px;background:${scoreBg}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:6px">
        <span style="font-weight:700;color:#1e40af;font-size:14px">u/${p.username}
          <span style="color:#6b7280;font-weight:400;font-size:12px"> · r/${p.subreddit}</span>
        </span>
        <span style="background:${scoreColor};color:#fff;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700">
          Intent ${p.intent_score}/10
        </span>
      </div>

      <p style="margin:0 0 8px;font-weight:700;color:#111827;font-size:15px">${p.post_title}</p>

      ${p.post_content ? `<p style="margin:0 0 12px;font-size:12px;color:#4b5563;font-style:italic;line-height:1.6">"${p.post_content.slice(0, 240)}${p.post_content.length > 240 ? '…' : ''}"</p>` : ''}

      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:14px">
        <p style="margin:0 0 8px;font-size:10px;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">
          ✉️ Message Ready — Copy & Send on Reddit
        </p>
        <p style="margin:0;font-size:13px;color:#1f2937;line-height:1.7;white-space:pre-line">${p.dm_text}</p>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a href="${dmUrl}"
           style="display:inline-block;background:#ff4500;color:#fff;padding:8px 18px;border-radius:7px;text-decoration:none;font-size:13px;font-weight:700">
          Send on Reddit →
        </a>
        <a href="${postLink}"
           style="display:inline-block;background:#f3f4f6;color:#374151;padding:8px 18px;border-radius:7px;text-decoration:none;font-size:13px;font-weight:600">
          View Post
        </a>
        <a href="${WEBSITE_URL}"
           style="display:inline-block;background:#1e3a5f;color:#fff;padding:8px 18px;border-radius:7px;text-decoration:none;font-size:13px;font-weight:600">
          cpcabinets.com
        </a>
      </div>
    </div>`;
  }).join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:640px;margin:0 auto;padding:28px 16px">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#0f2057 0%,#1e4d9b 100%);border-radius:16px;padding:32px;margin-bottom:24px;text-align:center">
    <p style="margin:0 0 6px;color:rgba(255,255,255,0.6);font-size:11px;text-transform:uppercase;letter-spacing:1.5px">${date}</p>
    <h1 style="margin:0 0 8px;color:#fff;font-size:24px;font-weight:800;line-height:1.2">
      🎯 ${prospects.length} New Lead${prospects.length !== 1 ? 's' : ''} Ready for Outreach
    </h1>
    <p style="margin:0;color:rgba(255,255,255,0.75);font-size:14px">CP Cabinets & Quartz · Reddit Outreach System</p>
    <div style="margin-top:18px;display:flex;justify-content:center;gap:12px;flex-wrap:wrap">
      <a href="${WEBSITE_URL}" style="background:rgba(255,255,255,0.15);color:#fff;padding:8px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;border:1px solid rgba(255,255,255,0.2)">
        🏠 cpcabinets.com
      </a>
      <a href="${SCHEDULE_URL}" style="background:#f59e0b;color:#fff;padding:8px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700">
        📅 Schedule a Visit
      </a>
    </div>
  </div>

  <!-- What is this? -->
  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:20px;margin-bottom:16px">
    <p style="margin:0 0 8px;font-weight:800;color:#92400e;font-size:14px">💡 What is this email?</p>
    <p style="margin:0;color:#78350f;font-size:13px;line-height:1.7">
      Every morning, our AI system automatically scans Reddit and home improvement forums looking for homeowners in <strong>South Carolina</strong> who are actively planning a <strong>kitchen or bathroom renovation</strong> — exactly the type of client CP Cabinets serves.<br><br>
      When it finds someone relevant, it writes a <strong>personalized message</strong> ready to be sent. All you need to do is click the button and send it. No typing required.
    </p>
  </div>

  <!-- Instructions -->
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:24px">
    <p style="margin:0 0 14px;font-weight:700;color:#111827;font-size:15px">📋 3 simple steps:</p>
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;align-items:flex-start;gap:14px">
        <div style="background:#dbeafe;color:#1d4ed8;padding:6px 12px;border-radius:20px;font-size:13px;font-weight:800;flex-shrink:0;min-width:28px;text-align:center">1</div>
        <div>
          <p style="margin:0 0 3px;font-weight:700;color:#111827;font-size:13px">Read the lead card below</p>
          <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.5">See which person posted, what they said, and what score our AI gave them (7+ = good quality, 8-10 = hot lead).</p>
        </div>
      </div>
      <div style="display:flex;align-items:flex-start;gap:14px">
        <div style="background:#dcfce7;color:#15803d;padding:6px 12px;border-radius:20px;font-size:13px;font-weight:800;flex-shrink:0;min-width:28px;text-align:center">2</div>
        <div>
          <p style="margin:0 0 3px;font-weight:700;color:#111827;font-size:13px">Click "Send on Reddit" — message already written</p>
          <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.5">The message below each card is personalized and ready. Just click the orange button, it opens Reddit with the message pre-filled. Hit send. Done.</p>
        </div>
      </div>
      <div style="display:flex;align-items:flex-start;gap:14px">
        <div style="background:#fef3c7;color:#d97706;padding:6px 12px;border-radius:20px;font-size:13px;font-weight:800;flex-shrink:0;min-width:28px;text-align:center">3</div>
        <div>
          <p style="margin:0 0 3px;font-weight:700;color:#111827;font-size:13px">When they reply — share the schedule link</p>
          <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.5">If they're interested, just reply with: <em>"You can pick a time here: <a href="${SCHEDULE_URL}" style="color:#1d4ed8">${SCHEDULE_URL}</a>"</em><br>The moment they fill out the form, <strong>Alice calls them automatically</strong> and schedules the showroom visit.</p>
        </div>
      </div>
    </div>
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid #f3f4f6;background:#f9fafb;border-radius:8px;padding:12px;margin-top:14px">
      <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6">
        ⚠️ <strong>Important:</strong> Send a maximum of <strong>10 messages per day</strong> on Reddit to avoid restrictions. Focus on leads with score <strong>8 or higher</strong> first.
      </p>
    </div>
  </div>

  <!-- Leads header -->
  <p style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:14px">
    TODAY'S QUALIFIED LEADS (Score 7+/10)
  </p>

  ${cards}

  <!-- Footer -->
  <div style="text-align:center;padding:24px 0 8px;border-top:2px solid #e5e7eb;margin-top:12px">
    <p style="margin:0 0 6px">
      <a href="${WEBSITE_URL}" style="color:#1e40af;font-weight:700;font-size:14px;text-decoration:none">cpcabinets.com</a>
      <span style="color:#d1d5db;margin:0 8px">·</span>
      <a href="${SCHEDULE_URL}" style="color:#1e40af;font-size:13px;text-decoration:none">Schedule a Showroom Visit</a>
    </p>
    <p style="margin:0;font-size:11px;color:#9ca3af">
      Powered by BTech Outreach System · Limit 10 Reddit messages/day to stay safe
    </p>
  </div>

</div>
</body>
</html>`;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type:         'OAuth2',
      user:         process.env.GMAIL_USER,
      clientId:     process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      accessToken:  process.env.GMAIL_ACCESS_TOKEN,
    },
  });

  const to = 'brunosouto1108@gmail.com, carvalhopintoge@gmail.com, contact@cpcabinets.com';

  await transporter.sendMail({
    from:    '"CP Cabinets Outreach" <' + process.env.GMAIL_USER + '>',
    to,
    subject: `🎯 ${prospects.length} New Leads Ready — CP Cabinets (${date})`,
    html,
  });

  console.log(`✅ Email sent to: ${to}`);
  console.log(`   ${prospects.length} prospects included.`);
}

run().catch(console.error);
