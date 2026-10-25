// Pestaña "Ganancias": ventas, costo de lo vendido y ganancia, a partir de ventas y compras.
import { fmtCOP, fmtMl, escapeHtml } from "./format.js";
import { getMovimientos, onMovimientos } from "./ventas.js";

const $ = id => document.getElementById(id);
const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);

export function initGanancias() {
  function render() {
    const { ventas, compras } = getMovimientos();
    const d = $("gDesde").value ? new Date($("gDesde").value + "T00:00:00") : null;
    const h = $("gHasta").value ? new Date($("gHasta").value + "T23:59:59.999") : null;
    const en = x => { const f = x.fecha?.toDate ? x.fecha.toDate() : null; return (!d || (f && f >= d)) && (!h || (f && f <= h)); };
    const vs = ventas.filter(en), cs = compras.filter(en);
    const conCosto = vs.filter(v => v.costoPorMl != null);
    const gan = v => (v.total || 0) - v.cantidadMl * v.costoPorMl;
    const ganancia = sum(conCosto, gan), ingCosto = sum(conCosto, v => v.total || 0);

    $("gIngresos").textContent = fmtCOP(sum(vs, v => v.total || 0));
    $("gGanancia").textContent = fmtCOP(ganancia);
    $("gMargen").textContent = ingCosto > 0 ? `margen de ${(ganancia / ingCosto * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %` : "";
    $("gCompras").textContent = fmtCOP(sum(cs, c => c.totalPagado || 0));
    const sin = vs.length - conCosto.length;
    $("gNota").textContent = sin > 0 ? `${sin} venta(s) no tienen costo registrado (el perfume no tenía costo al venderse) y no cuentan en la ganancia.` : "";

    const grupos = new Map();
    vs.forEach(v => {
      const g = grupos.get(v.nombre) || { ml: 0, ing: 0, gan: 0, hayCosto: false };
      g.ml += v.cantidadMl || 0; g.ing += v.total || 0;
      if (v.costoPorMl != null) { g.gan += gan(v); g.hayCosto = true; }
      grupos.set(v.nombre, g);
    });
    const filas = [...grupos.entries()].sort((a, b) => b[1].gan - a[1].gan);
    $("gBody").innerHTML = filas.length === 0
      ? `<tr><td colspan="4" class="empty">No hay ventas en este periodo.</td></tr>`
      : filas.map(([n, g]) => `<tr><td>${escapeHtml(n ?? "—")}</td><td class="num">${fmtMl(g.ml)}</td><td class="num">${fmtCOP(g.ing)}</td><td class="num">${g.hayCosto ? fmtCOP(g.gan) : "—"}</td></tr>`).join("");
  }
  onMovimientos(render);
  ["gDesde", "gHasta"].forEach(id => $(id).addEventListener("input", render));
  render();
}
