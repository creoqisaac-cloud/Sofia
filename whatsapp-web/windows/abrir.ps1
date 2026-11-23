# Sofia Nueva: prende a Sofia con WhatsApp vinculado (como WhatsApp Web) en esta computadora.
# Lo instala instalar.ps1 junto a app\ y datos\. Mientras esta ventana siga abierta, Sofia contesta.
# Solo usa letras sin acentos: Windows PowerShell lee estos archivos con otra codificacion.
#
#   -Probar  arranca sin preguntar (modo "Solo mi WhatsApp" con un numero de prueba), revisa que la pagina
#            del QR responda y se apaga. Lo usa la prueba automatica en Windows.
param([switch]$Probar)

$ErrorActionPreference = "Stop"
$base = $PSScriptRoot
$app = Join-Path $base "app"
$datos = Join-Path $base "datos"
$configArchivo = Join-Path $base "config.json"
$claveArchivo = Join-Path $base "clave.txt"
$puerto = 18750 # distinto al de otras Sofias, para que no choquen
$url = "http://127.0.0.1:$puerto"
try { $Host.UI.RawUI.WindowTitle = "Sofia Nueva" } catch { }
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { } # los mensajes del servidor traen acentos
New-Item -ItemType Directory -Force -Path $datos | Out-Null

function Numero([string]$texto) {
  $n = $texto -replace '[^\d]', ''
  if ($n.Length -eq 10) { $n = "52" + $n }
  if ($n -notmatch '^\d{11,15}$') { return $null }
  return $n
}
function Preguntar-Numero([string]$pregunta) {
  while ($true) {
    $n = Numero (Read-Host $pregunta)
    if ($n) { return $n }
    Write-Host "  Escribe los 10 digitos del celular (o con 52 al inicio)." -ForegroundColor Yellow
  }
}
# El token de la IA se guarda cifrado para tu usuario de Windows (nadie mas lo puede leer).
function Guardar-Secreto([string]$texto) { ConvertTo-SecureString $texto -AsPlainText -Force | ConvertFrom-SecureString }
function Leer-Secreto([string]$cifrado) {
  $p = [Runtime.InteropServices.Marshal]::SecureStringToBSTR((ConvertTo-SecureString $cifrado))
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }
}

# Clave de este servidor: protege la pagina del QR y el panel.
if (-not (Test-Path $claveArchivo)) {
  $bytes = New-Object byte[] 24
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  Set-Content -Encoding ascii -NoNewline -Path $claveArchivo -Value ([Convert]::ToBase64String($bytes) -replace '[+/=]', '')
}
$clave = (Get-Content -Raw $claveArchivo).Trim()

# Si ya esta prendida en otra ventana, no se abre otra (contestaria doble).
try {
  Invoke-WebRequest -UseBasicParsing "$url/api/salud" -TimeoutSec 2 | Out-Null
  Write-Host "Sofia Nueva ya esta abierta en otra ventana." -ForegroundColor Yellow
  if (-not $Probar) { Read-Host "Enter para salir" | Out-Null }
  return
} catch { }

$modos = @{
  mio    = "Solo mi WhatsApp: pruebas en tu chat 'Tu' empezando con /sofia"
  prueba = "WhatsApp de Mario: contesta SOLO a un numero de prueba"
  todos  = "WhatsApp de Mario: contesta a TODOS los clientes"
}
$cfg = $null
if (Test-Path $configArchivo) { try { $cfg = Get-Content -Raw $configArchivo | ConvertFrom-Json } catch { $cfg = $null } }

if ($Probar) {
  $cfg = [pscustomobject]@{ modo = "mio"; numero = "5218100000002"; cfCuenta = ""; cfLlave = "" }
} else {
  Write-Host ""
  Write-Host "  SOFIA NUEVA" -ForegroundColor Cyan
  Write-Host "  Cierra las otras Sofias (las de Codex) antes de seguir: dos abiertas con el mismo WhatsApp contestan doble." -ForegroundColor Yellow
  Write-Host ""
  if ($cfg -and $modos.ContainsKey([string]$cfg.modo)) {
    $antes = $modos[[string]$cfg.modo]
    if ($cfg.numero -and $cfg.modo -ne "todos") { $antes += " (" + $cfg.numero + ")" }
    if ($cfg.cfCuenta) { $antes += ", con IA" }
    Write-Host "  La vez pasada: $antes"
    if ((Read-Host "  Enter para seguir igual, o escribe C para cambiar") -match '^\s*[cC]') { $cfg = $null }
  } else { $cfg = $null }

  if (-not $cfg) {
    Write-Host ""
    Write-Host "  Como quieres usar a Sofia?"
    Write-Host "   1) $($modos.mio)"
    Write-Host "   2) $($modos.prueba)"
    Write-Host "   3) $($modos.todos)"
    do { $o = (Read-Host "  Escribe 1, 2 o 3").Trim() } until ($o -in "1", "2", "3")
    $cfg = [pscustomobject]@{ modo = @{ "1" = "mio"; "2" = "prueba"; "3" = "todos" }[$o]; numero = ""; cfCuenta = ""; cfLlave = "" }
    if ($cfg.modo -eq "mio") { $cfg.numero = Preguntar-Numero "  Tu numero de WhatsApp (el que vas a vincular)" }
    if ($cfg.modo -eq "prueba") { $cfg.numero = Preguntar-Numero "  Numero del celular de prueba (el que le va a escribir a Mario)" }
    if ($cfg.modo -eq "todos") {
      if ((Read-Host "  Sofia contestara a TODOS los que le escriban a Mario. Escribe SI para confirmar").Trim().ToUpper() -ne "SI") {
        Write-Host "  Cancelado: no se prendio nada."
        Read-Host "  Enter para salir" | Out-Null
        return
      }
    }
    Write-Host ""
    Write-Host "  IA gratis de Cloudflare (opcional): Sofia platica natural en vez de por reglas."
    Write-Host "  En dash.cloudflare.com -> AI -> Workers AI -> 'Use REST API': copia el Account ID y crea un token."
    $cuenta = (Read-Host "  Account ID (Enter para seguir sin IA)").Trim()
    if ($cuenta -match '^[a-fA-F0-9]{32}$') {
      $token = (Read-Host "  Token de Workers AI").Trim()
      if ($token) { $cfg.cfCuenta = $cuenta; $cfg.cfLlave = Guardar-Secreto $token }
    } elseif ($cuenta) {
      Write-Host "  Ese Account ID no se ve bien (son 32 letras y numeros): sigue sin IA." -ForegroundColor Yellow
    }
    $cfg | ConvertTo-Json | Set-Content -Encoding utf8 $configArchivo
  }
}

# Lo que lee el servidor de Sofia
$env:SOFIA_TOKEN = $clave
$env:SOFIA_WHATSAPP_WEB = "1"
$env:SOFIA_DATA_DIR = $datos
$env:SOFIA_BIND = "127.0.0.1"
$env:PORT = "$puerto"
foreach ($v in "SOFIA_SOLO_MI_WHATSAPP", "SOFIA_PRUEBA_NUMERO", "CF_ACCOUNT_ID", "CF_API_TOKEN", "SOFIA_ESPERA") { Remove-Item "Env:$v" -ErrorAction SilentlyContinue }
if ($cfg.modo -eq "mio") { $env:SOFIA_SOLO_MI_WHATSAPP = "1"; $env:SOFIA_PRUEBA_NUMERO = $cfg.numero }
if ($cfg.modo -eq "prueba") { $env:SOFIA_PRUEBA_NUMERO = $cfg.numero }
if ($cfg.cfCuenta -and $cfg.cfLlave) {
  try { $env:CF_API_TOKEN = Leer-Secreto $cfg.cfLlave; $env:CF_ACCOUNT_ID = $cfg.cfCuenta }
  catch { Write-Host "  No se pudo leer el token de la IA: sigue sin IA." -ForegroundColor Yellow }
}
if ($Probar) { $env:SOFIA_ESPERA = "0" }

$servidor = Join-Path $app "prueba\servidor\servidor.mjs"
$avisado = $false
while ($true) {
  $proc = Start-Process -FilePath "node" -ArgumentList "`"$servidor`"" -WorkingDirectory $base -NoNewWindow -PassThru
  $null = $proc.Handle # para leer ExitCode cuando termine
  $listo = $false
  for ($i = 0; $i -lt 90 -and -not $proc.HasExited; $i++) {
    try { Invoke-WebRequest -UseBasicParsing "$url/api/salud" -TimeoutSec 2 | Out-Null; $listo = $true; break } catch { Start-Sleep -Seconds 1 }
  }

  if ($Probar) {
    $auth = @{ Authorization = "Basic " + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("sofia:$clave")) }
    $pagina = ""
    for ($i = 0; $i -lt 120 -and $listo; $i++) {
      try { $pagina = (Invoke-WebRequest -UseBasicParsing "$url/vincular" -Headers $auth -TimeoutSec 5).Content } catch { }
      if ($pagina -match 'data:image/png') { break }
      Start-Sleep -Seconds 1
    }
    $sinClave = 0
    try { $sinClave = (Invoke-WebRequest -UseBasicParsing "$url/vincular" -TimeoutSec 5).StatusCode }
    catch { if ($_.Exception.Response) { $sinClave = [int]$_.Exception.Response.StatusCode } }
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    if (-not $listo) { throw "PRUEBA: el servidor no arranco." }
    if ($pagina -notmatch 'Vincular Sof') { throw "PRUEBA: la pagina del QR no respondio: $pagina" }
    if ($sinClave -ne 401) { throw "PRUEBA: la pagina del QR se abre sin clave ($sinClave)." }
    Write-Host ("PRUEBA OK: servidor listo, pagina del QR protegida, QR de WhatsApp " + $(if ($pagina -match 'data:image/png') { "generado." } else { "aun esperando a WhatsApp Web." }))
    return
  }

  if ($listo -and -not $avisado) {
    $avisado = $true
    try { Set-Clipboard -Value $clave } catch { }
    Write-Host ""
    Write-Host "  SOFIA ESTA PRENDIDA. No cierres esta ventana: al cerrarla, Sofia deja de contestar." -ForegroundColor Green
    Write-Host ""
    Write-Host "  1) Se abre el navegador con el QR. Usuario: sofia   Contrasena: $clave"
    Write-Host "     (la contrasena ya esta copiada: pegala con Ctrl+V)"
    switch ($cfg.modo) {
      "mio" {
        Write-Host "  2) En tu celular: WhatsApp -> Dispositivos vinculados -> Vincular un dispositivo, y escanea el QR."
        Write-Host "  3) En tu chat 'Tu' escribe:  /sofia Hola, precio del Civic"
        Write-Host "     Para seguir la platica empieza cada mensaje con /sofia. Tus demas chats no se tocan."
      }
      "prueba" {
        Write-Host "  2) En el celular de Mario: WhatsApp Business -> Dispositivos vinculados -> Vincular un dispositivo, y escanea el QR."
        Write-Host "  3) Desde el celular $($cfg.numero) escribele a Mario normal:  Hola, precio del Civic"
        Write-Host "     Los demas clientes de Mario no reciben nada. Las citas le llegan a Mario a su chat 'Tu'."
      }
      "todos" {
        Write-Host "  2) Si aun no esta vinculado: en el celular de Mario, WhatsApp Business -> Dispositivos vinculados -> Vincular un dispositivo."
        Write-Host "  3) Sofia contesta a todos. Si Mario escribe en un chat, ella se calla 12 horas en ese chat."
        Write-Host "     Las citas le llegan a Mario a su chat 'Tu'."
      }
    }
    Write-Host ""
    Write-Host "  Panel (prospectos y citas): $url  ->  Mas -> Conexiones -> Servidor: direccion $url y la misma contrasena."
    Write-Host ""
    Start-Process "$url/vincular"
  }

  $proc.WaitForExit()
  if ($proc.ExitCode -eq 0) { break }
  Write-Host "  WhatsApp se desconecto o Sofia se cerro (codigo $($proc.ExitCode)). La vuelvo a prender en 5 segundos..." -ForegroundColor Yellow
  Write-Host "  Si WhatsApp pide vincular otra vez, abre $url/vincular y escanea el QR." -ForegroundColor Yellow
  Start-Sleep -Seconds 5
}
