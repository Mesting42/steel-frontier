@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22.12 或更高版本。
  pause
  exit /b 1
)
if not exist "node_modules" (
  call npm ci
  if errorlevel 1 exit /b 1
)
echo 游戏启动后，请在浏览器打开 http://localhost:5173/
call npm run dev -- --port 5173
