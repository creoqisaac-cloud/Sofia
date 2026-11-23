# Instala una Sofia NUEVA en tu usuario de Windows (aparte de las que ya tengas) y crea en el escritorio el
# acceso "Sofia Nueva". En PowerShell pega esta linea:
#
#   irm https://creoqisaac-cloud.github.io/Sofia/windows/instalar.txt | iex
#
# Volver a correrla actualiza el programa y conserva el vinculo de WhatsApp, la clave y lo que elegiste.
# Solo usa letras sin acentos: Windows PowerShell lee estos archivos con otra codificacion.
# Para pruebas: SOFIA_ZIP (URL o ruta del paquete), SOFIA_DESTINO (carpeta), SOFIA_SIN_ACCESO=1 (sin acceso).

function Instalar-SofiaNueva {
  $ErrorActionPreference = "Stop"
  $ProgressPreference = "SilentlyContinue" # la descarga es mucho mas rapida sin la barra de avance
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }
  $zip = if ($env:SOFIA_ZIP) { $env:SOFIA_ZIP } else { "https://creoqisaac-cloud.github.io/Sofia/windows/sofia-windows.zip" }
  $destino = if ($env:SOFIA_DESTINO) { $env:SOFIA_DESTINO } else { Join-Path $env:LOCALAPPDATA "SofiaNueva" }

  Write-Host ""
  Write-Host "Instalando Sofia Nueva en $destino" -ForegroundColor Cyan

  # 1. Node.js 18 o mas nuevo (el que ya usa la Sofia de Codex sirve)
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    if (Get-Command winget -ErrorAction SilentlyContinue) {
      Write-Host "Instalando Node.js..."
      winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent | Out-Host
      $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
    }
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Falta Node.js. Instalalo desde https://nodejs.org (version LTS) y vuelve a pegar la linea." }
  }
  $mayor = [int](& node -p "process.versions.node.split('.')[0]")
  if ($mayor -lt 18) { throw "Tu Node.js ($mayor) es muy viejo. Instala la version LTS desde https://nodejs.org." }

  # 2. El programa en app\ (datos\, clave.txt y config.json no se tocan: ahi esta el vinculo de WhatsApp)
  New-Item -ItemType Directory -Force -Path $destino | Out-Null
  $paquete = Join-Path $env:TEMP ("sofia-nueva-" + [guid]::NewGuid().ToString("N") + ".zip")
  if ($zip -match '^https?://') {
    Write-Host "Descargando Sofia..."
    Invoke-WebRequest -UseBasicParsing -Uri $zip -OutFile $paquete
  } else {
    Copy-Item -LiteralPath $zip -Destination $paquete
  }
  $nueva = Join-Path $destino "app.nueva"
  if (Test-Path $nueva) { Remove-Item -Recurse -Force $nueva }
  Expand-Archive -LiteralPath $paquete -DestinationPath $nueva -Force
  Remove-Item -Force $paquete
  $app = Join-Path $destino "app"
  if (Test-Path $app) {
    try { Remove-Item -Recurse -Force $app } catch { throw "Cierra la ventana de Sofia Nueva y vuelve a pegar la linea." }
  }
  Rename-Item -LiteralPath $nueva -NewName "app"

  # 3. Las piezas de WhatsApp Web (la primera vez descarga su navegador, unos 150 MB)
  Write-Host "Preparando WhatsApp Web (la primera vez tarda unos minutos)..."
  Push-Location (Join-Path $app "whatsapp-web")
  try {
    & npm.cmd ci --omit=dev --no-audit --no-fund | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "No se pudieron instalar las piezas de WhatsApp Web (npm ci)." }
  } finally { Pop-Location }

  # 4. El lanzador y su acceso en el escritorio
  Copy-Item -Force (Join-Path $app "whatsapp-web\windows\abrir.ps1") (Join-Path $destino "abrir.ps1")
  if ($env:SOFIA_SIN_ACCESO -ne "1") {
    $shell = New-Object -ComObject WScript.Shell
    $acceso = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath("Desktop")) "Sofia Nueva.lnk"))
    $acceso.TargetPath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
    $acceso.Arguments = "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$(Join-Path $destino 'abrir.ps1')`" -Ventana"
    $acceso.WindowStyle = 7 # minimizada: solo se ve la ventana de Sofia
    $acceso.WorkingDirectory = $destino
    $acceso.Description = "Sofia Nueva: asistente de ventas por WhatsApp"
    try {
      Add-Type -AssemblyName System.Drawing
      $bmp = New-Object System.Drawing.Bitmap (Join-Path $app "prueba\icon-192.png")
      $ico = Join-Path $destino "sofia.ico"
      $archivo = [IO.File]::Create($ico)
      [System.Drawing.Icon]::FromHandle($bmp.GetHicon()).Save($archivo)
      $archivo.Close()
      $bmp.Dispose()
      $acceso.IconLocation = $ico
    } catch { } # sin icono propio tambien funciona
    $acceso.Save()
  }

  Write-Host ""
  Write-Host "Listo: en tu escritorio quedo el acceso 'Sofia Nueva'. Se abre sola ahorita." -ForegroundColor Green
  Write-Host "Cierra las otras Sofias (las de Codex) para que no contesten doble."
  if ($env:SOFIA_SIN_ACCESO -ne "1" -and $env:CI -ne "true") {
    Start-Process -WindowStyle Hidden -FilePath (Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe") -ArgumentList "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$(Join-Path $destino 'abrir.ps1')`" -Ventana"
  }
  Write-Host ""
}

Instalar-SofiaNueva
