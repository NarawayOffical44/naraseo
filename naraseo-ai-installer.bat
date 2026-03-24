@echo off
REM Naraseo AI - One-Click Chrome Extension Installer
REM This script automatically loads the extension into Chrome

setlocal enabledelayedexpansion

echo.
echo ============================================
echo   Naraseo AI Extension Installer
echo ============================================
echo.

REM Check if Chrome is installed
for /f "tokens=*" %%A in ('reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" /ve 2^>nul') do set "CHROME_PATH=%%A"

if not exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    if not exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
        echo ERROR: Google Chrome not found!
        echo Please install Chrome from https://www.google.com/chrome
        pause
        exit /b 1
    ) else (
        set "CHROME_PATH=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
    )
) else (
    set "CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
)

echo ✓ Chrome found: %CHROME_PATH%
echo.

REM Get script directory
set "SCRIPT_DIR=%~dp0"
set "EXTENSION_PATH=%SCRIPT_DIR%extension"

REM Check if extension folder exists
if not exist "%EXTENSION_PATH%" (
    echo ERROR: Extension folder not found at %EXTENSION_PATH%
    pause
    exit /b 1
)

echo ✓ Extension found at: %EXTENSION_PATH%
echo.
echo Installing extension into Chrome...
echo.

REM Method 1: Open Chrome with extension loading flag
REM This opens Chrome to extensions page with developer mode hint
"!CHROME_PATH!" --load-extension="%EXTENSION_PATH%" chrome://extensions

echo.
echo ============================================
echo Installation Steps:
echo ============================================
echo.
echo 1. Chrome should have opened with Extensions page
echo 2. Toggle "Developer mode" (top right)
echo 3. You should see "Naraseo AI" extension
echo 4. Click the extension icon to start
echo.
echo If you don't see the extension:
echo   a) Manual load: chrome://extensions
echo   b) Click "Load unpacked"
echo   c) Select: %EXTENSION_PATH%
echo.
echo ============================================
echo ✓ Installation Complete!
echo ============================================
echo.
echo Quick Start:
echo - Visit any website
echo - Press Ctrl+Shift+S
echo - Extension opens in sidebar
echo.
pause
