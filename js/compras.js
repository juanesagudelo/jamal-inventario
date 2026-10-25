// Registro de compras (entradas): suma ml al stock y recalcula el costo promedio por ml.
import { db } from "./firebase.js";
import { doc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { fmtCOP, fmtMl, costoDe } from "./format.js";
import { getInventario, comprasCol } from "./inventario.js";

const $ = id => document.getElementById(id);

// Costo promedio ponderado: mezcla lo que había con lo que se acaba de comprar.
function costoNuevo(ml, costoPrev, m, total) {
  return (costoPrev != null && ml > 0) ? (ml * costoPrev + total) / (ml + m) : total / m;
}

export function initCompras() {
  let perfumeId = null;
  const msg = (type, text) => { const el = $("compraMsg"); el.hidden = !text; el.className = "msg " + type; el.textContent = text || ""; };
  const cerrar = () => {
    $("compraBackdrop").hidden = true; perfumeId = null;
    $("cMl").value = ""; $("cTotal").value = ""; $("cResumen").textContent = ""; msg("err", "");
  };

  function resumen() {
    const p = getInventario().find(x => x.id === perfumeId);
    const m = parseInt($("cMl").value, 10), t = parseFloat($("cTotal").value);
    if (!p || !(m > 0) || isNaN(t) || t < 0) { $("cResumen").textContent = ""; return; }
    $("cResumen").textContent = `Esta compra: ${fmtCOP(t / m)} por ml. El stock quedará en ${fmtMl(p.ml + m)} ml, con costo promedio de ${fmtCOP(costoNuevo(p.ml, costoDe(p), m, t))} por ml.`;
  }

  document.addEventListener("comprar", e => {
    perfumeId = e.detail.id;
    $("compraNombre").textContent = `${e.detail.nombre} · stock actual: ${fmtMl(e.detail.ml)} ml`;
    $("compraBackdrop").hidden = false;
    $("cMl").focus();
  });
  ["cMl", "cTotal"].forEach(id => $(id).addEventListener("input", resumen));
  $("compraCancel").addEventListener("click", cerrar);
  $("compraBackdrop").addEventListener("mousedown", e => { if (e.target.id === "compraBackdrop") cerrar(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("compraBackdrop").hidden) cerrar(); });

  $("compraSave").addEventListener("click", async () => {
    const m = parseInt($("cMl").value, 10), t = parseFloat($("cTotal").value);
    if (!perfumeId) return;
    if (!(m > 0)) return msg("err", "Ingresa los ml comprados.");
    if (isNaN(t) || t < 0) return msg("err", "Ingresa el total pagado.");
    $("compraSave").disabled = true;
    try {
      await runTransaction(db, async tx => {
        const ref = doc(db, "inventario", perfumeId);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Ese perfume ya no existe en el inventario.");
        const d = snap.data();
        tx.update(ref, { ml: d.ml + m, costoPromedioPorMl: costoNuevo(d.ml, costoDe(d), m, t) });
        tx.set(doc(comprasCol), { fecha: serverTimestamp(), perfumeId, nombre: d.nombre, cantidadMl: m, totalPagado: Math.round(t) });
      });
      cerrar();
    } catch (e) {
      msg("err", e.message);
    } finally {
      $("compraSave").disabled = false;
    }
  });
}
