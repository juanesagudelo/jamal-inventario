// Editar y eliminar movimientos del historial (ventas y compras), ajustando el stock del perfume.
import { db } from "./firebase.js";
import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { fmtCOP, fmtMl, costoDe, moneyInput, parseMoney, fmtMoneyInput, escapeHtml } from "./format.js";
import { getInventario } from "./inventario.js";
import { getMovimientos } from "./ventas.js";

const $ = id => document.getElementById(id);

// ---------- Ventas ----------
async function editarVenta(v, nuevoId, ml, total) {
  await runTransaction(db, async tx => {
    const vRef = doc(db, "ventas", v.id);
    const oldRef = doc(db, "inventario", v.perfumeId);
    const mismo = nuevoId === v.perfumeId;
    const newRef = mismo ? oldRef : doc(db, "inventario", nuevoId);
    const vSnap = await tx.get(vRef);
    if (!vSnap.exists()) throw new Error("Esa venta ya no existe.");
    const oldSnap = await tx.get(oldRef);
    const newSnap = mismo ? oldSnap : await tx.get(newRef);
    const orig = vSnap.data();
    if (!newSnap.exists()) {
      if (!mismo) throw new Error("Ese perfume ya no existe en el inventario.");
      tx.update(vRef, { cantidadMl: ml, total });   // perfume eliminado: solo se corrige el registro
      return;
    }
    if (mismo) {
      const disponible = newSnap.data().ml + orig.cantidadMl;
      if (disponible < ml) throw new Error(`No hay suficiente perfume. Disponible: ${fmtMl(disponible)} ml.`);
      tx.update(newRef, { ml: disponible - ml });
    } else {
      if (newSnap.data().ml < ml) throw new Error(`No hay suficiente perfume. Disponible: ${fmtMl(newSnap.data().ml)} ml.`);
      if (oldSnap.exists()) tx.update(oldRef, { ml: oldSnap.data().ml + orig.cantidadMl });
      tx.update(newRef, { ml: newSnap.data().ml - ml });
    }
    tx.update(vRef, {
      perfumeId: nuevoId, nombre: newSnap.data().nombre, cantidadMl: ml, total,
      costoPorMl: mismo ? (orig.costoPorMl ?? null) : costoDe(newSnap.data())
    });
  });
}

async function eliminarVenta(v) {
  await runTransaction(db, async tx => {
    const vRef = doc(db, "ventas", v.id);
    const vSnap = await tx.get(vRef);
    if (!vSnap.exists()) throw new Error("Esa venta ya no existe.");
    const pRef = doc(db, "inventario", vSnap.data().perfumeId);
    const pSnap = await tx.get(pRef);
    if (pSnap.exists()) tx.update(pRef, { ml: pSnap.data().ml + vSnap.data().cantidadMl });  // los ml vuelven al stock
    tx.delete(vRef);
  });
}

// ---------- Compras (entradas) ----------
// Deshace el efecto de una compra sobre un perfume: resta los ml y recalcula el costo promedio.
function quitarCompra(d, m, total) {
  const s0 = d.ml - m;
  if (s0 < 0) throw new Error("No se puede: ya vendiste parte de esos ml y el stock no alcanza para quitar esta compra.");
  const prev = costoDe(d);
  const valor = prev != null ? Math.max(0, d.ml * prev - total) : null;
  return { ml: s0, costoPromedioPorMl: (s0 > 0 && valor != null) ? valor / s0 : null };
}
// Aplica una compra: suma los ml y mezcla el costo (igual que al registrar una compra).
function ponerCompra(d, m, total) {
  const prev = costoDe(d);
  return { ml: d.ml + m, costoPromedioPorMl: (prev != null && d.ml > 0) ? (d.ml * prev + total) / (d.ml + m) : total / m };
}

async function editarCompra(c, nuevoId, ml, total) {
  await runTransaction(db, async tx => {
    const cRef = doc(db, "compras", c.id);
    const oldRef = doc(db, "inventario", c.perfumeId);
    const mismo = nuevoId === c.perfumeId;
    const newRef = mismo ? oldRef : doc(db, "inventario", nuevoId);
    const cSnap = await tx.get(cRef);
    if (!cSnap.exists()) throw new Error("Esa compra ya no existe.");
    const oldSnap = await tx.get(oldRef);
    const newSnap = mismo ? oldSnap : await tx.get(newRef);
    const orig = cSnap.data();
    if (!newSnap.exists()) {
      if (!mismo) throw new Error("Ese perfume ya no existe en el inventario.");
      tx.update(cRef, { cantidadMl: ml, totalPagado: total });
      return;
    }
    if (mismo) {
      const q = quitarCompra(oldSnap.data(), orig.cantidadMl, orig.totalPagado || 0);
      tx.update(oldRef, ponerCompra({ ...oldSnap.data(), ...q }, ml, total));
    } else {
      if (oldSnap.exists()) tx.update(oldRef, quitarCompra(oldSnap.data(), orig.cantidadMl, orig.totalPagado || 0));
      tx.update(newRef, ponerCompra(newSnap.data(), ml, total));
    }
    tx.update(cRef, { perfumeId: nuevoId, nombre: newSnap.data().nombre, cantidadMl: ml, totalPagado: total });
  });
}

async function eliminarCompra(c) {
  await runTransaction(db, async tx => {
    const cRef = doc(db, "compras", c.id);
    const cSnap = await tx.get(cRef);
    if (!cSnap.exists()) throw new Error("Esa compra ya no existe.");
    const pRef = doc(db, "inventario", cSnap.data().perfumeId);
    const pSnap = await tx.get(pRef);
    if (pSnap.exists()) tx.update(pRef, quitarCompra(pSnap.data(), cSnap.data().cantidadMl, cSnap.data().totalPagado || 0));
    tx.delete(cRef);   // no queda rastro de la compra
  });
}

// ---------- Interfaz ----------
export function initMovimientos() {
  let actual = null; // { tipo: "venta" | "entrada", mov }
  moneyInput($("mTotal"));
  const msg = (id, type, text) => { const el = $(id); el.hidden = !text; el.className = "msg " + type; el.textContent = text || ""; };
  const cerrarEditar = () => { $("movBackdrop").hidden = true; actual = null; };
  const cerrarEliminar = () => { $("movDelBackdrop").hidden = true; actual = null; };

  function abrirEditar(tipo, mov) {
    actual = { tipo, mov };
    const esVenta = tipo === "venta";
    $("movTitle").textContent = esVenta ? "Editar venta" : "Editar compra";
    $("mTotalLbl").textContent = esVenta ? "Precio cobrado (COP)" : "Total pagado (COP)";
    const inv = [...getInventario()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    let opts = inv.map(p => `<option value="${p.id}">${escapeHtml(p.nombre)}${p.marca ? " · " + escapeHtml(p.marca) : ""}</option>`).join("");
    if (!inv.some(p => p.id === mov.perfumeId)) opts = `<option value="${mov.perfumeId}">${escapeHtml(mov.nombre || "—")} (eliminado)</option>` + opts;
    $("mPerfume").innerHTML = opts;
    $("mPerfume").value = mov.perfumeId;
    $("mMl").value = mov.cantidadMl;
    $("mTotal").value = fmtMoneyInput(esVenta ? mov.total : mov.totalPagado);
    msg("movMsg", "err", "");
    $("movBackdrop").hidden = false;
    $("mMl").focus();
  }

  function abrirEliminar(tipo, mov) {
    actual = { tipo, mov };
    const esVenta = tipo === "venta";
    $("movDelTitle").textContent = esVenta ? "Eliminar venta" : "Eliminar compra";
    $("movDelText").textContent = esVenta
      ? `Se eliminará la venta de ${mov.nombre} (${fmtMl(mov.cantidadMl)} ml, ${fmtCOP(mov.total)}). Los ml vuelven al stock del perfume y la venta deja de contar en las ganancias.`
      : `Se eliminará la compra de ${mov.nombre} (${fmtMl(mov.cantidadMl)} ml, ${fmtCOP(mov.totalPagado)}). Los ml se restan del stock, el costo se recalcula y no queda ningún registro de ella.`;
    msg("movDelMsg", "err", "");
    $("movDelBackdrop").hidden = false;
  }

  $("ventasBody").addEventListener("click", e => {
    const b = e.target.closest("[data-act]");
    if (!b || !b.dataset.tipo) return;
    const { ventas, compras } = getMovimientos();
    const mov = (b.dataset.tipo === "venta" ? ventas : compras).find(x => x.id === b.dataset.id);
    if (!mov) return;
    if (b.dataset.act === "edit") abrirEditar(b.dataset.tipo, mov);
    else abrirEliminar(b.dataset.tipo, mov);
  });

  $("movCancel").addEventListener("click", cerrarEditar);
  $("movDelCancel").addEventListener("click", cerrarEliminar);
  $("movBackdrop").addEventListener("mousedown", e => { if (e.target.id === "movBackdrop") cerrarEditar(); });
  $("movDelBackdrop").addEventListener("mousedown", e => { if (e.target.id === "movDelBackdrop") cerrarEliminar(); });
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (!$("movBackdrop").hidden) cerrarEditar();
    if (!$("movDelBackdrop").hidden) cerrarEliminar();
  });

  $("movSave").addEventListener("click", async () => {
    const ml = parseInt($("mMl").value, 10), total = parseMoney($("mTotal").value);
    if (!actual) return;
    if (!(ml > 0)) return msg("movMsg", "err", "Ingresa una cantidad válida en ml.");
    if (isNaN(total) || total < 0) return msg("movMsg", "err", "Ingresa el valor en pesos.");
    $("movSave").disabled = true;
    try {
      const f = actual.tipo === "venta" ? editarVenta : editarCompra;
      await f(actual.mov, $("mPerfume").value, ml, total);
      cerrarEditar();
    } catch (e) {
      msg("movMsg", "err", e.message);
    } finally {
      $("movSave").disabled = false;
    }
  });

  $("movDelOk").addEventListener("click", async () => {
    if (!actual) return;
    $("movDelOk").disabled = true;
    try {
      await (actual.tipo === "venta" ? eliminarVenta : eliminarCompra)(actual.mov);
      cerrarEliminar();
    } catch (e) {
      msg("movDelMsg", "err", e.message);
    } finally {
      $("movDelOk").disabled = false;
    }
  });
}
