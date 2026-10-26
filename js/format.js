// Funciones de formato — números, moneda y fechas en español colombiano.

export function fmtCOP(n) {
  return "$" + Math.round(n).toLocaleString("es-CO");
}

export function fmtLitros(ml) {
  return (ml / 1000).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

export function fmtMl(ml) {
  return ml.toLocaleString("es-CO");
}

export function fmtFecha(timestamp) {
  if (!timestamp?.toDate) return "—";
  return timestamp.toDate().toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// Costo por ml de un perfume (promedio de sus compras); null si no se ha registrado.
export function costoDe(p) {
  return p.costoPromedioPorMl ?? null;
}

// ---- Campos de dinero: se escriben como $30.000 y se leen como número ----
export const parseMoney = v => parseInt(String(v ?? "").replace(/\D/g, ""), 10);
export const fmtMoneyInput = n => (n == null || isNaN(n) ? "" : "$" + Math.round(n).toLocaleString("es-CO"));
export function moneyInput(el) {
  el.addEventListener("input", () => {
    const d = el.value.replace(/\D/g, "");
    el.value = d ? "$" + Number(d).toLocaleString("es-CO") : "";
  });
}
