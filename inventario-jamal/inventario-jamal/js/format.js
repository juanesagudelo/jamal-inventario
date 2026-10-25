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
