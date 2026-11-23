param([switch]$PruebaTecnica, [switch]$Reintentar, [switch]$SoloYo, [switch]$Mario)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$data = Join-Path $env:LOCALAPPDATA 'SofiaWhatsAppPrueba'
if ($SoloYo) { $data = Join-Path $env:LOCALAPPDATA "SofiaWhatsAppPersonal" }; if ($PruebaTecnica) { $data = Join-Path ([IO.Path]::GetTempPath()) ('sofia-test-' + [guid]::NewGuid()) }; if ($Mario) { $data = Join-Path $env:LOCALAPPDATA 'SofiaWhatsAppMario' }
[IO.Directory]::CreateDirectory($data) | Out-Null
try { $lock = [IO.File]::Open((Join-Path $data 'app.lock'),'OpenOrCreate','ReadWrite','None') }
catch { [Windows.Forms.MessageBox]::Show('La prueba de Sofia ya esta abierta.'); return }
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (!$node) { $node = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' }
$chromium = @(Get-ChildItem "$env:LOCALAPPDATA/ms-playwright/chromium-*/chrome-win*/chrome.exe" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | ForEach-Object FullName)
$browser = @($chromium + @("${env:ProgramFiles(x86)}/Microsoft/Edge/Application/msedge.exe","$env:ProgramFiles/Google/Chrome/Application/chrome.exe") | Where-Object { Test-Path -LiteralPath $_ })[0]
$form = New-Object Windows.Forms.Form
$form.Text = 'Sofía WhatsApp · Prueba en Windows'
$form.ClientSize = New-Object Drawing.Size(540,570)
$form.StartPosition = 'CenterScreen'
function Control($tipo,$texto,$x,$y,$ancho,$alto) {
    $item = New-Object ("Windows.Forms." + $tipo)
    $item.Text = $texto
    $item.SetBounds($x,$y,$ancho,$alto)
    $form.Controls.Add($item)
    return $item
}
$etiqueta = Control Label 'Número del otro celular, el que enviará el mensaje de prueba:' 18 15 495 22
$number = Control TextBox '' 18 40 200 28
$peerFile = Join-Path $data 'remitente.txt'
if (Test-Path $peerFile) { $number.Text = [IO.File]::ReadAllText($peerFile).Trim() }
$start = Control Button 'Iniciar prueba' 230 37 150 30
$start.Text = if ($Mario) { 'Iniciar Sofía' } else { 'Iniciar prueba' }
$status = Control Label 'Incluye el código de país. Para México, 52 y los 10 dígitos.' 18 85 500 52
$image = Control PictureBox '' 95 135 350 350
$image.SizeMode = 'Zoom'
$null = Control Label 'Deja esta ventana abierta durante la prueba. Al cerrarla, Sofía se detiene y conserva el vínculo para la próxima vez.' 18 505 495 46
if ($SoloYo) { $form.Text="Sofía · Solo mi WhatsApp"; $number.Visible=$false; $etiqueta.Text="Prueba privada con tu propio teléfono"; $status.Text="Escanea el QR desde tu propio WhatsApp." }; if ($Mario) { $form.Text="Sofía · WhatsApp de Mario"; $number.Visible=$false; $etiqueta.Text="Vincular el WhatsApp Business de Mario"; $status.Text="Mario debe escanear el QR con su teléfono. Después Sofía responderá a los clientes."; [IO.File]::WriteAllText((Join-Path $data 'perfil.txt'),'sesion-mario') }; $timer = New-Object Windows.Forms.Timer
$timer.Interval = 1200
$script:server = $null
$script:ready = $false
$script:qrSeen = $false
$script:reintentos = 0
$script:reintentarEn = $null
$iniciar = {
    try {
        $n = $number.Text -replace '[\s()+-]',''
        if (!$SoloYo -and !$Mario -and $n -notmatch '^\d{6,15}$') { $status.Text='Falta el número de prueba con su código de país.'; return }
        if (!(Test-Path $node) -or !$browser) { throw 'Falta Node.js o un navegador compatible en esta PC.' }
        $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
        $listener.Start()
        $port = $listener.LocalEndpoint.Port
        $listener.Stop()
        $secret = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
        $script:headers = @{Authorization='Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("sofia:$secret"))}
        $script:url = "http://127.0.0.1:$port/vincular"
        $script:log = Join-Path $data 'servidor.log'
        $env:SOFIA_BIND='127.0.0.1'; $env:PORT="$port"; $env:SOFIA_TOKEN=$secret
        $env:SOFIA_DATA_DIR=Join-Path $data 'datos'; $env:SOFIA_PRUEBA_NUMERO=$n
        if ($SoloYo) { $env:SOFIA_CHAT_PROPIO="1"; $env:SOFIA_PRUEBA_NUMERO="" } else { $env:SOFIA_CHAT_PROPIO="0" }; $env:CHROMIUM_PATH=$browser; $env:SOFIA_WHATSAPP_WEB='1'
        $perfil=Join-Path $data "perfil.txt"; if (Test-Path $perfil) { $env:SOFIA_WA_PERFIL=[IO.File]::ReadAllText($perfil).Trim() }; $env:SOFIA_STOP_FILE=Join-Path $data ('cerrar-' + [guid]::NewGuid().ToString('N'))
        $entry = '"' + (Join-Path $repo 'whatsapp-web/windows/iniciar.mjs') + '"'
        $script:server = Start-Process -FilePath $node -ArgumentList $entry -WorkingDirectory $data -WindowStyle Hidden -RedirectStandardOutput $script:log -RedirectStandardError (Join-Path $data 'errores.log') -PassThru
        [IO.File]::WriteAllText($peerFile,$n)
        $script:ready=$false; $start.Enabled=$false; $number.Enabled=$false
        $status.Text='Iniciando WhatsApp Web. El QR aparecerá aquí.'
        $timer.Start()
    } catch { $status.Text=$_.Exception.Message }
}
$start.Add_Click($iniciar)
$timer.Add_Tick({
    if ($script:server -and $script:server.HasExited -and $Mario -and !$PruebaTecnica) {
        if (!$script:reintentarEn) {
            $espera = [Math]::Min(30, [Math]::Pow(2, [Math]::Min(5, $script:reintentos)))
            $script:reintentarEn = (Get-Date).AddSeconds($espera)
            $script:reintentos += 1
            $image.Image = $null
            $status.Text = "La conexión se interrumpió. Sofía volverá a intentarlo en $([int]$espera) segundos, conservando el vínculo."
            return
        }
        if ((Get-Date) -ge $script:reintentarEn) {
            $script:reintentarEn = $null
            $script:ready = $false
            try { & $iniciar } catch { $status.Text = "No pude reiniciar el conector: $($_.Exception.Message)" }
        }
        return
    }
    if (!$script:server -or $script:server.HasExited) {
        $timer.Stop(); $image.Image=$null; $start.Enabled=$true; $number.Enabled=$true
        $status.Text="El conector se cerró. Revisa $data\errores.log o pulsa Iniciar prueba."
        if ($PruebaTecnica) { $form.Close() }
        return
    }
    try {
        if (!$script:ready) {
            $script:ready = [bool](Select-String -LiteralPath $script:log -SimpleMatch "En esta computadora: http://localhost:$env:PORT" -Quiet)
            if (!$script:ready) { return }
        }
        $p = (Invoke-WebRequest -Uri $script:url -Headers $script:headers -UseBasicParsing -TimeoutSec 2).Content
        if ($p -match 'data:image/png;base64,([A-Za-z0-9+/=]+)') {
            $stream = [IO.MemoryStream]::new([Convert]::FromBase64String($Matches[1]))
            $orig = [Drawing.Image]::FromStream($stream)
            $old = $image.Image; $image.Image = [Drawing.Bitmap]::new($orig)
            $orig.Dispose(); $stream.Dispose(); if ($old) { $old.Dispose() }
            $status.Text=$(if ($Mario) { 'En el WhatsApp Business de Mario: Dispositivos vinculados → Vincular un dispositivo; escanea este QR.' } else { 'En el teléfono que Sofía atenderá, abre WhatsApp Business → Dispositivos vinculados → Vincular un dispositivo y escanea el QR.' })
            'QR disponible' | Set-Content -LiteralPath (Join-Path $data 'estado.txt'); $script:qrSeen=$true
            if ($PruebaTecnica) { $form.Close() }
        } elseif ($p -match 'WhatsApp vinculado') {
            $script:reintentos = 0
            'Vinculado' | Set-Content -LiteralPath (Join-Path $data 'estado.txt'); $image.Image=$null; $status.Text=$(if ($SoloYo) {"Vinculado. En tu chat Tú escribe: /sofia Hola, ¿qué autos tienen?"} elseif ($Mario) {"Vinculado. Sofía ya puede atender los mensajes de los clientes."} else {"Vinculado. Desde el otro celular, escribe: Hola, ¿qué autos tienen?"})
        }
    } catch { $status.Text='Esperando la respuesta del conector local…' }
})
$form.Add_FormClosed({
    $timer.Stop()
    if ($script:server -and !$script:server.HasExited) {
        [IO.File]::WriteAllText($env:SOFIA_STOP_FILE,'')
        if (!$script:server.WaitForExit(8000)) { & taskkill.exe /PID $script:server.Id /T /F 2>&1 | Out-Null }
        if (Test-Path -LiteralPath $env:SOFIA_STOP_FILE) { Remove-Item -LiteralPath $env:SOFIA_STOP_FILE }
    }
})
if ($PruebaTecnica) {
    $number.Text='528100000000'
    $form.Opacity=0; $form.ShowInTaskbar=$false; $form.Add_Shown({ & $iniciar })
    $timeout=New-Object Windows.Forms.Timer; $timeout.Interval=90000
    $timeout.Add_Tick({$timeout.Stop();$form.Close()});$timeout.Start()
}
if ($SoloYo -or $Mario -or ($Reintentar -and $number.Text)) { $form.Add_Shown({ & $iniciar }) }
try { $null=$form.ShowDialog() } finally { $lock.Dispose(); $timer.Dispose(); $form.Dispose() }
if ($PruebaTecnica) {
    if (!$script:qrSeen) { throw "Faltó el QR. Diagnóstico: $data" }
    Write-Output 'QR generado y decodificado en Windows.'
}
