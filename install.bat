@echo off
REM Naraseo AI - ONE-CLICK AUTO-INSTALLER
REM User runs this → Extension installs automatically
REM NO MANUAL STEPS NEEDED!

setlocal enabledelayedexpansion
cd /d "%~dp0"

title Naraseo AI - Installing...
color 0A

echo.
echo ============================================
echo    Naraseo AI - Installing...
echo ============================================
echo.

REM Find Chrome installation
set "CHROME_PATH="

if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set "CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    set "CHROME_PATH=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
) else if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
    set "CHROME_PATH=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
)

if "!CHROME_PATH!"=="" (
    echo ERROR: Google Chrome not found!
    echo.
    echo Please install Chrome from: https://www.google.com/chrome
    echo.
    pause
    exit /b 1
)

echo [OK] Chrome found
echo.

REM Check extension folder
if not exist "extension\" (
    echo ERROR: Extension folder not found!
    echo Please make sure "extension" folder is in this directory.
    echo.
    pause
    exit /b 1
)

echo [OK] Extension found
echo.

REM Get full path to extension
set "EXT_PATH=%cd%\extension"

echo [INFO] Installing extension...
echo Path: !EXT_PATH!
echo.

REM Open Chrome with extension loading
REM This tells Chrome to load the unpacked extension
start "" "!CHROME_PATH!" --load-extension="!EXT_PATH!" chrome://extensions

REM Wait for Chrome to start
timeout /t 2 /nobreak

echo.
echo ============================================
echo    INSTALLATION COMPLETE!
echo ============================================
echo.
echo What to do now:
echo.
echo 1. Chrome has opened to the Extensions page
echo 2. You might see "Naraseo AI" extension
echo 3. If you see "Enable" or "Add extension" - click it
echo 4. Visit any website
echo 5. Press Ctrl+Shift+S to open Naraseo AI
echo.
echo The extension sidebar will appear on the right!
echo.
echo ============================================
echo.

REM Keep window open for user to see
pause
