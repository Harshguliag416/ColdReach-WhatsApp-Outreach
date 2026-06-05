@echo off
echo ==============================================
echo  Installing ColdReach Outreach Platform
echo ==============================================
echo.

echo 📦 Step 1: Installing Backend Dependencies...
cd backend
call npm install
if %errorlevel% neq 0 (
    echo ❌ Error installing backend dependencies.
    pause
    exit /b %errorlevel%
)

echo.
echo 📦 Step 2: Installing Frontend Dependencies...
cd ../frontend
call npm install
if %errorlevel% neq 0 (
    echo ❌ Error installing frontend dependencies.
    pause
    exit /b %errorlevel%
)

echo.
echo 📦 Step 3: Compiling Frontend Static Build...
call npm run build
if %errorlevel% neq 0 (
    echo ❌ Error building frontend.
    pause
    exit /b %errorlevel%
)

echo.
echo 👍 Setup completed successfully! Run start.bat to run the platform.
echo ==============================================
pause
