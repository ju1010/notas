#!/bin/bash
# Notas — abrir en macOS. Doble clic en Finder.
#
# La primera vez crea un entorno virtual e instala pywebview.
# Después de eso abre directo.

cd "$(dirname "$0")" || exit 1

if [ ! -d ".venv" ]; then
    clear
    echo "Primera vez: preparando el entorno (tarda un minuto)..."
    echo

    if ! command -v python3 >/dev/null 2>&1; then
        echo "No encontré python3."
        echo "Instalá Python desde https://www.python.org/downloads/macos/"
        read -r -p "Enter para cerrar..."
        exit 1
    fi

    python3 -m venv .venv || { echo "No pude crear el entorno virtual"; read -r -p "Enter..."; exit 1; }
    ./.venv/bin/pip install --quiet --upgrade pip

    echo "Instalando dependencias..."
    if ! ./.venv/bin/pip install --quiet -r requirements.txt; then
        echo
        echo "Falló la instalación. Probá a mano:"
        echo "  ./.venv/bin/pip install -r requirements.txt"
        read -r -p "Enter para cerrar..."
        exit 1
    fi
    echo "Listo."
fi

exec ./.venv/bin/python app.py
