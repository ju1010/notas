# Notas

[Español](README.md) · **English**

A local notes app for writing things down while you work. No cloud, no account, no internet:
notes are plain `.md` files in a folder.

Native window with [pywebview](https://pywebview.flowrl.com/) (WebView2 on Windows, WKWebView on
macOS), and an interface in plain HTML, CSS and JavaScript, with no framework and no build step.

## What it does

- **Quick capture**: a box on the top left of the sidebar. Type a line, press Enter, and the card
  shows up in the grid. If you split the line with ` - ` or `: `, the left side becomes the title
  and the right side the context.
- **Collapsible blocks**: paste an error from the console or a JSON response and the app wraps it
  in a folded code block, guessing a title (HTTP error, stack trace, response). The format is the
  Obsidian callout (`> [!example]- Title`), so the same note renders folded there as well.
- **Search across title, tags and body**, showing the line that matches.
- **Colored cards** and filters by type (all, quick captures, notes).
- **Everything offline and in plain text**: you can open the folder with any editor.

## Installation

### macOS

1. Get the repo with `git clone` (recommended) or with **Code → Download ZIP**.
2. Double click **`Iniciar Notas.command`**. The first time it creates a virtual environment and
   installs `pywebview`; that takes a minute and only needs internet for the install.
3. After that it opens on its own, with no terminal.

If macOS refuses to open it, that's Gatekeeper quarantine because the file came from the internet.
Right click the file → **Open** → **Open** again. Or from Terminal, inside the folder:

```bash
xattr -d com.apple.quarantine "Iniciar Notas.command"
```

If the Finder says you don't have permission to execute it (this happens after unzipping a ZIP):

```bash
chmod +x "Iniciar Notas.command"
```

You need Python 3.9 or newer. macOS ships one; if yours is older, install it from
[python.org](https://www.python.org/downloads/macos/).

### Windows

Double click **`iniciar.bat`**. The first time it creates the virtual environment and installs the
dependencies.

You need Python installed from [python.org](https://www.python.org/downloads/windows/)
(check "Add Python to PATH" in the installer).

### Linux

The same code runs here (through GTK or Qt), but it is not in the test matrix. Manual install:

```bash
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/python app.py
```

## Where the notes live

```
notas/
  some-note.md         <- notes (button + / Ctrl+N)
  rapidas/
    something.md       <- quick captures
```

The `notas/` folder is in `.gitignore`: those are your files, they go nowhere.
They open with any text editor, and the frontmatter at the top (title, tags, color, dates) is what
the app uses to sort and color the cards.

Renaming a note from the app renames the file, but it does not move it between folders: a quick
capture stays a quick capture.

## Shortcuts

On macOS shortcuts use `Cmd`; on Windows and Linux, `Ctrl`.

| Action | How |
|---|---|
| Quick capture | box on the top left, or `Ctrl/Cmd+Shift+N` |
| New note | `Ctrl/Cmd+N` |
| Search | `Ctrl/Cmd+K` |
| Save now | `Ctrl/Cmd+S` (it saves on its own anyway) |
| Paste an error as a folded block | **Paste block** button, or `Ctrl/Cmd+Shift+V` |
| Wrap the selection in a block | `Ctrl/Cmd+Shift+B` |
| Turn the selection into a link | right click → **Internet link**, or `Ctrl/Cmd+Shift+L` |
| Copy the contents of a block, clean | copy button inside the block |
| Markdown menu (headings, code, table) | right click in the editor |
| Color a card | hover the card, circle on the top right |
| Back to the grid | **Cards** button |

## How it is built

| File | What it is |
|---|---|
| `app.py` | backend: reads and writes the `.md` files, detects what you pasted, opens the window |
| `ui/` | the interface: HTML, CSS and JS with no build; `marked.min.js` renders markdown |
| `tests/` | tests for the logic that does not depend on the window |

The bridge between the window and Python is `window.pywebview.api`: every public method of the
`Api` class in `app.py` is callable from JavaScript.

To change something, edit the files and open the app again. If you touch `ui/style.css` or
`ui/app.js`, bump the `?v=N` in the `<link>` and the `<script>` in `ui/index.html`: the WebView
caches files, so otherwise you keep seeing the old version.

### Platform differences

`app.py` reads `platform.system()` for three things:

| Thing | Windows | macOS | Linux |
|---|---|---|---|
| Clipboard | Windows API (`ctypes`) | `pbcopy` / `pbpaste` | `wl-copy` / `xclip` |
| Open the notes folder | `explorer` | `open` | `xdg-open` |
| Icon | `.ico` on the window | `icono.png` in the Dock (AppKit) | — |

### Tests

```bash
python -m unittest discover -s tests -v
```

GitHub Actions runs the suite on macOS and Windows, and also checks that the macOS launcher is
still executable and has no Windows line endings.

## Contributing

The app is small and any help is welcome. Anyone can make it better: you don't need to be the
author or know the whole codebase.

If you find a bug, open an issue saying what you were doing and what you expected to happen. If you
want to change something, send a pull request; for small changes you don't need to ask first. If
you are planning something bigger, open an issue so we can agree on the approach before you write
the code.

Things that are missing and could use a hand:

- screenshots for the README
- checking how it looks on small screens and on Linux
- keyboard shortcuts people expect and are not there yet
- translations: today it is in Spanish and English
- tests for what is not covered yet (the note files and the rename logic, for example)

Run the tests before opening a pull request:

```bash
python -m unittest discover -s tests -v
```

Your personal notes never go to the repo: the `notas/` folder is ignored.

## If something does not start

Run the app with a console to see the error:

```bash
# macOS
./.venv/bin/python app.py

# Windows
.venv\Scripts\python.exe app.py
```

## License

MIT. See [LICENSE](LICENSE).
