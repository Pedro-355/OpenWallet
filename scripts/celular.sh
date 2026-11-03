#!/usr/bin/env bash
# Sobe o OpenWallet no seu computador e deixa ele acessível SÓ para os seus aparelhos,
# com HTTPS, pela sua rede privada Tailscale. Depois é só instalar no celular.
#
# Uso:  ./scripts/celular.sh          (sobe / atualiza)
#       ./scripts/celular.sh parar    (desliga o app e o acesso pelo celular)
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=.env.pessoal
COMPOSE=(docker compose -f docker-compose.pessoal.yml --env-file "$ENV_FILE")

erro() { echo "✗ $*" >&2; exit 1; }
ok()   { echo "✓ $*"; }

if [[ "${1:-}" == "parar" ]]; then
  tailscale serve --https=443 off 2>/dev/null || true
  "${COMPOSE[@]}" down
  ok "OpenWallet parado. Seus dados continuam guardados."
  exit 0
fi

command -v docker >/dev/null    || erro "Instale o Docker Desktop: https://www.docker.com/products/docker-desktop"
docker info >/dev/null 2>&1     || erro "Abra o Docker Desktop e espere ele ficar pronto."
# No Mac, o Tailscale da App Store não coloca o comando no PATH.
if ! command -v tailscale >/dev/null && [[ -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ]]; then
  tailscale() { /Applications/Tailscale.app/Contents/MacOS/Tailscale "$@"; }
fi
command -v tailscale >/dev/null || type tailscale >/dev/null 2>&1 || erro "Instale o Tailscale neste computador: https://tailscale.com/download"

# Nome deste computador na sua rede Tailscale (ex.: meu-pc.tail1234.ts.net)
STATUS=$(tailscale status --json 2>/dev/null || true)
if command -v jq >/dev/null; then
  DNS=$(jq -r '.Self.DNSName // empty' <<<"$STATUS")
elif command -v python3 >/dev/null; then
  DNS=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("Self",{}).get("DNSName",""))' <<<"$STATUS" 2>/dev/null || true)
else
  DNS=$(sed -n '/"Self"/,/}/s/.*"DNSName": *"\([^"]*\)".*/\1/p' <<<"$STATUS" | head -1)
fi
DNS=${DNS%.}
[[ -n "$DNS" ]] || erro "Entre no Tailscale primeiro:  tailscale up"
URL="https://$DNS"

if [[ ! -f "$ENV_FILE" ]]; then
  SECRET=$(set +o pipefail; LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 48)
  printf 'JWT_SECRET=%s\nPUBLIC_URL=%s\n' "$SECRET" "$URL" > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  ok "Configuração criada em $ENV_FILE"
elif ! grep -q "^PUBLIC_URL=$URL$" "$ENV_FILE"; then
  sed -i.bak "s#^PUBLIC_URL=.*#PUBLIC_URL=$URL#" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
  ok "Endereço atualizado para $URL"
fi

echo "… montando e subindo o app (a primeira vez leva alguns minutos)"
"${COMPOSE[@]}" up -d --build

echo -n "… esperando o app ficar pronto"
for _ in $(seq 1 90); do
  if curl -fs http://127.0.0.1:8080/health/ready >/dev/null 2>&1; then echo; ok "App rodando"; break; fi
  echo -n "."; sleep 2
done
curl -fs http://127.0.0.1:8080/health/ready >/dev/null 2>&1 || erro "O app não respondeu. Veja: docker compose -f docker-compose.pessoal.yml logs app"

# HTTPS com certificado válido, visível só dentro da sua rede Tailscale.
# Na 1ª vez o Tailscale pode mostrar um link para você liberar o HTTPS: abra, aprove e ele continua.
if ! tailscale serve --bg http://127.0.0.1:8080; then
  erro "O Tailscale não liberou o HTTPS. Abra https://login.tailscale.com/admin/dns, ative 'MagicDNS' e 'HTTPS Certificates' e rode de novo."
fi
ok "Acesso pelo celular liberado"

cat <<EOF

────────────────────────────────────────────────────────────
  Pronto! Endereço do seu OpenWallet (só seus aparelhos acessam):

      $URL

  No celular Android:
   1. Instale o app Tailscale e entre com a MESMA conta deste computador.
   2. Abra o endereço acima no Chrome (o 1º acesso pode levar alguns segundos).
   3. Toque em "Instalar" (ou menu ⋮ → Instalar app).

  O app funciona enquanto este computador estiver ligado.
  Para desligar:  ./scripts/celular.sh parar
────────────────────────────────────────────────────────────
EOF
