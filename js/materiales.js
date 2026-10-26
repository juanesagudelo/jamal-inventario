// Filas de materiales (nombre a la izquierda, precio a la derecha) reutilizables en los formularios.
import { moneyInput, parseMoney, fmtMoneyInput } from "./format.js";

const ICON_X = `<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

export function agregarMaterial(cont, m = {}) {
  const row = document.createElement("div");
  row.className = "mat-row";
  row.innerHTML = `<input class="mat-nombre" type="text" maxlength="60" placeholder="Material (ej. Esencia)">
    <input class="mat-precio" type="text" inputmode="numeric" autocomplete="off" placeholder="Precio $">
    <button type="button" class="icon-btn mat-del" aria-label="Quitar material">${ICON_X}</button>`;
  row.querySelector(".mat-nombre").value = m.nombre || "";
  const pr = row.querySelector(".mat-precio");
  pr.value = m.precio ? fmtMoneyInput(m.precio) : "";
  moneyInput(pr);
  cont.appendChild(row);
}

export function poblarMateriales(cont, lista) {
  cont.innerHTML = "";
  (lista?.length ? lista : [{}]).forEach(m => agregarMaterial(cont, m));
}

export const leerFilas = cont => [...cont.querySelectorAll(".mat-row")].map(r => ({
  nombre: r.querySelector(".mat-nombre").value.trim(),
  precio: parseMoney(r.querySelector(".mat-precio").value)
}));

// Conecta el botón de agregar, el de quitar y avisa con onChange cuando algo cambia.
export function initMateriales(cont, addBtn, onChange) {
  cont.addEventListener("input", onChange);
  cont.addEventListener("click", e => {
    const b = e.target.closest(".mat-del");
    if (!b) return;
    b.closest(".mat-row").remove();
    if (!cont.children.length) agregarMaterial(cont);
    onChange();
  });
  addBtn.addEventListener("click", () => {
    agregarMaterial(cont);
    cont.lastElementChild.querySelector(".mat-nombre").focus();
  });
}
