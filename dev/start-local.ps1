# Engega un entorn de proves local: servidor Paper amb els plugins + el panell en mode dev.
#
#   powershell -ExecutionPolicy Bypass -File dev\start-local.ps1
#
# El servidor de proves es crea FORA de Proton Drive (per defecte a %USERPROFILE%\mc-dev)
# perquè el món no es sincronitzi. Cal Java 25 i Node 24.

param(
    [string]$ServerDir = "$env:USERPROFILE\mc-dev",
    [string]$PaperVersion = "26.2"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$root = Split-Path -Parent $PSScriptRoot
$panel = Join-Path $root "panel"
$plugins = Join-Path $ServerDir "plugins"

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

# ---- 1. Servidor de proves ----
if (-not (Test-Path (Join-Path $ServerDir "paper.jar"))) {
    Step "Creant el servidor de proves a $ServerDir"
    New-Item -ItemType Directory -Force $plugins | Out-Null

    $build = Invoke-RestMethod "https://fill.papermc.io/v3/projects/paper/versions/$PaperVersion/builds/latest"
    Write-Host "Paper $PaperVersion build $($build.id)"
    Invoke-WebRequest $build.downloads.'server:default'.url -OutFile (Join-Path $ServerDir "paper.jar")

    $lp = Invoke-RestMethod "https://metadata.luckperms.net/data/all"
    Write-Host "LuckPerms $($lp.version)"
    Invoke-WebRequest $lp.downloads.bukkit -OutFile (Join-Path $plugins "LuckPerms.jar")

    $papi = Invoke-RestMethod "https://hangar.papermc.io/api/v1/projects/HelpChat/PlaceholderAPI/latestrelease"
    Write-Host "PlaceholderAPI $papi"
    Invoke-WebRequest "https://hangar.papermc.io/api/v1/projects/HelpChat/PlaceholderAPI/versions/$papi/PAPER/download" -OutFile (Join-Path $plugins "PlaceholderAPI.jar")

    $tab = Invoke-RestMethod "https://api.github.com/repos/NEZNAMY/TAB/releases/latest"
    $tabAsset = $tab.assets | Where-Object { $_.name -match '^TAB\.v[\d.]+\.jar$' } | Select-Object -First 1
    Write-Host "TAB $($tab.tag_name)"
    Invoke-WebRequest $tabAsset.browser_download_url -OutFile (Join-Path $plugins "TAB.jar")

    Set-Content (Join-Path $ServerDir "eula.txt") "eula=true" -Encoding ascii
    Set-Content (Join-Path $ServerDir "server.properties") @"
motd=Servidor de proves
level-type=minecraft\:flat
generate-structures=false
spawn-protection=0
"@ -Encoding ascii
}

# ---- 2. Compilar i copiar el Bridge ----
Step "Compilant el plugin Bridge"
Push-Location (Join-Path $root "bridge")
try {
    & .\gradlew.bat build --console=plain -q
    if ($LASTEXITCODE -ne 0) { throw "La compilació del Bridge ha fallat" }
    Copy-Item "build\libs\bridge-*.jar" $plugins -Force
} finally { Pop-Location }

# ---- 3. Engegar el servidor en una finestra pròpia ----
$running = Get-CimInstance Win32_Process -Filter "Name='java.exe'" | Where-Object { $_.CommandLine -like "*paper.jar*" }
if ($running) {
    Write-Host "El servidor ja està engegat (reinicia'l per carregar un Bridge nou)." -ForegroundColor Yellow
} else {
    Step "Engegant el servidor Minecraft (finestra nova; escriu 'stop' allà per aturar-lo)"
    Start-Process -FilePath "java" -ArgumentList "-Xms2G", "-Xmx2G", "-jar", "paper.jar", "--nogui" -WorkingDirectory $ServerDir
}

# ---- 4. Esperar el token del Bridge ----
Step "Esperant que el Bridge generi el token"
$bridgeConfig = Join-Path $plugins "Bridge\config.yml"
$token = $null
for ($i = 0; $i -lt 180 -and -not $token; $i++) {
    if (Test-Path $bridgeConfig) {
        $line = Select-String -Path $bridgeConfig -Pattern "^\s*token:\s*'?([0-9a-f]{64})'?" | Select-Object -First 1
        if ($line) { $token = $line.Matches[0].Groups[1].Value }
    }
    if (-not $token) { Start-Sleep 1 }
}
if (-not $token) { throw "El Bridge no ha generat el token. Mira la finestra del servidor." }
Write-Host "Token trobat."

# ---- 5. Configurar el panell ----
Push-Location $panel
try {
    $envFile = Join-Path $panel ".env"
    if (-not (Test-Path $envFile)) {
        Step "Creant panel\.env"
        Copy-Item (Join-Path $panel ".env.example") $envFile
    }
    # UTF-8 sense BOM (els comentaris tenen accents)
    $lines = [IO.File]::ReadAllLines($envFile) | Where-Object { $_ -notmatch '^BRIDGE_TOKEN=' }
    $lines += "BRIDGE_TOKEN=$token"
    [IO.File]::WriteAllLines($envFile, [string[]]$lines)

    if (-not (Test-Path (Join-Path $panel "node_modules"))) {
        Step "Instal·lant dependències del panell"
        npm install
    }

    if (-not (Test-Path (Join-Path $panel "data\panel.db"))) {
        Step "Creant el primer usuari del panell (owner)"
        $user = Read-Host "Nom d'usuari"
        $secure = Read-Host "Contrasenya (minim 10 caracters)" -AsSecureString
        $env:PANEL_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
        try { npm run create-user -- $user owner } finally { Remove-Item Env:PANEL_PASSWORD }
        if ($LASTEXITCODE -ne 0) { throw "No s'ha pogut crear l'usuari" }
    }

    Step "Engegant el panell a http://localhost:5173 (Ctrl+C per aturar-lo)"
    npm run dev -- --open
} finally { Pop-Location }
