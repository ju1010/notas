@echo off
rem Notas — abrir en Windows. Doble clic.
cd /d "%~dp0"

if exist ".venv\Scripts\pythonw.exe" (
    start "" ".venv\Scripts\pythonw.exe" "app.py"
    exit /b
)

echo Primera vez: preparando el entorno (tarda un minuto)...
echo.

rem py launcher (lo normal si se instalo Python desde python.org)
where py >nul 2>nul
if %errorlevel%==0 (
    py -3 -m venv .venv
) else (
    where python >nul 2>nul
    if %errorlevel%==0 (
        python -m venv .venv
    ) else (
        echo No encontre Python.
        echo Instalalo desde https://www.python.org/downloads/windows/
        echo y volve a abrir este archivo.
        pause
        exit /b 1
    )
)

if not exist ".venv\Scripts\pythonw.exe" (
    echo No pude crear el entorno virtual.
    pause
    exit /b 1
)

echo Instalando dependencias...
".venv\Scripts\python.exe" -m pip install --quiet --upgrade pip
".venv\Scripts\python.exe" -m pip install --quiet -r requirements.txt
if errorlevel 1 (
    echo.
    echo Fallo la instalacion. Proba a mano:
    echo   .venv\Scripts\python.exe -m pip install -r requirements.txt
    pause
    exit /b 1
)

start "" ".venv\Scripts\pythonw.exe" "app.py"
