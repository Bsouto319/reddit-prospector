/**
 * Roda UMA VEZ para obter o refresh_token do Gmail.
 * Depois o scraper usa automaticamente.
 *
 * Como usar:
 *   node get-token.js
 *   → abre o browser no Google
 *   → você clica em "Permitir"
 *   → refresh_token aparece no terminal
 *   → cola no .env
 */

require('dotenv').config();
const http   = require('http');
const { exec } = require('child_process');
const fetch  = require('node-fetch');
const fs     = require('fs');

const CLIENT_ID     = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI  = 'http://localhost:3001';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('\nERROR: Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env first.\n');
  process.exit(1);
}
const SCOPE         = 'https://mail.google.com/';

const authUrl = `https://accounts.google.com/o/oauth2/auth`
  + `?client_id=${CLIENT_ID}`
  + `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
  + `&response_type=code`
  + `&scope=${encodeURIComponent(SCOPE)}`
  + `&access_type=offline`
  + `&prompt=consent`;

console.log('\n🔑 Gmail Token Setup\n');
console.log('Abrindo o browser para autorizar...\n');

// Abre o browser automaticamente
const openCmd = process.platform === 'win32' ? `start "" "${authUrl}"` : `open "${authUrl}"`;
exec(openCmd);

// Sobe servidor local para capturar o callback
const server = http.createServer(async (req, res) => {
  const url    = new URL(req.url, 'http://localhost:3001');
  const code   = url.searchParams.get('code');

  if (!code) {
    res.end('Erro: sem código. Tente novamente.');
    return;
  }

  res.end('<h2 style="font-family:sans-serif;color:green">✅ Autorizado! Pode fechar essa aba e voltar ao terminal.</h2>');

  // Troca o code pelo refresh_token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri:  REDIRECT_URI,
      grant_type:    'authorization_code',
    }),
  });

  const tokens = await tokenRes.json();

  if (tokens.error) {
    console.error('❌ Erro ao obter token:', tokens.error_description);
    server.close();
    return;
  }

  console.log('\n✅ SUCESSO! Copie a linha abaixo para o seu .env:\n');
  console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log(`GMAIL_ACCESS_TOKEN=${tokens.access_token}`);
  console.log('\nAdicione também no .env:');
  console.log(`GMAIL_USER=brunosouto1108@gmail.com`);
  console.log(`GMAIL_CLIENT_ID=${CLIENT_ID}`);
  console.log(`GMAIL_CLIENT_SECRET=${CLIENT_SECRET}\n`);

  // Salva automaticamente no .env
  const envPath = '.env';
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

  const lines = {
    GMAIL_USER:          'brunosouto1108@gmail.com',
    GMAIL_CLIENT_ID:     CLIENT_ID,
    GMAIL_CLIENT_SECRET: CLIENT_SECRET,
    GMAIL_REFRESH_TOKEN: tokens.refresh_token,
    GMAIL_ACCESS_TOKEN:  tokens.access_token,
  };

  for (const [key, val] of Object.entries(lines)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${val}`);
    } else {
      envContent += `\n${key}=${val}`;
    }
  }

  fs.writeFileSync(envPath, envContent.trim() + '\n');
  console.log('💾 .env atualizado automaticamente!\n');

  server.close();
  process.exit(0);
});

server.listen(3001, () => {
  console.log('Aguardando autorização em http://localhost:3001 ...');
  console.log('Se o browser não abriu, acesse manualmente:');
  console.log(authUrl + '\n');
});
