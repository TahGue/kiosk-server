@echo off
mkdir public
mkdir public\js
mkdir public\css

:: Install dependencies
call npm install

echo Setup complete! Run 'npm start' to start the kiosk server.
