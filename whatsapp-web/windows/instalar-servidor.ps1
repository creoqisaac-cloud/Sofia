# Pasa la Sofia de Mario a ESTE equipo (el que va a estar siempre prendido como servidor).
# Uso, en PowerShell, desde la carpeta que trajiste en la USB:
#
#   powershell -ExecutionPolicy Bypass -File .\instalar-servidor.ps1
#
# Hace: Git + Node + cloudflared (si faltan), baja el programa de GitHub, instala WhatsApp Web, restaura los datos
# de Mario (vinculo de WhatsApp, chats, clientes, llaves) desde sofia-datos.zip, usa la IA local de este equipo
# (Ollama) sin tunel, deja a Sofia arrancando sola al iniciar Windows y la abre.
# NUNCA sobrescribe datos que ya existan aqui. Solo letras sin acentos: Windows PowerShell lee este archivo en ANSI.
param(
  [string]$Paquete = (Join-Path $PSScriptRoot "sofia-datos.zip"),
  [string]$Carpeta = (Join-Path $env:USERPROFILE "Sofia"),
  [string]$Rama = "fix/clientes-lid"
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
function Paso($t) { Write-Host ""; Write-Host "== $t" -ForegroundColor Cyan }
function Recargar-Path { $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User") }
function Asegurar($comando, $idWinget, $nombre) {
  if (Get-Command $comando -ErrorAction SilentlyContinue) { Write-Host "$nombre ya esta."; return }
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { throw "Falta $nombre y no hay winget. Instalalo a mano y vuelve a correr este archivo." }
  Write-Host "Instalando $nombre..."
  winget install -e --id $idWinget --accept-source-agreements --accept-package-agreements --silent | Out-Host
  Recargar-Path
  if (-not (Get-Command $comando -ErrorAction SilentlyContinue)) { throw "No se pudo instalar $nombre. Cierra y abre PowerShell y vuelve a correr este archivo." }
}

$datos = Join-Path $env:LOCALAPPDATA "SofiaWhatsAppMario"
if (-not (Test-Path $Paquete)) { throw "No encuentro $Paquete. Pon sofia-datos.zip junto a este archivo." }

Paso "1/6 Programas que necesita Sofia"
Asegurar git "Git.Git" "Git"
Asegurar node "OpenJS.NodeJS.LTS" "Node.js"
Asegurar cloudflared "Cloudflare.cloudflared" "cloudflared (tunel para la app del celular)"

Paso "2/6 Programa de Sofia (GitHub, rama $Rama)"
$repo = Join-Path $Carpeta "sofia-repo"
New-Item -ItemType Directory -Force -Path $Carpeta | Out-Null
if (Test-Path (Join-Path $repo ".git")) {
  git -C $repo fetch --quiet origin $Rama
  git -C $repo checkout --quiet $Rama
  git -C $repo merge --ff-only --quiet "origin/$Rama"
} else {
  git clone --quiet --branch $Rama https://github.com/creoqisaac-cloud/Sofia.git $repo
}
if ($LASTEXITCODE -ne 0) { throw "No se pudo bajar el programa de GitHub." }

Paso "3/6 WhatsApp Web (la primera vez tarda unos minutos)"
Push-Location (Join-Path $repo "whatsapp-web")
try { & npm.cmd ci --omit=dev --no-audit --no-fund | Out-Host; if ($LASTEXITCODE -ne 0) { throw "Fallo npm ci en whatsapp-web." } } finally { Pop-Location }

Paso "4/6 Datos de Mario (vinculo de WhatsApp, chats, clientes, llaves)"
if (Test-Path (Join-Path $datos "datos\sesion-mario")) {
  Write-Host "Ya hay datos de Mario en este equipo ($datos): NO los toco." -ForegroundColor Yellow
} else {
  New-Item -ItemType Directory -Force -Path $datos | Out-Null
  tar.exe -x -f $Paquete -C $datos
  if ($LASTEXITCODE -ne 0) { throw "No se pudo abrir $Paquete." }
  Write-Host "Restaurados en $datos"
}

Paso "5/6 IA local de este equipo (Ollama)"
$ollama = $false
try { $tags = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 5; $ollama = $true } catch { }
if ($ollama) {
  $modelos = @($tags.models | ForEach-Object { $_.name })
  $modelo = @("qwen2.5:7b", "qwen2.5:3b", "llama3.1:8b") | Where-Object { $modelos -contains $_ } | Select-Object -First 1
  if (-not $modelo) { $modelo = $modelos | Select-Object -First 1 }
  # Sin tunel: Sofia y Ollama viven en el mismo equipo.
  Set-Content -Encoding ascii -Path (Join-Path $datos "ia-local.txt") -Value @("# URL y modelo de la IA local (Ollama en este mismo equipo)", "http://127.0.0.1:11434", $modelo)
  $meta = Join-Path $datos "datos\kv\conexion_meta.json"
  if (Test-Path $meta) {
    $m = Get-Content $meta -Raw | ConvertFrom-Json
    $m | Add-Member -Force -NotePropertyName LOCAL_AI_URL -NotePropertyValue "http://127.0.0.1:11434"
    $m | Add-Member -Force -NotePropertyName LOCAL_AI_MODEL -NotePropertyValue $modelo
    [IO.File]::WriteAllText($meta, ($m | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding($false)))
  }
  Write-Host "IA local: Ollama en este equipo, modelo $modelo"
} else {
  Write-Host "No vi Ollama en http://127.0.0.1:11434 (abrelo y luego cambia la IA local en la app: Mas > IA)." -ForegroundColor Yellow
}

Paso "6/6 Arranque automatico y abrir Sofia"
$cmd = Join-Path $repo "whatsapp-web\windows\INICIAR_MARIO.cmd"
$shell = New-Object -ComObject WScript.Shell
foreach ($dir in @([Environment]::GetFolderPath("Startup"), [Environment]::GetFolderPath("Desktop"))) {
  $lnk = $shell.CreateShortcut((Join-Path $dir "Sofia - WhatsApp de Mario.lnk"))
  $lnk.TargetPath = $cmd
  $lnk.WorkingDirectory = Split-Path $cmd
  $lnk.WindowStyle = 7
  $lnk.Description = "Sofia: asistente de ventas de Mario por WhatsApp"
  $lnk.Save()
}
Start-Process -FilePath $cmd -WindowStyle Minimized

Write-Host ""
Write-Host "Listo. Sofia se esta abriendo y se abrira sola cada que prendas este equipo." -ForegroundColor Green
Write-Host "Para que nunca se duerma, corre tu (como administrador) estas dos lineas:"
Write-Host "   powercfg /change standby-timeout-ac 0"
Write-Host "   powercfg /change hibernate-timeout-ac 0"
Write-Host "Cuando Sofia diga 'Vinculado', borra sofia-datos.zip de la USB: trae el vinculo de WhatsApp de Mario."
