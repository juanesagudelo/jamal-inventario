// Pestañas "Vender" e "Historial": registra ventas con una transacción
// (segura aunque dos personas vendan al mismo tiempo) y muestra el historial en tiempo real.

import { db } from "./firebase.js";
import {
  doc, collection, onSnapshot, query, orderBy, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { fmtCOP, fmtMl, fmtFecha, escapeHtml } from "./format.js";
import { getInventario, onInventarioChange } from "./inventario.js";

const ventasCol = collection(db, "ventas");
const $ = id => document.getElementById(id);

export function initVentas() {
  initFormularioVenta();
  initHistorial();
}

// ---------- Vender ----------
function initFormularioVenta() {
  const sel = $("selPerfume"), ml = $("mlVender"), buscar = $("buscarVenta"), btn = $("registrarVenta");

  function renderSelector() {
    const q = buscar.value.trim().toLowerCase();
    const inv = getInventario();
    const lista = inv.filter(p => p.ml > 0 && (!q || `${p.nombre} ${p.marca || ""}`.toLowerCase().includes(q)));
    const prev = sel.value;
    if (inv.length === 0) sel.innerHTML = `<option value="">No hay perfumes todavía</option>`;
    else if (lista.length === 0) sel.innerHTML = `<option value="">Sin perfumes disponibles para esa búsqueda</option>`;
    else sel.innerHTML = lista.map(p =>
      `<option value="${p.id}">${escapeHtml(p.nombre)}${p.marca ? " · " + escapeHtml(p.marca) : ""} — ${fmtMl(p.ml)} ml</option>`).join("");
    if (prev && lista.some(p => p.id === prev)) sel.value = prev;
    renderResumen();
  }

  function renderResumen() {
    const p = getInventario().find(x => x.id === sel.value);
    const cant = parseFloat(ml.value);
    const ok = p && !isNaN(cant) && cant > 0;
    $("resPerfume").textContent = p ? p.nombre : "—";
    $("resDisp").textContent = p ? `${fmtMl(p.ml)} ml` : "—";
    $("resPrecio").textContent = p ? fmtCOP(p.precioPorMl) : "$0";
    $("resCantidad").textContent = ok ? `${fmtMl(cant)} ml` : "0 ml";
    $("estimateTotal").textContent = ok ? fmtCOP(cant * p.precioPorMl) : "$0";
  }

  onInventarioChange(renderSelector);
  renderSelector();
  buscar.addEventListener("input", renderSelector);
  sel.addEventListener("change", renderResumen);
  ml.addEventListener("input", renderResumen);

  function showMsg(type, text) {
    const el = $("ventaMsg");
    el.hidden = !text; el.className = "msg " + type; el.textContent = text || "";
  }

  btn.addEventListener("click", async () => {
    showMsg("ok", "");
    const perfumeId = sel.value;
    const cantidadMl = parseInt(ml.value, 10);

    if (!perfumeId) return showMsg("err", "Selecciona un perfume disponible para vender.");
    if (!cantidadMl || cantidadMl <= 0) return showMsg("err", "Ingresa una cantidad válida en ml.");

    btn.disabled = true;
    try {
      const resultado = await runTransaction(db, async (tx) => {
        const ref = doc(db, "inventario", perfumeId);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Ese perfume ya no existe en el inventario.");

        const data = snap.data();
        if (data.ml < cantidadMl) throw new Error(`No hay suficiente perfume. Disponible: ${fmtMl(data.ml)} ml.`);

        tx.update(ref, { ml: data.ml - cantidadMl });
        const total = cantidadMl * data.precioPorMl;
        tx.set(doc(ventasCol), { fecha: serverTimestamp(), perfumeId, nombre: data.nombre, cantidadMl, total });
        return { nombre: data.nombre, total };
      });

      showMsg("ok", `Venta registrada: ${resultado.nombre} — ${fmtCOP(resultado.total)}.`);
      ml.value = "";
      renderResumen();
    } catch (e) {
      showMsg("err", e.message);
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- Historial ----------
function initHistorial() {
  const body = $("ventasBody");
  let ventas = [];

  function render() {
    const q = $("buscarHistorial").value.trim().toLowerCase();
    const d = $("fechaDesde").value ? new Date($("fechaDesde").value + "T00:00:00") : null;
    const h = $("fechaHasta").value ? new Date($("fechaHasta").value + "T23:59:59.999") : null;
    const lista = ventas.filter(v => {
      const f = v.fecha?.toDate ? v.fecha.toDate() : null;
      return (!q || (v.nombre || "").toLowerCase().includes(q)) &&
        (!d || (f && f >= d)) && (!h || (f && f <= h));
    });
    if (lista.length === 0) {
      body.innerHTML = `<tr><td colspan="5" class="empty">${ventas.length ? "No hay movimientos con esos filtros." : "Todavía no hay ventas registradas."}</td></tr>`;
      return;
    }
    body.innerHTML = lista.map(v => `<tr>
      <td>${fmtFecha(v.fecha)}</td>
      <td>${escapeHtml(v.nombre ?? "—")}</td>
      <td><span class="badge inline venta">Venta</span></td>
      <td class="num">${v.cantidadMl != null ? fmtMl(v.cantidadMl) : "—"}</td>
      <td class="num">${fmtCOP(v.total ?? 0)}</td></tr>`).join("");
  }

  onSnapshot(query(ventasCol, orderBy("fecha", "desc")), snap => {
    ventas = snap.docs.map(x => x.data());
    render();
  }, err => console.error(err));

  ["buscarHistorial", "fechaDesde", "fechaHasta"].forEach(id => $(id).addEventListener("input", render));
}
