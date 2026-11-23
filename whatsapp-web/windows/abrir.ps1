# Sofia Nueva: ventana para prender a Sofia con WhatsApp vinculado (como WhatsApp Web) en esta computadora.
# El QR se ve en la misma ventana (sin usuario ni contrasena). Al cerrar la ventana, Sofia se apaga.
# Solo usa letras sin acentos: Windows PowerShell lee estos archivos con otra codificacion.
#
#   -Probar  sin ventana: arranca en modo "Solo mi WhatsApp" de prueba, revisa la pagina del QR y se apaga
#            (lo usa la prueba automatica en Windows).
param([switch]$Probar, [switch]$Ventana)

$ErrorActionPreference = "Stop"
$base = $PSScriptRoot
$app = Join-Path $base "app"
$datos = Join-Path $base "datos"
$configArchivo = Join-Path $base "config.json"
$claveArchivo = Join-Path $base "clave.txt"
$log = Join-Path $base "servidor.log"
$puerto = 18750 # distinto al de otras Sofias, para que no choquen
$url = "http://127.0.0.1:$puerto"
$servidor = Join-Path $app "prueba\servidor\servidor.mjs"

# Desde el acceso del escritorio: se vuelve a abrir sin la consola azul, solo con la ventana.
if (-not $Probar -and -not $Ventana) {
  Start-Process -WindowStyle Hidden -FilePath (Join-Path $PSHOME "powershell.exe") -ArgumentList "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Ventana"
  return
}

# Letras con acento para los textos de la ventana
$a = [char]0xE1; $e = [char]0xE9; $i = [char]0xED; $o = [char]0xF3; $u = [char]0xFA; $q = [char]0xBF

New-Item -ItemType Directory -Force -Path $datos | Out-Null
if (-not (Test-Path $claveArchivo)) {
  $bytes = New-Object byte[] 24
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  Set-Content -Encoding ascii -NoNewline -Path $claveArchivo -Value ([Convert]::ToBase64String($bytes) -replace '[+/=]', '')
}
$clave = (Get-Content -Raw $claveArchivo).Trim()
$auth = "Basic " + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("sofia:$clave"))

$cfg = [pscustomobject]@{ modo = "mio"; numero = ""; cfCuenta = ""; cfLlave = "" }
if (Test-Path $configArchivo) {
  try {
    $leido = Get-Content -Raw $configArchivo | ConvertFrom-Json
    foreach ($k in "modo", "numero", "cfCuenta", "cfLlave") { if ($leido.$k) { $cfg.$k = [string]$leido.$k } }
  } catch { }
}
function Guardar-Config { $cfg | ConvertTo-Json | Set-Content -Encoding utf8 $configArchivo }
function Numero([string]$texto) {
  $n = $texto -replace '[^\d]', ''
  if ($n.Length -eq 10) { $n = "52" + $n }
  if ($n -notmatch '^\d{11,15}$') { return $null }
  return $n
}
# El token de la IA se guarda cifrado para tu usuario de Windows (nadie mas lo puede leer).
function Guardar-Secreto([string]$texto) { ConvertTo-SecureString $texto -AsPlainText -Force | ConvertFrom-SecureString }
function Leer-Secreto([string]$cifrado) {
  $p = [Runtime.InteropServices.Marshal]::SecureStringToBSTR((ConvertTo-SecureString $cifrado))
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }
}
function Pedir([string]$ruta) {
  $r = [Net.HttpWebRequest]::Create("$url$ruta")
  $r.Timeout = 1500
  $r.Headers.Add("Authorization", $auth)
  $resp = $r.GetResponse()
  try { (New-Object IO.StreamReader($resp.GetResponseStream(), [Text.Encoding]::UTF8)).ReadToEnd() } finally { $resp.Close() }
}
function Ya-Prendida { try { Pedir "/api/salud" | Out-Null; return $true } catch { return $false } }

# Lo que lee el servidor de Sofia (los procesos hijos heredan estas variables)
function Preparar-Entorno {
  $env:SOFIA_TOKEN = $clave
  $env:SOFIA_WHATSAPP_WEB = "1"
  $env:SOFIA_DATA_DIR = $datos
  $env:SOFIA_BIND = "127.0.0.1"
  $env:PORT = "$puerto"
  foreach ($v in "SOFIA_SOLO_MI_WHATSAPP", "SOFIA_PRUEBA_NUMERO", "CF_ACCOUNT_ID", "CF_API_TOKEN", "SOFIA_ESPERA") { Remove-Item "Env:$v" -ErrorAction SilentlyContinue }
  if ($cfg.modo -eq "mio") { $env:SOFIA_SOLO_MI_WHATSAPP = "1"; $env:SOFIA_PRUEBA_NUMERO = $cfg.numero }
  if ($cfg.modo -eq "prueba") { $env:SOFIA_PRUEBA_NUMERO = $cfg.numero }
  if ($cfg.cfCuenta -and $cfg.cfLlave) { try { $env:CF_API_TOKEN = Leer-Secreto $cfg.cfLlave; $env:CF_ACCOUNT_ID = $cfg.cfCuenta } catch { } }
}
# El servidor corre escondido; lo que escribe queda en servidor.log.
function Prender-Servidor {
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = Join-Path $env:SystemRoot "System32\cmd.exe"
  $psi.Arguments = "/c node `"$servidor`" > `"$log`" 2>&1"
  $psi.WorkingDirectory = $base
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  return [Diagnostics.Process]::Start($psi)
}
function Apagar-Servidor($p) {
  if ($p -and -not $p.HasExited) { & (Join-Path $env:SystemRoot "System32\taskkill.exe") /PID $p.Id /T /F 2>&1 | Out-Null }
}
function Ultimo-Error {
  $lineas = Get-Content -Encoding UTF8 -Tail 40 $log -ErrorAction SilentlyContinue | Where-Object { $_ -match 'no inici|Error|error' }
  if ($lineas) { return [string]($lineas | Select-Object -Last 1) }
  return ""
}

# ----- Prueba automatica (sin ventana) -----
if ($Probar) {
  $cfg.modo = "mio"; $cfg.numero = "5218100000002"
  Preparar-Entorno
  $env:SOFIA_ESPERA = "0"
  $proc = Prender-Servidor
  $listo = $false
  for ($n = 0; $n -lt 90 -and -not $proc.HasExited; $n++) { if (Ya-Prendida) { $listo = $true; break }; Start-Sleep -Seconds 1 }
  $pagina = ""
  for ($n = 0; $n -lt 120 -and $listo; $n++) {
    try { $pagina = Pedir "/vincular" } catch { }
    if ($pagina -match 'data:image/png') { break }
    Start-Sleep -Seconds 1
  }
  Apagar-Servidor $proc
  Get-Content -Encoding UTF8 $log -ErrorAction SilentlyContinue | Out-Host
  if (-not $listo) { throw "PRUEBA: el servidor no arranco." }
  if ($pagina -notmatch 'Vincular Sof') { throw "PRUEBA: la pagina del QR no respondio: $pagina" }
  if ($pagina -notmatch 'data:image/png') { throw "PRUEBA: WhatsApp Web no dio el QR. $(Ultimo-Error)" }
  Write-Host "PRUEBA OK: servidor listo y QR de WhatsApp en la ventana."
  return
}

# ----- Ventana -----
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName Microsoft.VisualBasic
[Windows.Forms.Application]::EnableVisualStyles()

$titulos = @{ mio = "Sof${i}a $([char]0xB7) Solo mi WhatsApp"; prueba = "Sof${i}a $([char]0xB7) WhatsApp de Mario (prueba)"; todos = "Sof${i}a $([char]0xB7) WhatsApp de Mario" }
$form = New-Object Windows.Forms.Form
$form.Text = "Sof${i}a Nueva"
$form.StartPosition = "CenterScreen"
$form.ClientSize = New-Object Drawing.Size(460, 640)
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.Font = New-Object Drawing.Font("Segoe UI", 10)
try { $ico = Join-Path $base "sofia.ico"; if (Test-Path $ico) { $form.Icon = New-Object Drawing.Icon $ico } } catch { }

function Etiqueta([string]$texto, [int]$y, [int]$alto = 22) {
  $l = New-Object Windows.Forms.Label
  $l.Text = $texto; $l.Location = New-Object Drawing.Point(16, $y); $l.Size = New-Object Drawing.Size(428, $alto)
  $form.Controls.Add($l); return $l
}
Etiqueta "${q}C${o}mo la quieres usar?" 12 | Out-Null
$rMio = New-Object Windows.Forms.RadioButton; $rMio.Text = "Solo mi WhatsApp (pruebas en mi chat `"T${u}`" con /sofia)"
$rPrueba = New-Object Windows.Forms.RadioButton; $rPrueba.Text = "WhatsApp de Mario: contesta solo a un n${u}mero de prueba"
$rTodos = New-Object Windows.Forms.RadioButton; $rTodos.Text = "WhatsApp de Mario: contesta a todos los clientes"
$y = 36
foreach ($r in $rMio, $rPrueba, $rTodos) { $r.Location = New-Object Drawing.Point(20, $y); $r.Size = New-Object Drawing.Size(424, 24); $form.Controls.Add($r); $y += 26 }
$lNumero = Etiqueta "" 120
$tNumero = New-Object Windows.Forms.TextBox; $tNumero.Location = New-Object Drawing.Point(16, 144); $tNumero.Size = New-Object Drawing.Size(220, 26); $tNumero.Text = $cfg.numero
$form.Controls.Add($tNumero)
$bIniciar = New-Object Windows.Forms.Button; $bIniciar.Text = "Iniciar"; $bIniciar.Location = New-Object Drawing.Point(250, 142); $bIniciar.Size = New-Object Drawing.Size(120, 30)
$form.Controls.Add($bIniciar)
$estado = Etiqueta "" 182 64
$qr = New-Object Windows.Forms.PictureBox; $qr.Location = New-Object Drawing.Point(80, 250); $qr.Size = New-Object Drawing.Size(300, 300); $qr.SizeMode = "Zoom"
$form.Controls.Add($qr)
$bPanel = New-Object Windows.Forms.Button; $bPanel.Text = "Abrir panel de Sof${i}a y copiar clave"; $bPanel.Location = New-Object Drawing.Point(16, 560); $bPanel.Size = New-Object Drawing.Size(280, 30)
$form.Controls.Add($bPanel)
$lIa = New-Object Windows.Forms.LinkLabel; $lIa.Location = New-Object Drawing.Point(310, 566); $lIa.Size = New-Object Drawing.Size(140, 22)
$form.Controls.Add($lIa)
Etiqueta "Al cerrar esta ventana Sof${i}a deja de contestar. El v${i}nculo se guarda en esta computadora." 598 36 | Out-Null

switch ($cfg.modo) { "prueba" { $rPrueba.Checked = $true } "todos" { $rTodos.Checked = $true } default { $rMio.Checked = $true } }
function Modo { if ($rPrueba.Checked) { "prueba" } elseif ($rTodos.Checked) { "todos" } else { "mio" } }
function Ajustar-Modo {
  switch (Modo) {
    "mio" { $lNumero.Text = "Tu n${u}mero de WhatsApp (el que vas a vincular):"; $tNumero.Visible = $true }
    "prueba" { $lNumero.Text = "Celular de prueba (el que le va a escribir a Mario):"; $tNumero.Visible = $true }
    "todos" { $lNumero.Text = "Contesta a todos. Si Mario escribe en un chat, se calla 12 horas ah${i}."; $tNumero.Visible = $false }
  }
}
function Texto-Ia { $lIa.Text = if ($cfg.cfCuenta) { "IA gratis: activa" } else { "IA gratis (opcional)" } }
foreach ($r in $rMio, $rPrueba, $rTodos) { $r.Add_CheckedChanged({ Ajustar-Modo }) }
Ajustar-Modo
Texto-Ia
$estado.Text = "Elige c${o}mo usarla y toca Iniciar."

$script:proc = $null
$script:ultimoQr = ""
$script:reintentos = 0
$script:vinculado = $false

function Controles([bool]$libres) { foreach ($c in $rMio, $rPrueba, $rTodos, $tNumero) { $c.Enabled = $libres }; $bIniciar.Text = if ($libres) { "Iniciar" } else { "Detener" } }
function Instrucciones {
  switch ($cfg.modo) {
    "mio" { "Vinculado. En tu WhatsApp abre el chat `"T${u}`" y escribe: /sofia Hola, precio del Civic" }
    "prueba" { "Vinculado. Desde el celular $($cfg.numero) escr${i}bele a Mario normal: Hola, precio del Civic. Los dem${a}s clientes no reciben nada." }
    default { "Vinculado. Sof${i}a ya contesta a los clientes de Mario. Las citas le llegan a Mario a su chat `"T${u}`"." }
  }
}
function Iniciar([bool]$auto = $false) {
  $cfg.modo = Modo
  if ($cfg.modo -ne "todos") {
    $n = Numero $tNumero.Text
    if (-not $n) { [Windows.Forms.MessageBox]::Show("Escribe el n${u}mero con 10 d${i}gitos (o con 52 al inicio).", "Sof${i}a") | Out-Null; return }
    $cfg.numero = $n; $tNumero.Text = $n
  } elseif (-not $auto -and [Windows.Forms.MessageBox]::Show("Sof${i}a va a contestar a TODOS los que le escriban a Mario. ${q}Seguro?", "Sof${i}a", "YesNo", "Warning") -ne "Yes") { return }
  Guardar-Config
  if (Ya-Prendida) { [Windows.Forms.MessageBox]::Show("Ya hay una Sof${i}a Nueva prendida. Ci${e}rrala primero.", "Sof${i}a") | Out-Null; return }
  Preparar-Entorno
  $form.Text = $titulos[$cfg.modo]
  $script:proc = Prender-Servidor
  $script:vinculado = $false
  Controles $false
  $estado.Text = "Abriendo WhatsApp Web... la primera vez puede tardar un minuto."
}
function Detener {
  Apagar-Servidor $script:proc
  $script:proc = $null
  $qr.Image = $null; $script:ultimoQr = ""
  Controles $true
  $form.Text = "Sof${i}a Nueva"
  $estado.Text = "Sof${i}a est${a} apagada. Toca Iniciar para prenderla."
}

$bIniciar.Add_Click({ if ($script:proc) { Detener } else { $script:reintentos = 0; Iniciar } })
$bPanel.Add_Click({
  [Windows.Forms.Clipboard]::SetText($clave)
  Start-Process $url
  [Windows.Forms.MessageBox]::Show("En el panel ve a M${a}s > Conexiones > Servidor. Direcci${o}n: $url  y pega la clave (ya est${a} copiada).", "Panel de Sof${i}a") | Out-Null
})
$lIa.Add_LinkClicked({
  $cuenta = [Microsoft.VisualBasic.Interaction]::InputBox("IA gratis de Cloudflare: Sof${i}a platica natural en vez de por reglas.`n`nEn dash.cloudflare.com > AI > Workers AI > Use REST API copia tu Account ID (32 letras y n${u}meros). Vac${i}o = sin IA.", "IA gratis", $cfg.cfCuenta).Trim()
  if (-not $cuenta) { $cfg.cfCuenta = ""; $cfg.cfLlave = "" }
  elseif ($cuenta -notmatch '^[a-fA-F0-9]{32}$') { [Windows.Forms.MessageBox]::Show("Ese Account ID no se ve bien.", "IA gratis") | Out-Null; return }
  else {
    $token = [Microsoft.VisualBasic.Interaction]::InputBox("Pega el token de Workers AI (Create a Workers AI API Token).", "IA gratis", "").Trim()
    if (-not $token) { return }
    $cfg.cfCuenta = $cuenta; $cfg.cfLlave = Guardar-Secreto $token
  }
  Guardar-Config
  Texto-Ia
  if ($script:proc) { [Windows.Forms.MessageBox]::Show("Listo. Toca Detener e Iniciar para que la use.", "IA gratis") | Out-Null }
})

$timer = New-Object Windows.Forms.Timer
$timer.Interval = 1200
$timer.Add_Tick({
  if (-not $script:proc) { return }
  if ($script:proc.HasExited) {
    $detalle = Ultimo-Error
    $script:reintentos++
    if ($script:reintentos -le 3) {
      $estado.Text = "WhatsApp se cerr${o}; la vuelvo a prender... $detalle"
      $script:proc = Prender-Servidor
    } else {
      Detener
      $estado.Text = "No pude prender WhatsApp Web. $detalle  (detalles en $log)"
    }
    return
  }
  try { $pagina = Pedir "/vincular" } catch { return }
  $m = [regex]::Match($pagina, 'data:image/png;base64,([A-Za-z0-9+/=]+)')
  if ($m.Success) {
    if ($m.Groups[1].Value -ne $script:ultimoQr) {
      $script:ultimoQr = $m.Groups[1].Value
      $qr.Image = [Drawing.Image]::FromStream((New-Object IO.MemoryStream(, [Convert]::FromBase64String($script:ultimoQr))))
    }
    $quien = if ($cfg.modo -eq "mio") { "tu celular" } else { "el celular de Mario" }
    $estado.Text = "En $quien abre WhatsApp > Dispositivos vinculados > Vincular un dispositivo, y escanea este QR."
    $script:vinculado = $false
  } elseif ($pagina -match 'WhatsApp vinculado') {
    if (-not $script:vinculado) { $qr.Image = $null; $script:ultimoQr = ""; $script:reintentos = 0 }
    $script:vinculado = $true
    $estado.Text = Instrucciones
  } else {
    $estado.Text = "Abriendo WhatsApp Web... la primera vez puede tardar un minuto."
  }
})
$timer.Start()
$form.Add_FormClosing({ $timer.Stop(); Apagar-Servidor $script:proc })
# Si ya estaba configurada en modo de prueba, se prende sola al abrir (como la de Codex).
# Para contestar a TODOS siempre se confirma (que no se le cuele a tus chats personales).
$form.Add_Shown({ if ((Test-Path $configArchivo) -and $cfg.modo -ne "todos") { Iniciar $true } })
[Windows.Forms.Application]::Run($form)
