#!/bin/bash
# Reddit Prospector — Setup no VPS
# Cole este script no terminal SSH do VPS: bash setup-vps.sh

set -e
echo "🚀 Instalando Reddit Prospector no VPS..."

# 1. Instala Node.js se não tiver
if ! command -v node &> /dev/null; then
  echo "📦 Instalando Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "✅ Node $(node -v)"

# 2. Cria diretório e clona o repositório
mkdir -p /opt/reddit-prospector
cd /opt/reddit-prospector

if [ -d ".git" ]; then
  echo "📥 Atualizando repositório..."
  git pull
else
  echo "📥 Clonando repositório..."
  git clone https://github.com/Bsouto319/reddit-prospector.git .
fi

# 3. Instala dependências
npm install --production
echo "✅ Dependências instaladas"

# 4. Cria o .env com as credenciais
cat > .env << 'ENVEOF'
SUPABASE_URL=https://pvphgusjofufwtyiyviu.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2cGhndXNqb2Z1Znd0eWl5dml1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjkwODYsImV4cCI6MjA5MDg0NTA4Nn0.0aA8YNmhVusNuBjWZoEZW50dTRZWowm9AoNVoyGCXBM

OPENAI_API_KEY=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

GMAIL_USER=brunosouto1108@gmail.com
GMAIL_CLIENT_ID=155394808256-r9ro0qj2dtv701bjdtlala1urlvcradq.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=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
GMAIL_REFRESH_TOKEN=1//0hbFieiT7JlDbCgYIARAAGBESNwF-L9IrG5UaJQNxedxYC3kS2z533RgLOpY_SOzTaCHJmlk5CpLqGKKqQch-i7YUQRLHFysoT0I
GMAIL_ACCESS_TOKEN=ya29.a0AQvPyIOA5ZjsT-6LLXJQ3aqKRlvbPSWd8VtCEtQQ0SwsuH_KaZ8CRjSwSklhAegK_wPc6-3ne2sIP8GuH2rW30aR8tr6BZEmV7NDXHQa_wlr2ZWSOh9P9QhPzCaBOuJp8Lt8VyonDujrCgX_GibHFUTQzHtPm-sLRMtWGP-mgNb4YXs5-mmoH_1ntkG7y9s3RUeTu-QaCgYKAT0SARQSFQHGX2Miqoo1Zuh3CLubteNEgJZb6Q0206

DIGEST_EMAIL=brunosouto1108@gmail.com

GOOGLE_SEARCH_API_KEY=AIzaSyA5GqmiACXNlpU0CxfUwzjBangELcwhIFE
GOOGLE_SEARCH_CX=065f0114011c447f8
ENVEOF

echo "✅ .env criado"

# 5. Cria pasta de logs
mkdir -p /opt/reddit-prospector/logs

# 6. Testa rápido (sem enviar email)
echo "🔍 Testando scraper (dry-run de 30s)..."
timeout 30 node scraper.js --dry-run 2>&1 | head -20 || echo "(timeout — normal em dry-run longo)"

# 7. Configura o cron — roda todo dia às 8h (horário de Brasília = 11h UTC)
CRON_JOB="0 11 * * * cd /opt/reddit-prospector && /usr/bin/node scraper.js >> /opt/reddit-prospector/logs/scraper.log 2>&1"

# Adiciona só se não existir
(crontab -l 2>/dev/null | grep -q "reddit-prospector") \
  && echo "✅ Cron já existe" \
  || (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo ""
echo "✅ =============================================="
echo "✅  Reddit Prospector configurado no VPS!"
echo "✅ =============================================="
echo ""
echo "📅 Cron: todo dia às 8h (Brasília)"
echo "📂 Pasta: /opt/reddit-prospector"
echo "📋 Logs: /opt/reddit-prospector/logs/scraper.log"
echo ""
echo "Para testar manualmente:"
echo "  cd /opt/reddit-prospector && node scraper.js"
echo ""
echo "Para ver os logs:"
echo "  tail -f /opt/reddit-prospector/logs/scraper.log"
echo ""
echo "Para ver o cron:"
echo "  crontab -l"
