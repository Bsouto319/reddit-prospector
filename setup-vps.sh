#!/bin/bash
# Reddit Prospector — Setup no VPS
# Uso: bash setup-vps.sh
set -e

echo "🚀 Instalando Reddit Prospector no VPS..."

# 1. Node.js
if ! command -v node &> /dev/null; then
  echo "📦 Instalando Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "✅ Node $(node -v)"

# 2. Clonar / atualizar
mkdir -p /opt/reddit-prospector/logs
cd /opt/reddit-prospector

if [ -d ".git" ]; then
  git pull
else
  git clone https://github.com/Bsouto319/reddit-prospector.git .
fi

# 3. Dependências
npm install --production
echo "✅ Dependências instaladas"

# 4. Avisa sobre .env
if [ ! -f ".env" ]; then
  echo ""
  echo "⚠️  Arquivo .env não encontrado!"
  echo "    Crie manualmente com: nano /opt/reddit-prospector/.env"
  echo "    (use o .env.example como referência)"
  echo ""
fi

# 5. Cron — todo dia às 8h Brasília (11h UTC)
CRON_JOB="0 11 * * * cd /opt/reddit-prospector && /usr/bin/node scraper.js >> /opt/reddit-prospector/logs/scraper.log 2>&1"
(crontab -l 2>/dev/null | grep -q "reddit-prospector") \
  && echo "✅ Cron já existe" \
  || { (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -; echo "✅ Cron configurado"; }

echo ""
echo "✅ Setup concluído!"
echo "📅 Roda todo dia às 8h (Brasília)"
echo "📋 Logs: tail -f /opt/reddit-prospector/logs/scraper.log"
echo "🧪 Testar: cd /opt/reddit-prospector && node scraper.js --dry-run"
