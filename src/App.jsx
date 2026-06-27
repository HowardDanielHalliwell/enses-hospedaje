import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

// ─── DATOS DE DEMO ────────────────────────────────────────────────────────────
const PARROQUIAS_DEMO = [
  { codigo: "ADMIN2025", nombre: "ADMINISTRADOR GENERAL", esAdmin: true, cupo: 9999, decanato: "Todos", vicaria: "Todas" },
  { codigo: "SGDO001",   nombre: "Sagrado Corazón de Jesús", esAdmin: false, cupo: 100, decanato: "Decanato I", vicaria: "Vicaría Norte" },
  { codigo: "GRDL002",   nombre: "Nuestra Señora de Guadalupe", esAdmin: false, cupo: 150, decanato: "Decanato II", vicaria: "Vicaría Sur" },
  { codigo: "SNJN003",   nombre: "San Juan Diego", esAdmin: false, cupo: 200, decanato: "Decanato III", vicaria: "Vicaría Centro" },
  { codigo: "SNJP004",   nombre: "San José Obrero", esAdmin: false, cupo: 100, decanato: "Decanato I", vicaria: "Vicaría Norte" },
];

const CAMPOS_HEADER = ["Vicaria", "Decanato", "Parroquia", "Sacerdote", "Lugar (municipio/localidad)", "Enlace parroquial", "Teléfono"];

const fila_vacia = () => ({ nombre: "", telefono: "", direccion: "", cantidad: "", h: "", m: "", mt: "" });

async function cargarDatos() {
  const [{ data: parroquias }, { data: personas }] = await Promise.all([
    supabase.from("parroquias").select("*"),
    supabase.from("personas").select("*").order("posicion"),
  ]);

  const datos = {};
  for (const p of parroquias || []) {
    const filasP = (personas || [])
      .filter(per => per.parroquia_codigo === p.codigo)
      .map(per => ({
        nombre:    per.nombre    || "",
        telefono:  per.telefono  || "",
        direccion: per.direccion || "",
        cantidad:  per.cantidad  != null ? String(per.cantidad) : "",
        h:         per.h         != null ? String(per.h)        : "",
        m:         per.m         != null ? String(per.m)        : "",
        mt:        per.mt        != null ? String(per.mt)       : "",
      }));

    datos[p.codigo] = {
      header: {
        "Vicaria":                     p.vicaria            || "",
        "Decanato":                    p.decanato           || "",
        "Parroquia":                   p.nombre             || "",
        "Sacerdote":                   p.sacerdote          || "",
        "Lugar (municipio/localidad)": p.lugar              || "",
        "Enlace parroquial":           p.enlace_parroquial  || "",
        "Teléfono":                    p.telefono_contacto  || "",
      },
      filas: filasP.length > 0 ? filasP : Array(20).fill(null).map(fila_vacia),
    };
  }
  return datos;
}

async function guardarDatos(codigo, filas, header) {
  await supabase.from("parroquias").update({
    sacerdote:         header["Sacerdote"]                   || "",
    lugar:             header["Lugar (municipio/localidad)"] || "",
    enlace_parroquial: header["Enlace parroquial"]           || "",
    telefono_contacto: header["Teléfono"]                    || "",
  }).eq("codigo", codigo);

  await supabase.from("personas").delete().eq("parroquia_codigo", codigo);

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

  if (rows.length > 0) {
    await supabase.from("personas").insert(rows);
  }
}

// ─── ICONOS SVG ──────────────────────────────────────────────────────────────
const IconLogout = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);
const IconDownload = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);
const IconSave = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
  </svg>
);
const IconAdd = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
  </svg>
);
const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);

// ─── LOGOS (SVG embebidos simplificados) ─────────────────────────────────────
const LogoRCCES = () => (
  <img src="/Valle de Chalco RCCES.png" width={64} height={64} style={{ borderRadius: "50%", flexShrink: 0 }} alt="RCCES Valle de Chalco" />
);

const LogoDiocesis = () => (
  <img src="/Diocesis Valle de Chalco.png" width={64} height={64} style={{ borderRadius: "50%", flexShrink: 0 }} alt="Diócesis Valle de Chalco" />
);

// ─── PANTALLA LOGIN ───────────────────────────────────────────────────────────
function PantallaLogin({ onLogin }) {
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const handleLogin = () => {
    setError("");
    setCargando(true);
    setTimeout(() => {
      const p = PARROQUIAS_DEMO.find(p => p.codigo === codigo.trim().toUpperCase());
      if (p) { onLogin(p); }
      else { setError("Código incorrecto. Verifica con el coordinador del evento."); }
      setCargando(false);
    }, 600);
  };

  return (
    <div style={{
      minHeight: "100vh", background: "linear-gradient(135deg, #0d2347 0%, #1A3A6B 50%, #2a5298 100%)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "Inter, sans-serif"
    }}>
      <div style={{
        background: "white", borderRadius: 16, padding: "48px 40px",
        width: "100%", maxWidth: 420, boxShadow: "0 25px 60px rgba(0,0,0,0.4)"
      }}>
        {/* Logos */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
          <LogoRCCES />
          <div style={{ textAlign: "center", flex: 1, padding: "0 12px" }}>
            <div style={{ fontSize: 11, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>Sistema de Registro</div>
            <div style={{ fontSize: 22, fontWeight: "bold", color: "#1A3A6B", fontFamily: "Georgia, serif", lineHeight: 1.2 }}>ENSES 2026</div>
            <div style={{ fontSize: 11, color: "#8B0000", marginTop: 2 }}>Control de Hospedaje</div>
          </div>
          <LogoDiocesis />
        </div>

        <div style={{ borderTop: "1px solid #eee", paddingTop: 32 }}>
          <p style={{ color: "#444", fontSize: 14, marginBottom: 24, textAlign: "center" }}>
            Ingresa el código único de tu parroquia para acceder a tu lista de hospedaje.
          </p>

          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#1A3A6B", marginBottom: 6, letterSpacing: 1 }}>
            CÓDIGO DE PARROQUIA
          </label>
          <input
            value={codigo}
            onChange={e => setCodigo(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            placeholder="Ej: SGDO001"
            style={{
              width: "100%", padding: "12px 16px", fontSize: 16, fontFamily: "monospace",
              border: "2px solid #ddd", borderRadius: 8, outline: "none",
              letterSpacing: 3, textAlign: "center", boxSizing: "border-box",
              transition: "border-color 0.2s"
            }}
            onFocus={e => e.target.style.borderColor = "#1A3A6B"}
            onBlur={e => e.target.style.borderColor = "#ddd"}
          />

          {error && (
            <div style={{ background: "#fff3f3", border: "1px solid #ffcccc", borderRadius: 6, padding: "10px 14px", marginTop: 12, color: "#cc0000", fontSize: 13 }}>
              {error}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={!codigo || cargando}
            style={{
              width: "100%", marginTop: 20, padding: "14px", fontSize: 15, fontWeight: 700,
              background: codigo && !cargando ? "#1A3A6B" : "#9ba8c0",
              color: "white", border: "none", borderRadius: 8, cursor: codigo && !cargando ? "pointer" : "not-allowed",
              transition: "background 0.2s", letterSpacing: 0.5
            }}
          >
            {cargando ? "Verificando..." : "Acceder"}
          </button>

          <div style={{ marginTop: 24, padding: "12px 16px", background: "#f0f4ff", borderRadius: 8, fontSize: 12, color: "#444" }}>
            <strong>Códigos de demo:</strong><br/>
            SGDO001 · GRDL002 · SNJN003 · SNJP004<br/>
            <span style={{ color: "#8B0000" }}>Admin: ADMIN2025</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── VISTA ADMIN ──────────────────────────────────────────────────────────────
function VistaAdmin({ datos, onLogout }) {
  const [tabActiva, setTabActiva] = useState(null);
  const parroquias = PARROQUIAS_DEMO.filter(p => !p.esAdmin);

  const totalGeneral = parroquias.reduce((acc, p) => {
    const filas = datos[p.codigo]?.filas || [];
    return acc + filas.reduce((s, f) => s + (parseInt(f.cantidad) || 0), 0);
  }, 0);

  const exportarCSV = () => {
    let csv = "Parroquia,Nombre,Teléfono,Dirección,Cantidad,H,M,MT\n";
    parroquias.forEach(p => {
      const filas = datos[p.codigo]?.filas || [];
      filas.forEach(f => {
        if (f.nombre) csv += `"${p.nombre}","${f.nombre}","${f.telefono}","${f.direccion}","${f.cantidad}","${f.h}","${f.m}","${f.mt}"\n`;
      });
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "ENSES_Hospedaje_General.csv"; a.click();
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f0f4ff", fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#1A3A6B", color: "white", padding: "0 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <LogoRCCES />
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "Georgia, serif" }}>ENSES 2026 — Panel General</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Vista Administrador · {parroquias.length} parroquias</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button onClick={exportarCSV} style={{ display:"flex", gap:6, alignItems:"center", background:"#2a5298", color:"white", border:"none", padding:"8px 16px", borderRadius:6, cursor:"pointer", fontSize:13 }}>
              <IconDownload/> Exportar todo (CSV)
            </button>
            <button onClick={onLogout} style={{ display:"flex", gap:6, alignItems:"center", background:"transparent", color:"white", border:"1px solid rgba(255,255,255,0.4)", padding:"8px 16px", borderRadius:6, cursor:"pointer", fontSize:13 }}>
              <IconLogout/> Salir
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        {/* Resumen */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:16, marginBottom:28 }}>
          <TarjetaStat label="Total hospedados registrados" valor={totalGeneral} color="#1A3A6B"/>
          <TarjetaStat label="Parroquias participantes" valor={parroquias.length} color="#2a5298"/>
          <TarjetaStat label="Cupos totales disponibles" valor={parroquias.reduce((a,p)=>a+p.cupo,0)} color="#8B0000"/>
          <TarjetaStat label="Cupos disponibles restantes" valor={parroquias.reduce((a,p)=>a+p.cupo,0) - totalGeneral} color="#2a7a3a"/>
        </div>

        {/* Tabla por parroquia */}
        <div style={{ background:"white", borderRadius:12, overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,0.08)" }}>
          <div style={{ padding:"16px 20px", borderBottom:"1px solid #eee", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <h3 style={{ margin:0, color:"#1A3A6B", fontSize:16 }}>Estado por parroquia</h3>
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:14 }}>
            <thead>
              <tr style={{ background:"#f8f9fc" }}>
                {["Parroquia","Decanato","Vicaría","Registrados","Cupo máx.","Disponibles","Llenado"].map(h => (
                  <th key={h} style={{ padding:"10px 14px", textAlign:"left", color:"#444", fontWeight:600, borderBottom:"1px solid #eee", whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parroquias.map(p => {
                const filas = datos[p.codigo]?.filas || [];
                const reg = filas.reduce((s,f) => s+(parseInt(f.cantidad)||0), 0);
                const pct = Math.min(100, Math.round((reg/p.cupo)*100));
                const color = pct >= 90 ? "#cc0000" : pct >= 60 ? "#e07b00" : "#2a7a3a";
                return (
                  <tr key={p.codigo} style={{ borderBottom:"1px solid #f0f0f0", cursor:"pointer" }}
                    onClick={() => setTabActiva(tabActiva === p.codigo ? null : p.codigo)}
                    onMouseEnter={e => e.currentTarget.style.background="#f8f9ff"}
                    onMouseLeave={e => e.currentTarget.style.background="white"}>
                    <td style={{ padding:"10px 14px", fontWeight:600, color:"#1A3A6B" }}>{p.nombre}</td>
                    <td style={{ padding:"10px 14px", color:"#555" }}>{p.decanato}</td>
                    <td style={{ padding:"10px 14px", color:"#555" }}>{p.vicaria}</td>
                    <td style={{ padding:"10px 14px", fontWeight:700 }}>{reg}</td>
                    <td style={{ padding:"10px 14px", color:"#888" }}>{p.cupo}</td>
                    <td style={{ padding:"10px 14px", color, fontWeight:600 }}>{p.cupo - reg}</td>
                    <td style={{ padding:"10px 14px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div style={{ flex:1, height:8, background:"#eee", borderRadius:4 }}>
                          <div style={{ width:`${pct}%`, height:"100%", background:color, borderRadius:4, transition:"width 0.5s" }}/>
                        </div>
                        <span style={{ color, fontSize:12, fontWeight:700, minWidth:36 }}>{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Vista expandida */}
        {tabActiva && (() => {
          const p = PARROQUIAS_DEMO.find(x => x.codigo === tabActiva);
          const filas = datos[tabActiva]?.filas || [];
          return (
            <div style={{ marginTop:16, background:"white", borderRadius:12, padding:20, boxShadow:"0 2px 8px rgba(0,0,0,0.08)" }}>
              <h4 style={{ margin:"0 0 16px", color:"#1A3A6B" }}>Detalle: {p.nombre}</h4>
              <TablaPersonas filas={filas} soloLectura={true} />
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function TarjetaStat({ label, valor, color }) {
  return (
    <div style={{ background:"white", borderRadius:10, padding:"20px 24px", boxShadow:"0 2px 8px rgba(0,0,0,0.07)", borderLeft:`4px solid ${color}` }}>
      <div style={{ fontSize:32, fontWeight:800, color }}>{valor}</div>
      <div style={{ fontSize:13, color:"#666", marginTop:4 }}>{label}</div>
    </div>
  );
}

// ─── TABLA DE PERSONAS ────────────────────────────────────────────────────────
function TablaPersonas({ filas, onChange, soloLectura, onEliminar }) {
  const cols = [
    { key:"nombre",    label:"NOMBRE",              w:"20%" },
    { key:"telefono",  label:"TELÉFONO",             w:"14%" },
    { key:"direccion", label:"DIRECCIÓN",             w:"24%" },
    { key:"cantidad",  label:"CANTIDAD A HOSPEDAR",  w:"13%" },
    { key:"h",         label:"H",                    w:"7%" },
    { key:"m",         label:"M",                    w:"7%" },
    { key:"mt",        label:"MT",                   w:"7%" },
  ];

  const totalPersonas = filas.reduce((s,f) => s+(parseInt(f.cantidad)||0), 0);
  const totalH = filas.reduce((s,f) => s+(parseInt(f.h)||0), 0);
  const totalM = filas.reduce((s,f) => s+(parseInt(f.m)||0), 0);
  const totalMT = filas.reduce((s,f) => s+(parseInt(f.mt)||0), 0);

  return (
    <div style={{ overflowX:"auto" }}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
        <thead>
          <tr style={{ background:"#1A3A6B" }}>
            <th style={{ padding:"10px 8px", color:"white", width:"4%", textAlign:"center" }}>P.</th>
            {cols.map(c => (
              <th key={c.key} style={{ padding:"10px 8px", color:"white", width:c.w, textAlign:"left", fontWeight:600, letterSpacing:0.5 }}>{c.label}</th>
            ))}
            {!soloLectura && <th style={{ width:"4%", background:"#1A3A6B" }}/>}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, i) => (
            <tr key={i} style={{ background: i%2===0 ? "white" : "#fafbff" }}>
              <td style={{ padding:"7px 8px", textAlign:"center", color:"#888", fontSize:12, borderBottom:"1px solid #eef" }}>{i+1}</td>
              {cols.map(c => (
                <td key={c.key} style={{ padding:"4px 6px", borderBottom:"1px solid #eef" }}>
                  {soloLectura ? (
                    <span style={{ padding:"5px 4px", display:"block" }}>{fila[c.key] || "—"}</span>
                  ) : (
                    <input
                      value={fila[c.key]}
                      onChange={e => onChange(i, c.key, e.target.value)}
                      type={["cantidad","h","m","mt"].includes(c.key) ? "number" : "text"}
                      min={0}
                      style={{
                        width:"100%", border:"none", background:"transparent", padding:"5px 4px",
                        fontSize:13, fontFamily:"Inter, sans-serif", outline:"none", boxSizing:"border-box",
                        color:"#1A3A6B",
                        borderBottom:"1px solid transparent", transition:"border-color 0.2s"
                      }}
                      onFocus={e => { e.target.style.background="#f0f4ff"; e.target.style.borderBottomColor="#1A3A6B"; }}
                      onBlur={e => { e.target.style.background="transparent"; e.target.style.borderBottomColor="transparent"; }}
                    />
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
            <td colSpan={4} style={{ padding:"10px 8px", color:"#1A3A6B", textAlign:"right", borderTop:"2px solid #1A3A6B" }}>TOTAL</td>
            <td style={{ padding:"10px 8px", color:"#1A3A6B", borderTop:"2px solid #1A3A6B" }}>{totalPersonas}</td>
            <td style={{ padding:"10px 8px", color:"#1A3A6B", borderTop:"2px solid #1A3A6B" }}>{totalH}</td>
            <td style={{ padding:"10px 8px", color:"#1A3A6B", borderTop:"2px solid #1A3A6B" }}>{totalM}</td>
            <td style={{ padding:"10px 8px", color:"#1A3A6B", borderTop:"2px solid #1A3A6B" }}>{totalMT}</td>
            {!soloLectura && <td style={{ borderTop:"2px solid #1A3A6B" }}/>}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── VISTA PARROQUIA ──────────────────────────────────────────────────────────
function VistaParroquia({ parroquia, datos, setDatos, onLogout }) {
  const datosP = datos[parroquia.codigo] || { header: {}, filas: Array(20).fill(null).map(fila_vacia) };
  const [header, setHeader] = useState(datosP.header || {});
  const [filas, setFilas] = useState(datosP.header ? datosP.filas : Array(20).fill(null).map(fila_vacia));
  const [guardado, setGuardado] = useState(false);
  const [tab, setTab] = useState("registro");

  const totalPersonas = filas.reduce((s,f) => s+(parseInt(f.cantidad)||0), 0);
  const totalH = filas.reduce((s,f) => s+(parseInt(f.h)||0), 0);
  const totalM = filas.reduce((s,f) => s+(parseInt(f.m)||0), 0);
  const totalMT = filas.reduce((s,f) => s+(parseInt(f.mt)||0), 0);
  const pct = Math.min(100, Math.round((totalPersonas/parroquia.cupo)*100));
  const colorPct = pct >= 90 ? "#cc0000" : pct >= 60 ? "#e07b00" : "#2a7a3a";

  const handleHeader = (campo, valor) => setHeader(h => ({ ...h, [campo]: valor }));

  const handleFila = (i, campo, valor) => {
    setFilas(fs => { const n = [...fs]; n[i] = { ...n[i], [campo]: valor }; return n; });
  };

  const agregarFila = () => setFilas(fs => [...fs, fila_vacia()]);

  const eliminarFila = (i) => setFilas(fs => fs.filter((_,idx) => idx !== i));

  const guardar = async () => {
    const nuevo = { ...datos, [parroquia.codigo]: { header, filas } };
    setDatos(nuevo);
    await guardarDatos(parroquia.codigo, filas, header);
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
  };

  const exportarCSV = () => {
    let csv = `ENSES 2026 - Control de Hospedaje\n`;
    csv += `Parroquia:,${parroquia.nombre}\n\n`;
    csv += `P.,NOMBRE,TELÉFONO,DIRECCIÓN,CANTIDAD,H,M,MT\n`;
    filas.forEach((f,i) => {
      if (f.nombre) csv += `${i+1},"${f.nombre}","${f.telefono}","${f.direccion}","${f.cantidad}","${f.h}","${f.m}","${f.mt}"\n`;
    });
    csv += `\nTOTAL,,,,${totalPersonas},${totalH},${totalM},${totalMT}\n`;
    const blob = new Blob(["\uFEFF"+csv], { type:"text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`ENSES_${parroquia.nombre.replace(/\s+/g,"_")}.csv`; a.click();
  };

  const exportarTexto = () => {
    let txt = `ENSES 2026 - CONTROL DE HOSPEDAJE\n${"=".repeat(50)}\n\n`;
    txt += `Parroquia: ${parroquia.nombre}\n`;
    txt += `Vicaria: ${header["Vicaria"]||""}\n`;
    txt += `Decanato: ${header["Decanato"]||""}\n`;
    txt += `Sacerdote: ${header["Sacerdote"]||""}\n`;
    txt += `Lugar: ${header["Lugar (municipio/localidad)"]||""}\n`;
    txt += `Enlace parroquial: ${header["Enlace parroquial"]||""}\n`;
    txt += `Teléfono: ${header["Teléfono"]||""}\n\n`;
    txt += `${"─".repeat(80)}\n`;
    txt += `N°  ${"NOMBRE".padEnd(25)} ${"TELÉFONO".padEnd(15)} ${"DIRECCIÓN".padEnd(25)} CANT  H   M   MT\n`;
    txt += `${"─".repeat(85)}\n`;
    filas.forEach((f,i) => {
      if(f.nombre) txt += `${String(i+1).padStart(2)}. ${(f.nombre||"").padEnd(25)} ${(f.telefono||"").padEnd(15)} ${(f.direccion||"").padEnd(25)} ${String(f.cantidad||"").padEnd(5)} ${String(f.h||"").padEnd(3)} ${String(f.m||"").padEnd(3)} ${f.mt||""}\n`;
    });
    txt += `${"─".repeat(85)}\n`;
    txt += `TOTAL:${" ".repeat(62)}${String(totalPersonas).padEnd(5)} ${String(totalH).padEnd(3)} ${String(totalM).padEnd(3)} ${totalMT}\n`;
    const blob = new Blob([txt], { type:"text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`ENSES_${parroquia.nombre.replace(/\s+/g,"_")}.txt`; a.click();
  };

  return (
    <div style={{ minHeight:"100vh", background:"#f0f4ff", fontFamily:"Inter, sans-serif" }}>
      {/* Header */}
      <div style={{ background:"#1A3A6B", color:"white" }}>
        <div style={{ maxWidth:1000, margin:"0 auto", padding:"0 20px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", height:64 }}>
            <div style={{ display:"flex", alignItems:"center", gap:14 }}>
              <LogoRCCES />
              <div>
                <div style={{ fontSize:17, fontWeight:700, fontFamily:"Georgia, serif" }}>ENSES 2026</div>
                <div style={{ fontSize:12, opacity:0.8 }}>{parroquia.nombre}</div>
              </div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              {/* Indicador de cupo */}
              <div style={{ textAlign:"right", marginRight:8 }}>
                <div style={{ fontSize:12, opacity:0.7 }}>Cupo utilizado</div>
                <div style={{ fontSize:18, fontWeight:800, color: pct>=90?"#ff8080":pct>=60?"#ffcc66":"#80ff99" }}>
                  {totalPersonas} / {parroquia.cupo}
                </div>
              </div>
              <div style={{ width:48, height:48, borderRadius:"50%", background:"rgba(255,255,255,0.1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, color: pct>=90?"#ff8080":pct>=60?"#ffcc66":"#80ff99" }}>
                {pct}%
              </div>
              <button onClick={onLogout} style={{ display:"flex", gap:6, alignItems:"center", background:"transparent", color:"white", border:"1px solid rgba(255,255,255,0.4)", padding:"8px 14px", borderRadius:6, cursor:"pointer", fontSize:13, marginLeft:8 }}>
                <IconLogout/> Salir
              </button>
            </div>
          </div>

          {/* Barra de progreso */}
          <div style={{ height:4, background:"rgba(255,255,255,0.15)", borderRadius:2, marginBottom:0 }}>
            <div style={{ width:`${pct}%`, height:"100%", background: pct>=90?"#ff6666":pct>=60?"#ffaa33":"#66cc88", borderRadius:2, transition:"width 0.5s" }}/>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1000, margin:"0 auto", padding:20 }}>

        {/* Tabs */}
        <div style={{ display:"flex", gap:8, marginBottom:20 }}>
          {[["registro","📋 Registro de personas"],["datos","🏛️ Datos de la parroquia"]].map(([id,label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              padding:"10px 20px", fontSize:14, fontWeight:600, borderRadius:8, cursor:"pointer",
              background: tab===id ? "#1A3A6B" : "white",
              color: tab===id ? "white" : "#1A3A6B",
              border: tab===id ? "none" : "2px solid #1A3A6B",
              transition:"all 0.2s"
            }}>{label}</button>
          ))}
        </div>

        {tab === "datos" && (
          <div style={{ background:"white", borderRadius:12, padding:28, boxShadow:"0 2px 8px rgba(0,0,0,0.07)", marginBottom:16 }}>
            <h3 style={{ margin:"0 0 20px", color:"#1A3A6B", fontFamily:"Georgia, serif" }}>Datos generales de la parroquia</h3>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              {CAMPOS_HEADER.map(campo => (
                <div key={campo} style={{ gridColumn: campo==="Lugar (municipio/localidad)" || campo==="Enlace parroquial" ? "1/-1" : "auto" }}>
                  <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#444", marginBottom:6, letterSpacing:0.5 }}>{campo.toUpperCase()}</label>
                  <input
                    value={header[campo]||""}
                    onChange={e => handleHeader(campo, e.target.value)}
                    style={{
                      width:"100%", padding:"10px 14px", fontSize:14,
                      border:"1.5px solid #ddd", borderRadius:7, outline:"none", boxSizing:"border-box",
                      fontFamily:"Inter, sans-serif", transition:"border-color 0.2s"
                    }}
                    onFocus={e => e.target.style.borderColor="#1A3A6B"}
                    onBlur={e => e.target.style.borderColor="#ddd"}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "registro" && (
          <div style={{ background:"white", borderRadius:12, overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,0.07)", marginBottom:16 }}>
            <div style={{ padding:"16px 20px", borderBottom:"1px solid #eee", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <h3 style={{ margin:0, color:"#1A3A6B", fontSize:16 }}>Lista de hospedaje</h3>
                <p style={{ margin:"4px 0 0", fontSize:12, color:"#888" }}>
                  {filas.filter(f=>f.nombre).length} familias · {totalPersonas} personas ({totalH}H / {totalM}M / {totalMT}MT)
                </p>
              </div>
              <button onClick={agregarFila} style={{
                display:"flex", gap:6, alignItems:"center",
                background:"#f0f4ff", color:"#1A3A6B", border:"1.5px solid #1A3A6B",
                padding:"8px 14px", borderRadius:6, cursor:"pointer", fontSize:13, fontWeight:600
              }}>
                <IconAdd/> Agregar fila
              </button>
            </div>
            <TablaPersonas filas={filas} onChange={handleFila} onEliminar={eliminarFila} soloLectura={false} />
          </div>
        )}

        {/* Barra de acciones */}
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <button onClick={guardar} style={{
            display:"flex", gap:8, alignItems:"center",
            background:"#1A3A6B", color:"white", border:"none",
            padding:"12px 24px", borderRadius:8, cursor:"pointer", fontSize:14, fontWeight:700, flex:"1 1 160px"
          }}>
            <IconSave/> {guardado ? "✓ Guardado" : "Guardar cambios"}
          </button>
          <button onClick={exportarCSV} style={{
            display:"flex", gap:8, alignItems:"center",
            background:"white", color:"#1A3A6B", border:"2px solid #1A3A6B",
            padding:"12px 20px", borderRadius:8, cursor:"pointer", fontSize:14, fontWeight:600, flex:"1 1 130px"
          }}>
            <IconDownload/> Exportar CSV
          </button>
          <button onClick={exportarTexto} style={{
            display:"flex", gap:8, alignItems:"center",
            background:"white", color:"#555", border:"2px solid #ddd",
            padding:"12px 20px", borderRadius:8, cursor:"pointer", fontSize:14, fontWeight:600, flex:"1 1 130px"
          }}>
            <IconDownload/> Exportar TXT
          </button>
        </div>

        {guardado && (
          <div style={{ marginTop:12, padding:"12px 16px", background:"#e8f8ee", border:"1px solid #aaddbb", borderRadius:8, color:"#1a6b3a", fontSize:13, fontWeight:600 }}>
            ✓ Lista guardada correctamente
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop:24, textAlign:"center", fontSize:12, color:"#999", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <LogoRCCES />
          <span>Sistema ENSES 2026 · Diócesis Valle de Chalco · Control de Hospedaje</span>
          <LogoDiocesis />
        </div>
      </div>
    </div>
  );
}

// ─── APP PRINCIPAL ────────────────────────────────────────────────────────────
export default function App() {
  const [parroquiaActiva, setParroquiaActiva] = useState(null);
  const [datos, setDatos] = useState({});
  const [iniciando, setIniciando] = useState(true);

  useEffect(() => {
    cargarDatos().then(d => {
      setDatos(d);
      setIniciando(false);
    });

    const channel = supabase
      .channel("personas-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "personas" }, () => {
        cargarDatos().then(setDatos);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  if (iniciando) return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0d2347 0%, #1A3A6B 50%, #2a5298 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "Inter, sans-serif", flexDirection: "column", gap: 16
    }}>
      <div style={{
        width: 40, height: 40, border: "4px solid rgba(255,255,255,0.3)",
        borderTopColor: "white", borderRadius: "50%",
        animation: "spin 0.8s linear infinite"
      }}/>
      <div style={{ color: "white", fontSize: 16 }}>Cargando datos...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return parroquiaActiva === null
    ? <PantallaLogin onLogin={setParroquiaActiva} />
    : parroquiaActiva.esAdmin
      ? <VistaAdmin datos={datos} onLogout={() => setParroquiaActiva(null)} />
      : <VistaParroquia
          parroquia={parroquiaActiva}
          datos={datos}
          setDatos={setDatos}
          onLogout={() => setParroquiaActiva(null)}
        />;
}
