// Registro de compras (entradas): suma ml al stock, recalcula el costo promedio por ml
// y deja guardados los materiales del perfume para la próxima vez.
import { db } from "./firebase.js";
import { doc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { fmtCOP, fmtMl, costoDe, moneyInput, parseMoney } from "./format.js";
import { getInventario, comprasCol } from "./inventario.js";
import { poblarMateriales, leerFilas, initMateriales } from "./materiales.js";

const $ = id => document.getElementById(id);

// Costo promedio ponderado: mezcla lo que había con lo que se acaba de comprar.
function costoNuevo(ml, costoPrev, m, total) {
  return (costoPrev != null && ml > 0) ? (ml * costoPrev + total) / (ml + m) : total / m;
}

export function initCompras() {
  let perfumeId = null;
  const cont = $("cMateriales");
  moneyInput($("cTotal"));
  const msg = (type, text) => { const el = $("compraMsg"); el.hidden = !text; el.className = "msg " + type; el.textContent = text || ""; };
  const cerrar = () => {
    $("compraBackdrop").hidden = true; perfumeId = null;
    $("cMl").value = ""; $("cTotal").value = ""; cont.innerHTML = ""; $("cResumen").textContent = ""; msg("err", "");
  };

  // Total de la compra: el que escribes, o la suma de los materiales si lo dejas vacío.
  function calcular() {
    const c = parseMoney($("cTotal").value);
    const filas = leerFilas(cont);
    const suma = filas.reduce((s, f) => s + (isNaN(f.precio) ? 0 : f.precio), 0);
    return { filas, suma, total: !isNaN(c) ? c : suma };
  }

  function resumen() {
    const p = getInventario().find(x => x.id === perfumeId);
    const m = parseInt($("cMl").value, 10);
    $("cTotalBox").textContent = fmtCOP(calcular().total);
    $("cResumen").textContent = (p && m > 0) ? `El stock quedará en ${fmtMl(p.ml + m)} ml.` : "";
  }

  initMateriales(cont, $("cAddMaterial"), resumen);
  document.addEventListener("comprar", e => {
    perfumeId = e.detail.id;
    $("compraNombre").textContent = `${e.detail.nombre} · stock actual: ${fmtMl(e.detail.ml)} ml`;
    poblarMateriales(cont, (e.detail.materiales || []).map(m => ({ nombre: m.nombre })));
    resumen();
    $("compraBackdrop").hidden = false;
    $("cMl").focus();
  });
  ["cMl", "cTotal"].forEach(id => $(id).addEventListener("input", resumen));
  $("compraCancel").addEventListener("click", cerrar);
  $("compraBackdrop").addEventListener("mousedown", e => { if (e.target.id === "compraBackdrop") cerrar(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("compraBackdrop").hidden) cerrar(); });

  $("compraSave").addEventListener("click", async () => {
    const m = parseInt($("cMl").value, 10);
    const { filas, total } = calcular();
    if (!perfumeId) return;
    if (!(m > 0)) return msg("err", "Ingresa los ml comprados o hechos.");
    if (filas.some(f => !f.nombre && !isNaN(f.precio))) return msg("err", "Escribe el nombre de cada material que tenga precio.");
    const mats = filas.filter(f => f.nombre).map(f => ({ nombre: f.nombre, precio: isNaN(f.precio) ? 0 : f.precio }));
    $("compraSave").disabled = true;
    try {
      await runTransaction(db, async tx => {
        const ref = doc(db, "inventario", perfumeId);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Ese perfume ya no existe en el inventario.");
        const d = snap.data();
        tx.update(ref, { ml: d.ml + m, costoPromedioPorMl: costoNuevo(d.ml, costoDe(d), m, total), materiales: mats });
        tx.set(doc(comprasCol), { fecha: serverTimestamp(), perfumeId, nombre: d.nombre, cantidadMl: m, totalPagado: Math.round(total), materiales: mats });
      });
      cerrar();
    } catch (e) {
      msg("err", e.message);
    } finally {
      $("compraSave").disabled = false;
    }
  });
}
