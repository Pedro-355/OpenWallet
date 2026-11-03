# Sobe o OpenWallet no seu computador (Windows) e deixa ele acessível SÓ para os seus aparelhos,
# com HTTPS, pela sua rede privada Tailscale. Depois é só instalar no celular.
#
# Uso (no PowerShell, na pasta do projeto):
#   powershell -ExecutionPolicy Bypass -File scripts\celular.ps1          # sobe / atualiza
#   powershell -ExecutionPolicy Bypass -File scripts\celular.ps1 parar    # desliga
param([string]$Acao = "subir")
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$EnvFile = ".env.pessoal"
function Compose { docker compose -f docker-compose.pessoal.yml --env-file $EnvFile @args }
function Erro($msg) { Write-Host "X $msg" -ForegroundColor Red; exit 1 }
function Ok($msg) { Write-Host "OK $msg" -ForegroundColor Green }

if ($Acao -eq "parar") {
  try { tailscale serve --https=443 off | Out-Null } catch {}
  Compose down
  Ok "OpenWallet parado. Seus dados continuam guardados."
  exit 0
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Erro "Instale o Docker Desktop: https://www.docker.com/products/docker-desktop" }
docker info *> $null; if ($LASTEXITCODE -ne 0) { Erro "Abra o Docker Desktop e espere ele ficar pronto." }
if (-not (Get-Command tailscale -ErrorAction SilentlyContinue)) { Erro "Instale o Tailscale neste computador: https://tailscale.com/download" }

$status = tailscale status --json | ConvertFrom-Json
$Dns = ($status.Self.DNSName -replace '\.$', '')
if (-not $Dns) { Erro "Entre no Tailscale primeiro (ícone na bandeja → Log in)." }
$Url = "https://$Dns"

if (-not (Test-Path $EnvFile)) {
  $chars = [char[]]'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  $bytes = New-Object byte[] 48
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $secret = -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
  Set-Content -Path $EnvFile -Value "JWT_SECRET=$secret`nPUBLIC_URL=$Url" -NoNewline -Encoding ascii
  Ok "Configuração criada em $EnvFile"
} else {
  $content = Get-Content $EnvFile -Raw
  if ($content -notmatch [regex]::Escape("PUBLIC_URL=$Url")) {
    ($content -replace 'PUBLIC_URL=.*', "PUBLIC_URL=$Url") | Set-Content $EnvFile -NoNewline -Encoding ascii
    Ok "Endereço atualizado para $Url"
  }
}

Write-Host "... montando e subindo o app (a primeira vez leva alguns minutos)"
Compose up -d --build
if ($LASTEXITCODE -ne 0) { Erro "Falha ao subir os containers." }

Write-Host -NoNewline "... esperando o app ficar pronto"
$pronto = $false
for ($i = 0; $i -lt 90; $i++) {
  try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8080/health/ready -TimeoutSec 2 | Out-Null; $pronto = $true; break }
  catch { Write-Host -NoNewline "."; Start-Sleep 2 }
}
Write-Host ""
if (-not $pronto) { Erro "O app não respondeu. Veja: docker compose -f docker-compose.pessoal.yml logs app" }
Ok "App rodando"

# Na 1a vez o Tailscale pode mostrar um link para liberar o HTTPS: abra, aprove e ele continua.
tailscale serve --bg http://127.0.0.1:8080
if ($LASTEXITCODE -ne 0) { Erro "O Tailscale não liberou o HTTPS. Abra https://login.tailscale.com/admin/dns, ative 'MagicDNS' e 'HTTPS Certificates' e rode de novo." }
Ok "Acesso pelo celular liberado"

Write-Host @"

------------------------------------------------------------
  Pronto! Endereço do seu OpenWallet (só seus aparelhos acessam):

      $Url

  No celular Android:
   1. Instale o app Tailscale e entre com a MESMA conta deste computador.
   2. Abra o endereço acima no Chrome (o 1º acesso pode levar alguns segundos).
   3. Toque em "Instalar" (ou menu ⋮ → Instalar app).

  O app funciona enquanto este computador estiver ligado.
  Para desligar: powershell -ExecutionPolicy Bypass -File scripts\celular.ps1 parar
------------------------------------------------------------
"@
