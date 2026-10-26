// Pestaña "Ganancias": ventas, costo de lo vendido y ganancia, con margen por perfume
// y los más / menos vendidos del mes actual.
import { fmtCOP, fmtMl, escapeHtml } from "./format.js";
import { getMovimientos, onMovimientos } from "./ventas.js";
import { getInventario, onInventarioChange } from "./inventario.js";

const $ = id => document.getElementById(id);
const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
const pct = n => n.toLocaleString("es-CO", { maximumFractionDigits: 1 }) + " %";
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function initGanancias() {
  // Más y menos vendidos del mes actual (en ml). Los menos vendidos son perfumes con stock,
  // incluso los que no han vendido nada, para ver cuáles conviene mover con una promoción.
  function rankings(ventas) {
    const inicio = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const porPerfume = new Map();
    ventas.forEach(v => {
      const f = v.fecha?.toDate ? v.fecha.toDate() : null;
      if (!f || f < inicio) return;
      const k = v.perfumeId || v.nombre;
      const g = porPerfume.get(k) || { nombre: v.nombre, ml: 0, total: 0 };
      g.ml += v.cantidadMl || 0; g.total += v.total || 0;
      porPerfume.set(k, g);
    });
    const mas = [...porPerfume.entries()].map(([id, g]) => ({ id, ...g })).sort((a, b) => b.ml - a.ml).slice(0, 3);
    const enTop = new Set(mas.map(g => g.id));
    const menos = getInventario().filter(p => p.ml > 0 && !enTop.has(p.id))
      .map(p => ({ id: p.id, nombre: p.nombre, ml: porPerfume.get(p.id)?.ml || 0, stock: p.ml }))
      .sort((a, b) => a.ml - b.ml || b.stock - a.stock).slice(0, 3);
    return { mas, menos };
  }

  function renderRankings(ventas) {
    const mes = new Date().toLocaleDateString("es-CO", { month: "long" });
    $("gTopTitulo").textContent = `Más vendidos de ${mes}`;
    $("gBajoTitulo").textContent = `Menos vendidos de ${mes}`;
    const { mas, menos } = rankings(ventas);
    const fila = (g, i, extra) => `<li><span class="rank">${i + 1}</span><div><b>${escapeHtml(g.nombre ?? "—")}</b><small>${extra}</small></div><span class="num">${fmtMl(g.ml)} ml</span></li>`;
    $("gTop").innerHTML = mas.length
      ? mas.map((g, i) => fila(g, i, `${fmtCOP(g.total)} en ventas`)).join("")
      : `<li class="empty-li">Aún no hay ventas este mes.</li>`;
    $("gBajo").innerHTML = menos.length
      ? menos.map((g, i) => fila(g, i, `${fmtMl(g.stock)} ml en stock`)).join("")
      : `<li class="empty-li">No hay otros perfumes con stock.</li>`;
  }

  function render() {
    const { ventas, compras } = getMovimientos();
    renderRankings(ventas);
    const d = $("gDesde").value ? new Date($("gDesde").value + "T00:00:00") : null;
    const h = $("gHasta").value ? new Date($("gHasta").value + "T23:59:59.999") : null;
    const en = x => { const f = x.fecha?.toDate ? x.fecha.toDate() : null; return (!d || (f && f >= d)) && (!h || (f && f <= h)); };
    const vs = ventas.filter(en), cs = compras.filter(en);
    const conCosto = vs.filter(v => v.costoPorMl != null);
    const gan = v => (v.total || 0) - v.cantidadMl * v.costoPorMl;
    const ganancia = sum(conCosto, gan), ingCosto = sum(conCosto, v => v.total || 0);

    $("gIngresos").textContent = fmtCOP(sum(vs, v => v.total || 0));
    $("gGanancia").textContent = fmtCOP(ganancia);
    $("gMargen").textContent = ingCosto > 0 ? `margen de ${pct(ganancia / ingCosto * 100)}` : "";
    $("gCompras").textContent = fmtCOP(sum(cs, c => c.totalPagado || 0));
    const sin = vs.length - conCosto.length;
    $("gNota").textContent = sin > 0 ? `${sin} venta(s) no tienen costo registrado (el perfume no tenía costo al venderse) y no cuentan en la ganancia.` : "";

    const grupos = new Map();
    vs.forEach(v => {
      const g = grupos.get(v.nombre) || { ml: 0, ing: 0, gan: 0, ingC: 0, hayCosto: false };
      g.ml += v.cantidadMl || 0; g.ing += v.total || 0;
      if (v.costoPorMl != null) { g.gan += gan(v); g.ingC += v.total || 0; g.hayCosto = true; }
      grupos.set(v.nombre, g);
    });
    const filas = [...grupos.entries()].sort((a, b) => b[1].gan - a[1].gan);
    $("gBody").innerHTML = filas.length === 0
      ? `<tr><td colspan="5" class="empty">No hay ventas en este periodo.</td></tr>`
      : filas.map(([n, g]) => `<tr><td>${escapeHtml(n ?? "—")}</td><td class="num">${fmtMl(g.ml)}</td><td class="num">${fmtCOP(g.ing)}</td><td class="num">${g.hayCosto ? fmtCOP(g.gan) : "—"}</td><td class="num">${g.hayCosto && g.ingC > 0 ? pct(g.gan / g.ingC * 100) : "—"}</td></tr>`).join("");
  }

  // Filtros rápidos de fecha: Todo, Hoy, Esta semana (desde el lunes) y Este mes.
  const chips = document.querySelectorAll("#view-ganancias .chip");
  const marcar = r => chips.forEach(b => b.classList.toggle("active", b.dataset.rango === r));
  chips.forEach(b => b.addEventListener("click", () => {
    const hoy = new Date(), r = b.dataset.rango;
    let d = "", h = "";
    if (r === "hoy") d = h = iso(hoy);
    else if (r === "semana") { const lun = new Date(hoy); lun.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7)); d = iso(lun); h = iso(hoy); }
    else if (r === "mes") { d = iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)); h = iso(hoy); }
    $("gDesde").value = d; $("gHasta").value = h;
    marcar(r); render();
  }));

  onMovimientos(render);
  onInventarioChange(render);
  ["gDesde", "gHasta"].forEach(id => $(id).addEventListener("input", () => { marcar(null); render(); }));
  render();
}
