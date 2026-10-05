@echo off
setlocal EnableExtensions DisableDelayedExpansion
title AhPah Canvas
pushd "%~dp0" >nul 2>&1
if errorlevel 1 goto folder_error

where node.exe >nul 2>&1
if errorlevel 1 goto node_error
node.exe -e "process.exit(Number(process.versions.node.split('.')[0]) >= 24 ? 0 : 1)"
if errorlevel 1 goto node_error
where npm.cmd >nul 2>&1
if errorlevel 1 goto npm_error

if not exist "node_modules\.bin\vite.cmd" (
    echo Installing app dependencies for the first launch...
    call npm.cmd ci
    if errorlevel 1 goto install_error
)

echo Starting AhPah Canvas at http://127.0.0.1:5173/
echo Your browser will open automatically when the server is ready.
echo Keep this window open while using the app. Press Ctrl+C to stop.
echo.
call npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort --open
if errorlevel 1 goto server_error
popd
exit /b 0

:node_error
echo.
echo Node.js 24 or newer is required.
echo Install it from https://nodejs.org/ and launch this file again.
goto failed

:npm_error
echo.
echo npm was not found. Reinstall Node.js with npm included, then try again.
goto failed

:install_error
echo.
echo Dependencies could not be installed. Check your internet connection
echo and the error above, then launch this file again.
goto failed

:server_error
echo.
echo The server could not start. Check the error above.
echo If port 5173 is already in use by AhPah, open http://127.0.0.1:5173/
echo or stop the previous server window before trying again.
goto failed

:folder_error
echo Could not open the app folder. Extract the repository before launching.
pause
exit /b 1

:failed
pause
popd
exit /b 1
