@echo off
setlocal

set "ROOT=%~dp0"
set "URL=http://127.0.0.1:3000/"
if not defined PFP_OPEN_BROWSER set "PFP_OPEN_BROWSER=1"

cd /d "%ROOT%"

echo.
echo PFP localhost launcher
echo ======================
echo Project: %CD%
echo URL:     %URL%
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js was not found on PATH.
  echo Install Node.js or open this script from a terminal where node is available.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm was not found on PATH.
  echo Install Node.js/npm or open this script from a terminal where npm is available.
  echo.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo ERROR: package.json was not found in %CD%.
  echo Run this script from the PF Planner repository root.
  echo.
  pause
  exit /b 1
)

if not exist "apps\web\package.json" (
  echo ERROR: apps\web\package.json was not found.
  echo The web application workspace is missing.
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -Uri '%URL%' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 20 } } catch { }; $listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue; if ($listener) { exit 10 } exit 0"

if "%ERRORLEVEL%"=="20" (
  echo PFP already appears to be running at %URL%
  if "%PFP_OPEN_BROWSER%"=="1" start "" "%URL%"
  exit /b 0
)

if "%ERRORLEVEL%"=="10" (
  echo ERROR: Port 3000 is already in use, but PFP did not respond at %URL%
  echo Close the process using port 3000, then run this script again.
  echo.
  pause
  exit /b 1
)

echo Starting PFP on %URL%
echo Keep this window open while using the app.
echo Press Ctrl+C in this window to stop the local server.
echo.

if "%PFP_OPEN_BROWSER%"=="1" (
  start "Open PFP when ready" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "$url = '%URL%'; for ($i = 0; $i -lt 60; $i++) { try { $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { Start-Process $url; exit 0 } } catch { }; Start-Sleep -Seconds 1 }"
)

npm run dev
set "STATUS=%ERRORLEVEL%"

echo.
echo PFP local server stopped with exit code %STATUS%.
pause
exit /b %STATUS%
