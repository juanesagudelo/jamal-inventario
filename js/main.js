// Punto de entrada: arranca cada módulo en orden.
import { initTabs } from "./ui.js";
import { initInventario } from "./inventario.js";
import { initVentas } from "./ventas.js";

initTabs();
initInventario();
initVentas();
