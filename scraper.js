/**
 * Reddit Prospector — CP Cabinets & Quartz
 *
 * Roda diariamente (cron) e envia digest para Sarah + Eveline revisarem.
 * Foca em pessoas comprando NOVOS cabinets/countertops em SC — não reparos.
 */

require('dotenv').config();
const fetch   = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const OpenAI  = require('openai');
const nodemailer = require('nodemailer');

// ── Config ───────────────────────────────────────────────────────────────────

const DRY_RUN      = process.argv.includes('--dry-run');
const CP_CLIENT_ID = '5221cab9-a741-4ddc-a752-2359826fba95';
const SCHEDULE_URL = 'https://leads.btechsouto.shop/schedule/cp-cabinets';
const WEBSITE_URL  = 'https://cpcabinets.com';
const BUSINESS     = 'CP Cabinets & Quartz';
const SHOWROOM     = 'Columbia, SC';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Service Zones CP Cabinets (50 milhas de cada centro) ─────────────────────

const SERVICE_ZONES = [
  { city: 'Columbia',   lat: 34.0007, lng: -81.0348 },
  { city: 'Greenville', lat: 34.8526, lng: -82.3940 },
  { city: 'Charleston', lat: 32.7765, lng: -79.9311 },
  { city: 'Charlotte',  lat: 35.2271, lng: -80.8431 },
];
const MAX_RADIUS_MILES = 50;

// Haversine — distância em milhas entre dois pontos lat/lng
function haversine(lat1, lng1, lat2, lng2) {
  const R  = 3958.8; // raio da Terra em milhas
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Retorna true se lat/lng estiver dentro do raio de QUALQUER zona
function isInServiceArea(lat, lng) {
  return SERVICE_ZONES.some(z => haversine(lat, lng, z.lat, z.lng) <= MAX_RADIUS_MILES);
}

// Palavras-chave de cidades/regiões alvo para filtro rápido em texto
const TARGET_CITIES = [
  'south carolina', ' sc ', ' sc,', 'columbia', 'lexington', 'chapin', 'irmo', 'cayce', 'lugoff',
  'greenville', 'simpsonville', 'spartanburg', 'anderson',
  'charleston', 'summerville', 'goose creek', 'north charleston', 'mount pleasant',
  'charlotte', 'rock hill', 'fort mill',
  'orangeburg', 'aiken', 'florence', 'myrtle beach',
];

// ── Targets — Reddit + Fóruns via Google Custom Search ───────────────────────

const REDDIT_TARGETS = [
  // Subreddits locais SC/NC — keywords diretas (alta intenção local)
  { sub: 'columbiasc',         geo: true  },
  { sub: 'charleston',         geo: true  },
  { sub: 'Greenville',         geo: true  },
  { sub: 'Charlotte',          geo: true  },
  // Nichos 100% de alta intenção — exige menção de cidade SC no texto
  { sub: 'Cabinets',           geo: false },
  { sub: 'Countertops',        geo: false },
  { sub: 'remodeling',         geo: false },
  { sub: 'HomeImprovement',    geo: false },
  { sub: 'FirstTimeHomeBuyer', geo: false },
  { sub: 'realestate',         geo: false },
  { sub: 'KitchenRemodel',     geo: false },
];

// Fóruns para busca via Google Custom Search
const FORUM_SEARCHES = [
  // Houzz — fórum de reforma com alta intenção de compra
  'site:houzz.com/discussions "cabinet" ("Columbia" OR "Lexington" OR "Greenville" OR "Charleston" OR "South Carolina")',
  'site:houzz.com/discussions "quartz countertop" ("SC" OR "South Carolina" OR "Charlotte")',
  // DoItYourself / ContractorTalk / HomeTalk
  'site:doityourself.com/forum "kitchen remodel" ("Columbia SC" OR "Greenville SC" OR "Charleston SC")',
  'site:contractortalk.com "cabinet installer" "South Carolina"',
  'site:hometalk.com "kitchen renovation" ("Columbia" OR "Lexington" OR "South Carolina")',
  // Nextdoor — vizinhos pedindo indicação de empreiteiro
  'site:nextdoor.com "kitchen cabinets" ("Columbia" OR "Lexington" OR "Irmo" OR "Chapin" OR "Greenville" OR "South Carolina")',
  'site:nextdoor.com "countertop" ("Columbia SC" OR "Greenville SC" OR "Charleston SC")',
  // Angi / HomeAdvisor — pedidos de orçamento públicos
  'site:angi.com "kitchen cabinet" ("Columbia" OR "Greenville" OR "Charleston" OR "SC")',
  'site:homeadvisor.com "kitchen remodel" ("South Carolina" OR "Columbia SC" OR "Greenville SC")',
];

// Keywords de COMPRA NOVA — não reparos
const BUY_KEYWORDS = [
  'new kitchen cabinets',
  'custom cabinets',
  'kitchen remodel',
  'kitchen renovation',
  'new countertops',
  'quartz countertops',
  'granite countertops',
  'kitchen makeover',
  'new construction kitchen',
  'bathroom vanity replacement',
  'cabinet installation quote',
  'countertop estimate',
  'closing on a house',
  'just bought a house',
  'renovating before move',
];

// Para subs nacionais, adiciona localização SC
const GEO_SUFFIXES = [
  'south carolina', 'columbia sc', 'charleston sc',
  'greenville sc', 'lexington sc', 'summerville sc',
];

// Descarta imediatamente — reparos e ruídos
const DISCARD_KEYWORDS = [
  'repair', 'fix', 'broken', 'cracked', 'scratched', 'chip', 'chipped',
  'already installed', 'finished', 'done', 'completed',
  'selling', 'for sale', 'diy', 'ikea', 'amazon', 'lowes', 'home depot',
  'canada', 'australia', 'uk', 'england', 'london', 'toronto',
  'tutorial', 'youtube', 'how to paint', 'how to refinish',
  'california', 'texas', 'florida', 'new york', 'ohio', 'michigan',
  'illinois', 'pennsylvania', 'georgia', 'virginia', 'new jersey',
];

// ── RSS Parser ────────────────────────────────────────────────────────────────

function stripHtml(html) {
  return (html || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#32;/g, ' ').replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseAtomFeed(xml, subreddit) {
  const entries    = [];
  const entryBlocks = xml.match(/<entry>([\s\S]*?)<\/entry>/g) || [];

  for (const block of entryBlocks) {
    const author  = (block.match(/<name>\/u\/([^<]+)<\/name>/) || [])[1] || '[deleted]';
    const title   = (block.match(/<title>([^<]+)<\/title>/)    || [])[1] || '';
    const link    = (block.match(/<link href="([^"]+)"/)        || [])[1] || '';
    const content = (block.match(/<content[^>]*>([\s\S]*?)<\/content>/) || [])[1] || '';
    const updated = (block.match(/<updated>([^<]+)<\/updated>/)  || [])[1] || '';
    const sub     = (block.match(/term="([^"]+)"/)               || [])[1] || subreddit;

    if (!link.includes('/comments/')) continue;

    entries.push({
      author,
      title:                   title.trim(),
      selftext:                stripHtml(content).slice(0, 800),
      permalink:               link.replace('https://www.reddit.com', ''),
      subreddit:               sub,
      subreddit_name_prefixed: `r/${sub}`,
      created_utc:             updated ? new Date(updated).getTime() / 1000 : Date.now() / 1000,
      url: link,
    });
  }
  return entries;
}

async function fetchRSS(subreddit, query) {
  const url = `https://www.reddit.com/r/${subreddit}/search.rss`
    + `?q=${encodeURIComponent(query)}&restrict_sr=1&sort=new&t=month&limit=25`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 BTechProspector/1.0 contact:brunosouto1108@gmail.com' },
    });
    if (!res.ok) { console.warn(`  RSS ${res.status}: r/${subreddit}`); return []; }
    return parseAtomFeed(await res.text(), subreddit);
  } catch (e) {
    console.warn(`  RSS error: ${e.message}`); return [];
  }
}

// ── Bark.com direto — projetos públicos por localização ──────────────────────

async function searchBark() {
  const results = [];
  const targets = [
    'kitchen-cabinet-installation/south-carolina',
    'countertop-installation/south-carolina',
    'kitchen-remodeling/south-carolina',
    'cabinet-maker/south-carolina',
  ];

  for (const path of targets) {
    try {
      const url = `https://www.bark.com/find/${path}/`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (!res.ok) continue;
      const html = await res.text();

      // Extrai cards de projetos do HTML
      const cardMatches = html.matchAll(/<div[^>]*class="[^"]*request-card[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g);
      for (const m of cardMatches) {
        const block   = m[1];
        const title   = (block.match(/<h\d[^>]*>([^<]+)<\/h\d>/) || [])[1]?.trim() || '';
        const snippet = (block.match(/<p[^>]*>([^<]+)<\/p>/) || [])[1]?.trim() || '';
        const city    = (block.match(/class="[^"]*location[^"]*"[^>]*>([^<]+)<\//) || [])[1]?.trim() || 'SC';
        if (!title || title.length < 10) continue;
        results.push({
          author:      'bark_user',
          title,
          selftext:    snippet,
          permalink:   '',
          post_url:    url,
          subreddit:   'bark.com',
          subreddit_name_prefixed: 'bark.com',
          created_utc: Date.now() / 1000,
          source:      'bark',
        });
      }
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.warn(`  Bark error: ${e.message}`);
    }
  }
  return results;
}

// ── Craigslist RSS — seção "wanted" das cidades SC/NC ────────────────────────

const CRAIGSLIST_CITIES = [
  'columbia',   // Columbia SC
  'charleston', // Charleston SC
  'greenville', // Greenville SC
  'charlotte',  // Charlotte NC
];

const CRAIGSLIST_KEYWORDS = [
  'kitchen cabinets',
  'cabinet installation',
  'countertop installation',
  'kitchen remodel',
  'quartz countertop',
  'bathroom vanity',
];

function parseCraigslistRSS(xml, city) {
  const items = [];
  const blocks = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

  for (const block of blocks) {
    const rawTitle = (block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1] || '';
    const rawLink  = (block.match(/<link>(https?:[^<]+)<\/link>/)                           || [])[1] || '';
    const rawDesc  = (block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/) || [])[1] || '';
    const pubDate  = (block.match(/<pubDate>([^<]+)<\/pubDate>/)                            || [])[1] || '';

    const title = rawTitle.trim();
    const link  = rawLink.trim();
    if (!title || !link || title.toLowerCase() === 'craigslist') continue;

    items.push({
      author:      'craigslist_user',
      title,
      selftext:    stripHtml(rawDesc).slice(0, 800),
      permalink:   '',
      post_url:    link,
      subreddit:   `craigslist-${city}`,
      subreddit_name_prefixed: `craigslist/${city}`,
      created_utc: pubDate ? new Date(pubDate).getTime() / 1000 : Date.now() / 1000,
      source:      'craigslist',
    });
  }
  return items;
}

async function searchCraigslist() {
  const results = [];

  for (const city of CRAIGSLIST_CITIES) {
    for (const kw of CRAIGSLIST_KEYWORDS) {
      const url = `https://${city}.craigslist.org/search/wan?format=rss&query=${encodeURIComponent(kw)}&sort=date`;
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 BTechProspector/1.0 contact:brunosouto1108@gmail.com' },
        });
        if (!res.ok) { console.warn(`  Craigslist ${res.status}: ${city}/${kw}`); continue; }
        const xml   = await res.text();
        const posts = parseCraigslistRSS(xml, city);
        results.push(...posts);
      } catch (e) {
        console.warn(`  Craigslist error ${city}/${kw}: ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 600));
    }
  }
  return results;
}

// ── Google Custom Search — fóruns especializados ─────────────────────────────

async function searchForums() {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const cx     = process.env.GOOGLE_SEARCH_CX;
  if (!apiKey || !cx) return [];

  const results = [];
  for (const q of FORUM_SEARCHES) {
    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(q)}&num=5&dateRestrict=m1`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      for (const item of (data.items || [])) {
        results.push({
          author:      'forum_user',
          title:       item.title.replace(/ \| Houzz$| - DoItYourself\.com.*$| - HomeTalk.*$/i, ''),
          selftext:    item.snippet || '',
          permalink:   '',
          post_url:    item.link,
          subreddit:   new URL(item.link).hostname.replace('www.', ''),
          subreddit_name_prefixed: new URL(item.link).hostname.replace('www.', ''),
          created_utc: Date.now() / 1000 - 86400,
          source:      'forum',
        });
      }
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      console.warn(`  Forum search error: ${e.message}`);
    }
  }
  return results;
}

// ── Filters ───────────────────────────────────────────────────────────────────

function isRelevant(post) {
  const text = `${post.title} ${post.selftext}`.toLowerCase();

  // Descarta reparos e ruídos
  if (DISCARD_KEYWORDS.some(k => text.includes(k))) return false;

  // Sem conteúdo
  if (post.title.length < 15) return false;

  // Post muito antigo (> 30 dias)
  const ageDays = (Date.now() / 1000 - post.created_utc) / 86400;
  if (ageDays > 30) return false;

  // Usuário deletado
  if (post.author === '[deleted]') return false;

  return true;
}

// Filtro geográfico por menção de cidade/região alvo no texto
function mentionsTargetArea(post) {
  const text = `${post.title} ${post.selftext}`.toLowerCase();
  return TARGET_CITIES.some(city => text.includes(city));
}

// ── GPT — avalia intenção e gera DM focado em VENDA NOVA ────────────────────

async function assessAndGenerateDM(post) {
  const postText = `${post.title}\n${post.selftext}`.slice(0, 700);

  const prompt = `You analyze Reddit posts to find people who want to BUY NEW kitchen cabinets or countertops (quartz/granite) in the South Carolina / Southeast US area.

CP Cabinets & Quartz sells ONLY:
- Brand new custom kitchen cabinets
- Quartz and granite countertops
- Complete kitchen/bathroom renovations with new materials
They do NOT do repairs, touch-ups, painting, or small fixes.

Reddit post from r/${post.subreddit}:
"${postText}"

Evaluate:
1. PURCHASE INTENT (1-10): Are they planning to BUY NEW cabinets or countertops? (Score 8-10 = actively planning a new purchase/renovation, 5-7 = considering, 1-4 = not relevant or just a repair)
2. Are they in or near South Carolina? (or open to visit a showroom)
3. Worth contacting? YES only if intent >= 7 AND they're looking for something new (not a repair)

If worth contacting, write a SHORT natural Reddit DM (3-4 sentences) that:
- Feels like a genuine recommendation from a real person, NOT a bot
- References something specific from their post
- Mentions CP Cabinets & Quartz is in Columbia, SC with a showroom
- Offers a free in-home estimate OR showroom visit
- Ends with this link naturally: ${SCHEDULE_URL}
- NO emojis, NO "Hey there!", NO corporate tone
- Sound like: "Saw your post about [X]. We actually specialize in exactly that at CP Cabinets in Columbia. [1 sentence value prop]. Happy to give you a free estimate: [link]"

Respond ONLY with this JSON:
{
  "intent_score": <1-10>,
  "in_area": <true/false/unknown>,
  "worth_contacting": <true/false>,
  "reason": "<1 sentence why or why not>",
  "dm_text": "<the DM or null>"
}`;

  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.6,
    max_tokens: 350,
  });

  try {
    return JSON.parse(res.choices[0].message.content.replace(/```json\n?|\n?```/g, ''));
  } catch {
    return { intent_score: 0, in_area: false, worth_contacting: false, dm_text: null };
  }
}

// ── Supabase ──────────────────────────────────────────────────────────────────

async function alreadyProcessed(username, postUrl) {
  const { data } = await supabase
    .from('outbound_prospects')
    .select('id')
    .eq('username', username)
    .eq('post_url', postUrl)
    .maybeSingle();
  return !!data;
}

async function saveProspect(post, assessment) {
  const { error } = await supabase.from('outbound_prospects').insert({
    client_id:    CP_CLIENT_ID,
    source:       'reddit',
    username:     post.author,
    post_url:     `https://reddit.com${post.permalink}`,
    subreddit:    post.subreddit,
    post_title:   post.title,
    post_content: post.selftext?.slice(0, 1000) || '',
    intent_score: assessment.intent_score,
    dm_text:      assessment.dm_text,
    dm_sent:      false,
  });
  if (error && !error.message.includes('unique')) console.error('Supabase error:', error.message);
}

// ── Email digest — para Sarah e Eveline revisarem ────────────────────────────

async function sendDigestEmail(prospects) {
  if (prospects.length === 0) {
    console.log('Nenhum prospect novo — email não enviado.');
    return;
  }

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

  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const prospectCards = prospects.map((p, i) => {
    const scoreColor = p.intent_score >= 8 ? '#16a34a' : '#d97706';
    const scoreBg    = p.intent_score >= 8 ? '#f0fdf4' : '#fffbeb';
    const scoreBorder = p.intent_score >= 8 ? '#bbf7d0' : '#fde68a';
    return `
    <div style="border:1px solid ${scoreBorder};border-radius:12px;padding:20px;margin-bottom:16px;background:${scoreBg}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;flex-wrap:wrap;gap:8px">
        <div>
          <span style="font-size:13px;font-weight:700;color:#1e40af">u/${p.author}</span>
          <span style="color:#6b7280;font-size:12px"> · r/${p.subreddit}</span>
        </div>
        <span style="background:${scoreColor};color:#fff;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700">
          Intent ${p.intent_score}/10
        </span>
      </div>

      <p style="margin:0 0 8px;font-weight:700;color:#111827;font-size:14px">${p.title}</p>

      ${p.selftext ? `<p style="margin:0 0 12px;font-size:12px;color:#4b5563;font-style:italic;line-height:1.5">"${p.selftext.slice(0, 220)}${p.selftext.length > 220 ? '…' : ''}"</p>` : ''}

      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:10px">
        <p style="margin:0 0 6px;font-size:10px;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">
          ✉️ Message Ready to Send on Reddit
        </p>
        <p style="margin:0;font-size:13px;color:#1f2937;line-height:1.6;white-space:pre-line">${p.dm_text}</p>
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <a href="https://www.reddit.com/message/compose/?to=${p.author}&subject=Your+kitchen+project"
           style="background:#ff4500;color:#fff;padding:7px 16px;border-radius:6px;text-decoration:none;font-size:12px;font-weight:700">
          Send on Reddit →
        </a>
        <a href="https://www.reddit.com${p.permalink}"
           style="background:#f3f4f6;color:#374151;padding:7px 16px;border-radius:6px;text-decoration:none;font-size:12px;font-weight:600">
          View Post
        </a>
        <a href="${WEBSITE_URL}"
           style="background:#1e3a5f;color:#fff;padding:7px 16px;border-radius:6px;text-decoration:none;font-size:12px;font-weight:600">
          cpcabinets.com
        </a>
      </div>
    </div>`;
  }).join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">

<div style="max-width:620px;margin:0 auto;padding:24px 16px">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1e3a5f 0%,#2d5a9e 100%);border-radius:14px;padding:28px;margin-bottom:24px;text-align:center">
    <p style="margin:0 0 4px;color:rgba(255,255,255,0.7);font-size:12px;text-transform:uppercase;letter-spacing:1px">${date}</p>
    <h1 style="margin:0 0 6px;color:#fff;font-size:22px;font-weight:800">
      🎯 ${prospects.length} New Lead${prospects.length > 1 ? 's' : ''} Ready for Review
    </h1>
    <p style="margin:0;color:rgba(255,255,255,0.8);font-size:14px">CP Cabinets & Quartz · Outreach System</p>
  </div>

  <!-- Instructions -->
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:18px;margin-bottom:20px">
    <p style="margin:0 0 8px;font-weight:700;color:#111827;font-size:14px">📋 How it works:</p>
    <ol style="margin:0;padding-left:18px;color:#4b5563;font-size:13px;line-height:1.8">
      <li>Review the leads below — these are people on Reddit looking for NEW kitchen cabinets or countertops</li>
      <li>Click <strong>"Send on Reddit"</strong> for the ones that look promising — the message is already written</li>
      <li>When they respond and share their contact info, Alice calls them automatically</li>
      <li>They get a showroom invite email + follow-up sequence</li>
    </ol>
  </div>

  <!-- Prospects -->
  <p style="font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px">
    TODAY'S PROSPECTS (score ≥ 7/10)
  </p>

  ${prospectCards}

  <!-- Footer -->
  <div style="text-align:center;padding:20px 0;border-top:1px solid #e5e7eb;margin-top:8px">
    <p style="margin:0 0 4px;font-size:12px;color:#9ca3af">CP Cabinets & Quartz · Outreach System by BTech</p>
    <p style="margin:0;font-size:11px;color:#d1d5db">Max 10 messages/day on Reddit to stay safe · Focus on scores 8+</p>
  </div>

</div>
</body>
</html>`;

  const recipients = [
    process.env.DIGEST_EMAIL || 'brunosouto1108@gmail.com',
    'carvalhopintoge@gmail.com',
    'contact@cpcabinets.com',
  ].filter(Boolean).join(', ');

  await transporter.sendMail({
    from:    `"CP Cabinets Outreach" <${process.env.GMAIL_USER}>`,
    to:      recipients,
    subject: `🎯 ${prospects.length} New Leads Ready — CP Cabinets (${date})`,
    html,
  });

  console.log(`✅ Digest enviado para: ${recipients}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔍 CP Cabinets Prospector — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`${new Date().toISOString()}\n`);

  const newProspects = [];
  const seen         = new Set();

  // ── Reddit ────────────────────────────────────────────────────────────────
  for (const { sub, geo } of REDDIT_TARGETS) {
    const queries = geo
      ? BUY_KEYWORDS
      : BUY_KEYWORDS.slice(0, 5).map(k => `${k} ${GEO_SUFFIXES[Math.floor(Math.random() * GEO_SUFFIXES.length)]}`);

    for (const query of queries) {
      console.log(`  r/${sub} → "${query}"`);
      const posts = await fetchRSS(sub, query);

      for (const post of posts) {
        const key = `${post.author}::${post.permalink}`;
        if (seen.has(key)) continue;
        seen.add(key);

        if (!isRelevant(post)) continue;

        // Para subs nacionais sem geo: exige menção de cidade-alvo no texto
        if (!geo && !mentionsTargetArea(post)) continue;

        const done = await alreadyProcessed(post.author, `https://reddit.com${post.permalink}`);
        if (done) continue;

        console.log(`  → u/${post.author} | ${post.title.slice(0, 60)}`);

        let assessment;
        try {
          assessment = await assessAndGenerateDM(post);
        } catch (e) {
          console.warn(`  GPT error: ${e.message}`);
          continue;
        }

        console.log(`    Score: ${assessment.intent_score}/10 · ${assessment.reason}`);

        if (!assessment.worth_contacting) continue;

        if (!DRY_RUN) await saveProspect(post, assessment);

        newProspects.push({ ...post, ...assessment });
        await new Promise(r => setTimeout(r, 1000));
      }
      await new Promise(r => setTimeout(r, 600));
    }
  }

  // ── Bark.com — projetos públicos SC ──────────────────────────────────────
  console.log('\n  🔍 Buscando projetos no Bark.com...');
  const barkPosts = await searchBark();
  console.log(`  ${barkPosts.length} projetos encontrados no Bark.`);
  for (const post of barkPosts) {
    const key = `bark::${post.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!isRelevant(post)) continue;
    const done = await alreadyProcessed('bark_user', post.post_url + post.title);
    if (done) continue;
    let assessment;
    try { assessment = await assessAndGenerateDM(post); } catch { continue; }
    console.log(`    [Bark] ${post.title.slice(0,50)} · ${assessment.intent_score}/10`);
    if (!assessment.worth_contacting) continue;
    if (!DRY_RUN) await saveProspect({ ...post, author: 'bark_user', permalink: '' }, assessment);
    newProspects.push({ ...post, ...assessment });
    await new Promise(r => setTimeout(r, 800));
  }

  // ── Craigslist — seção "wanted" das cidades SC/NC ────────────────────────
  console.log('\n  🔍 Buscando no Craigslist (wanted — SC/NC)...');
  const craigslistPosts = await searchCraigslist();
  console.log(`  ${craigslistPosts.length} posts encontrados no Craigslist.`);
  for (const post of craigslistPosts) {
    const key = `craigslist::${post.post_url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!isRelevant(post)) continue;
    const done = await alreadyProcessed('craigslist_user', post.post_url);
    if (done) continue;
    console.log(`  → [CL] ${post.subreddit} | ${post.title.slice(0, 60)}`);
    let assessment;
    try { assessment = await assessAndGenerateDM(post); } catch (e) { console.warn(`  GPT error: ${e.message}`); continue; }
    console.log(`    Score: ${assessment.intent_score}/10 · ${assessment.reason}`);
    if (!assessment.worth_contacting) continue;
    if (!DRY_RUN) await saveProspect({ ...post, author: 'craigslist_user', permalink: '' }, assessment);
    newProspects.push({ ...post, ...assessment });
    await new Promise(r => setTimeout(r, 800));
  }

  // ── Fóruns via Google Custom Search ──────────────────────────────────────
  console.log('\n  🔍 Buscando em fóruns especializados (Houzz, Nextdoor, Angi, etc.)...');
  const forumPosts = await searchForums();
  console.log(`  ${forumPosts.length} resultados de fóruns encontrados.`);

  for (const post of forumPosts) {
    const key = `forum::${post.post_url}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (!isRelevant(post)) continue;

    const done = await alreadyProcessed('forum_user', post.post_url || '');
    if (done) continue;

    console.log(`  → [Forum] ${post.subreddit} | ${post.title.slice(0, 60)}`);

    let assessment;
    try {
      assessment = await assessAndGenerateDM(post);
    } catch (e) {
      console.warn(`  GPT error: ${e.message}`); continue;
    }

    console.log(`    Score: ${assessment.intent_score}/10 · ${assessment.reason}`);
    if (!assessment.worth_contacting) continue;

    if (!DRY_RUN) {
      await supabase.from('outbound_prospects').insert({
        client_id:    CP_CLIENT_ID,
        source:       'forum',
        username:     'forum_user',
        post_url:     post.post_url,
        subreddit:    post.subreddit,
        post_title:   post.title,
        post_content: post.selftext?.slice(0, 1000) || '',
        intent_score: assessment.intent_score,
        dm_text:      assessment.dm_text,
        dm_sent:      false,
      }).on('conflict', 'post_url', qb => qb.ignoreDuplicates());
    }

    newProspects.push({ ...post, ...assessment });
    await new Promise(r => setTimeout(r, 800));
  }

  console.log(`\n✅ ${newProspects.length} prospects qualificados.`);

  if (DRY_RUN) {
    for (const p of newProspects) {
      console.log(`\nu/${p.author} · r/${p.subreddit} · ${p.intent_score}/10`);
      console.log(`"${p.title}"`);
      console.log(`DM: ${p.dm_text}`);
    }
    return;
  }

  await sendDigestEmail(newProspects);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
