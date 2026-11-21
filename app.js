const API_BASE = "";

const POSICIONES = [
  { id: "der_dorsal", codigo: "Der Dorsal", titulo: "1. Der · Dorsal", subtitulo: "Dorso y nudillos", indicacion: "Mano Derecha · Dorso abierto (nudillos visibles)", espejo: false, tipo: "mano" },
  { id: "der_palmar", codigo: "Der Palmar", titulo: "2. Der · Palmar", subtitulo: "Palma abierta", indicacion: "Mano Derecha · Palma hacia la cámara", espejo: true, tipo: "mano" },
  { id: "der_muneca", codigo: "Der Muñeca", titulo: "3. Der · Muñeca", subtitulo: "Carpo y antebrazo", indicacion: "Mano Derecha · Enfoque dorsal de muñeca y carpo", espejo: false, tipo: "muneca" },
  { id: "izq_dorsal", codigo: "Izq Dorsal", titulo: "4. Izq · Dorsal", subtitulo: "Dorso y nudillos", indicacion: "Mano Izquierda · Dorso abierto (nudillos visibles)", espejo: true, tipo: "mano" },
  { id: "izq_palmar", codigo: "Izq Palmar", titulo: "5. Izq · Palmar", subtitulo: "Palma abierta", indicacion: "Mano Izquierda · Palma hacia la cámara", espejo: false, tipo: "mano" },
  { id: "izq_muneca", codigo: "Izq Muñeca", titulo: "6. Izq · Muñeca", subtitulo: "Carpo y antebrazo", indicacion: "Mano Izquierda · Enfoque dorsal de muñeca y carpo", espejo: true, tipo: "muneca" }
];

let poseIndexActual = 0;
let posesCompletadas = new Set();
let claseActual = "Sana";
let filtroActual = "TODAS";
let registrosCache = [];
let modoPreviewLocal = false;

const streamImg = document.getElementById("stream-img");
const statusPill = document.getElementById("status-pill");
const statusText = document.getElementById("status-text");
const toggleGuia = document.getElementById("toggle-guia");
const handGuide = document.getElementById("hand-guide");
const guideSvg = document.getElementById("guide-svg");
const guideCaption = document.getElementById("guide-caption");
const poseActivaTexto = document.getElementById("pose-activa-texto");
const posesGrid = document.getElementById("poses-grid");
const btnResetSesion = document.getElementById("btn-reset-sesion");
const classButtons = document.querySelectorAll(".class-btn");
const customInput = document.getElementById("etiqueta-custom");
const btnCapturar = document.getElementById("btn-capturar");
const btnSujetoLabel = document.getElementById("btn-sujeto-label");
const btnRefrescar = document.getElementById("btn-refrescar");
const btnExportar = document.getElementById("btn-exportar");
const toast = document.getElementById("toast");
const galeria = document.getElementById("galeria");

// Campos de sujeto anónimo
const inputSujeto = document.getElementById("input-sujeto");
const inputEdad = document.getElementById("input-edad");
const inputSexo = document.getElementById("input-sexo");
const subjectTitle = document.getElementById("subject-title");
const btnNuevoSujeto = document.getElementById("btn-nuevo-sujeto");

function sincronizarNombreSujeto() {
  const val = inputSujeto.value.trim() || "Sujeto_001";
  subjectTitle.textContent = val;
  btnSujetoLabel.textContent = val;
}

inputSujeto.addEventListener("input", sincronizarNombreSujeto);

btnNuevoSujeto.addEventListener("click", () => {
  const match = inputSujeto.value.match(/(\d+)$/);
  const siguienteNum = match ? Number(match[1]) + 1 : 2;
  const nuevoCodigo = `Sujeto_${String(siguienteNum).padStart(3, "0")}`;

  inputSujeto.value = nuevoCodigo;
  inputEdad.value = "";
  inputSexo.value = "";
  sincronizarNombreSujeto();

  posesCompletadas.clear();
  poseIndexActual = 0;
  renderizarTarjetasPoses();
  actualizarEtiquetaAutomatica();
  toast.textContent = `Listo para capturar las 6 vistas de ${nuevoCodigo}`;
});

function obtenerIconoPoseSVG(pose, esOverlay = false) {
  const stroke = esOverlay ? "rgba(255,255,255,0.52)" : "currentColor";
  const sw = esOverlay ? "2.4" : "2.8";
  const transform = pose.espejo ? 'transform="translate(200,0) scale(-1,1)"' : "";

  if (pose.tipo === "muneca") {
    return `
      ${esOverlay ? `<rect x="20" y="12" width="160" height="136" rx="16" stroke="rgba(255,255,255,0.4)" stroke-width="2" stroke-dasharray="6 5"/>` : ""}
      <g ${transform}>
        <path d="M74 146 V104 L66 78 C64 72 72 69 75 75 L80 88 V58 C80 52 88 52 88 58 V84 H93 V54 C93 48 101 48 101 54 V84 H106 V58 C106 52 114 52 114 58 V87 H118 V66 C118 60 125 60 125 66 V104 L120 146"
              stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <line x1="70" y1="114" x2="124" y2="114" stroke="${stroke}" stroke-width="2" stroke-dasharray="4 3"/>
      </g>
    `;
  }

  return `
    ${esOverlay ? `<rect x="18" y="10" width="164" height="140" rx="18" stroke="rgba(255,255,255,0.45)" stroke-width="2" stroke-dasharray="6 5"/>` : ""}
    <g ${transform}>
      <path d="M72 138 V86 L58 72 C53 67 59 61 64 66 L75 77 V44 C75 38 83 38 83 44 V74 H88 V36 C88 30 96 30 96 36 V74 H101 V39 C101 33 109 33 109 39 V76 H114 V48 C114 42 122 42 122 48 V98 L116 138"
            stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </g>
  `;
}

function actualizarEtiquetaAutomatica() {
  const pose = POSICIONES[poseIndexActual];
  customInput.value = `${claseActual} - ${pose.codigo}`;
  poseActivaTexto.textContent = `Posición actual: ${pose.indicacion}`;
  guideCaption.textContent = pose.indicacion;
  guideSvg.innerHTML = obtenerIconoPoseSVG(pose, true);
}

function renderizarTarjetasPoses() {
  posesGrid.innerHTML = POSICIONES.map((pose, idx) => {
    const activa = idx === poseIndexActual ? "active" : "";
    const hecha = posesCompletadas.has(pose.id) ? "done" : "";
    const marca = posesCompletadas.has(pose.id) ? "✓" : `${idx + 1}/6`;

    return `
      <button type="button" class="pose-card ${activa} ${hecha}" data-idx="${idx}">
        <span class="pose-badge">${marca}</span>
        <svg viewBox="0 0 200 160" fill="none">${obtenerIconoPoseSVG(pose, false)}</svg>
        <span class="pose-title">${pose.titulo}</span>
        <span class="pose-sub">${pose.subtitulo}</span>
      </button>
    `;
  }).join("");

  document.querySelectorAll(".pose-card").forEach((card) => {
    card.addEventListener("click", () => {
      poseIndexActual = Number(card.dataset.idx);
      renderizarTarjetasPoses();
      actualizarEtiquetaAutomatica();
    });
  });

  btnResetSesion.textContent = `Reiniciar ciclo (${posesCompletadas.size}/6)`;
}

btnResetSesion.addEventListener("click", () => {
  posesCompletadas.clear();
  poseIndexActual = 0;
  renderizarTarjetasPoses();
  actualizarEtiquetaAutomatica();
});

toggleGuia.addEventListener("change", () => {
  handGuide.classList.toggle("hidden", !toggleGuia.checked);
});

classButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    classButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    claseActual = btn.dataset.tag;
    actualizarEtiquetaAutomatica();
  });
});

streamImg.addEventListener("error", () => {
  if (modoPreviewLocal) return;
  modoPreviewLocal = true;
  statusPill.querySelector(".pulse-dot").classList.add("offline");
  statusText.textContent = "Vista previa de diseño (VS Code)";

  const stage = document.querySelector(".camera-stage");
  streamImg.style.display = "none";

  const canvas = document.createElement("canvas");
  canvas.width = 80;
  canvas.height = 62;
  stage.prepend(canvas);
  const ctx = canvas.getContext("2d");

  let t = 0;
  setInterval(() => {
    t += 0.08;
    const grad = ctx.createRadialGradient(40 + Math.sin(t) * 3, 35, 3, 40, 35, 32);
    grad.addColorStop(0, "#fef08a");
    grad.addColorStop(0.45, "#f97316");
    grad.addColorStop(0.8, "#7e22ce");
    grad.addColorStop(1, "#0f172a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 80, 62);
  }, 100);
});

function actualizarKPIs(lista) {
  const sujetosUnicos = new Set(lista.map((r) => r.sujeto_id || "Sujeto_001"));
  document.getElementById("kpi-sujetos").textContent = sujetosUnicos.size;
  document.getElementById("kpi-sana").textContent = lista.filter((r) =>
    r.etiqueta.toLowerCase().includes("sana")
  ).length;
  document.getElementById("kpi-artritis").textContent = lista.filter((r) =>
    r.etiqueta.toLowerCase().includes("artritis")
  ).length;
  document.getElementById("kpi-artrosis").textContent = lista.filter((r) =>
    r.etiqueta.toLowerCase().includes("artrosis")
  ).length;
}

function renderizarGaleria() {
  const filtrados =
    filtroActual === "TODAS"
      ? registrosCache
      : registrosCache.filter((r) =>
          r.etiqueta.toLowerCase().includes(filtroActual.toLowerCase())
        );

  if (filtrados.length === 0) {
    galeria.innerHTML = '<p class="empty-msg">No hay capturas registradas todavía.</p>';
    return;
  }

  // Agrupar por sujeto_id
  const grupos = {};
  filtrados.forEach((item) => {
    const key = item.sujeto_id || "Sujeto_001";
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(item);
  });

  galeria.innerHTML = Object.entries(grupos)
    .map(([sujeto, tomas]) => {
      const primero = tomas[0];
      const demografia = [
        primero.edad ? `${primero.edad} años` : "",
        primero.sexo ? `Sexo: ${primero.sexo}` : ""
      ].filter(Boolean).join(" · ");

      const tarjetasTomas = tomas
        .map(
          (t) => `
          <div class="mini-shot">
            <img src="${API_BASE}/capturas/${t.archivo_imagen}" alt="${t.etiqueta}" loading="lazy" />
            <div class="mini-shot-info">
              <span class="mini-shot-tag">${t.etiqueta.split(" - ")[1] || t.etiqueta}</span>
              <span class="mini-shot-temp">${t.t_min}°–${t.t_max}°C</span>
            </div>
          </div>
        `
        )
        .join("");

      return `
        <article class="subject-folder">
          <div class="folder-head">
            <div class="folder-title">
              <span>📁 ${sujeto}</span>
              <span class="folder-meta">(${tomas.length}/6 tomas${demografia ? " · " + demografia : ""})</span>
            </div>
            <span class="folder-meta">${primero.etiqueta.split(" - ")[0]}</span>
          </div>
          <div class="folder-shots">${tarjetasTomas}</div>
        </article>
      `;
    })
    .join("");
}

async function cargarCapturas() {
  try {
    const res = await fetch(`${API_BASE}/api/capturas`);
    if (!res.ok) throw new Error("API no disponible");
    registrosCache = await res.json();

    statusText.textContent = "Nodo Raspberry Pi en línea";
    statusPill.querySelector(".pulse-dot").classList.remove("offline");

    // Sugerir automáticamente el siguiente sujeto si ya hay registros
    if (registrosCache.length > 0 && inputSujeto.value === "Sujeto_001") {
      const ultimoSujeto = registrosCache[0].sujeto_id || "Sujeto_001";
      inputSujeto.value = ultimoSujeto;
      sincronizarNombreSujeto();
    }

    actualizarKPIs(registrosCache);
    renderizarGaleria();
  } catch (err) {
    galeria.innerHTML =
      '<p class="empty-msg">Esperando conexión con el servidor de la Raspberry Pi...</p>';
  }
}

async function tomarCaptura() {
  const poseActual = POSICIONES[poseIndexActual];
  const etiquetaFinal =
    customInput.value.trim() !== ""
      ? customInput.value.trim()
      : `${claseActual} - ${poseActual.codigo}`;

  const sujetoActual = inputSujeto.value.trim() || "Sujeto_001";

  btnCapturar.disabled = true;
  toast.classList.remove("error");
  toast.textContent = `Guardando en carpeta ${sujetoActual}...`;

  try {
    const res = await fetch(`${API_BASE}/api/capturar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        etiqueta: etiquetaFinal,
        sujeto_id: sujetoActual,
        edad: inputEdad.value,
        sexo: inputSexo.value
      }),
    });

    const data = await res.json();
    if (!data.ok) throw new Error("Fallo al guardar");

    posesCompletadas.add(poseActual.id);
    if (poseIndexActual < POSICIONES.length - 1) {
      poseIndexActual += 1;
    }
    renderizarTarjetasPoses();
    actualizarEtiquetaAutomatica();

    toast.textContent = `✓ Guardada en ${data.sujeto_id} [${data.etiqueta}] · ${data.t_min}°C a ${data.t_max}°C`;
    await cargarCapturas();
  } catch (err) {
    toast.classList.add("error");
    toast.textContent = "No se pudo guardar (verifica conexión con la Raspberry Pi).";
  } finally {
    btnCapturar.disabled = false;
  }
}

document.querySelectorAll(".filter-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    filtroActual = chip.dataset.filter;
    renderizarGaleria();
  });
});

btnExportar.addEventListener("click", () => {
  if (registrosCache.length === 0) return;
  const encabezados = ["id,sujeto_id,edad,sexo,fecha_hora,etiqueta,t_min,t_max,archivo_imagen,archivo_matriz"];
  const filas = registrosCache.map(
    (r) =>
      `${r.id},"${r.sujeto_id || ""}","${r.edad || ""}","${r.sexo || ""}","${r.fecha_hora}","${r.etiqueta}",${r.t_min},${r.t_max},"${r.archivo_imagen}","${r.archivo_matriz}"`
  );
  const blob = new Blob([encabezados.concat(filas).join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dataset_termografia_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

btnCapturar.addEventListener("click", tomarCaptura);
btnRefrescar.addEventListener("click", cargarCapturas);

document.addEventListener("keydown", (e) => {
  const tagActivo = document.activeElement.tagName;
  if (e.code === "Space" && !["INPUT", "SELECT"].includes(tagActivo)) {
    e.preventDefault();
    tomarCaptura();
  }
});

renderizarTarjetasPoses();
actualizarEtiquetaAutomatica();
sincronizarNombreSujeto();
cargarCapturas();