/**
 * Ilustraciones propias del sistema (SVG en línea, sin imágenes externas): nítidas en cualquier pantalla y ligeras.
 * Paleta institucional: azules del sistema + acentos ámbar, verde y coral.
 *   <Ilustracion tipo="login" />       escena principal de la pantalla de ingreso
 *   <Ilustracion tipo="bienvenida" />  cabecera de la bienvenida al entrar
 *   <Ilustracion tipo="espera" />      solicitud enviada, esperando asignación
 *   <Ilustracion tipo="vacio" />       listas sin resultados
 *   <Ilustracion tipo="evaluado" />    evaluación registrada (tutor)
 */
const C = { azul: '#0b3d91', medio: '#2563eb', claro: '#e8eefb', claro2: '#c9d8f7', ambar: '#f5b83d', verde: '#22a06b', coral: '#ff7a6b', piel: '#f1c7a1', piel2: '#b97a52', blanco: '#fff', tinta: '#1b2230' };

function Login() {
  return (
    <svg viewBox="0 0 520 420" role="img" aria-label="Estudiantes en práctica con su bitácora de seguimiento">
      <circle cx="270" cy="210" r="190" fill={C.claro} />
      <circle cx="430" cy="70" r="26" fill={C.ambar} opacity=".9" />
      {/* universidad */}
      <path d="M150 170 L270 110 L390 170 Z" fill={C.azul} />
      <rect x="160" y="170" width="220" height="14" fill={C.medio} />
      {[180, 225, 270, 315, 360].map((x) => <rect key={x} x={x - 9} y="184" width="18" height="112" fill={C.blanco} stroke={C.claro2} strokeWidth="2" />)}
      <rect x="150" y="296" width="240" height="16" rx="3" fill={C.azul} />
      <circle cx="270" cy="148" r="11" fill={C.ambar} />
      <path d="M270 110 V78" stroke={C.azul} strokeWidth="3" /><path d="M270 78 h26 l-6 8 6 8 h-26 z" fill={C.coral} />
      {/* tarjeta de progreso */}
      <g transform="translate(36 120)">
        <rect width="128" height="96" rx="12" fill={C.blanco} filter="url(#sombra)" />
        <text x="14" y="24" fontSize="11" fontWeight="700" fill={C.azul}>Horas</text>
        {[[16, 40], [38, 28], [60, 50], [82, 62]].map(([x, h], n) => <rect key={x} x={x} y={84 - h} width="14" height={h} rx="3" fill={n === 3 ? C.verde : C.medio} />)}
      </g>
      {/* bitácora */}
      <g transform="translate(372 196) rotate(6)">
        <rect width="112" height="136" rx="12" fill={C.blanco} filter="url(#sombra)" />
        <rect x="38" y="-8" width="36" height="16" rx="5" fill={C.azul} />
        {[30, 58, 86, 114].map((y, n) => <g key={y}>
          <circle cx="22" cy={y} r="8" fill={n < 3 ? C.verde : C.claro2} />
          {n < 3 && <path d={`M18 ${y} l3 3 6-6`} stroke={C.blanco} strokeWidth="2.4" fill="none" strokeLinecap="round" />}
          <rect x="38" y={y - 4} width={n === 3 ? 40 : 56} height="8" rx="4" fill={C.claro} />
        </g>)}
      </g>
      {/* estudiante con birrete */}
      <g transform="translate(206 250)">
        <ellipse cx="64" cy="152" rx="70" ry="10" fill={C.azul} opacity=".12" />
        <path d="M24 150 q0 -64 40 -64 q40 0 40 64 z" fill={C.medio} />
        <path d="M52 92 l12 18 12 -18" fill={C.blanco} />
        <circle cx="64" cy="62" r="24" fill={C.piel} />
        <path d="M40 58 q4 -22 24 -22 q22 0 24 22 q-10 -10 -24 -10 q-14 0 -24 10z" fill={C.tinta} />
        <path d="M30 38 L64 24 L98 38 L64 52 Z" fill={C.tinta} /><path d="M94 40 v18" stroke={C.ambar} strokeWidth="3" /><circle cx="94" cy="60" r="4" fill={C.ambar} />
        <rect x="92" y="108" width="42" height="30" rx="5" fill={C.ambar} transform="rotate(-12 113 123)" />
      </g>
      {/* compañera con portátil */}
      <g transform="translate(84 262)">
        <path d="M14 140 q0 -58 36 -58 q36 0 36 58 z" fill={C.coral} />
        <circle cx="50" cy="58" r="22" fill={C.piel2} />
        <path d="M26 62 q-2 -30 24 -30 q26 0 24 30 q-2 22 -6 30 q2 -26 -18 -34 q-20 8 -18 34 q-4 -8 -6 -30z" fill={C.tinta} />
        <rect x="20" y="104" width="64" height="40" rx="4" fill={C.azul} /><rect x="26" y="110" width="52" height="28" rx="2" fill={C.claro} />
        <path d="M34 130 l10 -8 8 5 14 -12" stroke={C.verde} strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>
      {[[120, 80], [470, 160], [96, 360]].map(([x, y]) => <path key={x} d={`M${x} ${y - 8} v16 M${x - 8} ${y} h16`} stroke={C.ambar} strokeWidth="3" strokeLinecap="round" />)}
      <defs><filter id="sombra" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="6" stdDeviation="7" floodColor="#0b3d91" floodOpacity=".16" /></filter></defs>
    </svg>
  );
}

function Bienvenida() {
  return (
    <svg viewBox="0 0 480 150" role="img" aria-label="Ilustración de bienvenida">
      <defs><linearGradient id="g-bien" x1="0" x2="1"><stop offset="0" stopColor={C.azul} /><stop offset="1" stopColor={C.medio} /></linearGradient></defs>
      <rect width="480" height="150" fill="url(#g-bien)" />
      <circle cx="420" cy="20" r="70" fill={C.blanco} opacity=".08" /><circle cx="40" cy="150" r="60" fill={C.blanco} opacity=".08" />
      {/* birrete */}
      <g transform="translate(208 30)">
        <path d="M0 30 L32 16 L64 30 L32 44 Z" fill={C.blanco} /><path d="M14 36 v16 q18 10 36 0 v-16 l-18 8z" fill={C.claro2} />
        <path d="M60 32 v20" stroke={C.ambar} strokeWidth="3" /><circle cx="60" cy="55" r="4" fill={C.ambar} />
      </g>
      {/* tarjetas */}
      <g transform="translate(70 52)"><rect width="92" height="64" rx="10" fill={C.blanco} /><rect x="12" y="14" width="44" height="7" rx="3.5" fill={C.claro2} />
        <rect x="12" y="30" width="68" height="7" rx="3.5" fill={C.claro} /><circle cx="22" cy="49" r="7" fill={C.verde} /><path d="M19 49 l2.5 2.5 5-5" stroke={C.blanco} strokeWidth="2" fill="none" /></g>
      <g transform="translate(318 48)"><rect width="92" height="70" rx="10" fill={C.blanco} />
        {[[14, 30], [30, 20], [46, 40], [62, 50]].map(([x, h]) => <rect key={x} x={x} y={58 - h} width="10" height={h} rx="2" fill={x === 62 ? C.ambar : C.medio} />)}</g>
      {[[190, 110], [290, 112], [260, 22]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="4" fill={C.ambar} />)}
    </svg>
  );
}

function Espera() {
  return (
    <svg viewBox="0 0 240 150" role="img" aria-label="Solicitud enviada, esperando asignación">
      <ellipse cx="120" cy="80" rx="100" ry="66" fill={C.claro} />
      <g transform="translate(64 26)">
        <rect width="80" height="104" rx="10" fill={C.blanco} stroke={C.claro2} strokeWidth="2" />
        <rect x="24" y="-8" width="32" height="16" rx="5" fill={C.azul} />
        {[26, 48, 70].map((y, n) => <g key={y}><circle cx="18" cy={y} r="7" fill={n < 2 ? C.verde : C.claro2} />
          {n < 2 && <path d={`M15 ${y} l2.5 2.5 5-5`} stroke={C.blanco} strokeWidth="2" fill="none" />}
          <rect x="32" y={y - 3.5} width="36" height="7" rx="3.5" fill={C.claro} /></g>)}
      </g>
      <g transform="translate(150 54)">
        <path d="M0 0 h36 M0 64 h36" stroke={C.azul} strokeWidth="5" strokeLinecap="round" />
        <path d="M4 2 q0 22 14 30 q-14 8 -14 30 h28 q0 -22 -14 -30 q14 -8 14 -30z" fill={C.blanco} stroke={C.azul} strokeWidth="3" />
        <path d="M10 14 h16 q-2 10 -8 14 q-6 -4 -8 -14z" fill={C.ambar} /><path d="M8 58 q10 -14 20 0z" fill={C.ambar} />
      </g>
      <circle cx="44" cy="40" r="5" fill={C.ambar} /><circle cx="206" cy="128" r="4" fill={C.coral} />
    </svg>
  );
}

function Vacio() {
  return (
    <svg viewBox="0 0 220 140" role="img" aria-label="Sin resultados">
      <ellipse cx="110" cy="76" rx="92" ry="58" fill={C.claro} />
      <path d="M50 70 h120 l-12 50 h-96z" fill={C.claro2} />
      <path d="M50 70 l20 -26 h80 l20 26" fill="none" stroke={C.azul} strokeWidth="3" strokeLinejoin="round" />
      <path d="M50 70 h36 q4 12 24 12 q20 0 24 -12 h36 l-12 50 h-96z" fill={C.blanco} stroke={C.azul} strokeWidth="3" strokeLinejoin="round" />
      <g transform="translate(140 22)"><circle cx="18" cy="18" r="14" fill={C.blanco} stroke={C.medio} strokeWidth="4" /><path d="M28 28 l12 12" stroke={C.medio} strokeWidth="5" strokeLinecap="round" /></g>
      <circle cx="40" cy="36" r="4" fill={C.ambar} /><circle cx="186" cy="110" r="4" fill={C.coral} />
    </svg>
  );
}

function Evaluado() {
  return (
    <svg viewBox="0 0 200 130" role="img" aria-label="Evaluación registrada">
      <ellipse cx="100" cy="70" rx="84" ry="56" fill="#e6f4ec" />
      <rect x="58" y="22" width="84" height="94" rx="10" fill={C.blanco} stroke="#bfe3cf" strokeWidth="2" />
      {[44, 62, 80].map((y) => <rect key={y} x="74" y={y} width={y === 80 ? 30 : 52} height="7" rx="3.5" fill="#d7eee1" />)}
      <circle cx="136" cy="98" r="22" fill={C.verde} /><path d="M126 98 l7 7 13 -14" stroke={C.blanco} strokeWidth="4.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M40 34 l3 7 7 1 -5 5 1 7 -6 -3 -6 3 1 -7 -5 -5 7 -1z" fill={C.ambar} />
    </svg>
  );
}

const TIPOS = { login: Login, bienvenida: Bienvenida, espera: Espera, vacio: Vacio, evaluado: Evaluado };

export default function Ilustracion({ tipo, className = '' }) {
  const Dibujo = TIPOS[tipo];
  return Dibujo ? <div className={'ilustracion ' + className}><Dibujo /></div> : null;
}

/** Estado vacío ilustrado, para listas sin datos o sin resultados. */
export function EstadoVacio({ titulo, children }) {
  return (
    <div className="vacio-ilustrado">
      <Ilustracion tipo="vacio" />
      {titulo && <b>{titulo}</b>}
      {children && <p className="gris">{children}</p>}
    </div>
  );
}
