// Notas — front-end. Sin framework, sin build.

const $ = (id) => document.getElementById(id);

// En Mac los atajos van con Cmd; en el resto, con Ctrl. Se usa en los textos
// de la interfaz para no mostrarle "Ctrl+K" a alguien que tiene una Mac.
const ES_MAC = /mac/i.test(navigator.platform || navigator.userAgent || "");
const TECLA = ES_MAC ? "Cmd" : "Ctrl";
const ATAJO = (tecla) => tecla.replace("Ctrl", TECLA);

const estado = {
  api: null,
  notas: [],
  resultados: null,   // cuando hay búsqueda activa
  actual: null,       // { archivo, titulo, tags, cuerpo }
  vista: "tarjetas",
  filtro: "todas",    // todas | rapida | nota
  timerGuardado: null,
  sucio: false,
};

// ------------------------------------------------------------------ arranque
function cuandoEsteLista() {
  return new Promise((resolver) => {
    if (window.pywebview && window.pywebview.api) return resolver(window.pywebview.api);
    window.addEventListener("pywebviewready", () => resolver(window.pywebview.api), { once: true });
    // por si el evento ya pasó
    const t = setInterval(() => {
      if (window.pywebview && window.pywebview.api) {
        clearInterval(t);
        resolver(window.pywebview.api);
      }
    }, 120);
  });
}

async function iniciar() {
  estado.api = await cuandoEsteLista();
  marked.setOptions({ breaks: true, gfm: true });
  conectarEventos();
  await cargarLista();
  const primera = estado.notas[0];
  if (primera) await abrir(primera.archivo);
  else mostrarVacio();
  aplicarVista("tarjetas");
  $("ruta").textContent = await estado.api.carpeta();
  $("captura").focus();
}

// --------------------------------------------------------------------- lista
async function cargarLista() {
  estado.notas = await estado.api.listar();
  pintarLista();
}

function datosVisibles(filtro = "") {
  let datos = estado.resultados ? estado.resultados : estado.notas;

  if (estado.filtro !== "todas") {
    datos = datos.filter((n) => n.tipo === estado.filtro);
  }

  const f = filtro.trim().toLowerCase();
  if (!f || estado.resultados) return datos;
  return datos.filter((n) =>
    (n.titulo + " " + n.tags + " " + n.resumen).toLowerCase().includes(f)
  );
}

function pintarLista(filtro = "") {
  const caja = $("lista");
  const notas = datosVisibles(filtro);

  if (!notas.length) {
    caja.innerHTML = `<div class="vacio">${filtro ? "Nada con eso." : "Todavía no hay notas.<br>Capturá algo arriba"}</div>`;
    return;
  }

  caja.innerHTML = "";
  for (const n of notas) {
    const d = document.createElement("div");
    d.className = "tarjeta" + (estado.actual && estado.actual.archivo === n.archivo ? " activa" : "");
    d.innerHTML = `<div class="t"></div><div class="s"></div><div class="m"></div>`;
    d.querySelector(".t").textContent = n.titulo;
    d.querySelector(".s").textContent = n.resumen || "—";
    d.querySelector(".m").textContent =
      n.modificado + (n.tipo === "rapida" ? " · rápida" : "") + (n.donde ? " · " + n.donde : "");
    d.addEventListener("click", () => {
      abrir(n.archivo);
      if (estado.vista === "tarjetas") aplicarVista("editor");
    });
    caja.appendChild(d);
  }
}

// ------------------------------------------------------------- grilla Keep
function pintarTarjetas(filtro = "") {
  const caja = $("tarjetas");
  const notas = datosVisibles(filtro);

  if (!notas.length) {
    caja.innerHTML = `<div class="vacio">${filtro ? "Nada con eso." : "Todavía no hay notas.<br>Capturá algo arriba"}</div>`;
    return;
  }

  caja.innerHTML = "";
  for (const n of notas) {
    const t = document.createElement("div");
    t.className = "nota-tarjeta" + (estado.actual && estado.actual.archivo === n.archivo ? " activa" : "");
    t.dataset.color = n.color || (n.tipo === "rapida" ? "azul" : "");
    t.innerHTML = `<button class="color-btn" title="Cambiar color">◍</button><div class="tit"></div><div class="txt"></div><div class="pie"></div>`;
    t.querySelector(".tit").textContent = n.titulo;
    t.querySelector(".txt").textContent = n.preview || n.resumen || "";
    t.querySelector(".pie").textContent =
      n.modificado + (n.tipo === "rapida" ? "  ·  rápida" : "") + (n.donde ? "  ·  " + n.donde : "");
    t.querySelector(".color-btn").addEventListener("click", (ev) => {
      ev.stopPropagation();
      abrirPaleta(ev.clientX, ev.clientY, n.archivo, n.color || "");
    });
    t.addEventListener("click", async () => {
      await abrir(n.archivo);
      aplicarVista("editor");
    });
    caja.appendChild(t);
  }
}

function aplicarVista(vista) {
  estado.vista = vista === "editor" ? "editor" : "tarjetas";
  const esTarjetas = estado.vista === "tarjetas";
  $("tarjetas").classList.toggle("oculto", !esTarjetas);
  $("cuerpo").classList.toggle("oculto", esTarjetas);
  const main = document.querySelector("main");
  main.classList.toggle("en-grilla", esTarjetas);
  main.classList.toggle("en-editor", !esTarjetas);
  if (esTarjetas) pintarTarjetas($("buscar").value);
  else pintarLista($("buscar").value);
}

// ---------------------------------------------------------- captura rápida
async function crearCaptura() {
  const inp = $("captura");
  const texto = inp.value.trim();
  if (!texto) return;

  inp.value = "";
  const r = await estado.api.crear_captura(texto);
  if (!r) return;

  // si estabas filtrando solo "Notas", la rápida nueva no se vería
  if (estado.filtro === "nota") {
    estado.filtro = "todas";
    document.querySelectorAll(".chip").forEach((x) => {
      x.classList.toggle("activo", x.dataset.filtro === "todas");
    });
  }

  await cargarLista();
  if (estado.vista === "tarjetas") pintarTarjetas($("buscar").value);
  pintarLista($("buscar").value);
  $("estado").textContent = `capturada en Rápidas: ${r.titulo}`;
  inp.focus();
}

// --------------------------------------------------------------------- abrir
async function abrir(archivo) {
  await guardarYa();
  const nota = await estado.api.leer(archivo);
  if (!nota) return;

  estado.actual = nota;
  $("titulo").value = nota.titulo;
  $("tags").value = nota.tags || "";
  $("editor").value = nota.cuerpo || "";
  reiniciarHistorial();
  renderizar();
  pintarLista($("buscar").value);
  $("estado").textContent = "abierta · " + nota.archivo;
  $("cuerpo").classList.remove("lectura");
  $("vista").textContent = "Solo lectura";
  estado.sucio = false;
}

function mostrarVacio() {
  estado.actual = null;
  $("titulo").value = "";
  $("tags").value = "";
  $("editor").value = "";
  $("preview").innerHTML = `<p class="vacio">Sin nota abierta. Creá una con ＋ (${TECLA}+N).</p>`;
  $("estado").textContent = "—";
}

// -------------------------------------------------------------------- guardar
function marcarSucio() {
  estado.sucio = true;
  $("estado").textContent = "escribiendo…";
  clearTimeout(estado.timerGuardado);
  estado.timerGuardado = setTimeout(guardarYa, 500);
  renderizar();
}

async function guardarYa() {
  if (!estado.actual || !estado.sucio) return;
  clearTimeout(estado.timerGuardado);
  try {
    const r = await estado.api.guardar(
      estado.actual.archivo,
      $("titulo").value,
      $("editor").value,
      $("tags").value
    );
    const renombro = r.archivo !== estado.actual.archivo;
    estado.actual.archivo = r.archivo;
    estado.actual.titulo = r.titulo;
    estado.sucio = false;
    const hora = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    $("estado").textContent = `guardado ${hora} · ${r.archivo}`;
    if (renombro) await cargarLista();
    pintarLista($("buscar").value);
  } catch (e) {
    $("estado").textContent = "ERROR al guardar: " + e;
  }
}

// -------------------------------------------------------------------- render
function renderizar() {
  const md = $("editor").value;
  const html = marked.parse(md || "");
  $("preview").innerHTML = "";
  $("preview").appendChild(procesarCallouts(html));
}

function procesarCallouts(html) {
  const doc = new DOMParser().parseFromString(`<div id="raiz">${html}</div>`, "text/html");
  const raiz = doc.getElementById("raiz");

  raiz.querySelectorAll("blockquote").forEach((bq) => {
    const p = bq.querySelector("p");
    if (!p) return;
    const m = p.textContent.match(/^\[!(\w+)\]([+-]?)\s*([\s\S]*)$/);
    if (!m) return;

    const tipo = m[1].toLowerCase();
    const signo = m[2];
    const texto = m[3];
    const titulo = texto.split("\n")[0].trim() || tipo;
    const resto = texto.slice(titulo.length).trim();

    // lenguaje del primer bloque de código, para mostrarlo en el header
    const code = bq.querySelector("pre code");
    const leng = code ? (code.className.match(/language-(\w+)/) || [, ""])[1] : "";

    const div = doc.createElement("div");
    div.className = "callout" + (signo === "-" ? "" : " abierto");
    div.dataset.tipo = tipo;

    const head = doc.createElement("div");
    head.className = "chead";
    head.innerHTML =
      '<span class="caret">▶</span>' +
      '<span class="ctitulo"></span>' +
      '<span class="cmeta"></span>' +
      '<span class="espacio"></span>' +
      '<button class="btn-mini btn-copiar" title="Copiar lo que está adentro (limpio)">⧉</button>' +
      '<button class="btn-max" title="Maximizar">⤢</button>';
    head.querySelector(".ctitulo").textContent = titulo;
    head.querySelector(".cmeta").textContent = leng ? leng : tipo;

    const cuerpo = doc.createElement("div");
    cuerpo.className = "ccuerpo";

    if (resto) {
      const pResto = doc.createElement("p");
      pResto.textContent = resto;
      const cont = doc.createElement("div");
      cont.className = "md-interno";
      cont.appendChild(pResto);
      cuerpo.appendChild(cont);
    }

    // muevo todo lo demás (código, listas, párrafos) al cuerpo
    [...bq.childNodes].forEach((nodo) => {
      if (nodo === p) return;
      cuerpo.appendChild(nodo);
    });

    div.appendChild(head);
    div.appendChild(cuerpo);
    bq.replaceWith(div);
  });

  return raiz;
}

// --------------------------------------------------------------------- pegar
async function pegarBloque() {
  const r = await estado.api.pegar();
  if (!r.ok) {
    $("estado").textContent = r.motivo || "No pude leer el portapapeles";
    return;
  }
  insertarEnCursor(r.md);
}

function insertarEnCursor(texto) {
  guardarPunto(true);
  const ed = $("editor");
  const haySeleccion = ed.selectionEnd > ed.selectionStart;

  if (haySeleccion) {
    // reemplaza lo que haya seleccionado
    ed.value = ed.value.slice(0, ed.selectionStart) + texto + ed.value.slice(ed.selectionEnd);
  } else {
    // si no hay selección, va al final: si no, puede partir un bloque de código al medio
    const limpio = ed.value.replace(/\s+$/, "");
    ed.value = limpio ? limpio + "\n\n" + texto : texto;
  }

  ed.selectionStart = ed.selectionEnd = ed.value.length;
  $("cuerpo").classList.remove("lectura");
  $("vista").textContent = "Solo lectura";
  ed.focus();
  marcarSucio();
}

async function envolverSeleccion() {
  const ed = $("editor");
  const sel = ed.value.slice(ed.selectionStart, ed.selectionEnd);
  if (!sel.trim()) {
    $("estado").textContent = `Seleccioná el texto que querés plegar (${TECLA}+Shift+B)`;
    return;
  }
  const r = await estado.api.envolver(sel, "");
  ed.setRangeText(r.md, ed.selectionStart, ed.selectionEnd, "end");
  marcarSucio();
}

// -------------------------------------------------------------------- modal
function abrirModal(titulo, contenido) {
  $("modal-titulo").textContent = titulo;
  $("modal-cuerpo").textContent = contenido;
  $("modal").classList.remove("oculto");
}

function cerrarModal() {
  $("modal").classList.add("oculto");
}

// ------------------------------------------------- copiar al portapapeles
function limpiarCita(texto) {
  const lineas = texto.split("\n");
  const con = lineas.filter((l) => l.trim());
  if (!con.length) return texto;
  const citadas = con.filter((l) => /^\s*>/.test(l)).length;
  if (citadas >= Math.max(1, con.length * 0.6)) {
    return lineas.map((l) => l.replace(/^\s*>\s?/, "")).join("\n");
  }
  return texto;
}

function textoDelBloque(callout) {
  const pre = callout.querySelector(".ccuerpo pre");
  if (pre) return limpiarCita(pre.textContent.replace(/\n$/, ""));
  const cuerpo = callout.querySelector(".ccuerpo");
  return cuerpo ? limpiarCita(cuerpo.innerText.trim()) : "";
}

async function copiarTexto(texto) {
  try {
    const r = await estado.api.copiar(texto);
    if (r && r.ok) return true;
  } catch (e) { /* cae al navegador */ }
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch (e) {
    return false;
  }
}

// ------------------------------------------------ menú de click derecho
const OPCIONES_MENU = [
  { texto: "Título 1", tecla: "#", ejecutar: () => aplicarTitulo(1) },
  { texto: "Título 2", tecla: "##", ejecutar: () => aplicarTitulo(2) },
  { texto: "Título 3", tecla: "###", ejecutar: () => aplicarTitulo(3) },
  { texto: "Título 4", tecla: "####", ejecutar: () => aplicarTitulo(4) },
  { separador: true },
  { texto: "Bloque de código", tecla: "```", ejecutar: insertarBloqueCodigo },
  { texto: "Separador", tecla: "---", ejecutar: () => insertarTexto("\n\n---\n\n") },
  { texto: "Salto de línea", tecla: "<br>", ejecutar: () => insertarTexto("<br>\n") },
  { texto: "Tabla 3×3", ejecutar: insertarTabla },
  { separador: true },
  { texto: "Negrita", tecla: "**", ejecutar: () => marcarSeleccion("**") },
  { texto: "Cursiva", tecla: "_", ejecutar: () => marcarSeleccion("_") },
  { texto: "Enlace a internet", tecla: ATAJO("Ctrl+Shift+L"), ejecutar: insertarEnlace },
  { separador: true },
  { texto: "Pegar bloque del portapapeles", tecla: ATAJO("Ctrl+Shift+V"), ejecutar: pegarBloque },
];

function lineaDelCursor(ed) {
  const pos = ed.selectionStart;
  const ini = ed.value.lastIndexOf("\n", pos - 1) + 1;
  let fin = ed.value.indexOf("\n", pos);
  if (fin === -1) fin = ed.value.length;
  return { ini, fin, texto: ed.value.slice(ini, fin) };
}

function aplicarTitulo(n) {
  guardarPunto(true);
  const ed = $("editor");
  const { ini, fin, texto } = lineaDelCursor(ed);
  const marcas = "#".repeat(n) + " ";
  const limpio = texto.replace(/^#{1,6}\s+/, "");
  ed.setRangeText(marcas + limpio, ini, fin, "end");
  marcarSucio();
  ed.focus();
}

function insertarTexto(t) {
  guardarPunto(true);
  const ed = $("editor");
  ed.setRangeText(t, ed.selectionStart, ed.selectionEnd, "end");
  marcarSucio();
  ed.focus();
}

function insertarBloqueCodigo() {
  guardarPunto(true);
  const ed = $("editor");
  const ini = ed.selectionStart;
  const fin = ed.selectionEnd;
  const sel = ed.value.slice(ini, fin);

  if (sel.trim()) {
    const cerca = sel.includes("```") ? "~~~~" : "```";
    ed.setRangeText(`${cerca}\n${sel}\n${cerca}`, ini, fin, "end");
  } else {
    ed.setRangeText("```\n\n```", ini, fin, "end");
    ed.selectionStart = ed.selectionEnd = ini + 4;
  }
  marcarSucio();
  ed.focus();
}

function insertarTabla() {
  insertarTexto(
    "\n| Columna | Columna | Columna |\n|---|---|---|\n|  |  |  |\n|  |  |  |\n"
  );
}

function marcarSeleccion(marca) {
  guardarPunto(true);
  const ed = $("editor");
  const ini = ed.selectionStart;
  const fin = ed.selectionEnd;
  if (ini === fin) {
    ed.setRangeText(marca + marca, ini, fin, "end");
    ed.selectionStart = ed.selectionEnd = ini + marca.length;
  } else {
    ed.setRangeText(marca + ed.value.slice(ini, fin) + marca, ini, fin, "end");
  }
  marcarSucio();
  ed.focus();
}

// --------------------------------------------------- deshacer / rehacer
// El undo del WebView no cubre los cambios que hace el menú (asignar el valor
// del textarea no entra en su historial), así que llevamos el nuestro.
const historial = { pila: [], rehacer: [], ultimo: 0 };

function reiniciarHistorial() {
  historial.pila = [];
  historial.rehacer = [];
  historial.ultimo = 0;
}

function guardarPunto(separado = false) {
  const ed = $("editor");
  const ultimo = historial.pila[historial.pila.length - 1];
  if (ultimo && ultimo.valor === ed.value) return;

  // al tipear se agrupa: un punto cada 700 ms de pausa
  const ahora = Date.now();
  if (!separado && ahora - historial.ultimo < 700) {
    historial.ultimo = ahora;
    return;
  }

  historial.pila.push({ valor: ed.value, ini: ed.selectionStart, fin: ed.selectionEnd });
  if (historial.pila.length > 150) historial.pila.shift();
  historial.rehacer = [];
  historial.ultimo = ahora;
}

function aplicarPunto(p) {
  const ed = $("editor");
  ed.value = p.valor;
  ed.selectionStart = p.ini;
  ed.selectionEnd = p.fin;
  ed.focus();
  marcarSucio();
}

function deshacer() {
  const ed = $("editor");
  const actual = { valor: ed.value, ini: ed.selectionStart, fin: ed.selectionEnd };

  let previo = null;
  while (historial.pila.length) {
    const p = historial.pila.pop();
    if (p.valor !== actual.valor) { previo = p; break; }
  }
  if (!previo) {
    $("estado").textContent = "no hay nada para deshacer";
    return;
  }
  historial.rehacer.push(actual);
  aplicarPunto(previo);
  $("estado").textContent = "deshecho";
}

function rehacer() {
  const p = historial.rehacer.pop();
  if (!p) return;
  const ed = $("editor");
  historial.pila.push({ valor: ed.value, ini: ed.selectionStart, fin: ed.selectionEnd });
  aplicarPunto(p);
  $("estado").textContent = "rehecho";
}

// --------------------------------------------------------------- links
// Convierte la selección en un link a internet: [texto](https://...)
function insertarEnlace() {
  const ed = $("editor");
  const ini = ed.selectionStart;
  const fin = ed.selectionEnd;
  const sel = ed.value.slice(ini, fin);

  // Si el menú no está abierto (atajo de teclado), lo abro cerca del editor.
  const m = $("menu");
  if (m.classList.contains("oculto")) {
    const r = $("cuerpo").getBoundingClientRect();
    abrirMenu(r.left + 60, r.top + 60);
  }
  pedirUrl(ini, fin, sel);
}

function pedirUrl(ini, fin, sel) {
  const m = $("menu");
  m.innerHTML = "";
  const caja = document.createElement("div");
  caja.className = "pedir-url";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "https://...";
  input.spellcheck = false;
  caja.appendChild(input);
  m.appendChild(caja);
  input.focus();

  const aplicar = () => {
    const url = input.value.trim();
    cerrarMenu();
    if (url) aplicarEnlace(ini, fin, sel, url);
    else $("editor").focus();
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); aplicar(); }
    if (e.key === "Escape") { e.preventDefault(); cerrarMenu(); $("editor").focus(); }
  });
}

// "github.com/x" -> "https://github.com/x"; deja intacto lo que ya trae esquema.
function normalizarUrl(url) {
  const limpio = (url || "").trim();
  if (!limpio) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(limpio)) return limpio;
  return "https://" + limpio.replace(/^\/+/, "");
}

function aplicarEnlace(ini, fin, sel, url) {
  guardarPunto(true);
  const ed = $("editor");
  const limpia = normalizarUrl(url);
  if (!limpia) {
    ed.focus();
    return;
  }
  const texto = sel.trim().replace(/\]/g, "\\]");
  // Un espacio o un paréntesis en la URL rompe el markdown: va entre < >
  const destino = /[\s()<>]/.test(limpia) ? "<" + limpia + ">" : limpia;
  const md = texto ? `[${texto}](${destino})` : `[](${destino})`;
  ed.setRangeText(md, ini, fin, "end");
  $("cuerpo").classList.remove("lectura");
  $("vista").textContent = "Solo lectura";
  marcarSucio();
  ed.focus();
  // sin selección, el cursor queda entre los corchetes para escribir el texto
  ed.selectionStart = ed.selectionEnd = texto ? ini + md.length : ini + 1;
}

function abrirMenu(x, y) {
  const m = $("menu");
  if (!m) return;
  m.innerHTML = "";
  for (const op of OPCIONES_MENU) {
    if (op.separador) {
      const h = document.createElement("div");
      h.className = "sep";
      m.appendChild(h);
      continue;
    }
    const it = document.createElement("button");
    it.className = "item";
    it.innerHTML = '<span class="txt"></span><span class="tecla"></span>';
    it.querySelector(".txt").textContent = op.texto;
    if (op.tecla) it.querySelector(".tecla").textContent = op.tecla;
    it.addEventListener("click", () => {
      cerrarMenu();
      op.ejecutar();
    });
    m.appendChild(it);
  }

  m.style.left = "0px";
  m.style.top = "0px";
  m.classList.remove("oculto");
  const caja = m.getBoundingClientRect();
  m.style.left = Math.max(6, Math.min(x, window.innerWidth - caja.width - 6)) + "px";
  m.style.top = Math.max(6, Math.min(y, window.innerHeight - caja.height - 6)) + "px";
}

function cerrarMenu(origen) {
  const m = $("menu");
  if (!m) return;
  if (!m.classList.contains("oculto") && estado.api && origen) {
    estado.api.registrar("cerrar menu desde " + origen);
  }
  m.classList.add("oculto");
}

// ------------------------------------------------------- paleta de colores
const COLORES = [
  { id: "", nombre: "Sin color" },
  { id: "azul", nombre: "Azul" },
  { id: "verde", nombre: "Verde" },
  { id: "amarillo", nombre: "Amarillo" },
  { id: "naranja", nombre: "Naranja" },
  { id: "rosa", nombre: "Rosa" },
  { id: "violeta", nombre: "Violeta" },
  { id: "turquesa", nombre: "Turquesa" },
  { id: "gris", nombre: "Gris" },
];

function abrirPaleta(x, y, archivo, actual) {
  const p = $("paleta");
  p.innerHTML = "";

  const titulo = document.createElement("div");
  titulo.className = "paleta-titulo";
  titulo.textContent = "Color de la tarjeta";
  p.appendChild(titulo);

  const fila = document.createElement("div");
  fila.className = "paleta-fila";

  for (const c of COLORES) {
    const b = document.createElement("button");
    b.className = "muestra " + (c.id ? "c-" + c.id : "c-ninguno") + (c.id === actual ? " sel" : "");
    b.title = c.nombre;
    b.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      cerrarPaleta();
      await estado.api.set_color(archivo, c.id);
      await cargarLista();
      if (estado.vista === "tarjetas") pintarTarjetas($("buscar").value);
      pintarLista($("buscar").value);
      if (estado.actual && estado.actual.archivo === archivo) estado.actual.color = c.id;
      $("estado").textContent = c.id ? `color: ${c.nombre}` : "sin color";
    });
    fila.appendChild(b);
  }

  p.appendChild(fila);
  p.classList.remove("oculto");

  const caja = p.getBoundingClientRect();
  p.style.left = Math.max(6, Math.min(x, window.innerWidth - caja.width - 6)) + "px";
  p.style.top = Math.max(6, Math.min(y, window.innerHeight - caja.height - 6)) + "px";
}

function cerrarPaleta() {
  const p = $("paleta");
  if (p) p.classList.add("oculto");
}

// ------------------------------------------------------------------- eventos
function conectarEventos() {
  $("editor").addEventListener("input", () => { guardarPunto(); marcarSucio(); });
  $("titulo").addEventListener("input", marcarSucio);
  $("tags").addEventListener("input", marcarSucio);
  $("editor").addEventListener("blur", guardarYa);
  $("titulo").addEventListener("blur", guardarYa);
  window.addEventListener("beforeunload", () => { if (estado.sucio) guardarYa(); });

  // menú de markdown con click derecho en el editor
  $("editor").addEventListener("contextmenu", (e) => {
    e.preventDefault();
    abrirMenu(e.clientX, e.clientY);
  });
  // respaldo: algunos WebView no disparan 'contextmenu' pero sí 'mousedown'
  $("editor").addEventListener("mousedown", (e) => {
    if (e.button !== 2) return;
    e.preventDefault();
    abrirMenu(e.clientX, e.clientY);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#menu")) cerrarMenu("click afuera");
    if (!e.target.closest("#paleta") && !e.target.closest(".color-btn") && !e.target.closest("#color")) {
      cerrarPaleta();
    }
  });
  $("editor").addEventListener("scroll", () => cerrarMenu("scroll"));
  window.addEventListener("resize", () => cerrarMenu("resize"));

  let timerBusqueda = null;
  $("buscar").addEventListener("input", (e) => {
    const q = e.target.value.trim();
    clearTimeout(timerBusqueda);

    if (!q) {
      estado.resultados = null;
      pintarLista("");
      if (estado.vista === "tarjetas") pintarTarjetas("");
      $("estado").textContent = "";
      return;
    }

    timerBusqueda = setTimeout(async () => {
      estado.resultados = await estado.api.buscar(q);
      pintarLista(q);
      if (estado.vista === "tarjetas") pintarTarjetas(q);
      $("estado").textContent = `${estado.resultados.length} resultado(s) para "${q}"`;
    }, 180);
  });

  // captura rápida
  $("captura").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      crearCaptura();
    } else if (e.key === "Escape") {
      $("captura").value = "";
      $("captura").blur();
    }
  });

  // volver a la grilla desde el editor
  $("volver").addEventListener("click", async () => {
    await guardarYa();
    aplicarVista("tarjetas");
  });

  // color de la nota abierta (desde el header del editor)
  $("color").addEventListener("click", (e) => {
    if (!estado.actual) return;
    const r = e.currentTarget.getBoundingClientRect();
    abrirPaleta(r.left, r.bottom + 6, estado.actual.archivo, estado.actual.color || "");
  });

  // filtro Rápidas / Notas
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((x) => x.classList.remove("activo"));
      chip.classList.add("activo");
      estado.filtro = chip.dataset.filtro;
      pintarLista($("buscar").value);
      if (estado.vista === "tarjetas") pintarTarjetas($("buscar").value);
    });
  });

  $("nueva").addEventListener("click", async () => {
    await guardarYa();
    const r = await estado.api.crear("Sin título");
    await cargarLista();
    await abrir(r.archivo);
    $("titulo").select();
  });

  $("pegar").addEventListener("click", pegarBloque);

  $("vista").addEventListener("click", () => {
    const cuerpo = $("cuerpo");
    cuerpo.classList.toggle("lectura");
    $("vista").textContent = cuerpo.classList.contains("lectura") ? "Editar" : "Solo lectura";
  });

  $("borrar").addEventListener("click", async () => {
    if (!estado.actual) return;
    if (!confirm(`¿Borrar "${$("titulo").value}"? Se va el archivo .md, sin vuelta atrás.`)) return;
    await estado.api.borrar(estado.actual.archivo);
    estado.actual = null;
    estado.sucio = false;
    await cargarLista();
    const primera = estado.notas[0];
    if (primera) await abrir(primera.archivo);
    else mostrarVacio();
  });

  $("carpeta").addEventListener("click", () => estado.api.abrir_carpeta());

  // callouts: plegar, copiar y maximizar (delegado)
  $("preview").addEventListener("click", async (e) => {
    const callout = e.target.closest(".callout");
    if (!callout) return;

    if (e.target.closest(".btn-copiar")) {
      const btn = e.target.closest(".btn-copiar");
      const texto = textoDelBloque(callout);
      const r = await copiarTexto(texto);
      btn.textContent = r ? "✓" : "✕";
      btn.classList.add("hecho");
      $("estado").textContent = r
        ? `copiado limpio (${texto.length} caracteres) — listo para pegar`
        : "no pude copiar al portapapeles";
      setTimeout(() => {
        btn.textContent = "⧉";
        btn.classList.remove("hecho");
      }, 1400);
      return;
    }

    if (e.target.closest(".btn-max")) {
      const titulo = callout.querySelector(".ctitulo").textContent;
      abrirModal(titulo, textoDelBloque(callout));
      return;
    }

    if (e.target.closest(".chead")) callout.classList.toggle("abierto");
  });

  $("modal-cerrar").addEventListener("click", cerrarModal);
  $("modal").addEventListener("click", (e) => { if (e.target.id === "modal") cerrarModal(); });
  $("modal-copiar").addEventListener("click", async () => {
    const ok = await copiarTexto($("modal-cuerpo").textContent);
    $("modal-copiar").textContent = ok ? "¡Copiado!" : "No pude";
    setTimeout(() => ($("modal-copiar").textContent = "Copiar"), 1200);
  });

  // Los links del preview abren el navegador del sistema, no navegan la app.
  $("preview").addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a) return;
    e.preventDefault();
    estado.api.abrir_url(a.getAttribute("href"));
  });

  document.addEventListener("keydown", (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.key === "Escape") { cerrarModal(); cerrarMenu(); cerrarPaleta(); return; }

    // deshacer / rehacer: en el editor usa nuestro historial, no el del WebView
    if (document.activeElement === $("editor")) {
      const k = e.key.toLowerCase();
      if (ctrl && !e.shiftKey && k === "z") { e.preventDefault(); deshacer(); return; }
      if (ctrl && (k === "y" || (e.shiftKey && k === "z"))) { e.preventDefault(); rehacer(); return; }
    }

    if (ctrl && e.shiftKey && e.key.toLowerCase() === "v") { e.preventDefault(); pegarBloque(); }
    if (ctrl && e.shiftKey && e.key.toLowerCase() === "b") { e.preventDefault(); envolverSeleccion(); }
    if (ctrl && e.shiftKey && e.key.toLowerCase() === "l") { e.preventDefault(); insertarEnlace(); }
    if (ctrl && e.shiftKey && e.key.toLowerCase() === "n") { e.preventDefault(); $("captura").focus(); }
    if (ctrl && !e.shiftKey && e.key.toLowerCase() === "n") { e.preventDefault(); $("nueva").click(); }
    if (ctrl && !e.shiftKey && e.key.toLowerCase() === "k") { e.preventDefault(); $("buscar").focus(); }
    if (ctrl && !e.shiftKey && e.key.toLowerCase() === "s") { e.preventDefault(); guardarYa(); }
  });
}

// Los títulos de los botones muestran la tecla del sistema (Ctrl o Cmd).
function ajustarEtiquetasDeAtajos() {
  document.querySelectorAll("[data-tecla]").forEach((el) => {
    const accion = el.dataset.accion || "";
    el.title = accion + " (" + ATAJO(el.dataset.tecla) + ")";
  });
}

ajustarEtiquetasDeAtajos();
iniciar();
