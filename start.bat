@echo off
REM Optional launcher — serves the folder over localhost.
REM You can also just DOUBLE-CLICK index.html (it runs offline with no server).

where python >nul 2>nul
if %errorlevel%==0 (
  echo Serving at http://localhost:8000/   ^(press Ctrl+C to stop^)
  start "" http://localhost:8000/index.html
  python -m http.server 8000
  goto :eof
)

where py >nul 2>nul
if %errorlevel%==0 (
  echo Serving at http://localhost:8000/   ^(press Ctrl+C to stop^)
  start "" http://localhost:8000/index.html
  py -m http.server 8000
  goto :eof
)

echo Python was not found on PATH.
echo No problem — just double-click index.html to play ^(it works offline^).
pause
