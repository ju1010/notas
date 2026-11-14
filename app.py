#!/usr/bin/env python
"""
Notas — app local, offline, sin nube.

Backend: Python + pywebview (ventana nativa WebView2).
Las notas son archivos .md sueltos en la carpeta `notas/`.

Arranque:  python app.py      (o doble clic en iniciar.bat)
"""

import json
import platform
import re
import subprocess
import threading
import time
import unicodedata
import webbrowser
from datetime import datetime
from pathlib import Path

import webview

SISTEMA = platform.system()  # 'Windows' | 'Darwin' | 'Linux'

BASE = Path(__file__).resolve().parent
DIR_NOTAS = BASE / "notas"
DIR_RAPIDAS = DIR_NOTAS / "rapidas"
INDEX = BASE / "ui" / "index.html"
ICONO = BASE / "notas-app.ico"
ICONO_PNG = BASE / "icono.png"
PREFERENCIAS = BASE / "preferencias.json"
DIR_NOTAS.mkdir(exist_ok=True)
DIR_RAPIDAS.mkdir(exist_ok=True)


# -------------------------------------------------------------- rutas notas
def ruta_rel(p: Path) -> str:
    """Ruta relativa a notas/ con barras normales: 'rapidas/oriana.md'."""
    return p.relative_to(DIR_NOTAS).as_posix()


def tipo_de(rel: str) -> str:
    return "rapida" if rel.startswith("rapidas/") else "nota"


def ruta_abs(archivo: str) -> Path:
    """Resuelve 'rapidas/x.md' contra notas/, sin dejar salir de la carpeta."""
    limpio = (archivo or "").replace("\\", "/").lstrip("/")
    p = (DIR_NOTAS / limpio).resolve()
    raiz = DIR_NOTAS.resolve()
    if p != raiz and raiz not in p.parents:
        raise ValueError("ruta fuera de notas")
    return p


# --------------------------------------------------------- icono y portapapeles
def poner_icono(titulo="Notas", ruta=ICONO):
    """En Windows le pone el .ico a la ventana; en Mac, el ícono al Dock."""
    if SISTEMA == "Darwin":
        _icono_mac()
        return
    if SISTEMA != "Windows":
        return

    def _trabajo():
        try:
            import ctypes

            u32 = ctypes.windll.user32
            try:
                ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("Chises.Notas")
            except Exception:
                pass

            hwnd = 0
            for _ in range(100):
                hwnd = u32.FindWindowW(None, titulo)
                if hwnd:
                    break
                time.sleep(0.1)
            if not hwnd:
                return

            WM_SETICON = 0x0080
            IMAGE_ICON = 1
            LR_LOADFROMFILE = 0x10
            LR_DEFAULTSIZE = 0x40
            hicon = u32.LoadImageW(None, str(ruta), IMAGE_ICON, 0, 0,
                                   LR_LOADFROMFILE | LR_DEFAULTSIZE)
            if hicon:
                u32.SendMessageW(hwnd, WM_SETICON, 1, hicon)  # ICON_BIG
                u32.SendMessageW(hwnd, WM_SETICON, 0, hicon)  # ICON_SMALL
        except Exception:
            pass

    threading.Thread(target=_trabajo, daemon=True).start()


def _icono_mac():
    """En macOS el ícono del Dock se cambia por AppKit (pyobjc, viene con pywebview)."""
    if not ICONO_PNG.exists():
        return

    def _trabajo():
        try:
            from AppKit import NSApplication, NSImage

            for _ in range(50):
                time.sleep(0.1)
                app = NSApplication.sharedApplication()
                if app is not None:
                    break
            img = NSImage.alloc().initWithContentsOfFile_(str(ICONO_PNG))
            if img:
                app.setApplicationIconImage_(img)
        except Exception:
            pass

    threading.Thread(target=_trabajo, daemon=True).start()


def _copiar_linux(texto: str) -> bool:
    for cmd in (["wl-copy"], ["xclip", "-selection", "clipboard"]):
        try:
            subprocess.run(cmd, input=texto.encode("utf-8"), check=True)
            return True
        except Exception:
            continue
    return False


def copiar_al_portapapeles(texto: str) -> bool:
    """Copia texto al sistema, con la API nativa de cada plataforma."""
    texto = str(texto)

    if SISTEMA == "Darwin":
        try:
            subprocess.run(["pbcopy"], input=texto.encode("utf-8"), check=True)
            return True
        except Exception:
            return False

    if SISTEMA == "Linux":
        return _copiar_linux(texto)

    try:
        import ctypes

        CF_UNICODETEXT = 13
        GMEM_MOVEABLE = 0x0002
        u32, k32 = ctypes.windll.user32, ctypes.windll.kernel32

        k32.GlobalAlloc.restype = ctypes.c_void_p
        k32.GlobalAlloc.argtypes = [ctypes.c_uint, ctypes.c_size_t]
        k32.GlobalLock.restype = ctypes.c_void_p
        k32.GlobalLock.argtypes = [ctypes.c_void_p]
        k32.GlobalUnlock.argtypes = [ctypes.c_void_p]
        u32.SetClipboardData.restype = ctypes.c_void_p
        u32.SetClipboardData.argtypes = [ctypes.c_uint, ctypes.c_void_p]

        if not u32.OpenClipboard(None):
            return False
        try:
            u32.EmptyClipboard()
            data = str(texto)
            n = (len(data) + 1) * ctypes.sizeof(ctypes.c_wchar)
            h = k32.GlobalAlloc(GMEM_MOVEABLE, n)
            if not h:
                return False
            p = k32.GlobalLock(h)
            ctypes.memmove(p, ctypes.create_unicode_buffer(data), n)
            k32.GlobalUnlock(h)
            if not u32.SetClipboardData(CF_UNICODETEXT, h):
                return False
        finally:
            u32.CloseClipboard()
        return True
    except Exception:
        return False


def leer_portapapeles() -> str:
    """Devuelve el texto del portapapeles ('' si no hay o no se puede leer)."""
    if SISTEMA == "Darwin":
        try:
            r = subprocess.run(["pbpaste"], capture_output=True, check=True)
            return r.stdout.decode("utf-8", "replace")
        except Exception:
            return ""

    if SISTEMA == "Linux":
        for cmd in (["wl-paste", "--no-newline"], ["xclip", "-selection", "clipboard", "-o"]):
            try:
                r = subprocess.run(cmd, capture_output=True, check=True)
                return r.stdout.decode("utf-8", "replace")
            except Exception:
                continue

    try:
        import tkinter
        r = tkinter.Tk()
        r.withdraw()
        txt = r.clipboard_get()
        r.destroy()
        return txt or ""
    except Exception:
        return ""


# ---------------------------------------------------------------- utilidades
def slug(texto: str) -> str:
    """'Traseo Soyem!' -> 'traseo-soyem'"""
    t = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    t = re.sub(r"[^\w\s-]", "", t).strip().lower()
    t = re.sub(r"[\s_-]+", "-", t)
    return t or "nota"


def leer_md(p: Path):
    """Devuelve (meta, cuerpo). Tolera archivos sin frontmatter."""
    try:
        txt = p.read_text(encoding="utf-8")
    except Exception:
        return {}, ""
    meta, body = {}, txt
    if txt.startswith("---"):
        fin = txt.find("\n---", 3)
        if fin != -1:
            for linea in txt[3:fin].splitlines():
                if ":" in linea:
                    k, v = linea.split(":", 1)
                    meta[k.strip()] = v.strip()
            body = txt[fin + 4:].lstrip("\n")
    return meta, body


def escribir_md(p: Path, meta: dict, body: str):
    cab = "\n".join(f"{k}: {v}" for k, v in meta.items())
    p.write_text(f"---\n{cab}\n---\n\n{body}", encoding="utf-8")


def resumen(body: str, largo=90) -> str:
    limpio = re.sub(r"[`>#*_\[\]!-]", " ", body)
    limpio = re.sub(r"\s+", " ", limpio).strip()
    return limpio[:largo]


def extracto_md(body: str, max_lineas: int = 6) -> str:
    """Texto plano para la tarjeta de la grilla: sin fences, callouts resumidos."""
    salida = []
    en_codigo = False
    for linea in body.splitlines():
        if re.match(r"^\s*(```|~~~)", linea):
            en_codigo = not en_codigo
            continue
        if en_codigo:
            continue
        t = linea.strip()
        if not t:
            continue
        if re.fullmatch(r"(?:-{3,}|<br\s*/?>|={3,})", t, re.I):
            continue
        m = re.match(r"^>\s*\[![\w]+\][+-]?\s*(.*)$", t)
        if m:
            salida.append("▸ " + m.group(1))
        elif t.startswith(">"):
            continue
        else:
            t = re.sub(r"^#{1,6}\s*", "", t)
            t = re.sub(r"^[-*]\s+", "• ", t)
            t = re.sub(r"\*\*(.+?)\*\*", r"\1", t)
            t = re.sub(r"`([^`]*)`", r"\1", t)
            salida.append(t)
        if len(salida) >= max_lineas:
            break
    return "\n".join(salida)


# ------------------------------------------------- detección de lo pegado
def limpiar_cita(texto: str) -> str:
    """Si lo copiado ya viene citado (de Obsidian o de un chat), le saca el '> '."""
    lineas = texto.split("\n")
    con_contenido = [l for l in lineas if l.strip()]
    if not con_contenido:
        return texto
    citadas = sum(1 for l in con_contenido if l.lstrip().startswith(">"))
    if citadas >= max(1, len(con_contenido) * 0.6):
        return "\n".join(re.sub(r"^\s*>\s?", "", l) for l in lineas)
    return texto


def detectar(texto: str):
    """Devuelve (titulo, lenguaje). Adivina qué te acaban de pegar."""
    texto = texto.replace("\r\n", "\n")
    t = texto.strip()
    if not t:
        return "Bloque vacío", "text"

    if t.lower().startswith("curl "):
        return "Petición curl", "bash"

    if t[0] in "{[":
        try:
            data = json.loads(t)
        except Exception:
            return "Bloque pegado", "json"
        if isinstance(data, dict):
            status = data.get("statusCode") or data.get("status") or data.get("code")
            if status:
                partes = [f"Error {status}"]
                metodo = data.get("method")
                ruta = data.get("path") or data.get("url") or data.get("endpoint")
                if metodo and ruta:
                    partes.append(f"{metodo} {str(ruta)[:48]}")
                elif ruta:
                    partes.append(str(ruta)[:48])
                else:
                    msg = data.get("message") or data.get("error") or data.get("detail")
                    if isinstance(msg, str) and msg.strip():
                        partes.append(msg.strip()[:60])
                return " · ".join(partes), "json"
            if data.get("name"):
                return f"Response · {data['name']}", "json"
            if data.get("stack") or data.get("stacktrace"):
                return "Stack en JSON", "json"
        if isinstance(data, list):
            return f"Response · {len(data)} ítems", "json"
        return "Response", "json"

    if re.search(r"^\s*at\s+.+\(.+:\d+:\d+\)", t, re.M):
        return "Stack trace", "text"

    if re.search(r"^(GET|POST|PUT|PATCH|DELETE)\s+\S+", t):
        return t.splitlines()[0][:70], "http"

    if t.count("\n") >= 2:
        return "Salida de consola", "text"

    return "Bloque pegado", "text"


def envolver(texto: str, titulo: str = None, plegado: bool = True) -> str:
    """Arma el callout de Obsidian con el texto adentro."""
    if not texto.strip():
        return ""
    texto = limpiar_cita(texto.replace("\r\n", "\n"))
    titulo_auto, leng = detectar(texto)
    titulo = (titulo or titulo_auto).replace("\n", " ").strip()
    cerca = "```"
    if "```" in texto:
        cerca = "~~~~"

    lineas = texto.rstrip("\n").split("\n")
    adentro = [cerca + leng] + lineas + [cerca]
    cuerpo = "\n".join(("> " + l) if l else ">" for l in adentro)
    signo = "-" if plegado else "+"
    return f"> [!example]{signo} {titulo}\n{cuerpo}\n"


# ------------------------------------------------------------------- API JS
class Api:
    def listar(self, tipo: str = None):
        salida = []
        for p in DIR_NOTAS.rglob("*.md"):
            rel = ruta_rel(p)
            clase = tipo_de(rel)
            if tipo and tipo != "todas" and clase != tipo:
                continue
            meta, body = leer_md(p)
            salida.append({
                "archivo": rel,
                "tipo": clase,
                "color": meta.get("color", ""),
                "titulo": meta.get("titulo") or p.stem.replace("-", " "),
                "tags": meta.get("tags", ""),
                "modificado": datetime.fromtimestamp(p.stat().st_mtime).strftime("%Y-%m-%d %H:%M"),
                "epoch": p.stat().st_mtime,
                "resumen": resumen(body),
                "preview": extracto_md(body),
            })
        salida.sort(key=lambda n: n["epoch"], reverse=True)
        return salida

    def leer(self, archivo: str):
        p = ruta_abs(archivo)
        if not p.exists():
            return None
        meta, body = leer_md(p)
        rel = ruta_rel(p)
        return {
            "archivo": rel,
            "tipo": tipo_de(rel),
            "color": meta.get("color", ""),
            "titulo": meta.get("titulo") or p.stem.replace("-", " "),
            "tags": meta.get("tags", ""),
            "cuerpo": body,
            "creado": meta.get("creado", ""),
        }

    def guardar(self, archivo: str, titulo: str, cuerpo: str, tags: str):
        """Guarda y, si cambió el título, renombra el archivo (en su misma carpeta)."""
        p = ruta_abs(archivo) if archivo else None
        meta, _ = leer_md(p) if (p and p.exists()) else ({}, "")

        titulo = (titulo or "").strip() or "Sin título"
        meta["titulo"] = titulo
        meta["modificado"] = datetime.now().strftime("%Y-%m-%d %H:%M")
        if tags.strip():
            meta["tags"] = tags.strip()
        else:
            meta.pop("tags", None)
        meta.setdefault("creado", datetime.now().strftime("%Y-%m-%d %H:%M"))

        carpeta = p.parent if (p and p.exists()) else DIR_NOTAS
        destino = carpeta / f"{slug(titulo)}.md"
        if p and destino != p and destino.exists():
            i = 2
            while (carpeta / f"{slug(titulo)}-{i}.md").exists():
                i += 1
            destino = carpeta / f"{slug(titulo)}-{i}.md"

        escribir_md(destino, meta, cuerpo)
        if p and p != destino and p.exists():
            p.unlink()

        return {
            "archivo": ruta_rel(destino),
            "tipo": tipo_de(ruta_rel(destino)),
            "titulo": titulo,
            "modificado": meta["modificado"],
        }

    def crear(self, titulo: str = "Sin título"):
        base = slug(titulo)
        destino = DIR_NOTAS / f"{base}.md"
        i = 2
        while destino.exists():
            destino = DIR_NOTAS / f"{base}-{i}.md"
            i += 1
        ahora = datetime.now().strftime("%Y-%m-%d %H:%M")
        escribir_md(destino, {"titulo": titulo, "creado": ahora, "modificado": ahora}, "")
        return {"archivo": ruta_rel(destino), "titulo": titulo, "tipo": "nota"}

    def borrar(self, archivo: str):
        p = ruta_abs(archivo)
        if p.exists():
            p.unlink()
            return True
        return False

    def set_color(self, archivo: str, color: str):
        """Pinta la nota. color='' la deja sin color."""
        p = ruta_abs(archivo)
        if not p.exists():
            return {"ok": False}
        meta, cuerpo = leer_md(p)
        if color:
            meta["color"] = color
        else:
            meta.pop("color", None)
        escribir_md(p, meta, cuerpo)
        return {"ok": True, "color": color or ""}

    # ---------------------------------------------------- captura rápida
    def crear_captura(self, texto: str):
        """'Oriana Valente - no puede ver solicitudes' -> título + contexto.

        El título es el dato (lo que el ojo tiene que cazar en la grilla);
        el cuerpo es el contexto corto.
        """
        texto = (texto or "").strip()
        if not texto:
            return None

        partes = re.split(r"\s+[-—–]\s+|:\s+", texto, maxsplit=1)
        if len(partes) == 2 and len(partes[0].strip()) >= 3:
            titulo, cuerpo = partes[0].strip(), partes[1].strip()
        elif len(texto) <= 48:
            titulo, cuerpo = texto, ""
        else:
            # texto largo sin separador: título corto (corte en palabra) y el
            # texto completo como contexto, así la tarjeta no se deforma
            corte = texto[:48].rsplit(" ", 1)[0].rstrip(".,;:")
            titulo, cuerpo = corte, texto

        base = slug(titulo)
        destino = DIR_RAPIDAS / f"{base}.md"
        i = 2
        while destino.exists():
            destino = DIR_RAPIDAS / f"{base}-{i}.md"
            i += 1

        ahora = datetime.now().strftime("%Y-%m-%d %H:%M")
        escribir_md(destino, {"titulo": titulo, "creado": ahora, "modificado": ahora, "color": "azul"}, cuerpo)
        return {"archivo": ruta_rel(destino), "titulo": titulo, "cuerpo": cuerpo, "tipo": "rapida"}

    # ------------------------------------------------- búsqueda full-text
    def buscar(self, q: str):
        """Busca en título, tags Y cuerpo. Devuelve el snippet de la línea que matchea."""
        q = (q or "").strip()
        if not q:
            return []
        bajo = q.lower()
        resultados = []

        for p in DIR_NOTAS.rglob("*.md"):
            meta, cuerpo = leer_md(p)
            rel = ruta_rel(p)
            titulo = meta.get("titulo") or p.stem.replace("-", " ")
            donde = None

            if bajo in titulo.lower():
                donde = "título"
            elif bajo in meta.get("tags", "").lower():
                donde = "tags"
            else:
                for linea in cuerpo.splitlines():
                    if bajo in linea.lower():
                        donde = "cuerpo"
                        break

            if not donde:
                continue

            snippet = ""
            for linea in cuerpo.splitlines():
                limpia = linea.strip()
                if bajo in limpia.lower():
                    snippet = limpia[:140]
                    break
            if not snippet:
                snippet = resumen(cuerpo, 140)

            resultados.append({
                "archivo": rel,
                "tipo": tipo_de(rel),
                "titulo": titulo,
                "tags": meta.get("tags", ""),
                "modificado": datetime.fromtimestamp(p.stat().st_mtime).strftime("%Y-%m-%d %H:%M"),
                "epoch": p.stat().st_mtime,
                "resumen": snippet,
                "preview": extracto_md(cuerpo),
                "donde": donde,
            })

        resultados.sort(key=lambda n: n["epoch"], reverse=True)
        return resultados[:60]

    # ------------------------------------------------------- preferencias
    def prefs(self):
        try:
            if PREFERENCIAS.exists():
                return json.loads(PREFERENCIAS.read_text(encoding="utf-8"))
        except Exception:
            pass
        return {"vista": "tarjetas"}

    def set_pref(self, clave: str, valor):
        actual = self.prefs()
        actual[clave] = valor
        try:
            PREFERENCIAS.write_text(json.dumps(actual, indent=2), encoding="utf-8")
        except Exception:
            return False
        return True

    def _clipboard(self) -> str:
        return leer_portapapeles()

    def pegar(self):
        """Lee el portapapeles y devuelve el bloque listo para insertar."""
        texto = self._clipboard()
        if not texto.strip():
            return {"ok": False, "md": "", "motivo": "No pude leer el portapapeles. Usá Ctrl+V y después Ctrl+Shift+B."}
        return {"ok": True, "md": envolver(texto), "titulo": detectar(texto)[0]}

    def envolver(self, texto: str, titulo: str = ""):
        return {"md": envolver(texto, titulo or None)}

    def copiar(self, texto: str):
        """Copia texto limpio al portapapeles (para pegarlo en WhatsApp, etc.)."""
        texto = texto or ""
        return {"ok": copiar_al_portapapeles(texto), "largo": len(texto)}

    def abrir_url(self, url: str):
        """Abre un link en el navegador del sistema. Solo http y https."""
        url = (url or "").strip()
        if not re.match(r"^https?://", url, re.I):
            return False
        try:
            return webbrowser.open(url)
        except Exception:
            return False

    def registrar(self, texto: str):
        """Log chiquito para diagnosticar el front sin abrir devtools."""
        try:
            with open(BASE / "debug.log", "a", encoding="utf-8") as f:
                f.write(f"{datetime.now().strftime('%H:%M:%S')} {texto}\n")
        except Exception:
            pass
        return True

    def detectar(self, texto: str):
        return detectar(texto)

    def abrir_carpeta(self):
        if SISTEMA == "Darwin":
            subprocess.Popen(["open", str(DIR_NOTAS)])
        elif SISTEMA == "Windows":
            subprocess.Popen(["explorer", str(DIR_NOTAS)])
        else:
            subprocess.Popen(["xdg-open", str(DIR_NOTAS)])
        return True

    def carpeta(self):
        return str(DIR_NOTAS)


def main():
    api = Api()
    ventana = webview.create_window(
        "Notas",
        url=str(INDEX),
        js_api=api,
        width=1180,
        height=780,
        min_size=(860, 520),
    )
    poner_icono("Notas", ICONO)
    webview.start(debug=False)
    return ventana


if __name__ == "__main__":
    main()
