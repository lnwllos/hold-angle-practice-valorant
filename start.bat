@echo off
chcp 65001 >nul
REM ตัวเปิดเสริม - serve โฟลเดอร์นี้ผ่าน localhost
REM หรือดับเบิลคลิก index.html ได้เลย เพราะเล่น offline ได้

where python >nul 2>nul
if %errorlevel%==0 (
  echo กำลัง serve ที่ http://localhost:8000/   ^(กด Ctrl+C เพื่อหยุด^)
  start "" http://localhost:8000/index.html
  python -m http.server 8000
  goto :eof
)

where py >nul 2>nul
if %errorlevel%==0 (
  echo กำลัง serve ที่ http://localhost:8000/   ^(กด Ctrl+C เพื่อหยุด^)
  start "" http://localhost:8000/index.html
  py -m http.server 8000
  goto :eof
)

echo ไม่พบ Python ใน PATH
echo ไม่เป็นไร - ดับเบิลคลิก index.html เพื่อเล่นได้เลย ^(เล่น offline ได้^)
pause
