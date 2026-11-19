# Notas

[![CI](https://github.com/ju1010/notas/actions/workflows/ci.yml/badge.svg)](https://github.com/ju1010/notas/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/ju1010/notas/blob/main/LICENSE)

**Español** · [English](README.en.md)

App de notas local para escribir rápido mientras trabajás. Sin nube, sin cuenta, sin internet:
las notas son archivos `.md` sueltos en una carpeta.

Ventana nativa con [pywebview](https://pywebview.flowrl.com/) (WebView2 en Windows, WKWebView en macOS),
interfaz en HTML, CSS y JavaScript sin framework ni paso de compilación.

## Qué hace

- **Captura rápida**: un cuadro arriba a la izquierda; escribís una línea, Enter, y la tarjeta
  aparece en la grilla. Si separás con ` - ` o `: `, lo de la izquierda es el título y lo de la
  derecha el contexto.
- **Bloques plegables**: pegás un error de la consola o un JSON de respuesta y la app lo envuelve
  en un bloque de código plegado, con el título adivinado (error HTTP, stack trace, respuesta).
  El formato es el de los callouts de Obsidian (`> [!example]- Título`), así que la misma nota se
  ve plegada también en Obsidian.
- **Búsqueda en título, tags y cuerpo**, con el fragmento de la línea que coincide.
- **Tarjetas con color** y filtros por tipo (todas, rápidas, notas).
- **Todo offline y en texto plano**: podés abrir la carpeta con cualquier editor.

## Instalación

### macOS

1. Bajá el repo con `git clone` (recomendado) o con **Code → Download ZIP**.
2. Doble clic en **`Iniciar Notas.command`**. La primera vez crea un entorno virtual e instala
   `pywebview`; tarda un minuto y necesita conexión solo para eso.
3. Después de eso abre directo, sin terminal.

Si macOS no deja abrirlo, es la cuarentena de Gatekeeper porque el archivo vino de internet.
Clic derecho sobre el archivo → **Abrir** → **Abrir** otra vez. O desde Terminal, en la carpeta:

```bash
xattr -d com.apple.quarantine "Iniciar Notas.command"
```

Si el Finder dice que no tenés permiso para ejecutarlo (pasa al descomprimir un ZIP):

```bash
chmod +x "Iniciar Notas.command"
```

Necesitás Python 3.9 o más nuevo. macOS trae uno; si es más viejo, instalalo desde
[python.org](https://www.python.org/downloads/macos/).

### Windows

Doble clic en **`iniciar.bat`**. La primera vez crea el entorno virtual e instala las dependencias.

Necesitás Python instalado desde [python.org](https://www.python.org/downloads/windows/)
(marcá "Add Python to PATH" en el instalador).

### Linux

Funciona con el mismo código (GTK o Qt de por medio), pero no está en la matriz de pruebas.
Instalación manual:

```bash
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/python app.py
```

## Dónde están las notas

```
notas/
  una-nota.md          <- notas (botón + / Ctrl+N)
  rapidas/
    algo-rapido.md     <- capturas rápidas
```

La carpeta `notas/` está en el `.gitignore`: son datos tuyos, no se suben a ningún lado.
Se pueden abrir con cualquier editor de texto, y el frontmatter del principio (título, tags,
color, fechas) es el que la app usa para ordenar y pintar las tarjetas.

Renombrar una nota desde la app renombra el archivo, pero no la mueve de carpeta: una nota
rápida sigue siendo rápida.

## Gestos

En macOS los atajos van con `Cmd`; en Windows y Linux, con `Ctrl`.

| Acción | Cómo |
|---|---|
| Capturar algo rápido | cuadro de arriba a la izquierda, o `Ctrl/Cmd+Shift+N` |
| Nueva nota | `Ctrl/Cmd+N` |
| Buscar | `Ctrl/Cmd+K` |
| Guardar ya | `Ctrl/Cmd+S` (igual se guarda solo) |
| Deshacer | `Ctrl/Cmd+Z` (incluye lo que hacen los botones del menú) |
| Rehacer | `Ctrl+Y` o `Ctrl/Cmd+Shift+Z` |
| Pegar un error como bloque plegable | botón **Pegar bloque**, o `Ctrl/Cmd+Shift+V` |
| Envolver lo seleccionado en un bloque | `Ctrl/Cmd+Shift+B` |
| Convertir la selección en un link | click derecho → **Enlace a internet**, o `Ctrl/Cmd+Shift+L` |
| Copiar el contenido de un bloque, limpio | botón de copiar en el bloque |
| Menú de markdown (títulos, código, tabla) | clic derecho en el editor |
| Pintar una tarjeta | hover sobre la tarjeta, círculo arriba a la derecha |
| Volver a la grilla | botón **Tarjetas** |

## Cómo está hecho

| Archivo | Qué es |
|---|---|
| `app.py` | backend: lee y escribe los `.md`, detecta qué le pegaste, abre la ventana |
| `ui/` | la interfaz: HTML, CSS y JS sin build; `marked.min.js` renderiza el markdown |
| `tests/` | tests de la lógica que no depende de la ventana |

El puente entre la ventana y Python es `window.pywebview.api`: cada método público de la clase
`Api` en `app.py` queda disponible desde el JavaScript.

Para modificarla, editá los archivos y volvé a abrir la app. Si tocás `ui/style.css` o
`ui/app.js`, subí el `?v=N` del `<link>` y del `<script>` en `ui/index.html`: el WebView cachea
y si no, seguís viendo la versión vieja.

### Diferencias por sistema

`app.py` detecta la plataforma con `platform.system()` para tres cosas:

| Cosa | Windows | macOS | Linux |
|---|---|---|---|
| Portapapeles | API de Windows (`ctypes`) | `pbcopy` / `pbpaste` | `wl-copy` / `xclip` |
| Abrir la carpeta de notas | `explorer` | `open` | `xdg-open` |
| Ícono | `.ico` en la ventana | `icono.png` en el Dock (AppKit) | — |

### Tests

```bash
python -m unittest discover -s tests -v
```

GitHub Actions corre la suite en macOS y Windows, y además verifica que el lanzador de macOS
siga siendo ejecutable y no haya quedado con finales de línea de Windows.

## Si algo no arranca

Corré la app con consola para ver el error:

```bash
# macOS
./.venv/bin/python app.py

# Windows
.venv\Scripts\python.exe app.py
```

## Contribuir

La app es chica y cualquier ayuda suma. No hace falta ser el autor ni conocer todo el código para
mejorarla.

Si encontrás un bug, abrí un issue contando qué estabas haciendo y qué esperabas que pasara. Si
querés cambiar algo, mandá un pull request; para cambios chicos no hace falta avisar antes. Si es
algo grande, abrí primero un issue así acordamos el enfoque antes de que escribas código.

Cosas que faltan y podés tomar:

- capturas de pantalla para el README
- revisar cómo se ve en pantallas chicas y en Linux
- atajos de teclado que uno espera encontrar y todavía no están
- traducciones: hoy está en español e inglés
- tests de lo que falta cubrir (los archivos de notas y el renombrado, por ejemplo)

Antes de abrir el pull request, corré los tests:

```bash
python -m unittest discover -s tests -v
```

Tus notas personales nunca van al repo: la carpeta `notas/` está ignorada.

## Licencia

MIT. Ver [LICENSE](LICENSE).
