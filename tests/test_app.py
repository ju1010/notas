"""Tests de la lógica que no depende de la ventana.

Correr con:  python -m unittest discover -s tests -v
"""

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app


class TestSlug(unittest.TestCase):
    def test_acentos_y_signos(self):
        self.assertEqual(app.slug("Traseo Soyem!"), "traseo-soyem")

    def test_emoji_y_tildes(self):
        self.assertEqual(app.slug("Ñandú 🚀"), "nandu")

    def test_vacio_devuelve_algo(self):
        self.assertEqual(app.slug("   "), "nota")


class TestDetectar(unittest.TestCase):
    def test_error_http_en_json(self):
        titulo, leng = app.detectar(
            '{"statusCode":500,"message":"boom","path":"/api/x"}'
        )
        self.assertIn("500", titulo)
        self.assertEqual(leng, "json")

    def test_curl(self):
        self.assertEqual(app.detectar("curl -X GET http://localhost")[1], "bash")

    def test_stack_trace(self):
        texto = "TypeError: x\n    at foo (/tmp/a.js:1:2)"
        self.assertEqual(app.detectar(texto)[0], "Stack trace")

    def test_texto_vacio(self):
        self.assertEqual(app.detectar("   ")[0], "Bloque vacío")


class TestEnvolver(unittest.TestCase):
    def test_arma_el_callout(self):
        md = app.envolver('{"a": 1}')
        self.assertTrue(md.startswith("> [!example]- "))
        self.assertIn("```json", md)
        self.assertIn("> {\"a\": 1}", md)

    def test_usa_cuatro_tildes_si_el_texto_ya_tiene_tres(self):
        texto = "```js\nconsole.log(1)\n```"
        md = app.envolver(texto)
        self.assertIn("~~~~", md)

    def test_saca_la_cita_si_viene_citado(self):
        md = app.envolver("> linea uno\n> linea dos")
        self.assertNotIn("> > ", md)


class TestArchivos(unittest.TestCase):
    def test_ida_y_vuelta(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "nota.md"
            app.escribir_md(p, {"titulo": "Hola", "tags": "a, b"}, "cuerpo")
            meta, cuerpo = app.leer_md(p)
            self.assertEqual(meta["titulo"], "Hola")
            self.assertEqual(cuerpo.strip(), "cuerpo")

    def test_sin_frontmatter_no_rompe(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "suelta.md"
            p.write_text("solo texto", encoding="utf-8")
            meta, cuerpo = app.leer_md(p)
            self.assertEqual(meta, {})
            self.assertEqual(cuerpo, "solo texto")


class TestRutasSeguras(unittest.TestCase):
    def test_no_deja_salir_de_notas(self):
        with self.assertRaises(ValueError):
            app.ruta_abs("../../etc/passwd")

    def test_ruta_normal(self):
        p = app.ruta_abs("rapidas/x.md")
        self.assertEqual(p.name, "x.md")
        self.assertEqual(p.parent.name, "rapidas")


class TestExtracto(unittest.TestCase):
    def test_saca_los_fences(self):
        texto = "# Titulo\n\n```js\nno deberia aparecer\n```\n\nparrafo"
        salida = app.extracto_md(texto)
        self.assertIn("Titulo", salida)
        self.assertNotIn("no deberia aparecer", salida)


class TestLinks(unittest.TestCase):
    def test_abrir_url_rechaza_lo_que_no_es_web(self):
        api = app.Api()
        self.assertFalse(api.abrir_url("file:///etc/passwd"))
        self.assertFalse(api.abrir_url("javascript:alert(1)"))
        self.assertFalse(api.abrir_url(""))
        self.assertFalse(api.abrir_url(None))

    def test_portapapeles_devuelve_texto(self):
        # puede venir vacio (por ejemplo en un runner sin portapapeles), pero nunca None
        self.assertIsInstance(app.Api().portapapeles(), str)

    def test_abrir_url_le_pasa_la_url_al_navegador(self):
        import webbrowser
        from unittest import mock

        with mock.patch.object(webbrowser, "open", return_value=True) as abrir:
            self.assertTrue(app.Api().abrir_url("  https://example.com/x  "))
            abrir.assert_called_once_with("https://example.com/x")


if __name__ == "__main__":
    unittest.main()
