// Pestaña "Inventario": escucha Firestore en tiempo real, dibuja catálogo y tabla,
// calcula estadísticas y maneja agregar / editar / eliminar perfumes.

import { db } from "./firebase.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { fmtCOP, fmtMl, escapeHtml, costoDe } from "./format.js";
import { setSyncState } from "./ui.js";

export const inventarioCol = collection(db, "inventario");
export const comprasCol = collection(db, "compras");

const LOW_ML = 300;
let inventario = [];
const listeners = [];

export function getInventario() { return inventario; }
export function onInventarioChange(cb) { listeners.push(cb); }
function notifyListeners() { listeners.forEach(cb => cb(inventario)); }

const $ = id => document.getElementById(id);
const estadoDe = p => (p.ml <= 0 ? "agotado" : p.ml < LOW_ML ? "bajo" : "disponible");
const ESTADO_TXT = { disponible: "Disponible", bajo: "Stock bajo", agotado: "Agotado" };
const safeUrl = u => (/^(https?:\/\/|data:image\/)/i.test(u || "") ? u : "");

// Reduce la foto (máx. 600 px, JPEG) para guardarla dentro del documento de Firestore sin costo extra.
function comprimirImagen(file, max = 600, calidad = 0.78) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL("image/jpeg", calidad));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("No se pudo leer la imagen")); };
    img.src = url;
  });
}

const BOTTLE = `<svg class="bottle-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M10 3h4v2.6c1.4.5 2.4 1.8 2.4 3.4v9a3 3 0 0 1-3 3h-2.8a3 3 0 0 1-3-3V9c0-1.6 1-2.9 2.4-3.4V3Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="M9.6 12.5h4.8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;
const ICON_EDIT = `<svg viewBox="0 0 24 24" fill="none"><path d="M4 20h4L19 9l-4-4L4 16v4Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
const ICON_BUY = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const ICON_DEL = `<svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function initInventario() {
  const grid = $("inventoryGrid");
  const tableWrap = $("inventoryTableWrap");
  const tbody = $("inventoryTableBody");
  let modo = "cards";
  let editId = null;
  let deleteId = null;
  let fotoActual = "";

  setSyncState("connecting");
  onSnapshot(query(inventarioCol, orderBy("nombre")), { includeMetadataChanges: true }, snap => {
    inventario = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setSyncState(!snap.metadata.fromCache);
    render();
    notifyListeners();
  }, err => {
    console.error(err);
    setSyncState(false);
  });
  window.addEventListener("offline", () => setSyncState(false));

  // ---------- Dibujo ----------
  function filtrar() {
    const q = $("searchInventario").value.trim().toLowerCase();
    const est = $("filtroDisponibilidad").value;
    const marca = $("filtroMarca").value;
    return inventario.filter(p =>
      (!q || `${p.nombre} ${p.marca || ""}`.toLowerCase().includes(q)) &&
      (est === "todos" || estadoDe(p) === est) &&
      (!marca || (p.marca || "") === marca));
  }

  function renderStats() {
    $("statReferencias").textContent = inventario.length.toLocaleString("es-CO");
    $("statUnidades").textContent = fmtMl(inventario.reduce((s, p) => s + (p.ml || 0), 0)) + " ml";
    $("statValor").textContent = fmtCOP(inventario.reduce((s, p) => s + (p.ml || 0) * (p.precioPorMl || 0), 0));
    $("statBajoStock").textContent = inventario.filter(p => p.ml < LOW_ML).length;
  }

  function renderMarcas() {
    const sel = $("filtroMarca");
    const prev = sel.value;
    const marcas = [...new Set(inventario.map(p => p.marca).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
    sel.innerHTML = `<option value="">Todas las marcas</option>` +
      marcas.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
    sel.value = marcas.includes(prev) ? prev : "";
  }

  const foto = p => safeUrl(p.foto) ? `<img src="${escapeHtml(p.foto)}" alt="${escapeHtml(p.nombre)}" loading="lazy">` : BOTTLE;
  const acciones = p => `<div class="row-actions">
    <button class="icon-btn" data-act="buy" data-id="${p.id}" title="Registrar compra" aria-label="Registrar compra de ${escapeHtml(p.nombre)}">${ICON_BUY}</button>
    <button class="icon-btn" data-act="edit" data-id="${p.id}" aria-label="Editar ${escapeHtml(p.nombre)}">${ICON_EDIT}</button>
    <button class="icon-btn danger" data-act="del" data-id="${p.id}" aria-label="Eliminar ${escapeHtml(p.nombre)}">${ICON_DEL}</button></div>`;

  function render() {
    renderStats();
    renderMarcas();
    const vacio = inventario.length === 0;
    const lista = filtrar();
    $("viewCards").classList.toggle("active", modo === "cards");
    $("viewTable").classList.toggle("active", modo === "table");
    grid.hidden = modo !== "cards";
    tableWrap.hidden = modo !== "table" || vacio;

    if (vacio) {
      tableWrap.hidden = true; grid.hidden = false;
      grid.innerHTML = `<div class="empty-state">${BOTTLE}
        <h3>Tu colección comienza aquí</h3>
        <p>Registra tu primera fragancia para controlar existencias, precios y ventas desde un solo lugar.</p>
        <button class="btn btn-gold" id="emptyAdd">Agregar primer perfume</button></div>`;
      return;
    }
    if (lista.length === 0) {
      const msg = `<div class="empty-state"><p>No hay perfumes que coincidan con la búsqueda.</p></div>`;
      grid.hidden = false; tableWrap.hidden = true; grid.innerHTML = msg;
      return;
    }
    if (modo === "cards") {
      grid.innerHTML = lista.map(p => {
        const e = estadoDe(p);
        return `<article class="card ${e}">
          <div class="ph">${foto(p)}<span class="badge ${e}">${ESTADO_TXT[e]}</span></div>
          <div class="card-body">
            <h3 class="name">${escapeHtml(p.nombre)}</h3>
            <p class="brand-line">${p.marca ? escapeHtml(p.marca) : "&nbsp;"}</p>
            <dl>
              <div><dt>Existencias</dt><dd class="${e !== "disponible" ? "low" : ""}">${fmtMl(p.ml)} ml</dd></div>
              <div><dt>Venta / ml</dt><dd>${fmtCOP(p.precioPorMl)}</dd></div>
              ${costoDe(p) != null ? `<div><dt>Costo / ml</dt><dd>${fmtCOP(costoDe(p))}</dd></div>` : ""}
            </dl>
            ${acciones(p)}
          </div></article>`;
      }).join("");
      grid.querySelectorAll(".ph img").forEach(img =>
        img.addEventListener("error", () => { img.outerHTML = BOTTLE; }, { once: true }));
    } else {
      tbody.innerHTML = lista.map(p => {
        const e = estadoDe(p);
        return `<tr><td><b>${escapeHtml(p.nombre)}</b></td><td>${p.marca ? escapeHtml(p.marca) : "—"}</td>
          <td class="num">${fmtMl(p.ml)} ml</td>
          <td class="num">${costoDe(p) != null ? fmtCOP(costoDe(p)) : "—"}</td>
          <td class="num">${fmtCOP(p.precioPorMl)}</td>
          <td><span class="badge inline ${e}">${ESTADO_TXT[e]}</span></td><td>${acciones(p)}</td></tr>`;
      }).join("");
      grid.hidden = true;
    }
  }

  ["searchInventario", "filtroDisponibilidad", "filtroMarca"].forEach(id => {
    $(id).addEventListener(id === "searchInventario" ? "input" : "change", render);
  });
  $("viewCards").addEventListener("click", () => { modo = "cards"; render(); });
  $("viewTable").addEventListener("click", () => { modo = "table"; render(); });

  // Acciones de editar / eliminar / agregar primer perfume (delegación)
  document.addEventListener("click", ev => {
    const b = ev.target.closest("[data-act], #emptyAdd");
    if (!b) return;
    if (b.id === "emptyAdd") return abrirModal();
    const p = inventario.find(x => x.id === b.dataset.id);
    if (!p) return;
    if (b.dataset.act === "edit") abrirModal(p);
    if (b.dataset.act === "del") abrirConfirm(p);
    if (b.dataset.act === "buy") document.dispatchEvent(new CustomEvent("comprar", { detail: p }));
  });

  // ---------- Modal agregar / editar ----------
  const campos = ["fNombre", "fMarca", "fLitros", "fPrecioVenta", "fPrecioCompra", "fFoto"];
  const msgEl = (id, type, text) => { const el = $(id); el.hidden = !text; el.className = "msg " + type; el.textContent = text || ""; };

  function abrirModal(p = null) {
    editId = p ? p.id : null;
    $("modalTitle").textContent = p ? "Editar perfume" : "Nuevo perfume";
    $("fNombre").value = p ? p.nombre : "";
    $("fMarca").value = p?.marca || "";
    $("fLitros").value = p ? p.ml : "";
    $("fPrecioVenta").value = p ? p.precioPorMl : "";
    $("fPrecioCompra").value = p && costoDe(p) != null ? Math.round(costoDe(p) * 100) / 100 : "";
    $("lblCosto").textContent = p ? "Costo por ml (opcional)" : "Total pagado por esos ml (opcional)";
    $("fFoto").value = "";
    fotoActual = p?.foto || "";
    pintarFoto(); pintarResumenStock();
    msgEl("modalMsg", "err", "");
    $("modalBackdrop").hidden = false;
    $("fNombre").focus();
  }
  function cerrarModal() { $("modalBackdrop").hidden = true; campos.forEach(id => ($(id).value = "")); editId = null; fotoActual = ""; pintarFoto(); pintarResumenStock(); }
  function pintarFoto() { const prev = $("fFotoPrev"); prev.hidden = !fotoActual; prev.querySelector("img").src = fotoActual; }
  function pintarResumenStock() {
    const m = parseFloat($("fLitros").value), v = parseFloat($("fPrecioVenta").value);
    $("fResumenStock").textContent = (m > 0 && v > 0) ? `Con ${fmtMl(m)} ml a ${fmtCOP(v)} por ml, este stock vale ${fmtCOP(m * v)} si se vende completo.` : "";
  }
  $("fLitros").addEventListener("input", pintarResumenStock);
  $("fPrecioVenta").addEventListener("input", pintarResumenStock);
  $("fFotoQuitar").addEventListener("click", () => { fotoActual = ""; $("fFoto").value = ""; pintarFoto(); });
  $("fFoto").addEventListener("change", async () => {
    const f = $("fFoto").files[0];
    if (!f) return;
    try { fotoActual = await comprimirImagen(f); pintarFoto(); msgEl("modalMsg", "err", ""); }
    catch (e) { msgEl("modalMsg", "err", "No se pudo cargar la imagen. Prueba con otra (JPG o PNG)."); }
  });

  $("openAddPerfume").addEventListener("click", () => abrirModal());
  $("modalCancel").addEventListener("click", cerrarModal);
  $("modalBackdrop").addEventListener("mousedown", e => { if (e.target.id === "modalBackdrop") cerrarModal(); });

  $("modalSave").addEventListener("click", async () => {
    const nombre = $("fNombre").value.trim();
    const mlIn = parseFloat($("fLitros").value);
    const precio = parseFloat($("fPrecioVenta").value);
    const compraRaw = $("fPrecioCompra").value.trim();
    const compra = compraRaw === "" ? null : parseFloat(compraRaw);
    const url = fotoActual;

    if (!nombre || isNaN(mlIn) || mlIn < 0 || isNaN(precio) || precio < 0) {
      return msgEl("modalMsg", "err", "Completa nombre, mililitros y precio de venta con valores válidos.");
    }
    if (compra !== null && (isNaN(compra) || compra < 0)) return msgEl("modalMsg", "err", "El precio de compra no es válido.");

    const data = {
      nombre, marca: $("fMarca").value.trim(), ml: Math.round(mlIn),
      precioPorMl: Math.round(precio), foto: url,
      costoPromedioPorMl: compra === null ? null : editId ? compra : (mlIn > 0 ? compra / mlIn : null)
    };
    $("modalSave").disabled = true;
    try {
      if (editId) await updateDoc(doc(db, "inventario", editId), data);
      else {
        const ref = await addDoc(inventarioCol, { ...data, creadoEn: serverTimestamp() });
        if (compra > 0 && mlIn > 0) {
          await addDoc(comprasCol, { fecha: serverTimestamp(), perfumeId: ref.id, nombre, cantidadMl: Math.round(mlIn), totalPagado: Math.round(compra) });
        }
      }
      cerrarModal();
    } catch (e) {
      msgEl("modalMsg", "err", "No se pudo guardar: " + e.message);
    } finally {
      $("modalSave").disabled = false;
    }
  });

  // ---------- Confirmar eliminación ----------
  function abrirConfirm(p) {
    deleteId = p.id;
    $("confirmText").textContent = `Se eliminará «${p.nombre}» del inventario compartido. Las ventas ya registradas se conservan en el historial.`;
    msgEl("confirmMsg", "err", "");
    $("confirmBackdrop").hidden = false;
  }
  const cerrarConfirm = () => { $("confirmBackdrop").hidden = true; deleteId = null; };
  $("confirmCancel").addEventListener("click", cerrarConfirm);
  $("confirmBackdrop").addEventListener("mousedown", e => { if (e.target.id === "confirmBackdrop") cerrarConfirm(); });
  $("confirmDelete").addEventListener("click", async () => {
    $("confirmDelete").disabled = true;
    try { await deleteDoc(doc(db, "inventario", deleteId)); cerrarConfirm(); }
    catch (e) { msgEl("confirmMsg", "err", "No se pudo eliminar: " + e.message); }
    finally { $("confirmDelete").disabled = false; }
  });

  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (!$("modalBackdrop").hidden) cerrarModal();
    if (!$("confirmBackdrop").hidden) cerrarConfirm();
  });
}
