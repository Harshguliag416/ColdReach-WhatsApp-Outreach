@echo off
echo ==============================================
echo  Launching ColdReach Outreach Platform...
echo ==============================================
echo.

echo 🚀 Starting Outreach Server (Port 3001)...
cd backend
call npm start
if %errorlevel% neq 0 (
    echo ❌ Server crashed.
    pause
)

