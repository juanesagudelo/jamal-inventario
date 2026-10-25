// Conexión a Firebase — un solo punto de verdad para toda la app.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAllq1M0q6tuTHoofcYkLez2oDRv3-2ERg",
  authDomain: "jamal-inventario.firebaseapp.com",
  projectId: "jamal-inventario",
  storageBucket: "jamal-inventario.firebasestorage.app",
  messagingSenderId: "782695185244",
  appId: "1:782695185244:web:cce6dc80cf1404772c1f99"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
