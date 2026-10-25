// Interfaz general: pestañas e indicador de sincronización del encabezado.

export function initTabs() {
  const views = {
    inventario: document.getElementById("view-inventario"),
    vender: document.getElementById("view-vender"),
    historial: document.getElementById("view-historial"),
    ganancias: document.getElementById("view-ganancias")
  };
  const buttons = document.querySelectorAll("nav.tabs button");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      buttons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      Object.values(views).forEach(v => (v.hidden = true));
      views[btn.dataset.view].hidden = false;
    });
  });
}

// ok: true = sincronizado, false = sin conexión, "connecting" = conectando
export function setSyncState(ok) {
  const dot = document.getElementById("syncDot");
  const label = document.getElementById("syncLabel");
  dot.classList.toggle("on", ok === true);
  dot.classList.toggle("off", ok === false);
  label.textContent = ok === true ? "Sincronizado" : ok === false ? "Sin conexión" : "Conectando…";
}
