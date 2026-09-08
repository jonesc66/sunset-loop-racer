@echo off
cd /d "C:\Users\jones\Documents\game-race"
echo Starting Game Race Vite dev server...
echo.
echo If the default port is available, open:
echo   http://127.0.0.1:5173/
echo.
echo Keep this window open while playing.
echo Press Ctrl+C in this window to stop the server.
echo.
npm run dev -- --host 127.0.0.1
pause
