/**
 * Reenvia o digest para Sarah + Eveline + Bruno.
 * Explicação em Português. Cards com layout fixo para email.
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

function scoreLabel(s) {
  if (s >= 9) return '🔥 HOT LEAD';
  if (s >= 8) return '🟠 Muito Quente';
  if (s >= 7) return '🟡 Bom Lead';
  return '🟢 Monitorar';
}

function scoreColor(s) {
  if (s >= 9) return { bg: '#fef2f2', border: '#fecaca', badge: '#dc2626', text: '#7f1d1d' };
  if (s >= 8) return { bg: '#fff7ed', border: '#fed7aa', badge: '#ea580c', text: '#7c2d12' };
  if (s >= 7) return { bg: '#fefce8', border: '#fde68a', badge: '#d97706', text: '#78350f' };
  return      { bg: '#f0fdf4', border: '#bbf7d0', badge: '#16a34a', text: '#14532d' };
}

async function run() {
  const { data, error } = await supabase
    .from('outbound_prospects')
    .select('*')
    .eq('client_id', CP_CLIENT_ID)
    .eq('dm_sent', false)
    .order('intent_score', { ascending: false });

  if (error) { console.error(error.message); return; }
  const prospects = data || [];
  if (!prospects.length) { console.log('Nenhum prospect para enviar.'); return; }

  const date = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  // ── Cards dos leads ───────────────────────────────────────────────────────
  const cards = prospects.map((p, idx) => {
    const c      = scoreColor(p.intent_score);
    const dmUrl  = `https://www.reddit.com/message/compose/?to=${p.username}&subject=Kitchen+project`;
    const postLink = p.post_url || 'https://reddit.com';

    return `
<!-- LEAD CARD ${idx + 1} -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;border-radius:12px;border:1px solid ${c.border};background:${c.bg};border-collapse:separate">
  <tr>
    <td style="padding:18px 20px 0 20px">
      <!-- Header: username + score badge -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td>
            <span style="font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:#1e40af">u/${p.username}</span>
            <span style="font-family:Arial,sans-serif;font-size:12px;color:#6b7280;font-weight:400"> · r/${p.subreddit}</span>
          </td>
          <td align="right" style="white-space:nowrap">
            <span style="font-family:Arial,sans-serif;background:${c.badge};color:#ffffff;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;display:inline-block">
              ${scoreLabel(p.intent_score)} · ${p.intent_score}/10
            </span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Title -->
  <tr>
    <td style="padding:10px 20px 0 20px">
      <p style="margin:0;font-family:Arial,sans-serif;font-size:15px;font-weight:700;color:#111827;line-height:1.4">${p.post_title}</p>
    </td>
  </tr>

  ${p.post_content ? `
  <!-- Quote -->
  <tr>
    <td style="padding:8px 20px 0 20px">
      <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#4b5563;font-style:italic;line-height:1.6;border-left:3px solid ${c.badge};padding-left:10px">"${p.post_content.slice(0, 200)}${p.post_content.length > 200 ? '…' : ''}"</p>
    </td>
  </tr>` : ''}

  <!-- DM box -->
  <tr>
    <td style="padding:14px 20px 0 20px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px">
        <tr>
          <td style="padding:14px 16px">
            <p style="margin:0 0 8px 0;font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px">✉️ Mensagem pronta para enviar no Reddit:</p>
            <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:#1f2937;line-height:1.7">${p.dm_text}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Buttons -->
  <tr>
    <td style="padding:14px 20px 18px 20px">
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding-right:8px">
            <a href="${dmUrl}" style="font-family:Arial,sans-serif;display:inline-block;background:#ff4500;color:#ffffff;padding:9px 18px;border-radius:7px;text-decoration:none;font-size:13px;font-weight:700">
              Enviar no Reddit →
            </a>
          </td>
          <td style="padding-right:8px">
            <a href="${postLink}" style="font-family:Arial,sans-serif;display:inline-block;background:#f3f4f6;color:#374151;padding:9px 16px;border-radius:7px;text-decoration:none;font-size:13px;font-weight:600">
              Ver Post
            </a>
          </td>
          <td>
            <a href="${WEBSITE_URL}" style="font-family:Arial,sans-serif;display:inline-block;background:#1e3a5f;color:#ffffff;padding:9px 16px;border-radius:7px;text-decoration:none;font-size:13px;font-weight:600">
              cpcabinets.com
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
  }).join('\n');

  // ── HTML principal ────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6">
<tr><td align="center" style="padding:24px 16px">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%">

  <!-- LOGO -->
  <tr>
    <td align="center" style="background:#ffffff;border-radius:14px 14px 0 0;padding:20px 30px 16px;border-bottom:1px solid #e5e7eb">
      <img src="https://leads.btechsouto.shop/cp-cabinets-logo.png" alt="CP Cabinets &amp; Quartz" width="200" style="display:block;max-width:200px;height:auto;margin:0 auto" />
    </td>
  </tr>

  <!-- HEADER -->
  <tr>
    <td style="background:linear-gradient(135deg,#0f2057,#1e4d9b);border-radius:0 0 14px 14px;padding:26px 30px 30px;text-align:center">
      <p style="margin:0 0 4px 0;color:rgba(255,255,255,0.6);font-size:11px;text-transform:uppercase;letter-spacing:1.5px">${date}</p>
      <h1 style="margin:0 0 6px 0;color:#ffffff;font-size:22px;font-weight:800;line-height:1.2">
        🎯 ${prospects.length} Lead${prospects.length !== 1 ? 's' : ''} Pronto${prospects.length !== 1 ? 's' : ''} para Contato
      </h1>
      <p style="margin:0 0 18px 0;color:rgba(255,255,255,0.75);font-size:14px">CP Cabinets & Quartz · Sistema de Prospecção</p>
      <table align="center" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding-right:8px">
            <a href="${WEBSITE_URL}" style="display:inline-block;background:rgba(255,255,255,0.15);color:#ffffff;padding:8px 18px;border-radius:8px;text-decoration:none;font-size:12px;font-weight:600;border:1px solid rgba(255,255,255,0.25)">🏠 cpcabinets.com</a>
          </td>
          <td>
            <a href="${SCHEDULE_URL}" style="display:inline-block;background:#f59e0b;color:#ffffff;padding:8px 18px;border-radius:8px;text-decoration:none;font-size:12px;font-weight:700">📅 Agendar Visita</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <tr><td style="height:24px"></td></tr>

  <!-- O QUE É ESTE EMAIL? -->
  <tr>
    <td style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:20px">
      <p style="margin:0 0 8px 0;font-size:15px;font-weight:800;color:#92400e">💡 O que é este email?</p>
      <p style="margin:0;font-size:13px;color:#78350f;line-height:1.8">
        Todo dia de manhã, nosso sistema de inteligência artificial varre automaticamente o Reddit e fóruns especializados em busca de moradores da <strong>Carolina do Sul</strong> que estão planejando uma <strong>reforma na cozinha ou banheiro</strong> — exatamente o perfil de cliente da CP Cabinets.<br><br>
        Quando encontra alguém relevante, a IA escreve uma <strong>mensagem personalizada</strong> pronta para enviar. Você não precisa digitar nada — só clicar no botão laranja e mandar.
      </p>
    </td>
  </tr>

  <tr><td style="height:14px"></td></tr>

  <!-- COMO USAR -->
  <tr>
    <td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:20px">
      <p style="margin:0 0 16px 0;font-size:15px;font-weight:700;color:#111827">📋 Como usar em 3 passos:</p>

      <!-- Passo 1 -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px">
        <tr>
          <td width="40" valign="top">
            <span style="display:inline-block;background:#dbeafe;color:#1d4ed8;padding:5px 10px;border-radius:20px;font-size:12px;font-weight:800">1</span>
          </td>
          <td style="padding-left:10px">
            <p style="margin:0 0 3px 0;font-size:13px;font-weight:700;color:#111827">Leia o card do lead abaixo</p>
            <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5">Veja quem postou, o que disse e a pontuação que a IA deu. Score 7+ = bom lead. Score 8-10 = cliente quente, priorize esses.</p>
          </td>
        </tr>
      </table>

      <!-- Passo 2 -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px">
        <tr>
          <td width="40" valign="top">
            <span style="display:inline-block;background:#dcfce7;color:#15803d;padding:5px 10px;border-radius:20px;font-size:12px;font-weight:800">2</span>
          </td>
          <td style="padding-left:10px">
            <p style="margin:0 0 3px 0;font-size:13px;font-weight:700;color:#111827">Clique em "Enviar no Reddit" — mensagem já escrita</p>
            <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5">O botão laranja abre o Reddit com a mensagem personalizada já preenchida. Só clicar em enviar. Pronto.</p>
          </td>
        </tr>
      </table>

      <!-- Passo 3 -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px">
        <tr>
          <td width="40" valign="top">
            <span style="display:inline-block;background:#fef3c7;color:#d97706;padding:5px 10px;border-radius:20px;font-size:12px;font-weight:800">3</span>
          </td>
          <td style="padding-left:10px">
            <p style="margin:0 0 3px 0;font-size:13px;font-weight:700;color:#111827">Quando responder — mande o link de agendamento</p>
            <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5">Se a pessoa tiver interesse, responda com:<br><em style="color:#1d4ed8">"You can pick a time here: ${SCHEDULE_URL}"</em><br>Assim que preencher o formulário, a <strong>Alice liga automaticamente</strong> e agenda a visita ao showroom.</p>
          </td>
        </tr>
      </table>

      <!-- Aviso -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="background:#f9fafb;border-radius:8px;padding:12px;border:1px solid #e5e7eb">
            <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6">
              ⚠️ <strong>Importante:</strong> Envie no máximo <strong>10 mensagens por dia</strong> no Reddit para não ser bloqueado. Priorize sempre os leads com score <strong>8 ou mais</strong>.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <tr><td style="height:24px"></td></tr>

  <!-- TÍTULO DOS LEADS -->
  <tr>
    <td>
      <p style="margin:0 0 14px 0;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px">
        LEADS QUALIFICADOS DE HOJE (Score 7+/10)
      </p>
    </td>
  </tr>

  <!-- CARDS DOS LEADS -->
  <tr>
    <td>
      ${cards}
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="border-top:2px solid #e5e7eb;padding:20px 0 8px 0;text-align:center">
      <p style="margin:0 0 6px 0">
        <a href="${WEBSITE_URL}" style="color:#1e40af;font-weight:700;font-size:13px;text-decoration:none">cpcabinets.com</a>
        <span style="color:#d1d5db;margin:0 8px">·</span>
        <a href="${SCHEDULE_URL}" style="color:#1e40af;font-size:13px;text-decoration:none">Agendar Visita ao Showroom</a>
      </p>
      <p style="margin:0;font-size:11px;color:#9ca3af">
        Sistema de Prospecção Automática por BTech · Máximo 10 mensagens/dia no Reddit
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
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
    subject: `🎯 ${prospects.length} Lead${prospects.length !== 1 ? 's' : ''} Pronto${prospects.length !== 1 ? 's' : ''} para Contato — CP Cabinets`,
    html,
  });

  console.log(`✅ Email enviado para: ${to}`);
  console.log(`   ${prospects.length} prospects incluídos.`);
}

run().catch(console.error);
