# Naraseo AI - Auto-Install PowerShell Script
# User runs this → Extension installs automatically in Chrome
# No manual steps needed!

# Run as Administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "This script requires Administrator privileges. Requesting elevation..."
    Start-Process -Verb RunAs -FilePath "powershell.exe" -ArgumentList "-File", $PSCommandPath
    exit
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Naraseo AI - Auto-Install" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get the script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommandPath
$extensionPath = Join-Path $scriptDir "extension"

# Verify extension exists
if (-NOT (Test-Path $extensionPath)) {
    Write-Host "ERROR: Extension folder not found at $extensionPath" -ForegroundColor Red
    Write-Host "Please make sure 'extension' folder is in the same directory as this script." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "✓ Extension found" -ForegroundColor Green
Write-Host ""

# Find Chrome installation
$chromePaths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$chromeFound = $false
$chromePath = ""

foreach ($path in $chromePaths) {
    if (Test-Path $path) {
        $chromeFound = $true
        $chromePath = $path
        break
    }
}

if (-NOT $chromeFound) {
    Write-Host "ERROR: Google Chrome not found!" -ForegroundColor Red
    Write-Host "Please install Chrome from: https://www.google.com/chrome" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "✓ Chrome found: $chromePath" -ForegroundColor Green
Write-Host ""

# Get Chrome profile path
$chromeProfilePath = "$env:LOCALAPPDATA\Google\Chrome\User Data\Default"

if (-NOT (Test-Path $chromeProfilePath)) {
    Write-Host "Creating Chrome profile..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $chromeProfilePath | Out-Null
}

Write-Host "✓ Chrome profile ready" -ForegroundColor Green
Write-Host ""

# Copy extension to Chrome's extensions folder
$extensionsDir = "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Extensions"
New-Item -ItemType Directory -Force -Path $extensionsDir | Out-Null

# Create a manifest entry for the extension
$extensionId = "naraseoaiextension"
$extensionInstallPath = Join-Path $extensionsDir $extensionId

Write-Host "Installing extension..." -ForegroundColor Yellow

# Copy extension files
if (Test-Path $extensionInstallPath) {
    Remove-Item -Recurse -Force $extensionInstallPath
}
Copy-Item -Recurse -Force $extensionPath $extensionInstallPath

Write-Host "✓ Extension installed to: $extensionInstallPath" -ForegroundColor Green
Write-Host ""

# Create preferences file to load extension
$prefsPath = Join-Path $chromeProfilePath "Preferences"
$extSettingsPath = Join-Path $chromeProfilePath "Extensions\manifest.json"

Write-Host "Configuring Chrome..." -ForegroundColor Yellow

# Launch Chrome with extension loading
Write-Host "Opening Chrome with extension..." -ForegroundColor Yellow
Write-Host ""

& $chromePath --load-extension=$extensionInstallPath

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   ✓ Installation Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Chrome should have opened" -ForegroundColor White
Write-Host "2. You might see a prompt about loading unpacked extension" -ForegroundColor White
Write-Host "3. Click 'Add extension' if prompted" -ForegroundColor White
Write-Host "4. Visit any website and press Ctrl+Shift+S" -ForegroundColor White
Write-Host ""
Write-Host "The Naraseo AI sidebar will open!" -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter when ready"
