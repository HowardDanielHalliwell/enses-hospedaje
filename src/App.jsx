import { useState, useEffect, useMemo } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase, supabaseConCodigo } from "./supabase";

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const ADMIN_CODIGO  = "ADMIN2025";
const NAV_ID_KEY    = "enses_nav_id";
const BLOQUEO_KEY   = "enses_bloqueo";
const MAX_INTENTOS  = 5;
const BLOQUEO_MS    = 15 * 60 * 1000;

const CAMPOS_HEADER = ["Vicaria", "Decanato", "Parroquia", "Sacerdote", "Lugar (municipio/localidad)", "Enlace parroquial", "Teléfono"];

// ─── RATE LIMITING ────────────────────────────────────────────────────────────
function getNavegadorId() {
  let id = localStorage.getItem(NAV_ID_KEY);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(NAV_ID_KEY, id); }
  return id;
}
function getBloqueoLocal() {
  try { return JSON.parse(localStorage.getItem(BLOQUEO_KEY) || "null"); } catch { return null; }
}

// ─── DATA FUNCTIONS ───────────────────────────────────────────────────────────
const fila_vacia = () => ({ nombre: "", telefono: "", direccion: "", cantidad: "", h: "", m: "", mt: "", agregado_por: "" });

// db: cliente de Supabase con header x-parroquia-codigo ya configurado
async function cargarDatos(db) {
  const [{ data: parroquias }, { data: personas }] = await Promise.all([
    db.from("parroquias").select("*"),
    db.from("personas").select("*").order("posicion"),
  ]);

  const datos = {};
  for (const p of parroquias || []) {
    const filasP = (personas || [])
      .filter(per => per.parroquia_codigo === p.codigo)
      .map(per => ({
        nombre:      per.nombre    || "",
        telefono:    per.telefono  || "",
        direccion:   per.direccion || "",
        cantidad:    per.cantidad  != null ? String(per.cantidad) : "",
        h:           per.h         != null ? String(per.h)        : "",
        m:           per.m         != null ? String(per.m)        : "",
        mt:          per.mt        != null ? String(per.mt)       : "",
        agregado_por: per.agregado_por || "",
      }));

    datos[p.codigo] = {
      header: {
        "Vicaria":                     p.vicaria           || "",
        "Decanato":                    p.decanato          || "",
        "Parroquia":                   p.nombre            || "",
        "Sacerdote":                   p.sacerdote         || "",
        "Lugar (municipio/localidad)": p.lugar             || "",
        "Enlace parroquial":           p.enlace_parroquial || "",
        "Teléfono":                    p.telefono_contacto || "",
      },
      filas: filasP.length > 0 ? filasP : Array(20).fill(null).map(fila_vacia),
    };
  }
  return { datos, parroquias: parroquias || [] };
}

async function guardarDatos(db, codigo, filas, header) {
  await db.from("parroquias").update({
    sacerdote:         header["Sacerdote"]                   || "",
    lugar:             header["Lugar (municipio/localidad)"] || "",
    enlace_parroquial: header["Enlace parroquial"]           || "",
    telefono_contacto: header["Teléfono"]                    || "",
  }).eq("codigo", codigo);

  await db.from("personas").delete().eq("parroquia_codigo", codigo);

  const rows = filas
    .map((f, i) => ({ ...f, parroquia_codigo: codigo, posicion: i }))
    .filter(f => f.nombre)
    .map(f => ({
      parroquia_codigo: f.parroquia_codigo,
      posicion:         f.posicion,
      nombre:           f.nombre,
      telefono:         f.telefono  || null,
      direccion:        f.direccion || null,
      cantidad:         f.cantidad !== "" ? parseInt(f.cantidad) : null,
      h:                f.h        !== "" ? parseInt(f.h)        : null,
      m:                f.m        !== "" ? parseInt(f.m)        : null,
      mt:               f.mt       !== "" ? parseInt(f.mt)       : null,
    }));

  if (rows.length > 0) await db.from("personas").insert(rows);
}

async function agregarPersonasCoordinador(db, parroquiaCodigo, filas, codigoCord) {
  const rows = filas
    .filter(f => f.nombre.trim())
    .map((f, i) => ({
      parroquia_codigo: parroquiaCodigo,
      posicion:         Date.now() + i,
      nombre:           f.nombre.trim(),
      telefono:         f.telefono  || null,
      direccion:        f.direccion || null,
      cantidad:         f.cantidad !== "" ? parseInt(f.cantidad) : null,
      h:                f.h        !== "" ? parseInt(f.h)        : null,
      m:                f.m        !== "" ? parseInt(f.m)        : null,
      mt:               f.mt       !== "" ? parseInt(f.mt)       : null,
      agregado_por:     codigoCord,
    }));
  if (rows.length > 0) await db.from("personas").insert(rows);
}

// ─── PDF HELPERS ──────────────────────────────────────────────────────────────
async function imgToBase64(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

function pdfAddLogosYTitulo(doc, logoRCCES, logoDioc, titulo, subtitulo) {
  const W = doc.internal.pageSize.getWidth();
  if (logoRCCES) doc.addImage(logoRCCES, "PNG", 10, 7, 20, 20);
  if (logoDioc)  doc.addImage(logoDioc,  "PNG", W - 30, 7, 20, 20);
  doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(26, 58, 107);
  doc.text(titulo, W / 2, 14, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(100);
  doc.text(subtitulo, W / 2, 20, { align: "center" });
  doc.setDrawColor(26, 58, 107); doc.setLineWidth(0.4); doc.line(10, 30, W - 10, 30);
}

function pdfAddNumeroPaginas(doc) {
  const total = doc.internal.getNumberOfPages();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i); doc.setFontSize(7); doc.setTextColor(160);
    doc.text(`Página ${i} de ${total}  ·  ENSES 2026  ·  Diócesis Valle de Chalco`, W / 2, H - 6, { align: "center" });
  }
}

async function exportarPDFParroquia(parroquia, header, filas) {
  const [logoRCCES, logoDioc] = await Promise.all([
    imgToBase64("/Valle de Chalco RCCES.png"),
    imgToBase64("/Diocesis Valle de Chalco.png"),
  ]);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  pdfAddLogosYTitulo(doc, logoRCCES, logoDioc, "ENSES 2026 — Control de Hospedaje", "Diócesis Valle de Chalco");
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(26, 58, 107);
  doc.text(parroquia.nombre, 10, 37);

  const infoFields = [
    ["Vicaria",   header["Vicaria"]],
    ["Decanato",  header["Decanato"]],
    ["Sacerdote", header["Sacerdote"]],
    ["Lugar",     header["Lugar (municipio/localidad)"]],
    ["Enlace",    header["Enlace parroquial"]],
    ["Teléfono",  header["Teléfono"]],
  ].filter(([, v]) => v);

  doc.setFontSize(8);
  let infoY = 43;
  infoFields.forEach(([label, value], idx) => {
    const col = idx % 2; const row = Math.floor(idx / 2); const x = col === 0 ? 10 : W / 2;
    doc.setFont("helvetica", "bold"); doc.setTextColor(80); doc.text(label + ":", x, infoY + row * 5.5);
    doc.setFont("helvetica", "normal"); doc.setTextColor(40);
    doc.text(doc.splitTextToSize(value || "", W / 2 - 15)[0], x + 20, infoY + row * 5.5);
  });

  const tableStartY = infoY + Math.ceil(infoFields.length / 2) * 5.5 + 5;
  const filasConDatos = filas.filter(f => f.nombre);
  const totP = filas.reduce((s, f) => s + (parseInt(f.cantidad) || 0), 0);
  const totH = filas.reduce((s, f) => s + (parseInt(f.h)        || 0), 0);
  const totM = filas.reduce((s, f) => s + (parseInt(f.m)        || 0), 0);
  const totMT= filas.reduce((s, f) => s + (parseInt(f.mt)       || 0), 0);

  autoTable(doc, {
    startY: tableStartY,
    head: [["#", "Nombre", "Teléfono", "Dirección", "Cant.", "H", "M", "MT"]],
    body: [
      ...filasConDatos.map((f, i) => [i+1, f.nombre, f.telefono||"", f.direccion||"", f.cantidad||"", f.h||"", f.m||"", f.mt||""]),
      ["", "TOTAL", "", "", totP||"", totH||"", totM||"", totMT||""],
    ],
    styles: { fontSize: 7.5, cellPadding: 1.8 },
    headStyles: { fillColor: [26, 58, 107], textColor: 255, fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: [240, 244, 255] },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" }, 1: { cellWidth: 52 }, 2: { cellWidth: 28 },
      3: { cellWidth: 52 }, 4: { cellWidth: 12, halign: "center" },
      5: { cellWidth: 8, halign: "center" }, 6: { cellWidth: 8, halign: "center" }, 7: { cellWidth: 8, halign: "center" },
    },
    didParseCell(data) {
      if (data.row.index === filasConDatos.length) {
        data.cell.styles.fillColor = [26, 58, 107]; data.cell.styles.textColor = 255; data.cell.styles.fontStyle = "bold";
      }
    },
  });
  pdfAddNumeroPaginas(doc);
  doc.save(`ENSES_${parroquia.nombre.replace(/\s+/g, "_")}.pdf`);
}

async function exportarPDFGlobal(parroquias, datos) {
  const [logoRCCES, logoDioc] = await Promise.all([
    imgToBase64("/Valle de Chalco RCCES.png"),
    imgToBase64("/Diocesis Valle de Chalco.png"),
  ]);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  pdfAddLogosYTitulo(doc, logoRCCES, logoDioc, "ENSES 2026 — Resumen General de Hospedaje", "Diócesis Valle de Chalco · Panel Administrador");

  const rows = parroquias.map(p => {
    const filas = datos[p.codigo]?.filas || [];
    const reg = filas.reduce((s, f) => s + (parseInt(f.cantidad) || 0), 0);
    const cupo = p.cupo_maximo || 0;
    return [p.nombre, p.decanato||"—", p.vicaria||"—", reg, cupo, cupo-reg, cupo>0?`${Math.round((reg/cupo)*100)}%`:"—"];
  });
  const totReg  = parroquias.reduce((a,p) => a + (datos[p.codigo]?.filas||[]).reduce((s,f)=>s+(parseInt(f.cantidad)||0),0), 0);
  const totCupo = parroquias.reduce((a,p) => a + (p.cupo_maximo||0), 0);

  autoTable(doc, {
    startY: 34,
    head: [["Parroquia","Decanato","Vicaría","Registrados","Cupo","Disponibles","Llenado"]],
    body: [...rows, ["TOTAL GENERAL","","",totReg,totCupo,totCupo-totReg,""]],
    styles: { fontSize: 7.5, cellPadding: 1.8 },
    headStyles: { fillColor: [26, 58, 107], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [240, 244, 255] },
    columnStyles: {
      0:{cellWidth:65},1:{cellWidth:28},2:{cellWidth:28},
      3:{cellWidth:18,halign:"center"},4:{cellWidth:15,halign:"center"},
      5:{cellWidth:18,halign:"center"},6:{cellWidth:14,halign:"center"},
    },
    didParseCell(data) {
      if (data.row.index === rows.length) {
        data.cell.styles.fillColor = [26, 58, 107]; data.cell.styles.textColor = 255; data.cell.styles.fontStyle = "bold";
      }
    },
  });
  pdfAddNumeroPaginas(doc);
  doc.save("ENSES_Hospedaje_General.pdf");
}

// ─── HOOK RESPONSIVIDAD ───────────────────────────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

// ─── ICONOS SVG ──────────────────────────────────────────────────────────────
const IconLogout   = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
const IconDownload = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
const IconSave     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>;
const IconAdd      = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>;
const IconTrash    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>;
const IconPlus     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const IconPDF      = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
const IconEye      = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
const IconShield   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
const IconDatabase = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>;
const IconUpload   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
const IconUsers    = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;

// ─── LOGOS ────────────────────────────────────────────────────────────────────
const LogoRCCES    = ({ size = 64 }) => <img src="/Valle de Chalco RCCES.png"    width={size} height={size} style={{ borderRadius:"50%", flexShrink:0 }} alt="RCCES" />;
const LogoDiocesis = ({ size = 64 }) => <img src="/Diocesis Valle de Chalco.png" width={size} height={size} style={{ borderRadius:"50%", flexShrink:0 }} alt="Diócesis" />;

// ─── PANTALLA LOGIN ───────────────────────────────────────────────────────────
function PantallaLogin({ onLogin }) {
  const [codigo, setCodigo]   = useState("");
  const [error, setError]     = useState("");
  const [cargando, setCargando] = useState(false);

  const navId = useMemo(() => getNavegadorId(), []);
  const [bloqueoLocal, setBloqueoLocalState] = useState(() => getBloqueoLocal());
  const [tiempoRestante, setTiempoRestante]  = useState(0);

  // Cuenta regresiva + chequeo periódico de desbloqueo por admin
  useEffect(() => {
    if (!bloqueoLocal?.bloqueadoHasta) return;
    let lastCheck = 0;

    const tick = async () => {
      const remaining = new Date(bloqueoLocal.bloqueadoHasta) - Date.now();
      if (remaining <= 0) {
        localStorage.removeItem(BLOQUEO_KEY);
        setBloqueoLocalState(null);
        return;
      }
      setTiempoRestante(Math.ceil(remaining / 1000));

      // Cada 30s consulta Supabase para ver si admin desbloqueó
      if (Date.now() - lastCheck > 30000) {
        lastCheck = Date.now();
        const { data } = await supabase.from("bloqueos").select("desbloqueado_por").eq("navegador_id", navId).maybeSingle();
        if (data?.desbloqueado_por) {
          localStorage.removeItem(BLOQUEO_KEY);
          setBloqueoLocalState(null);
        }
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [bloqueoLocal?.bloqueadoHasta, navId]);

  const registrarIntentoFallido = async () => {
    const anterior = getBloqueoLocal();
    const intentos = (anterior?.intentos || 0) + 1;
    const bloqueadoHasta = intentos >= MAX_INTENTOS ? new Date(Date.now() + BLOQUEO_MS).toISOString() : null;
    const nuevo = { intentos, bloqueadoHasta };
    localStorage.setItem(BLOQUEO_KEY, JSON.stringify(nuevo));
    setBloqueoLocalState(nuevo);
    if (bloqueadoHasta) setTiempoRestante(Math.ceil(BLOQUEO_MS / 1000));
    const payload = {
      navegador_id: navId,
      intentos,
      bloqueado_hasta: bloqueadoHasta,
      ...(bloqueadoHasta ? { desbloqueado_por: null } : {}),
    };
    if (bloqueadoHasta) {
      await supabase.from("bloqueos")
        .upsert(payload, { onConflict: "navegador_id" })
        .catch(() => {});
    } else {
      supabase.from("bloqueos")
        .upsert(payload, { onConflict: "navegador_id" })
        .catch(() => {});
    }
    return intentos >= MAX_INTENTOS;
  };

  const handleLogin = async () => {
    const code = codigo.trim().toUpperCase();
    if (!code || bloqueoLocal?.bloqueadoHasta) return;
    setError(""); setCargando(true);

    try {
      // Coordinador: COORD-XXXX — validar contra tabla coordinadores en Supabase
      if (code.startsWith("COORD-")) {
        const { data: coord } = await supabase.from("coordinadores").select("*").eq("codigo", code).maybeSingle();
        if (coord) {
          localStorage.removeItem(BLOQUEO_KEY); setBloqueoLocalState(null);
          onLogin({ codigo: coord.codigo, codigoReal: coord.codigo, codigoHeader: coord.codigo, nombre: coord.nombre || `Coordinador ${code.slice(6)}`, esAdmin: false, esCoordinador: true, soloLectura: false, cupo_maximo: 0 });
        } else {
          await registrarIntentoFallido();
          setError("Código de coordinador no válido. Verifica con el administrador.");
        }
        return;
      }

      // Acceso de solo lectura: VER-XXXX
      const esVistaLectura = code.startsWith("VER-");
      const codigoReal = esVistaLectura ? code.slice(4) : code;

      if (codigoReal === ADMIN_CODIGO) {
        localStorage.removeItem(BLOQUEO_KEY); setBloqueoLocalState(null);
        onLogin({ codigo: ADMIN_CODIGO, codigoReal: ADMIN_CODIGO, codigoHeader: ADMIN_CODIGO, nombre: "ADMINISTRADOR GENERAL", esAdmin: true, soloLectura: false, cupo_maximo: 9999 });
        return;
      }

      const { data } = await supabase.from("parroquias").select("*").eq("codigo", codigoReal).maybeSingle();
      if (data) {
        localStorage.removeItem(BLOQUEO_KEY); setBloqueoLocalState(null);
        onLogin({ ...data, codigoReal, codigoHeader: codigoReal, esAdmin: false, soloLectura: esVistaLectura });
      } else {
        await registrarIntentoFallido();
        const restantes = Math.max(0, MAX_INTENTOS - ((getBloqueoLocal()?.intentos) || 0));
        setError(
          esVistaLectura
            ? `No existe la parroquia "${codigoReal}".`
            : restantes > 0
              ? `Código incorrecto. ${restantes} intento${restantes > 1 ? "s" : ""} restante${restantes > 1 ? "s" : ""}.`
              : "Demasiados intentos. Acceso bloqueado por 15 minutos."
        );
      }
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setCargando(false);
    }
  };

  // ── UI bloqueado ─────────────────────────────────────────────────────────
  if (bloqueoLocal?.bloqueadoHasta && tiempoRestante > 0) {
    const mins = Math.floor(tiempoRestante / 60);
    const secs = tiempoRestante % 60;
    return (
      <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#0d2347 0%,#1A3A6B 50%,#2a5298 100%)", display:"flex", alignItems:"center", justifyContent:"center", padding:20, fontFamily:"Inter, sans-serif" }}>
        <div style={{ background:"white", borderRadius:16, padding:"40px 28px", width:"100%", maxWidth:380, boxShadow:"0 25px 60px rgba(0,0,0,0.4)", textAlign:"center" }}>
          <div style={{ fontSize:56, marginBottom:8 }}>🔒</div>
          <h3 style={{ color:"#cc0000", margin:"0 0 8px", fontFamily:"Georgia, serif" }}>Acceso bloqueado</h3>
          <p style={{ color:"#666", fontSize:13, margin:"0 0 24px" }}>
            Se alcanzó el límite de {MAX_INTENTOS} intentos fallidos.
          </p>
          <div style={{ fontSize:52, fontWeight:800, fontFamily:"monospace", color:"#cc0000", letterSpacing:4, lineHeight:1 }}>
            {String(mins).padStart(2,"0")}:{String(secs).padStart(2,"0")}
          </div>
          <p style={{ color:"#888", fontSize:12, marginTop:10 }}>Tiempo restante para desbloqueo automático</p>
          <p style={{ color:"#aaa", fontSize:11, marginTop:16, padding:"10px 14px", background:"#f8f8f8", borderRadius:8 }}>
            Si necesitas acceso urgente, solicita al administrador que desbloquee este dispositivo.
          </p>
        </div>
      </div>
    );
  }

  const intentosActuales = bloqueoLocal?.intentos || 0;

  // ── UI login normal ───────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#0d2347 0%,#1A3A6B 50%,#2a5298 100%)", display:"flex", alignItems:"center", justifyContent:"center", padding:20, fontFamily:"Inter, sans-serif" }}>
      <div style={{ background:"white", borderRadius:16, padding:"40px 28px", width:"100%", maxWidth:420, boxShadow:"0 25px 60px rgba(0,0,0,0.4)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:28 }}>
          <LogoRCCES size={52} />
          <div style={{ textAlign:"center", flex:1, padding:"0 10px" }}>
            <div style={{ fontSize:10, color:"#666", letterSpacing:2, textTransform:"uppercase" }}>Sistema de Registro</div>
            <div style={{ fontSize:20, fontWeight:"bold", color:"#1A3A6B", fontFamily:"Georgia, serif", lineHeight:1.2 }}>ENSES 2026</div>
            <div style={{ fontSize:10, color:"#8B0000", marginTop:2 }}>Control de Hospedaje</div>
          </div>
          <LogoDiocesis size={52} />
        </div>

        <div style={{ borderTop:"1px solid #eee", paddingTop:28 }}>
          <p style={{ color:"#444", fontSize:14, marginBottom:20, textAlign:"center" }}>Ingresa el código de tu parroquia para acceder.</p>
          <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#1A3A6B", marginBottom:6, letterSpacing:1 }}>CÓDIGO DE PARROQUIA</label>
          <input
            value={codigo}
            onChange={e => setCodigo(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && !cargando && handleLogin()}
            placeholder="Ej: SGDO001 · VER-SGDO001 · COORD-NORTE"
            style={{ width:"100%", padding:"12px 16px", fontSize:14, fontFamily:"monospace", border:"2px solid #ddd", borderRadius:8, outline:"none", letterSpacing:2, textAlign:"center", boxSizing:"border-box", transition:"border-color 0.2s" }}
            onFocus={e => e.target.style.borderColor="#1A3A6B"}
            onBlur={e => e.target.style.borderColor="#ddd"}
          />

          <div style={{ marginTop:8, fontSize:11, color:"#888", textAlign:"center", lineHeight:1.6 }}>
            <strong>VER-CÓDIGO</strong> — solo lectura &nbsp;·&nbsp; <strong>COORD-NOMBRE</strong> — coordinador
          </div>

          {/* Advertencia de intentos restantes */}
          {intentosActuales > 0 && (
            <div style={{ marginTop:10, padding:"8px 12px", background:"#fff8e6", border:"1px solid #f0c060", borderRadius:6, color:"#7a5500", fontSize:12, textAlign:"center" }}>
              ⚠️ {MAX_INTENTOS - intentosActuales} intento{MAX_INTENTOS - intentosActuales !== 1 ? "s" : ""} restante{MAX_INTENTOS - intentosActuales !== 1 ? "s" : ""} antes del bloqueo.
            </div>
          )}

          {error && (
            <div style={{ background:"#fff3f3", border:"1px solid #ffcccc", borderRadius:6, padding:"10px 14px", marginTop:10, color:"#cc0000", fontSize:13 }}>
              {error}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={!codigo || cargando}
            style={{ width:"100%", marginTop:18, padding:"14px", fontSize:15, fontWeight:700, background:codigo&&!cargando?"#1A3A6B":"#9ba8c0", color:"white", border:"none", borderRadius:8, cursor:codigo&&!cargando?"pointer":"not-allowed", transition:"background 0.2s", letterSpacing:0.5 }}
          >
            {cargando ? "Verificando..." : "Acceder"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PANTALLA DE CARGA POST-LOGIN ─────────────────────────────────────────────
function PantallaCargando() {
  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#0d2347 0%,#1A3A6B 50%,#2a5298 100%)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Inter, sans-serif", flexDirection:"column", gap:16 }}>
      <div style={{ width:40, height:40, border:"4px solid rgba(255,255,255,0.3)", borderTopColor:"white", borderRadius:"50%", animation:"spin 0.8s linear infinite" }}/>
      <div style={{ color:"white", fontSize:16 }}>Cargando datos...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── VISTA ADMIN ──────────────────────────────────────────────────────────────
const FORM_VACIO      = { nombre:"", codigo:"", vicaria:"", decanato:"", cupo_maximo:"" };
const FORM_COORD_VACIO = { nombre:"", codigo:"" };

function generarCodigoCoord() {
  return "COORD-" + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function VistaAdmin({ parroquias, datos, db, onLogout, recargar, esCoordinador = false, coordinadorCodigo = "" }) {
  const isMobile = useIsMobile();

  // ── Estado parroquias ──────────────────────────────────────────────────
  const [tabActiva, setTabActiva]   = useState(null);
  const [modalOpen, setModalOpen]   = useState(false);
  const [form, setForm]             = useState(FORM_VACIO);
  const [guardando, setGuardando]   = useState(false);
  const [errForm, setErrForm]       = useState("");
  const [genPDF, setGenPDF]         = useState(false);
  const [nuevasFilas, setNuevasFilas]       = useState([]);
  const [guardandoNuevas, setGuardandoNuevas] = useState(false);
  const [guardadoNuevasOk, setGuardadoNuevasOk] = useState(false);

  // ── Estado coordinadores ───────────────────────────────────────────────
  const [coordsList, setCoordslist]         = useState([]);
  const [modalCoordOpen, setModalCoordOpen] = useState(false);
  const [formCoord, setFormCoord]           = useState(FORM_COORD_VACIO);
  const [guardandoCoord, setGuardandoCoord] = useState(false);
  const [errFormCoord, setErrFormCoord]     = useState("");

  // ── Estado bloqueos ────────────────────────────────────────────────────
  const [bloqueosList, setBloqueosList] = useState([]);

  // ── Estado backup/restore ──────────────────────────────────────────────
  const [restaurando, setRestaurando]   = useState(false);

  // ── Efectos de carga ───────────────────────────────────────────────────
  useEffect(() => {
    db.from("coordinadores").select("*").order("codigo").then(({ data }) => setCoordslist(data || []));
  }, [db]);

  useEffect(() => {
    if (esCoordinador) return;
    db.from("bloqueos").select("*").order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => setBloqueosList(data || []));
  }, [db, esCoordinador]);

  useEffect(() => {
    setNuevasFilas([]);
    setGuardadoNuevasOk(false);
  }, [tabActiva]);

  // ── Helpers ────────────────────────────────────────────────────────────
  const refreshCoords = async () => {
    const { data } = await db.from("coordinadores").select("*").order("codigo");
    setCoordslist(data || []);
  };
  const refreshBloqueos = async () => {
    const { data } = await db.from("bloqueos").select("*").order("created_at", { ascending: false }).limit(100);
    setBloqueosList(data || []);
  };

  const totalRegistrados = parroquias.reduce((acc, p) => {
    return acc + (datos[p.codigo]?.filas || []).reduce((s, f) => s + (parseInt(f.cantidad) || 0), 0);
  }, 0);
  const totalCupos = parroquias.reduce((a, p) => a + (p.cupo_maximo || 0), 0);

  // ── Parroquias ─────────────────────────────────────────────────────────
  const crearParroquia = async () => {
    if (!form.nombre.trim() || !form.codigo.trim()) { setErrForm("Nombre y Código son obligatorios."); return; }
    setErrForm(""); setGuardando(true);
    const { error } = await db.from("parroquias").insert({ nombre:form.nombre.trim(), codigo:form.codigo.trim().toUpperCase(), vicaria:form.vicaria.trim(), decanato:form.decanato.trim(), cupo_maximo:parseInt(form.cupo_maximo)||0 });
    setGuardando(false);
    if (error) { setErrForm(error.message); return; }
    setModalOpen(false); setForm(FORM_VACIO);
  };

  const eliminarParroquia = async (codigo, nombre) => {
    if (!window.confirm(`¿Eliminar la parroquia "${nombre}" y todos sus registros?\n\nEsta acción no se puede deshacer.`)) return;
    await db.from("personas").delete().eq("parroquia_codigo", codigo);
    await db.from("parroquias").delete().eq("codigo", codigo);
    if (tabActiva === codigo) setTabActiva(null);
  };

  // ── Coordinadores ──────────────────────────────────────────────────────
  const crearCoordinador = async () => {
    if (!formCoord.nombre.trim() || !formCoord.codigo.trim()) { setErrFormCoord("Nombre y Código son obligatorios."); return; }
    setGuardandoCoord(true);
    const { error } = await db.from("coordinadores").insert({ codigo: formCoord.codigo.trim().toUpperCase(), nombre: formCoord.nombre.trim() });
    setGuardandoCoord(false);
    if (error) { setErrFormCoord(error.message.includes("duplicate") ? "Ese código ya existe." : error.message); return; }
    setModalCoordOpen(false); setFormCoord(FORM_COORD_VACIO); setErrFormCoord("");
    refreshCoords();
  };

  const eliminarCoordinador = async (codigo) => {
    if (!window.confirm(`¿Eliminar el coordinador "${codigo}"?`)) return;
    await db.from("coordinadores").delete().eq("codigo", codigo);
    refreshCoords();
  };

  // ── Bloqueos ───────────────────────────────────────────────────────────
  const desbloquear = async (id) => {
    await db.from("bloqueos").update({ desbloqueado_por: ADMIN_CODIGO }).eq("id", id);
    refreshBloqueos();
  };

  const eliminarBloqueo = async (id) => {
    await db.from("bloqueos").delete().eq("id", id);
    refreshBloqueos();
  };

  // ── CSV global ─────────────────────────────────────────────────────────
  const exportarCSV = () => {
    let csv = "Parroquia,Nombre,Teléfono,Dirección,Cantidad,H,M,MT,Agregado por\n";
    parroquias.forEach(p => {
      (datos[p.codigo]?.filas || []).forEach(f => {
        if (f.nombre) csv += `"${p.nombre}","${f.nombre}","${f.telefono}","${f.direccion}","${f.cantidad}","${f.h}","${f.m}","${f.mt}","${f.agregado_por}"\n`;
      });
    });
    const blob = new Blob([csv], { type:"text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download="ENSES_Hospedaje_General.csv"; a.click();
  };

  const handlePDFGlobal = async () => { setGenPDF(true); await exportarPDFGlobal(parroquias, datos); setGenPDF(false); };

  // ── Backup / Restaurar ─────────────────────────────────────────────────
  const exportarBackup = async () => {
    setGenPDF(true);
    const [{ data: pars }, { data: pers }, { data: coords }] = await Promise.all([
      db.from("parroquias").select("*"),
      db.from("personas").select("*"),
      db.from("coordinadores").select("*"),
    ]);
    const backup = { version: 2, timestamp: new Date().toISOString(), parroquias: pars||[], personas: pers||[], coordinadores: coords||[] };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`ENSES_backup_${new Date().toISOString().slice(0,10)}.json`; a.click();
    setGenPDF(false);
  };

  const handleRestaurar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    let backup;
    try { backup = JSON.parse(await file.text()); } catch { alert("Archivo JSON inválido."); return; }
    if (!backup.parroquias || !backup.personas) { alert("El archivo no es un backup válido de ENSES."); return; }
    const msg = `⚠️ RESTAURAR BACKUP\n\nFecha: ${backup.timestamp}\nParroquias: ${backup.parroquias.length}\nPersonas: ${backup.personas.length}\n\nEsto REEMPLAZARÁ todos los datos actuales.\n¿Continuar?`;
    if (!window.confirm(msg)) return;
    if (!window.confirm("¿Estás SEGURO? Esta acción no se puede deshacer.")) return;

    setRestaurando(true);
    try {
      const CAMPOS_P   = ["codigo","nombre","vicaria","decanato","sacerdote","lugar","enlace_parroquial","telefono_contacto","cupo_maximo"];
      const CAMPOS_PER = ["parroquia_codigo","posicion","nombre","telefono","direccion","cantidad","h","m","mt","agregado_por"];
      const pars = backup.parroquias.map(r => Object.fromEntries(CAMPOS_P.filter(k => r[k] !== undefined).map(k => [k, r[k]])));
      const pers = backup.personas.map(r => Object.fromEntries(CAMPOS_PER.filter(k => r[k] !== undefined).map(k => [k, r[k]])));

      await db.from("personas").delete().not("parroquia_codigo", "is", null);
      await db.from("parroquias").delete().not("codigo", "is", null);
      if (pars.length) await db.from("parroquias").insert(pars);
      if (pers.length) await db.from("personas").insert(pers);

      if (backup.coordinadores?.length) {
        await db.from("coordinadores").delete().not("codigo", "is", null);
        await db.from("coordinadores").insert(backup.coordinadores.map(({ codigo, nombre }) => ({ codigo, nombre })));
        refreshCoords();
      }
      await recargar();
      alert(`✓ Backup restaurado correctamente.\n${pars.length} parroquias · ${pers.length} personas.`);
    } catch (err) {
      alert("Error al restaurar: " + err.message);
    } finally {
      setRestaurando(false);
    }
  };

  // ── RENDER ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:"#f0f4ff", fontFamily:"Inter, sans-serif" }}>

      {/* Header */}
      <div style={{ background:"#1A3A6B", color:"white" }}>
        <div style={{ maxWidth:1100, margin:"0 auto", padding: isMobile ? "10px 14px" : "0 24px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", minHeight: isMobile ? "auto" : 64 }}>
            <div style={{ display:"flex", alignItems:"center", gap: isMobile ? 10 : 16 }}>
              <LogoRCCES size={isMobile ? 40 : 52} />
              <div>
                <div style={{ fontSize: isMobile ? 14 : 18, fontWeight:700, fontFamily:"Georgia, serif" }}>ENSES 2026 — Panel General</div>
                <div style={{ fontSize:11, opacity:0.8 }}>
                  {esCoordinador ? `Coordinador ${coordinadorCodigo}` : "Administrador"} · {parroquias.length} parroquias
                </div>
              </div>
            </div>
            <button onClick={onLogout} style={{ display:"flex", gap:5, alignItems:"center", background:"transparent", color:"white", border:"1px solid rgba(255,255,255,0.4)", padding:"7px 12px", borderRadius:6, cursor:"pointer", fontSize:12, whiteSpace:"nowrap" }}>
              <IconLogout/> {!isMobile && "Salir"}
            </button>
          </div>

          {/* Botones de acción del header */}
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", paddingBottom: isMobile ? 10 : 0, marginTop: isMobile ? 8 : -48, marginLeft: isMobile ? 0 : "auto", justifyContent: isMobile ? "stretch" : "flex-end", maxWidth: isMobile ? "none" : 640 }}>
            {!esCoordinador && (
              <button onClick={() => { setForm(FORM_VACIO); setErrForm(""); setModalOpen(true); }} style={{ display:"flex", gap:5, alignItems:"center", justifyContent:"center", background:"#2a7a3a", color:"white", border:"none", padding:"8px 12px", borderRadius:6, cursor:"pointer", fontSize:11, fontWeight:600, flex: isMobile ? "1 1 calc(50% - 4px)" : "none" }}>
                <IconPlus/> Nueva parroquia
              </button>
            )}
            <button onClick={exportarCSV} style={{ display:"flex", gap:5, alignItems:"center", justifyContent:"center", background:"#2a5298", color:"white", border:"none", padding:"8px 12px", borderRadius:6, cursor:"pointer", fontSize:11, flex: isMobile ? "1 1 calc(50% - 4px)" : "none" }}>
              <IconDownload/> CSV
            </button>
            {!esCoordinador && (<>
              <button onClick={handlePDFGlobal} disabled={genPDF} style={{ display:"flex", gap:5, alignItems:"center", justifyContent:"center", background: genPDF ? "#666" : "#8B0000", color:"white", border:"none", padding:"8px 12px", borderRadius:6, cursor: genPDF ? "not-allowed" : "pointer", fontSize:11, flex: isMobile ? "1 1 calc(50% - 4px)" : "none" }}>
                <IconPDF/> {genPDF ? "..." : "PDF global"}
              </button>
              <button onClick={exportarBackup} disabled={genPDF || restaurando} style={{ display:"flex", gap:5, alignItems:"center", justifyContent:"center", background:"#4a4a8a", color:"white", border:"none", padding:"8px 12px", borderRadius:6, cursor:"pointer", fontSize:11, flex: isMobile ? "1 1 calc(50% - 4px)" : "none" }}>
                <IconDatabase/> Backup
              </button>
              <label style={{ display:"flex", gap:5, alignItems:"center", justifyContent:"center", background: restaurando ? "#666" : "#6a3a00", color:"white", padding:"8px 12px", borderRadius:6, cursor: restaurando ? "not-allowed" : "pointer", fontSize:11, flex: isMobile ? "1 1 calc(50% - 4px)" : "none" }}>
                <IconUpload/> {restaurando ? "Restaurando..." : "Restaurar"}
                <input type="file" accept=".json" onChange={handleRestaurar} disabled={restaurando} style={{ display:"none" }} />
              </label>
            </>)}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:"0 auto", padding: isMobile ? "14px 12px" : 24 }}>

        {/* Tarjetas resumen */}
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: isMobile ? 10 : 16, marginBottom: isMobile ? 16 : 28 }}>
          <TarjetaStat label="Hospedados"  valor={totalRegistrados}              color="#1A3A6B" small={isMobile}/>
          <TarjetaStat label="Parroquias"  valor={parroquias.length}             color="#2a5298" small={isMobile}/>
          <TarjetaStat label="Cupos total" valor={totalCupos}                    color="#8B0000" small={isMobile}/>
          <TarjetaStat label="Disponibles" valor={totalCupos - totalRegistrados} color="#2a7a3a" small={isMobile}/>
        </div>

        {/* Tabla de parroquias */}
        <div style={{ background:"white", borderRadius:12, overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,0.08)" }}>
          <div style={{ padding:"14px 16px", borderBottom:"1px solid #eee" }}>
            <h3 style={{ margin:0, color:"#1A3A6B", fontSize:15 }}>Estado por parroquia</h3>
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize: isMobile ? 12 : 14, minWidth:600 }}>
              <thead>
                <tr style={{ background:"#f8f9fc" }}>
                  {["Parroquia","Decanato","Vicaría","Reg.","Cupo","Disp.","Llenado", ...(esCoordinador ? [] : [""])].map(h => (
                    <th key={h} style={{ padding:"9px 10px", textAlign:"left", color:"#444", fontWeight:600, borderBottom:"1px solid #eee", whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parroquias.map(p => {
                  const filas = datos[p.codigo]?.filas || [];
                  const reg = filas.reduce((s,f) => s+(parseInt(f.cantidad)||0), 0);
                  const cupo = p.cupo_maximo || 0;
                  const pct = cupo > 0 ? Math.min(100, Math.round((reg/cupo)*100)) : 0;
                  const color = pct >= 90 ? "#cc0000" : pct >= 60 ? "#e07b00" : "#2a7a3a";
                  return (
                    <tr key={p.codigo} style={{ borderBottom:"1px solid #f0f0f0" }}>
                      <td style={{ padding:"9px 10px", fontWeight:600, color:"#1A3A6B", cursor:"pointer", minWidth:120 }}
                        onClick={() => setTabActiva(tabActiva === p.codigo ? null : p.codigo)}
                        onMouseEnter={e => e.currentTarget.style.textDecoration="underline"}
                        onMouseLeave={e => e.currentTarget.style.textDecoration="none"}>
                        {p.nombre}
                      </td>
                      <td style={{ padding:"9px 10px", color:"#555", whiteSpace:"nowrap" }}>{p.decanato||"—"}</td>
                      <td style={{ padding:"9px 10px", color:"#555", whiteSpace:"nowrap" }}>{p.vicaria||"—"}</td>
                      <td style={{ padding:"9px 10px", fontWeight:700 }}>{reg}</td>
                      <td style={{ padding:"9px 10px", color:"#888" }}>{cupo}</td>
                      <td style={{ padding:"9px 10px", color, fontWeight:600 }}>{cupo-reg}</td>
                      <td style={{ padding:"9px 10px", minWidth:90 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <div style={{ flex:1, height:7, background:"#eee", borderRadius:4 }}>
                            <div style={{ width:`${pct}%`, height:"100%", background:color, borderRadius:4 }}/>
                          </div>
                          <span style={{ color, fontSize:11, fontWeight:700, minWidth:32 }}>{pct}%</span>
                        </div>
                      </td>
                      {!esCoordinador && (
                        <td style={{ padding:"4px 8px", textAlign:"center" }}>
                          <button onClick={() => eliminarParroquia(p.codigo, p.nombre)} title="Eliminar parroquia"
                            style={{ background:"none", border:"none", cursor:"pointer", color:"#ccc", padding:5, borderRadius:4, display:"flex", alignItems:"center" }}
                            onMouseEnter={e => { e.currentTarget.style.color="#cc0000"; e.currentTarget.style.background="#fff0f0"; }}
                            onMouseLeave={e => { e.currentTarget.style.color="#ccc"; e.currentTarget.style.background="none"; }}>
                            <IconTrash/>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {parroquias.length === 0 && (
                  <tr><td colSpan={8} style={{ padding:"32px", textAlign:"center", color:"#999", fontStyle:"italic" }}>
                    No hay parroquias. Haz clic en "+ Nueva parroquia" para comenzar.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Panel expandido de parroquia */}
        {tabActiva && (() => {
          const p = parroquias.find(x => x.codigo === tabActiva);
          if (!p) return null;
          const filas  = datos[tabActiva]?.filas  || [];
          const headerP = datos[tabActiva]?.header || {};

          const exportarCSVParroquia = () => {
            let csv = `ENSES 2026 - Control de Hospedaje\nParroquia:,${p.nombre}\n\nP.,NOMBRE,TELÉFONO,DIRECCIÓN,CANTIDAD,H,M,MT,AGREGADO POR\n`;
            filas.forEach((f,i) => { if (f.nombre) csv += `${i+1},"${f.nombre}","${f.telefono}","${f.direccion}","${f.cantidad}","${f.h}","${f.m}","${f.mt}","${f.agregado_por}"\n`; });
            const blob = new Blob(["﻿"+csv], { type:"text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href=url; a.download=`ENSES_${p.nombre.replace(/\s+/g,"_")}.csv`; a.click();
          };

          const handlePDFParroquia = async () => { setGenPDF(true); await exportarPDFParroquia(p, headerP, filas); setGenPDF(false); };

          const guardarNuevasPersonas = async () => {
            const conNombre = nuevasFilas.filter(f => f.nombre.trim());
            if (!conNombre.length) return;
            setGuardandoNuevas(true);
            await agregarPersonasCoordinador(db, tabActiva, conNombre, coordinadorCodigo);
            setGuardandoNuevas(false);
            setNuevasFilas([]);
            setGuardadoNuevasOk(true);
            setTimeout(() => setGuardadoNuevasOk(false), 3000);
          };

          return (
            <div style={{ marginTop:14, background:"white", borderRadius:12, padding: isMobile ? 14 : 20, boxShadow:"0 2px 8px rgba(0,0,0,0.08)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8, marginBottom:14 }}>
                <h4 style={{ margin:0, color:"#1A3A6B", fontSize: isMobile ? 13 : 15 }}>Detalle: {p.nombre}</h4>
                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  <button onClick={exportarCSVParroquia} style={{ display:"flex", gap:5, alignItems:"center", background:"#f0f4ff", color:"#1A3A6B", border:"1.5px solid #1A3A6B", padding:"6px 12px", borderRadius:6, cursor:"pointer", fontSize:12 }}>
                    <IconDownload/> CSV
                  </button>
                  <button onClick={handlePDFParroquia} disabled={genPDF} style={{ display:"flex", gap:5, alignItems:"center", background: genPDF ? "#bbb" : "#8B0000", color:"white", border:"none", padding:"6px 12px", borderRadius:6, cursor: genPDF ? "not-allowed" : "pointer", fontSize:12 }}>
                    <IconPDF/> PDF
                  </button>
                  <button onClick={() => setTabActiva(null)} style={{ background:"none", border:"1px solid #ddd", borderRadius:6, padding:"6px 10px", cursor:"pointer", fontSize:12, color:"#666" }}>Cerrar</button>
                </div>
              </div>

              <TablaPersonas filas={filas} soloLectura={true} mostrarAgregadoPor={true} />

              {esCoordinador && (
                <div style={{ marginTop:20, borderTop:"2px dashed #c8d8f8", paddingTop:16 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                    <div>
                      <h5 style={{ margin:0, color:"#1A3A6B", fontSize:13 }}>Agregar personas</h5>
                      <span style={{ fontSize:11, color:"#888" }}>Se registrarán con código: <strong>{coordinadorCodigo}</strong></span>
                    </div>
                    <button onClick={() => setNuevasFilas(fs => [...fs, fila_vacia()])} style={{ display:"flex", gap:5, alignItems:"center", background:"#f0f4ff", color:"#1A3A6B", border:"1.5px solid #1A3A6B", padding:"7px 12px", borderRadius:6, cursor:"pointer", fontSize:12, fontWeight:600 }}>
                      <IconPlus/> Agregar persona
                    </button>
                  </div>
                  {nuevasFilas.length > 0 && (<>
                    <TablaPersonas filas={nuevasFilas} onChange={(i,campo,valor) => setNuevasFilas(fs => { const n=[...fs]; n[i]={...n[i],[campo]:valor}; return n; })} onEliminar={i => setNuevasFilas(fs => fs.filter((_,idx)=>idx!==i))} soloLectura={false} mostrarAgregadoPor={false} />
                    <div style={{ marginTop:12, display:"flex", gap:8, alignItems:"center" }}>
                      <button onClick={guardarNuevasPersonas} disabled={guardandoNuevas} style={{ display:"flex", gap:6, alignItems:"center", background: guardandoNuevas ? "#9ba8c0" : "#1A3A6B", color:"white", border:"none", padding:"10px 18px", borderRadius:8, cursor: guardandoNuevas ? "not-allowed" : "pointer", fontSize:13, fontWeight:700 }}>
                        <IconSave/> {guardandoNuevas ? "Guardando..." : "Guardar nuevas personas"}
                      </button>
                      {guardadoNuevasOk && <span style={{ color:"#2a7a3a", fontSize:13, fontWeight:600 }}>✓ Guardado correctamente</span>}
                    </div>
                  </>)}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── GESTIÓN DE COORDINADORES (solo admin) ───────────────────────────────── */}
        {!esCoordinador && (
          <div style={{ background:"white", borderRadius:12, overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,0.08)", marginTop:24 }}>
            <div style={{ padding:"14px 16px", borderBottom:"1px solid #eee", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <IconUsers/>
                <h3 style={{ margin:0, color:"#1A3A6B", fontSize:15 }}>Coordinadores activos</h3>
                <span style={{ background:"#e8eeff", color:"#1A3A6B", borderRadius:10, padding:"2px 8px", fontSize:11, fontWeight:700 }}>{coordsList.length}</span>
              </div>
              <button onClick={() => { setFormCoord({ nombre:"", codigo: generarCodigoCoord() }); setErrFormCoord(""); setModalCoordOpen(true); }}
                style={{ display:"flex", gap:5, alignItems:"center", background:"#1A3A6B", color:"white", border:"none", padding:"8px 14px", borderRadius:6, cursor:"pointer", fontSize:12, fontWeight:600 }}>
                <IconPlus/> Nuevo coordinador
              </button>
            </div>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13, minWidth:400 }}>
                <thead>
                  <tr style={{ background:"#f8f9fc" }}>
                    {["Código","Nombre",""].map(h => (
                      <th key={h} style={{ padding:"9px 14px", textAlign:"left", color:"#444", fontWeight:600, borderBottom:"1px solid #eee" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {coordsList.map(c => (
                    <tr key={c.codigo} style={{ borderBottom:"1px solid #f0f0f0" }}>
                      <td style={{ padding:"10px 14px", fontFamily:"monospace", fontWeight:700, color:"#2a5298", fontSize:13 }}>{c.codigo}</td>
                      <td style={{ padding:"10px 14px", color:"#333" }}>{c.nombre}</td>
                      <td style={{ padding:"4px 8px", textAlign:"center" }}>
                        <button onClick={() => eliminarCoordinador(c.codigo)} title="Eliminar coordinador"
                          style={{ background:"none", border:"none", cursor:"pointer", color:"#ccc", padding:5, borderRadius:4, display:"flex", alignItems:"center" }}
                          onMouseEnter={e => { e.currentTarget.style.color="#cc0000"; e.currentTarget.style.background="#fff0f0"; }}
                          onMouseLeave={e => { e.currentTarget.style.color="#ccc"; e.currentTarget.style.background="none"; }}>
                          <IconTrash/>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {coordsList.length === 0 && (
                    <tr><td colSpan={3} style={{ padding:"24px", textAlign:"center", color:"#999", fontStyle:"italic" }}>
                      No hay coordinadores registrados.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── ACCESOS BLOQUEADOS (solo admin) ─────────────────────────────────────── */}
        {!esCoordinador && (
          <div style={{ background:"white", borderRadius:12, overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,0.08)", marginTop:24 }}>
            <div style={{ padding:"14px 16px", borderBottom:"1px solid #eee", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <IconShield/>
                <h3 style={{ margin:0, color:"#1A3A6B", fontSize:15 }}>Accesos bloqueados</h3>
                {bloqueosList.filter(b => b.bloqueado_hasta && !b.desbloqueado_por && new Date(b.bloqueado_hasta) > new Date()).length > 0 && (
                  <span style={{ background:"#ffeeee", color:"#cc0000", borderRadius:10, padding:"2px 8px", fontSize:11, fontWeight:700 }}>
                    {bloqueosList.filter(b => b.bloqueado_hasta && !b.desbloqueado_por && new Date(b.bloqueado_hasta) > new Date()).length} activos
                  </span>
                )}
              </div>
              <button onClick={refreshBloqueos} style={{ background:"none", border:"1px solid #ddd", borderRadius:6, padding:"6px 12px", cursor:"pointer", fontSize:12, color:"#666" }}>
                Actualizar
              </button>
            </div>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, minWidth:560 }}>
                <thead>
                  <tr style={{ background:"#f8f9fc" }}>
                    {["Dispositivo","Intentos","Bloqueado hasta","Estado","Acciones"].map(h => (
                      <th key={h} style={{ padding:"9px 14px", textAlign:"left", color:"#444", fontWeight:600, borderBottom:"1px solid #eee", whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bloqueosList.map(b => {
                    const aun = b.bloqueado_hasta && new Date(b.bloqueado_hasta) > new Date();
                    const desbloqueado = !!b.desbloqueado_por;
                    return (
                      <tr key={b.id} style={{ borderBottom:"1px solid #f0f0f0" }}>
                        <td style={{ padding:"9px 14px", fontFamily:"monospace", fontSize:11, color:"#555" }}>
                          {b.navegador_id?.slice(0,16)}…
                        </td>
                        <td style={{ padding:"9px 14px", fontWeight:700, color: b.intentos >= MAX_INTENTOS ? "#cc0000" : "#333" }}>
                          {b.intentos}
                        </td>
                        <td style={{ padding:"9px 14px", color:"#555", whiteSpace:"nowrap" }}>
                          {b.bloqueado_hasta ? new Date(b.bloqueado_hasta).toLocaleString("es-MX", { hour12:false }) : "—"}
                        </td>
                        <td style={{ padding:"9px 14px" }}>
                          <span style={{ display:"inline-block", padding:"2px 8px", borderRadius:10, fontSize:11, fontWeight:600,
                            background: desbloqueado ? "#e8f8ee" : aun ? "#ffeeee" : "#f0f0f0",
                            color: desbloqueado ? "#2a7a3a" : aun ? "#cc0000" : "#888" }}>
                            {desbloqueado ? `Desbloqueado por ${b.desbloqueado_por}` : aun ? "Bloqueado" : "Expirado"}
                          </span>
                        </td>
                        <td style={{ padding:"6px 14px" }}>
                          <div style={{ display:"flex", gap:6 }}>
                            {aun && !desbloqueado && (
                              <button onClick={() => desbloquear(b.id)} style={{ background:"#e8f8ee", color:"#2a7a3a", border:"1px solid #aaddbb", borderRadius:5, padding:"4px 10px", cursor:"pointer", fontSize:11, fontWeight:600 }}>
                                Desbloquear
                              </button>
                            )}
                            <button onClick={() => eliminarBloqueo(b.id)} style={{ background:"none", border:"1px solid #eee", borderRadius:5, padding:"4px 8px", cursor:"pointer", fontSize:11, color:"#aaa" }}
                              onMouseEnter={e => e.currentTarget.style.color="#cc0000"}
                              onMouseLeave={e => e.currentTarget.style.color="#aaa"}>
                              <IconTrash/>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {bloqueosList.length === 0 && (
                    <tr><td colSpan={5} style={{ padding:"24px", textAlign:"center", color:"#999", fontStyle:"italic" }}>
                      No hay registros de bloqueo.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal nueva parroquia */}
      {modalOpen && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding: isMobile ? 14 : 20 }}>
          <div style={{ background:"white", borderRadius:14, padding: isMobile ? "22px 18px" : 32, width:"100%", maxWidth:480, boxShadow:"0 20px 60px rgba(0,0,0,0.3)", maxHeight:"90vh", overflowY:"auto" }}>
            <h3 style={{ margin:"0 0 20px", color:"#1A3A6B", fontFamily:"Georgia, serif", fontSize: isMobile ? 17 : 20 }}>Nueva parroquia</h3>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {[
                { key:"nombre",      label:"Nombre de la parroquia *", placeholder:"Ej: Sagrado Corazón de Jesús" },
                { key:"codigo",      label:"Código de acceso *",        placeholder:"Ej: SGDO001", upper:true },
                { key:"vicaria",     label:"Vicaria",                   placeholder:"Ej: Vicaría Norte" },
                { key:"decanato",    label:"Decanato",                  placeholder:"Ej: Decanato I" },
                { key:"cupo_maximo", label:"Cupo máximo",               placeholder:"Ej: 100", type:"number" },
              ].map(({ key, label, placeholder, upper, type }) => (
                <div key={key}>
                  <label style={{ display:"block", fontSize:11, fontWeight:600, color:"#444", marginBottom:4, letterSpacing:0.4 }}>{label.toUpperCase()}</label>
                  <input type={type||"text"} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: upper ? e.target.value.toUpperCase() : e.target.value }))} placeholder={placeholder} min={type==="number"?0:undefined}
                    style={{ width:"100%", padding:"10px 12px", fontSize:14, fontFamily:"Inter, sans-serif", border:"1.5px solid #ddd", borderRadius:7, outline:"none", boxSizing:"border-box", transition:"border-color 0.2s" }}
                    onFocus={e => e.target.style.borderColor="#1A3A6B"} onBlur={e => e.target.style.borderColor="#ddd"} />
                </div>
              ))}
            </div>
            {errForm && <div style={{ marginTop:10, padding:"9px 12px", background:"#fff3f3", border:"1px solid #ffcccc", borderRadius:6, color:"#cc0000", fontSize:13 }}>{errForm}</div>}
            <div style={{ display:"flex", gap:8, marginTop:20 }}>
              <button onClick={crearParroquia} disabled={guardando} style={{ flex:1, padding:"12px", background: guardando ? "#9ba8c0" : "#1A3A6B", color:"white", border:"none", borderRadius:8, cursor: guardando ? "not-allowed" : "pointer", fontSize:14, fontWeight:700 }}>
                {guardando ? "Guardando..." : "Guardar"}
              </button>
              <button onClick={() => { setModalOpen(false); setErrForm(""); }} style={{ flex:1, padding:"12px", background:"white", color:"#555", border:"2px solid #ddd", borderRadius:8, cursor:"pointer", fontSize:14 }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nuevo coordinador */}
      {modalCoordOpen && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding: isMobile ? 14 : 20 }}>
          <div style={{ background:"white", borderRadius:14, padding: isMobile ? "22px 18px" : 32, width:"100%", maxWidth:420, boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>
            <h3 style={{ margin:"0 0 20px", color:"#1A3A6B", fontFamily:"Georgia, serif", fontSize: isMobile ? 17 : 20 }}>Nuevo coordinador</h3>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div>
                <label style={{ display:"block", fontSize:11, fontWeight:600, color:"#444", marginBottom:4, letterSpacing:0.4 }}>NOMBRE DEL COORDINADOR *</label>
                <input value={formCoord.nombre} onChange={e => setFormCoord(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Coordinador Zona Norte"
                  style={{ width:"100%", padding:"10px 12px", fontSize:14, border:"1.5px solid #ddd", borderRadius:7, outline:"none", boxSizing:"border-box", transition:"border-color 0.2s" }}
                  onFocus={e => e.target.style.borderColor="#1A3A6B"} onBlur={e => e.target.style.borderColor="#ddd"} />
              </div>
              <div>
                <label style={{ display:"block", fontSize:11, fontWeight:600, color:"#444", marginBottom:4, letterSpacing:0.4 }}>CÓDIGO DE ACCESO *</label>
                <div style={{ display:"flex", gap:8 }}>
                  <input value={formCoord.codigo} onChange={e => setFormCoord(f => ({ ...f, codigo: e.target.value.toUpperCase() }))} placeholder="COORD-XXXX"
                    style={{ flex:1, padding:"10px 12px", fontSize:14, fontFamily:"monospace", border:"1.5px solid #ddd", borderRadius:7, outline:"none", boxSizing:"border-box", letterSpacing:1, transition:"border-color 0.2s" }}
                    onFocus={e => e.target.style.borderColor="#1A3A6B"} onBlur={e => e.target.style.borderColor="#ddd"} />
                  <button onClick={() => setFormCoord(f => ({ ...f, codigo: generarCodigoCoord() }))} title="Generar código aleatorio"
                    style={{ padding:"10px 12px", background:"#f0f4ff", color:"#1A3A6B", border:"1.5px solid #1A3A6B", borderRadius:7, cursor:"pointer", fontSize:12, whiteSpace:"nowrap" }}>
                    🎲 Auto
                  </button>
                </div>
                <p style={{ margin:"5px 0 0", fontSize:11, color:"#888" }}>El código debe empezar con COORD-. Este será el código de acceso al login.</p>
              </div>
            </div>
            {errFormCoord && <div style={{ marginTop:10, padding:"9px 12px", background:"#fff3f3", border:"1px solid #ffcccc", borderRadius:6, color:"#cc0000", fontSize:13 }}>{errFormCoord}</div>}
            <div style={{ display:"flex", gap:8, marginTop:20 }}>
              <button onClick={crearCoordinador} disabled={guardandoCoord} style={{ flex:1, padding:"12px", background: guardandoCoord ? "#9ba8c0" : "#1A3A6B", color:"white", border:"none", borderRadius:8, cursor: guardandoCoord ? "not-allowed" : "pointer", fontSize:14, fontWeight:700 }}>
                {guardandoCoord ? "Guardando..." : "Guardar"}
              </button>
              <button onClick={() => { setModalCoordOpen(false); setErrFormCoord(""); }} style={{ flex:1, padding:"12px", background:"white", color:"#555", border:"2px solid #ddd", borderRadius:8, cursor:"pointer", fontSize:14 }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TARJETA ESTADÍSTICA ──────────────────────────────────────────────────────
function TarjetaStat({ label, valor, color, small }) {
  return (
    <div style={{ background:"white", borderRadius:10, padding: small ? "14px 16px" : "20px 24px", boxShadow:"0 2px 8px rgba(0,0,0,0.07)", borderLeft:`4px solid ${color}` }}>
      <div style={{ fontSize: small ? 24 : 32, fontWeight:800, color }}>{valor}</div>
      <div style={{ fontSize: small ? 11 : 13, color:"#666", marginTop:3 }}>{label}</div>
    </div>
  );
}

// ─── TABLA DE PERSONAS ────────────────────────────────────────────────────────
function TablaPersonas({ filas, onChange, soloLectura, onEliminar, mostrarAgregadoPor = false }) {
  const cols = [
    { key:"nombre",    label:"NOMBRE",    w:"20%" },
    { key:"telefono",  label:"TELÉFONO",  w:"14%" },
    { key:"direccion", label:"DIRECCIÓN", w:"22%" },
    { key:"cantidad",  label:"CANT.",     w:"8%"  },
    { key:"h",         label:"H",         w:"6%"  },
    { key:"m",         label:"M",         w:"6%"  },
    { key:"mt",        label:"MT",        w:"6%"  },
    ...(mostrarAgregadoPor ? [{ key:"agregado_por", label:"AGREGADO POR", w:"13%" }] : []),
  ];

  const totalPersonas = filas.reduce((s,f) => s+(parseInt(f.cantidad)||0), 0);
  const totalH  = filas.reduce((s,f) => s+(parseInt(f.h)||0),  0);
  const totalM  = filas.reduce((s,f) => s+(parseInt(f.m)||0),  0);
  const totalMT = filas.reduce((s,f) => s+(parseInt(f.mt)||0), 0);

  return (
    <div style={{ overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13, minWidth: mostrarAgregadoPor ? 660 : 560 }}>
        <thead>
          <tr style={{ background:"#1A3A6B" }}>
            <th style={{ padding:"9px 7px", color:"white", width:"4%", textAlign:"center" }}>P.</th>
            {cols.map(c => (
              <th key={c.key} style={{ padding:"9px 7px", color:"white", width:c.w, textAlign:"left", fontWeight:600, letterSpacing:0.3 }}>{c.label}</th>
            ))}
            {!soloLectura && <th style={{ width:"4%", background:"#1A3A6B" }}/>}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, i) => (
            <tr key={i} style={{ background: i%2===0 ? "white" : "#fafbff" }}>
              <td style={{ padding:"6px 7px", textAlign:"center", color:"#888", fontSize:12, borderBottom:"1px solid #eef" }}>{i+1}</td>
              {cols.map(c => (
                <td key={c.key} style={{ padding:"4px 5px", borderBottom:"1px solid #eef" }}>
                  {soloLectura || c.key === "agregado_por" ? (
                    <span style={{ padding:"4px", display:"block", color: c.key==="agregado_por" && fila[c.key] ? "#2a5298" : "#333", fontSize: c.key==="agregado_por" ? 11 : 13, fontStyle: c.key==="agregado_por" && !fila[c.key] ? "italic" : "normal" }}>
                      {fila[c.key] || "—"}
                    </span>
                  ) : (
                    <input value={fila[c.key]} onChange={e => onChange(i, c.key, e.target.value)} type={["cantidad","h","m","mt"].includes(c.key) ? "number" : "text"} min={0}
                      style={{ width:"100%", border:"none", background:"transparent", padding:"5px 4px", fontSize:13, fontFamily:"Inter, sans-serif", outline:"none", boxSizing:"border-box", color:"#1A3A6B", borderBottom:"1px solid transparent", transition:"border-color 0.2s" }}
                      onFocus={e => { e.target.style.background="#f0f4ff"; e.target.style.borderBottomColor="#1A3A6B"; }}
                      onBlur={e => { e.target.style.background="transparent"; e.target.style.borderBottomColor="transparent"; }} />
                  )}
                </td>
              ))}
              {!soloLectura && (
                <td style={{ padding:"4px", textAlign:"center", borderBottom:"1px solid #eef" }}>
                  <button onClick={() => onEliminar(i)} style={{ background:"none", border:"none", cursor:"pointer", color:"#ccc", padding:4 }}
                    onMouseEnter={e=>e.currentTarget.style.color="#cc0000"}
                    onMouseLeave={e=>e.currentTarget.style.color="#ccc"}>
                    <IconTrash/>
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background:"#f0f4ff", fontWeight:700 }}>
            <td colSpan={4} style={{ padding:"9px 7px", color:"#1A3A6B", textAlign:"right", borderTop:"2px solid #1A3A6B" }}>TOTAL</td>
            <td style={{ padding:"9px 7px", color:"#1A3A6B", borderTop:"2px solid #1A3A6B" }}>{totalPersonas}</td>
            <td style={{ padding:"9px 7px", color:"#1A3A6B", borderTop:"2px solid #1A3A6B" }}>{totalH}</td>
            <td style={{ padding:"9px 7px", color:"#1A3A6B", borderTop:"2px solid #1A3A6B" }}>{totalM}</td>
            <td style={{ padding:"9px 7px", color:"#1A3A6B", borderTop:"2px solid #1A3A6B" }}>{totalMT}</td>
            {mostrarAgregadoPor && <td style={{ borderTop:"2px solid #1A3A6B" }}/>}
            {!soloLectura && <td style={{ borderTop:"2px solid #1A3A6B" }}/>}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── VISTA PARROQUIA ──────────────────────────────────────────────────────────
function VistaParroquia({ parroquia, datos, setDatos, db, soloLectura, onLogout }) {
  const isMobile = useIsMobile();
  const cupo = parroquia.cupo_maximo ?? parroquia.cupo ?? 0;
  const datosP = datos[parroquia.codigo] || { header:{}, filas: Array(20).fill(null).map(fila_vacia) };
  const [header, setHeader] = useState(datosP.header || {});
  const [filas, setFilas]   = useState(datosP.header ? datosP.filas : Array(20).fill(null).map(fila_vacia));
  const [guardado, setGuardado] = useState(false);
  const [tab, setTab]           = useState("registro");
  const [genPDF, setGenPDF]     = useState(false);

  const totalPersonas = filas.reduce((s,f) => s+(parseInt(f.cantidad)||0), 0);
  const totalH  = filas.reduce((s,f) => s+(parseInt(f.h)||0),  0);
  const totalM  = filas.reduce((s,f) => s+(parseInt(f.m)||0),  0);
  const totalMT = filas.reduce((s,f) => s+(parseInt(f.mt)||0), 0);
  const pct = cupo > 0 ? Math.min(100, Math.round((totalPersonas/cupo)*100)) : 0;

  const handleHeader = (campo, valor) => { if (soloLectura) return; setHeader(h => ({ ...h, [campo]: valor })); };
  const handleFila   = (i, campo, valor) => setFilas(fs => { const n=[...fs]; n[i]={...n[i],[campo]:valor}; return n; });
  const agregarFila  = () => setFilas(fs => [...fs, fila_vacia()]);
  const eliminarFila = (i) => setFilas(fs => fs.filter((_,idx) => idx!==i));

  const guardar = async () => {
    if (soloLectura) return;
    setDatos(prev => ({ ...prev, [parroquia.codigo]: { header, filas } }));
    await guardarDatos(db, parroquia.codigo, filas, header);
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
  };

  const exportarCSV = () => {
    let csv = `ENSES 2026 - Control de Hospedaje\nParroquia:,${parroquia.nombre}\n\nP.,NOMBRE,TELÉFONO,DIRECCIÓN,CANTIDAD,H,M,MT\n`;
    filas.forEach((f,i) => { if (f.nombre) csv += `${i+1},"${f.nombre}","${f.telefono}","${f.direccion}","${f.cantidad}","${f.h}","${f.m}","${f.mt}"\n`; });
    csv += `\nTOTAL,,,,${totalPersonas},${totalH},${totalM},${totalMT}\n`;
    const blob = new Blob(["﻿"+csv], { type:"text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`ENSES_${parroquia.nombre.replace(/\s+/g,"_")}.csv`; a.click();
  };

  const exportarTexto = () => {
    let txt = `ENSES 2026 - CONTROL DE HOSPEDAJE\n${"=".repeat(50)}\n\nParroquia: ${parroquia.nombre}\nVicaria: ${header["Vicaria"]||""}\nDecanato: ${header["Decanato"]||""}\nSacerdote: ${header["Sacerdote"]||""}\nLugar: ${header["Lugar (municipio/localidad)"]||""}\nEnlace: ${header["Enlace parroquial"]||""}\nTeléfono: ${header["Teléfono"]||""}\n\n`;
    txt += `${"─".repeat(80)}\nN°  ${"NOMBRE".padEnd(25)} ${"TELÉFONO".padEnd(15)} ${"DIRECCIÓN".padEnd(25)} CANT  H   M   MT\n${"─".repeat(85)}\n`;
    filas.forEach((f,i) => { if(f.nombre) txt += `${String(i+1).padStart(2)}. ${(f.nombre||"").padEnd(25)} ${(f.telefono||"").padEnd(15)} ${(f.direccion||"").padEnd(25)} ${String(f.cantidad||"").padEnd(5)} ${String(f.h||"").padEnd(3)} ${String(f.m||"").padEnd(3)} ${f.mt||""}\n`; });
    txt += `${"─".repeat(85)}\nTOTAL:${" ".repeat(62)}${String(totalPersonas).padEnd(5)} ${String(totalH).padEnd(3)} ${String(totalM).padEnd(3)} ${totalMT}\n`;
    const blob = new Blob([txt], { type:"text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`ENSES_${parroquia.nombre.replace(/\s+/g,"_")}.txt`; a.click();
  };

  const handlePDF = async () => { setGenPDF(true); await exportarPDFParroquia(parroquia, header, filas); setGenPDF(false); };

  return (
    <div style={{ minHeight:"100vh", background:"#f0f4ff", fontFamily:"Inter, sans-serif" }}>
      {soloLectura && (
        <div style={{ background:"#7c4d00", color:"white", padding:"8px 20px", textAlign:"center", fontSize:13, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
          <IconEye/><span>Vista de <strong>solo lectura</strong> — los cambios no se guardan</span>
        </div>
      )}

      <div style={{ background:"#1A3A6B", color:"white" }}>
        <div style={{ maxWidth:1000, margin:"0 auto", padding: isMobile ? "10px 14px" : "0 20px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", minHeight: isMobile ? "auto" : 64 }}>
            <div style={{ display:"flex", alignItems:"center", gap: isMobile ? 10 : 14 }}>
              {!isMobile && <LogoRCCES size={48} />}
              <div>
                <div style={{ fontSize: isMobile ? 13 : 17, fontWeight:700, fontFamily:"Georgia, serif" }}>ENSES 2026{soloLectura ? " · Solo lectura" : ""}</div>
                <div style={{ fontSize: isMobile ? 11 : 12, opacity:0.8, maxWidth: isMobile ? 180 : "none", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{parroquia.nombre}</div>
              </div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap: isMobile ? 8 : 10 }}>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize: isMobile ? 10 : 12, opacity:0.7 }}>Cupo utilizado</div>
                <div style={{ fontSize: isMobile ? 14 : 18, fontWeight:800, color: pct>=90?"#ff8080":pct>=60?"#ffcc66":"#80ff99" }}>{totalPersonas}/{cupo}</div>
              </div>
              {!isMobile && (
                <div style={{ width:44, height:44, borderRadius:"50%", background:"rgba(255,255,255,0.1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color: pct>=90?"#ff8080":pct>=60?"#ffcc66":"#80ff99" }}>{pct}%</div>
              )}
              <button onClick={onLogout} style={{ display:"flex", gap:5, alignItems:"center", background:"transparent", color:"white", border:"1px solid rgba(255,255,255,0.4)", padding: isMobile ? "7px 10px" : "8px 14px", borderRadius:6, cursor:"pointer", fontSize: isMobile ? 12 : 13 }}>
                <IconLogout/> {!isMobile && "Salir"}
              </button>
            </div>
          </div>
          <div style={{ height:4, background:"rgba(255,255,255,0.15)", borderRadius:2, marginTop: isMobile ? 8 : 0 }}>
            <div style={{ width:`${pct}%`, height:"100%", background: pct>=90?"#ff6666":pct>=60?"#ffaa33":"#66cc88", borderRadius:2, transition:"width 0.5s" }}/>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1000, margin:"0 auto", padding: isMobile ? "14px 12px" : 20 }}>
        <div style={{ display:"flex", gap:8, marginBottom: isMobile ? 14 : 20 }}>
          {[["registro","📋 Registro"],["datos","🏛️ Datos parroquia"]].map(([id,label]) => (
            <button key={id} onClick={() => setTab(id)} style={{ flex:"1 1 auto", padding: isMobile ? "9px 8px" : "10px 20px", fontSize: isMobile ? 13 : 14, fontWeight:600, borderRadius:8, cursor:"pointer", background: tab===id ? "#1A3A6B" : "white", color: tab===id ? "white" : "#1A3A6B", border: tab===id ? "none" : "2px solid #1A3A6B" }}>{label}</button>
          ))}
        </div>

        {tab === "datos" && (
          <div style={{ background:"white", borderRadius:12, padding: isMobile ? "18px 14px" : 28, boxShadow:"0 2px 8px rgba(0,0,0,0.07)", marginBottom:14 }}>
            <h3 style={{ margin:"0 0 16px", color:"#1A3A6B", fontFamily:"Georgia, serif", fontSize: isMobile ? 15 : 17 }}>Datos generales</h3>
            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:14 }}>
              {CAMPOS_HEADER.map(campo => (
                <div key={campo} style={{ gridColumn: !isMobile && (campo==="Lugar (municipio/localidad)"||campo==="Enlace parroquial") ? "1/-1" : "auto" }}>
                  <label style={{ display:"block", fontSize:11, fontWeight:600, color:"#444", marginBottom:5, letterSpacing:0.5 }}>{campo.toUpperCase()}</label>
                  <input value={header[campo]||""} onChange={e => handleHeader(campo, e.target.value)} readOnly={soloLectura}
                    style={{ width:"100%", padding:"10px 12px", fontSize:14, border:"1.5px solid #ddd", borderRadius:7, outline:"none", boxSizing:"border-box", fontFamily:"Inter, sans-serif", transition:"border-color 0.2s", background: soloLectura ? "#f8f9fc" : "white", color: soloLectura ? "#555" : "inherit", cursor: soloLectura ? "default" : "text" }}
                    onFocus={e => { if (!soloLectura) e.target.style.borderColor="#1A3A6B"; }}
                    onBlur={e => e.target.style.borderColor="#ddd"} />
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "registro" && (
          <div style={{ background:"white", borderRadius:12, overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,0.07)", marginBottom:14 }}>
            <div style={{ padding: isMobile ? "12px 14px" : "16px 20px", borderBottom:"1px solid #eee", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <h3 style={{ margin:0, color:"#1A3A6B", fontSize: isMobile ? 14 : 16 }}>Lista de hospedaje</h3>
                <p style={{ margin:"3px 0 0", fontSize:11, color:"#888" }}>{filas.filter(f=>f.nombre).length} familias · {totalPersonas} personas ({totalH}H/{totalM}M/{totalMT}MT)</p>
              </div>
              {!soloLectura && (
                <button onClick={agregarFila} style={{ display:"flex", gap:5, alignItems:"center", background:"#f0f4ff", color:"#1A3A6B", border:"1.5px solid #1A3A6B", padding: isMobile ? "7px 10px" : "8px 14px", borderRadius:6, cursor:"pointer", fontSize:12, fontWeight:600, whiteSpace:"nowrap" }}>
                  <IconAdd/> {isMobile ? "+" : "Agregar fila"}
                </button>
              )}
            </div>
            <TablaPersonas filas={filas} onChange={handleFila} onEliminar={eliminarFila} soloLectura={soloLectura} />
          </div>
        )}

        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {!soloLectura && (
            <button onClick={guardar} style={{ display:"flex", gap:7, alignItems:"center", justifyContent:"center", background:"#1A3A6B", color:"white", border:"none", padding:"12px 20px", borderRadius:8, cursor:"pointer", fontSize:14, fontWeight:700, flex:"1 1 140px" }}>
              <IconSave/> {guardado ? "✓ Guardado" : "Guardar"}
            </button>
          )}
          <button onClick={exportarCSV} style={{ display:"flex", gap:7, alignItems:"center", justifyContent:"center", background:"white", color:"#1A3A6B", border:"2px solid #1A3A6B", padding:"12px 16px", borderRadius:8, cursor:"pointer", fontSize:14, fontWeight:600, flex:"1 1 100px" }}><IconDownload/> CSV</button>
          <button onClick={exportarTexto} style={{ display:"flex", gap:7, alignItems:"center", justifyContent:"center", background:"white", color:"#555", border:"2px solid #ddd", padding:"12px 16px", borderRadius:8, cursor:"pointer", fontSize:14, fontWeight:600, flex:"1 1 100px" }}><IconDownload/> TXT</button>
          <button onClick={handlePDF} disabled={genPDF} style={{ display:"flex", gap:7, alignItems:"center", justifyContent:"center", background: genPDF ? "#bbb" : "#8B0000", color:"white", border:"none", padding:"12px 16px", borderRadius:8, cursor: genPDF ? "not-allowed" : "pointer", fontSize:14, fontWeight:600, flex:"1 1 100px" }}><IconPDF/> {genPDF ? "PDF..." : "PDF"}</button>
        </div>

        {guardado && <div style={{ marginTop:10, padding:"11px 14px", background:"#e8f8ee", border:"1px solid #aaddbb", borderRadius:8, color:"#1a6b3a", fontSize:13, fontWeight:600 }}>✓ Lista guardada correctamente</div>}

        <div style={{ marginTop:20, textAlign:"center", fontSize:11, color:"#999", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <LogoRCCES size={isMobile ? 40 : 52} />
          <span>Sistema ENSES 2026 · Diócesis Valle de Chalco</span>
          <LogoDiocesis size={isMobile ? 40 : 52} />
        </div>
      </div>
    </div>
  );
}

// ─── APP PRINCIPAL ────────────────────────────────────────────────────────────
export default function App() {
  const [parroquiaActiva, setParroquiaActiva] = useState(null);
  const [parroquias, setParroquias]           = useState([]);
  const [datos, setDatos]                     = useState({});
  const [cargando, setCargando]               = useState(false);

  const db = useMemo(
    () => parroquiaActiva ? supabaseConCodigo(parroquiaActiva.codigoHeader) : null,
    [parroquiaActiva]
  );

  useEffect(() => {
    if (!parroquiaActiva || !db) return;
    let montado = true;
    setCargando(true);

    cargarDatos(db).then(({ datos: d, parroquias: p }) => {
      if (!montado) return;
      setDatos(d); setParroquias(p); setCargando(false);
    });

    const actualizarTodo = () => {
      if (!montado) return;
      cargarDatos(db).then(({ datos: d, parroquias: p }) => { if (!montado) return; setDatos(d); setParroquias(p); });
    };

    const ch1 = supabase.channel("personas-realtime").on("postgres_changes", { event:"*", schema:"public", table:"personas" }, actualizarTodo).subscribe();
    const ch2 = supabase.channel("parroquias-realtime").on("postgres_changes", { event:"*", schema:"public", table:"parroquias" }, actualizarTodo).subscribe();

    return () => { montado = false; supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [parroquiaActiva, db]);

  const handleLogin  = (p) => setParroquiaActiva(p);
  const handleLogout = () => { setParroquiaActiva(null); setDatos({}); setParroquias([]); };

  const recargar = async () => {
    if (!db) return;
    const { datos: d, parroquias: p } = await cargarDatos(db);
    setDatos(d); setParroquias(p);
  };

  if (!parroquiaActiva) return <PantallaLogin onLogin={handleLogin} />;
  if (cargando)         return <PantallaCargando />;

  if (parroquiaActiva.esAdmin || parroquiaActiva.esCoordinador) {
    return (
      <VistaAdmin
        parroquias={parroquias}
        datos={datos}
        db={db}
        onLogout={handleLogout}
        recargar={recargar}
        esCoordinador={parroquiaActiva.esCoordinador ?? false}
        coordinadorCodigo={parroquiaActiva.codigo ?? ""}
      />
    );
  }

  return (
    <VistaParroquia
      parroquia={parroquiaActiva}
      datos={datos}
      setDatos={setDatos}
      db={db}
      soloLectura={parroquiaActiva.soloLectura}
      onLogout={handleLogout}
    />
  );
}
