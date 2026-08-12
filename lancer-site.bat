@echo off
REM ============================================================
REM YOUXIS IOT v2 - Lance le site en mode production (local)
REM Le backend sert le frontend compile sur le port 3001.
REM Ensuite, dans un autre terminal : ngrok http 3001
REM ============================================================
cd /d "%~dp0"

echo [1/2] Build du frontend (React -> dist)...
cd frontend
call npm run build
cd ..

echo [2/2] Demarrage du backend sur le port 3001...
cd backend
node src/server.js
pause
