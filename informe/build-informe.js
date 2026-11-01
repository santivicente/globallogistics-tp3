// Genera el informe en PDF a partir de resultados/resumen.csv. Necesita Node 22+ y Chrome.
// Uso: node informe/build-informe.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const REPO = 'https://github.com/santivicente/globallogistics-tp3';
const SALIDA = path.join(__dirname, 'TP3 - Arquitectura de Sistemas.pdf');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// ---------- datos ----------
const lineas = fs.readFileSync(path.join(ROOT, 'resultados', 'resumen.csv'), 'utf8').trim().split('\n');
const cab = lineas[0].split(',');
const filas = lineas.slice(1).map((l) => {
  const o = {};
  l.split(',').forEach((v, i) => { o[cab[i]] = i === 0 ? v : Number(v); });
  o.errores = o.completas ? ((o.fallidas + o.no2xx) / o.completas) * 100 : 0;
  return o;
});
const get = (e, c) => {
  const f = filas.find((x) => x.escenario === e && x.c === c);
  if (!f) throw new Error(`Falta ${e} c=${c}`);
  return f;
};
const n0 = (v) => Math.round(v).toLocaleString('es-AR');
const pct = (v) => (v < 0.05 ? '0 %' : `${v < 10 ? v.toFixed(1).replace('.', ',') : Math.round(v)} %`);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const leer = (r) => esc(fs.readFileSync(path.join(ROOT, r), 'utf8').trim());

// ---------- gráficos ----------
const C = { s1: '#2a78d6', s2: '#eb6834', s3: '#1baf7a', grid: '#e4e3df', eje: '#b9b8b2', t1: '#1a1a1a', t2: '#52514e' };
const W = 680;

function marco({ h, xTicks, yTicks, xFn, yFn, xLabel, yLabel, m }) {
  let s = '';
  for (const y of yTicks) {
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${yFn(y)}" y2="${yFn(y)}" stroke="${C.grid}"/>`;
    s += `<text x="${m.l - 8}" y="${yFn(y) + 4}" text-anchor="end" class="tick">${y.toLocaleString('es-AR')}</text>`;
  }
  for (const x of xTicks) {
    s += `<text x="${xFn(x)}" y="${h - m.b + 17}" text-anchor="middle" class="tick">${x.toLocaleString('es-AR')}</text>`;
  }
  s += `<line x1="${m.l}" x2="${W - m.r}" y1="${h - m.b}" y2="${h - m.b}" stroke="${C.eje}"/>`;
  s += `<text x="${(m.l + W - m.r) / 2}" y="${h - 4}" text-anchor="middle" class="eje">${xLabel}</text>`;
  s += `<text x="${m.l - 44}" y="12" class="eje">${yLabel}</text>`;
  return s;
}
function serie(puntos, xFn, yFn, color) {
  const d = puntos.map((p, i) => `${i ? 'L' : 'M'}${xFn(p[0]).toFixed(1)} ${yFn(p[1]).toFixed(1)}`).join(' ');
  let s = `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  for (const p of puntos) s += `<circle cx="${xFn(p[0]).toFixed(1)}" cy="${yFn(p[1]).toFixed(1)}" r="4" fill="${color}" stroke="#fff" stroke-width="2"/>`;
  return s;
}
const leyenda = (items, x0) => items.map(([txt, col], i) => {
  const x = x0 + items.slice(0, i).reduce((a, it) => a + 34 + it[0].length * 6.2, 0);
  return `<line x1="${x}" x2="${x + 20}" y1="10" y2="10" stroke="${col}" stroke-width="2"/><circle cx="${x + 10}" cy="10" r="4" fill="${col}" stroke="#fff" stroke-width="2"/><text x="${x + 26}" y="14" class="ley">${txt}</text>`;
}).join('');

function graficoLatencia() {
  const h = 270; const m = { l: 56, r: 62, t: 28, b: 42 };
  const xFn = (x) => m.l + (x / 1000) * (W - m.l - m.r);
  const yFn = (y) => h - m.b - (y / 900) * (h - m.t - m.b);
  const datos = [10, 50, 100, 200, 300, 400, 450].map((c) => get('base3', c)).concat([get('tuned3', 500), get('tuned3', 1000)]);
  const p95 = datos.map((d) => [d.c, d.p95]); const p99 = datos.map((d) => [d.c, d.p99]);
  let s = marco({ h, m, xFn, yFn, xTicks: [0, 200, 400, 600, 800, 1000], yTicks: [0, 300, 600, 900], xLabel: 'Clientes simultáneos', yLabel: 'Latencia (ms)' });
  s += `<line x1="${m.l}" x2="${W - m.r}" y1="${yFn(800)}" y2="${yFn(800)}" stroke="${C.t2}"/><text x="${m.l + 6}" y="${yFn(800) - 5}" class="ref">Objetivo p99: 800 ms</text>`;
  s += `<line x1="${m.l}" x2="${W - m.r}" y1="${yFn(300)}" y2="${yFn(300)}" stroke="${C.t2}"/><text x="${m.l + 6}" y="${yFn(300) - 5}" class="ref">Objetivo p95: 300 ms</text>`;
  s += serie(p95, xFn, yFn, C.s1) + serie(p99, xFn, yFn, C.s2);
  s += `<text x="${xFn(1000) + 8}" y="${yFn(614) + 13}" class="val">p95 ${Math.round(get('tuned3', 1000).p95)}</text>`;
  s += `<text x="${xFn(1000) + 8}" y="${yFn(635) - 5}" class="val">p99 ${Math.round(get('tuned3', 1000).p99)}</text>`;
  s += leyenda([['p95', C.s1], ['p99', C.s2]], W - m.r - 130);
  return `<svg viewBox="0 0 ${W} ${h}" role="img" aria-label="Latencia p95 y p99 según la cantidad de clientes">${s}</svg>`;
}

function graficoGoodput() {
  const h = 280; const m = { l: 56, r: 24, t: 28, b: 42 };
  const lmax = Math.log10(6000);
  const xFn = (x) => m.l + (Math.log10(x) / lmax) * (W - m.l - m.r);
  const yFn = (y) => h - m.b - (y / 2000) * (h - m.t - m.b);
  const base = filas.filter((f) => f.escenario === 'base3').map((f) => [f.c, f.goodput]);
  const tuned = filas.filter((f) => f.escenario === 'tuned3').map((f) => [f.c, f.goodput]);
  const keep = filas.filter((f) => f.escenario === 'keepalive3').map((f) => [f.c, f.goodput]);
  let s = marco({ h, m, xFn, yFn, xTicks: [1, 10, 100, 1000, 6000], yTicks: [0, 500, 1000, 1500, 2000], xLabel: 'Clientes simultáneos (escala logarítmica)', yLabel: 'Respuestas 2xx por segundo' });
  s += serie(base, xFn, yFn, C.s1) + serie(tuned, xFn, yFn, C.s2) + serie(keep, xFn, yFn, C.s3);
  s += leyenda([['Configuración final (pool 1024)', C.s1], ['Pool ampliado (8192)', C.s2], ['Con keepalive', C.s3]], m.l + 110);
  return `<svg viewBox="0 0 ${W} ${h}" role="img" aria-label="Respuestas correctas por segundo según la cantidad de clientes">${s}</svg>`;
}

const diagrama = `<svg viewBox="0 0 680 150" role="img" aria-label="Clientes, balanceador NGINX y tres réplicas de la API">
<defs><marker id="f" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="${C.t2}"/></marker></defs>
<g class="caja"><rect x="10" y="50" width="130" height="50" rx="5"/><rect x="255" y="50" width="150" height="50" rx="5"/>
<rect x="520" y="5" width="150" height="40" rx="5"/><rect x="520" y="55" width="150" height="40" rx="5"/><rect x="520" y="105" width="150" height="40" rx="5"/></g>
<g class="dtxt" text-anchor="middle"><text x="75" y="72">Cliente / ab</text><text x="75" y="88" class="sub">red de Compose o :80</text>
<text x="330" y="72">NGINX 1.28</text><text x="330" y="88" class="sub">round-robin, 1 CPU</text>
<text x="595" y="23">api-1</text><text x="595" y="37" class="sub">Node 22, 1 CPU, /health</text>
<text x="595" y="73">api-2</text><text x="595" y="87" class="sub">Node 22, 1 CPU, /health</text>
<text x="595" y="123">api-3</text><text x="595" y="137" class="sub">Node 22, 1 CPU, /health</text></g>
<g stroke="${C.t2}" fill="none" marker-end="url(#f)"><path d="M140 75H253"/><path d="M405 70L518 27"/><path d="M405 75H518"/><path d="M405 80L518 123"/></g>
<text x="462" y="20" text-anchor="middle" class="sub">DNS interno de Docker</text></svg>`;

// ---------- tablas ----------
const b100 = get('base3', 100); const b1000 = get('base3', 1000); const t1000 = get('tuned3', 1000);
const celdaObj = (ok) => (ok ? 'Cumple' : '<b>No cumple</b>');

const tablaEscenarios = `<table>
<thead><tr><th>Métrica</th><th class="n">Moderado<br>c = 100</th><th class="n">Extremo c = 1000<br>config. final</th><th class="n">Extremo c = 1000<br>pool ampliado</th><th class="n">Objetivo<br>(TP2)</th></tr></thead><tbody>
<tr><td>Peticiones con error</td><td class="n">${pct(b100.errores)}</td><td class="n"><b>${pct(b1000.errores)}</b></td><td class="n">${pct(t1000.errores)}</td><td class="n">–</td></tr>
<tr><td>Respuestas correctas por segundo</td><td class="n">${n0(b100.goodput)}</td><td class="n"><b>${n0(b1000.goodput)}</b></td><td class="n">${n0(t1000.goodput)}</td><td class="n">–</td></tr>
<tr><td>Latencia promedio</td><td class="n">${n0(b100.media_real)} ms</td><td class="n">*</td><td class="n">${n0(t1000.media_real)} ms</td><td class="n">–</td></tr>
<tr><td>Percentil 95</td><td class="n">${n0(b100.p95)} ms</td><td class="n">*</td><td class="n"><b>${n0(t1000.p95)} ms</b></td><td class="n">≤ 300 ms</td></tr>
<tr><td>Percentil 99</td><td class="n">${n0(b100.p99)} ms</td><td class="n">*</td><td class="n">${n0(t1000.p99)} ms</td><td class="n">≤ 800 ms</td></tr>
<tr><td>Latencia máxima</td><td class="n">${n0(b100.max)} ms</td><td class="n">*</td><td class="n">${n0(t1000.max)} ms</td><td class="n">≤ 2000 ms</td></tr>
<tr><td>CPU de cada réplica / de NGINX</td><td class="n">${n0(b100.cpu_api)} % / ${n0(b100.cpu_lb)} %</td><td class="n">${n0(b1000.cpu_api)} % / ${n0(b1000.cpu_lb)} %</td><td class="n">${n0(t1000.cpu_api)} % / ${n0(t1000.cpu_lb)} %</td><td class="n">–</td></tr>
<tr class="res"><td>Resultado frente al objetivo</td><td class="n">Cumple</td><td class="n"><b>No cumple</b></td><td class="n"><b>No cumple</b> (solo p95)</td><td></td></tr>
</tbody></table>`;

function filaBarrido(e, c, etiqueta) {
  const f = get(e, c);
  const malo = f.errores > 50;
  const lat = (v) => (malo ? '*' : n0(v));
  const obj = f.errores > 1 ? 'Con errores' : f.p95 <= 300 && f.p99 <= 800 && f.max <= 2000 ? 'Cumple' : 'p95 excedido';
  return `<tr><td>${etiqueta || ''}</td><td class="n">${n0(c)}</td><td class="n">${n0(f.goodput)}</td><td class="n">${pct(f.errores)}</td><td class="n">${lat(f.media_real)}</td><td class="n">${lat(f.p95)}</td><td class="n">${lat(f.p99)}</td><td class="n">${lat(f.max)}</td><td class="n">${n0(f.cpu_api)}</td><td class="n">${n0(f.cpu_lb)}</td><td>${obj}</td></tr>`;
}
const tablaBarrido = `<table class="densa"><thead><tr><th>Pool</th><th class="n">Clientes</th><th class="n">2xx/s</th><th class="n">Errores</th><th class="n">Media</th><th class="n">p95</th><th class="n">p99</th><th class="n">Máx.</th><th class="n">CPU réplica</th><th class="n">CPU NGINX</th><th>Objetivo</th></tr></thead><tbody>
${[1, 10, 50, 100, 200, 300, 400, 450, 480, 500, 1000, 2000].map((c, i) => filaBarrido('base3', c, i === 0 ? '1024' : '')).join('')}
${[500, 1000, 1500, 2000].map((c, i) => filaBarrido('tuned3', c, i === 0 ? '8192' : '')).join('')}
</tbody></table>`;

const media2 = (e) => (get(e, 100).goodput + get(e, 200).goodput) / 2;
const uno = media2('rep1');
const filaEscala = (n, e) => {
  const x = media2(e);
  const f = get(e, 100);
  return `<tr><td>${n}</td><td class="n">${n0(x)}</td><td class="n">${n === 1 ? '1,00' : (x / uno).toFixed(2).replace('.', ',')}x</td><td class="n">${Math.round((x / uno / n) * 100)} %</td><td class="n">${n0(f.p95)} ms</td><td class="n">${n0(get(e, 100).cpu_lb)} %</td></tr>`;
};
const tablaEscala = `<table><thead><tr><th>Réplicas</th><th class="n">2xx/s (c = 100 y 200)</th><th class="n">Aceleración</th><th class="n">Eficiencia</th><th class="n">p95 con c = 100</th><th class="n">CPU NGINX con c = 100</th></tr></thead><tbody>
${filaEscala(1, 'rep1')}${filaEscala(2, 'rep2')}${filaEscala(3, 'base3')}${filaEscala(4, 'rep4')}${filaEscala(5, 'rep5')}</tbody></table>`;

const k100 = get('keepalive3', 100); const k150 = get('keepalive3', 150); const k200 = get('keepalive3', 200); const b200 = get('base3', 200);
const tablaKeepalive = `<table><thead><tr><th>Clientes</th><th>Configuración</th><th class="n">2xx/s</th><th class="n">Errores</th><th class="n">Máx.</th></tr></thead><tbody>
<tr><td>100</td><td>Con keepalive</td><td class="n">${n0(k100.goodput)}</td><td class="n">${n0(k100.no2xx)} respuestas 504</td><td class="n">${n0(k100.max)} ms</td></tr>
<tr><td>150</td><td>Con keepalive</td><td class="n">${n0(k150.goodput)}</td><td class="n">${pct(k150.errores)}</td><td class="n">${n0(k150.max)} ms</td></tr>
<tr><td>200</td><td>Con keepalive</td><td class="n">${n0(k200.goodput)}</td><td class="n"><b>${pct(k200.errores)}</b></td><td class="n">${n0(k200.max)} ms</td></tr>
<tr><td>200</td><td>Sin keepalive (final)</td><td class="n">${n0(b200.goodput)}</td><td class="n">0 %</td><td class="n">${n0(b200.max)} ms</td></tr></tbody></table>`;

// valores usados en el texto
const r1c100 = get('rep1', 100); const b300 = get('base3', 300); const d100 = get('directo1', 100);
const salud = get('salud3', 100); const puro = get('nginxpuro', 100);
const efic3 = Math.round((b300.goodput / r1c100.goodput / 3) * 100);
const costoLB = ((1 - r1c100.goodput / d100.goodput) * 100).toFixed(1).replace('.', ',');
const b400 = get('base3', 400); const b450 = get('base3', 450); const b480 = get('base3', 480); const b2000 = get('base3', 2000);
const t1500 = get('tuned3', 1500); const b500 = get('base3', 500); const b10 = get('base3', 10); const b1 = get('base3', 1);
const techo = Math.round(salud.goodput / 10) * 10;

// ---------- documento ----------
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>TP3 - Arquitectura de Sistemas</title><style>
*{box-sizing:border-box}
body{font:10.5pt/1.48 "Segoe UI",Calibri,Arial,sans-serif;color:${C.t1};margin:0;background:#fff}
h1{font-size:21pt;line-height:1.2;margin:0 0 3pt}
h2{font-size:14pt;margin:20pt 0 6pt;break-after:avoid}
h3{font-size:11pt;margin:13pt 0 3pt;break-after:avoid}
p{margin:0 0 7pt}
ul{margin:0 0 7pt;padding-left:17pt} li{margin-bottom:3pt}
a{color:#1a5fb4}
code{font:9.2pt Consolas,monospace;background:#f2f1ee;padding:0 2.5pt;border-radius:2px}
pre{font:8pt/1.32 Consolas,monospace;background:#f6f5f2;border:1px solid ${C.grid};border-radius:3px;padding:7pt 9pt;margin:0 0 9pt;white-space:pre-wrap;overflow-wrap:anywhere}
.tapa{border-bottom:2px solid ${C.t1};padding-bottom:9pt;margin-bottom:11pt}
.tapa .sup{font-size:9.5pt;color:${C.t2};margin-bottom:5pt}
.tapa .sub{font-size:12pt;color:${C.t2};margin-bottom:8pt}
.meta{font-size:9.7pt} .meta div{margin-bottom:2pt}
table{border-collapse:collapse;width:100%;margin:5pt 0 9pt;font-size:9.3pt;break-inside:avoid}
th{font-weight:600;text-align:left;border-bottom:1px solid ${C.t1};padding:3pt 5pt;vertical-align:bottom}
td{border-bottom:1px solid ${C.grid};padding:2.6pt 5pt;vertical-align:top}
.n{text-align:right;font-variant-numeric:tabular-nums}
.res td{border-top:1px solid ${C.t1};font-weight:600}
.densa{font-size:8.6pt} .densa td,.densa th{padding:1.8pt 4pt}
figure{margin:7pt 0 10pt;break-inside:avoid}
figure img{width:100%;display:block;border:1px solid ${C.grid}}
figure svg{width:100%;display:block}
figcaption{font-size:8.8pt;color:${C.t2};margin-top:3pt}
.nota{font-size:8.8pt;color:${C.t2};margin-top:-5pt}
.conc{border-left:3px solid ${C.t1};padding:2pt 0 2pt 10pt;margin:8pt 0;break-inside:avoid}
.tick{font-size:10.5px;fill:${C.t2}} .eje{font-size:10.5px;fill:${C.t2}} .ley{font-size:10.5px;fill:${C.t1}} .val{font-size:10.5px;fill:${C.t1};font-weight:600} .ref{font-size:10px;fill:${C.t2}}
.caja rect{fill:#f6f5f2;stroke:${C.eje}} .dtxt text{font-size:12.5px;fill:${C.t1};font-weight:600} .dtxt .sub,.sub{font-size:10px;font-weight:400;fill:${C.t2}}
.salto{break-before:page}
</style></head><body>

<header class="tapa">
<div class="sup">Licenciatura en Sistemas de Información · Arquitectura de Sistemas · Ciclo 2026</div>
<h1>Trabajo Práctico N° 3</h1>
<div class="sub">Despliegue de Arquitectura Cloud-Native. Caso: GlobalLogistics S.A.</div>
<div class="meta">
<div><b>Repositorio:</b> <a href="${REPO}">${REPO.replace('https://', '')}</a></div>
<div><b>Integrantes:</b> Santiago Vicente, Josué Ferreyra, Candela Aguiar, Delfina Ibañez y Matias Porcari</div>
<div><b>Fecha:</b> Noviembre de 2026</div>
</div>
</header>

<h2 style="margin-top:0">Resumen</h2>
<p>Desplegamos un balanceador NGINX y tres réplicas de un microservicio con un solo archivo de Docker Compose, y lo sometimos a pruebas de carga con Apache Benchmark. Como vara usamos los objetivos del contrato que definimos en el TP2: p95 ≤ 300 ms, p99 ≤ 800 ms y un máximo de 2000 ms.</p>
<p>Con 100 clientes simultáneos el sistema cumple sin problemas (p95 de ${n0(b100.p95)} ms, sin errores). La CPU de las réplicas se satura mucho antes, cerca de los 10 clientes, pero eso solo hace crecer la latencia de forma gradual. El objetivo de p95 se pierde entre 400 y 450 clientes y los errores empiezan cerca de 480, cuando se agota el pool de conexiones de NGINX. A los 1000 clientes falla el ${pct(b1000.errores)} de las peticiones. La lección que más nos dejó el trabajo es que las caídas no vinieron de la CPU, sino de límites de conexiones y de la interacción entre configuraciones.</p>

<h2>1. Configuración del entorno e IaC</h2>
<figure>${diagrama}<figcaption>Figura 1. Arquitectura desplegada.</figcaption></figure>
<p>El archivo <code>docker-compose.yml</code> define todo el entorno y está completo en el Anexo. Un <code>docker-compose up -d</code> levanta exactamente un balanceador y tres réplicas: la cantidad sale de <code>deploy.replicas: 3</code>. Lo probamos borrando antes la imagen de la API, para confirmar que el entorno se construye solo y no requiere pasos previos.</p>
<p>Las decisiones que tomamos en el manifiesto fueron estas:</p>
<ul>
<li><b>Límite de 1 CPU por contenedor.</b> Sin límites, las réplicas compiten por los mismos núcleos y no se puede comparar una réplica contra tres. Además, se parece más a cómo se contrata capacidad en la nube.</li>
<li><b>Orden de arranque por salud.</b> NGINX espera con <code>depends_on: condition: service_healthy</code>, así no recibe tráfico hasta que las réplicas responden.</li>
<li><b>Reinicio automático.</b> Con <code>restart: unless-stopped</code>, si el proceso de una réplica termina, Docker la vuelve a levantar.</li>
<li><b>Generador de carga en un perfil aparte.</b> <code>ab</code> no arranca con <code>up -d</code>, así que el entorno tiene solo los cuatro contenedores que pide la consigna.</li>
</ul>

<h2>2. Microservicio y balanceo</h2>
<p>La API está hecha en Node.js con Express sobre <code>node:22-alpine</code>. <code>GET /</code> devuelve el hostname del sistema, que en Docker es el ID corto del contenedor, y <code>GET /health</code> responde al health check.</p>
<p>Agregamos algo que no estaba pedido: <code>GET /</code> ejecuta 3000 iteraciones de PBKDF2, alrededor de 1,6 ms de CPU. Un endpoint que solo devuelve un JSON casi no consume procesador y queríamos saturar la CPU de verdad, que es lo que pide el escenario extremo. Elegimos un cálculo y no una espera porque una espera no ocupa CPU. El valor se cambia con la variable <code>CPU_WORK_ITERATIONS</code>.</p>
<p>La Figura 2 muestra la rotación: nueve peticiones seguidas al balanceador son respondidas por tres IDs distintos, siempre en el mismo orden.</p>
<figure><img src="capturas/c1.png" alt="docker-compose ps y nueve peticiones respondidas por tres instancias"><figcaption>Figura 2. Un balanceador y tres réplicas sanas; las peticiones consecutivas rotan entre las instancias.</figcaption></figure>

<h3>Health checks</h3>
<p>Los resolvimos en dos niveles, porque el <code>health_check</code> activo de NGINX es exclusivo de la versión Plus y usamos la versión abierta:</p>
<ul>
<li><b>Pasivo, en NGINX:</b> <code>max_fails=3 fail_timeout=10s</code>. Tres fallos en 10 s sacan a una réplica de la rotación durante 10 s, y <code>proxy_next_upstream</code> reintenta la petición en otra.</li>
<li><b>Activo, en Docker:</b> cada 5 s se consulta <code>/health</code> en cada réplica y <code>/nginx-health</code> en el balanceador.</li>
</ul>
<p>Hay un límite que conviene tener claro: en Compose, una réplica marcada <i>unhealthy</i> no sale sola de la rotación ni se reinicia. Esa decisión la toma solo el mecanismo pasivo, es decir, recién cuando ya fallaron peticiones reales. Como veremos, esto tuvo consecuencias.</p>

<h3>Prueba de resiliencia</h3>
<table><thead><tr><th style="width:38%">Prueba</th><th>Resultado</th></tr></thead><tbody>
<tr><td>Detener una réplica durante 10 s con 50 clientes activos</td><td>41.910 peticiones, <b>0 fallidas</b>; p99 de 110 ms y máximo de 204 ms. Al volver, recibe otra vez su parte del tráfico.</td></tr>
<tr><td>Terminar el proceso de una réplica</td><td>Docker la reinició sola; a los 13 s estaba otra vez sana.</td></tr>
<tr><td>Escalar a 5 réplicas con <code>--scale api=5</code></td><td>NGINX las incorporó sin reiniciarse, gracias a <code>resolve</code> y al DNS interno de Docker.</td></tr>
</tbody></table>
<p>Dos aclaraciones. <code>docker stop</code> es una detención ordenada; no probamos un corte abrupto con peticiones en curso. Y NGINX reintenta solo métodos idempotentes como GET: un <code>POST /envios</code> no se reintentaría, y ahí es donde entra en juego la <code>Idempotency-Key</code> que definimos en el TP2.</p>
<p>Respecto a escalar "sin intervención manual", el resultado es parcial. Las réplicas se recuperan solas, pero agregar capacidad sigue requiriendo un comando: Compose no tiene autoescalado. Para eso haría falta un orquestador, como Kubernetes con un HPA.</p>

<h2>3. Pruebas de estrés</h2>
<h3>Método</h3>
<p>Cada medición dura 20 s y se repite 3 veces. Informamos el promedio de las tres, salvo la latencia máxima, donde dejamos el peor valor. Corrimos todo en una PC con un i7-9700 de 8 núcleos y 16 GB de RAM, con Docker Desktop sobre WSL2.</p>
<p><code>ab</code> corre en un contenedor dentro de la red de Compose, para no medir también el reenvío de puertos de Windows. Como comparte la máquina con el sistema probado, controlamos que no fuera el cuello de botella: en el barrido y en las pruebas de escalabilidad, mientras no hubo errores, su CPU se mantuvo entre 6 % y 35 %. Los comandos exactos están en el README y los reportes crudos en <code>resultados/crudo/</code>.</p>
<h3>Resultados de los dos escenarios</h3>
${tablaEscenarios}
<p class="nota">* No se informa porque casi todas las muestras son errores instantáneos: el p50 de esa prueba da ${n0(b1000.p50)} ms y no significa que el sistema responda rápido.</p>
<figure><img src="capturas/c2.png" alt="Reporte de ab con 100 clientes"><figcaption>Figura 3. Una corrida del escenario moderado. Sus valores difieren un poco del promedio de la tabla, como es esperable entre corridas.</figcaption></figure>
<figure><img src="capturas/c3.png" alt="Reporte de ab con 1000 clientes y advertencias de NGINX"><figcaption>Figura 4. Escenario extremo con la configuración final. Las 11.600 "req/s" son en su gran mayoría fallos; el log de NGINX muestra el motivo.</figcaption></figure>
<p>Leer estos reportes tiene su trampa. <code>ab</code> cuenta los errores como peticiones completas, así que mientras el sistema se cae, las req/s <i>suben</i>. Además, su "Time per request" no se mide: es la concurrencia dividida por el throughput. Por eso reportamos las respuestas 2xx por segundo y la media de <i>Connection Times</i>.</p>

<h3>Barrido de concurrencia</h3>
<p>Dos escenarios no alcanzan para ubicar dónde se degrada el sistema, así que medimos también los puntos intermedios.</p>
${tablaBarrido}
<p class="nota">Latencias en ms y CPU en % de un núcleo. * No representativo: más de la mitad de las respuestas son errores.</p>
<figure>${graficoLatencia()}<figcaption>Figura 5. Latencia en las pruebas sin errores significativos: pool 1024 hasta 450 clientes y pool ampliado en 500 y 1000.</figcaption></figure>
<figure>${graficoGoodput()}<figcaption>Figura 6. Respuestas correctas por segundo. El caudal se sostiene hasta que un límite de conexiones provoca una caída brusca.</figcaption></figure>

<h2>4. Análisis crítico</h2>
<h3>¿En qué punto se degrada y qué se rompe primero?</h3>
<p>Encontramos cuatro puntos de quiebre, cada uno de distinta naturaleza:</p>
<table><thead><tr><th class="n" style="width:13%">Clientes</th><th style="width:29%">Qué pasa</th><th>Evidencia</th></tr></thead><tbody>
<tr><td class="n">≈ 10</td><td>Se saturan las CPU de las réplicas</td><td>${n0(b10.cpu_api)} % de CPU y ${n0(b10.goodput)} req/s. La latencia sube de ${String(b1.media.toFixed(1)).replace('.', ',')} a ${String(b10.media.toFixed(1)).replace('.', ',')} ms. Sin errores.</td></tr>
<tr><td class="n">400–450</td><td>Se pierde el objetivo de p95</td><td>p95 de ${n0(b400.p95)} ms con 400 clientes y de ${n0(b450.p95)} ms con 450. Sin errores.</td></tr>
<tr><td class="n">450–480</td><td>Se agota el pool de NGINX</td><td>${pct(b480.errores)} de errores con 480 y ${pct(b500.errores)} con 500. Log: <code>1024 worker_connections are not enough</code>.</td></tr>
<tr><td class="n">1000–1500</td><td>Con pool ampliado, se llena el backlog de las réplicas</td><td><code>ListenOverflows</code> pasa de 0 a 250 entre 1000 y 1500 clientes, y aparecen timeouts de conexión.</td></tr>
</tbody></table>
<p>Respondiendo a la pregunta de la consigna: <b>lo primero en saturarse fue la CPU de los nodos, pero lo primero en romperse fue NGINX</b>, al quedarse sin conexiones. Son dos cosas distintas. Cuando se satura la CPU, el sistema no falla: las peticiones hacen cola. Por eso, una vez saturado, el caudal se queda en unas 1750 req/s y la latencia crece en proporción a los clientes, como predice la Ley de Little (R = N / X). Con 400 clientes predice ${n0(400 / b400.goodput * 1000)} ms y medimos ${n0(b400.media_real)} ms; con 1000 clientes, ${n0(1000 / t1000.goodput * 1000)} ms contra ${n0(t1000.media_real)} ms.</p>
<p>El pool, en cambio, falla de golpe. Cada petición ocupa dos conexiones, una con el cliente y otra con la réplica, de modo que las 1024 alcanzan para unos 512 clientes como máximo, y los errores empiezan algo antes. Agotado el pool, NGINX corta conexiones y queda en un estado de muy bajo rendimiento: con 2000 clientes salen apenas ${n0(b2000.goodput)} respuestas correctas por segundo y las réplicas están prácticamente ociosas, con ${n0(b2000.cpu_api)} % de CPU. Ampliar el pool a 8192 eliminó los errores a 1000 clientes, lo que confirma la causa.</p>
<p>Pasar de 1000 a 1500 clientes con el pool ampliado expuso el siguiente límite: 1500 clientes son unas 500 conexiones por réplica, cerca del backlog de 511 que Node usa por defecto. Las conexiones tardan más de 1 s, NGINX lo cuenta como fallo y el health check pasivo empieza a retirar réplicas. Este punto es inestable: las tres corridas de 20 s entraron en cascada (${n0(t1500.goodput)} respuestas correctas por segundo), pero una verificación posterior de 15 s terminó con solo 4 errores.</p>

<h3>Un hallazgo no previsto: la cascada del keepalive</h3>
<p>En nuestra primera configuración habíamos puesto <code>keepalive 64</code> hacia las réplicas, una recomendación habitual para mejorar el rendimiento. La primera batería mostró algo absurdo: con 200 clientes el sistema "rendía" más de 7000 req/s, cuando su capacidad era de 1800. Al mirar el detalle, más del 90 % de las respuestas eran 502 instantáneos y las réplicas estaban sin carga.</p>
${tablaKeepalive}
<p>Algunas peticiones llegaban a esperar más de 2 s y vencían <code>proxy_read_timeout</code>. Esos timeouts cuentan como fallos para <code>max_fails</code>, así que NGINX fue retirando a las tres réplicas, sanas, y se quedó sin destinos (<code>no live upstreams</code>). Cambiando solo esa línea, con 200 clientes pasamos de ${pct(k200.errores)} de errores a ninguno. Yendo directo a una réplica, sin NGINX, tampoco aparecían esas esperas. No llegamos a aislar el mecanismo exacto; nuestra hipótesis es que Node atiende primero las conexiones reutilizadas y demora las nuevas.</p>
<p>La enseñanza de fondo es que un mecanismo de resiliencia puede volverse la causa de la caída: el health check pasivo no distingue una réplica muerta de una ocupada, y justo cuando el sistema está más cargado le quita capacidad. También tuvo un costo: sin keepalive, NGINX llega al ${n0(salud.cpu_lb)} % de CPU con unas ${n0(techo)} req/s, mientras que en una única corrida de calibración con keepalive había alcanzado 10.500. Sacarlo resolvió la cascada, pero baja el techo del balanceador.</p>

<h3>¿Escala linealmente?</h3>
<p>Casi, pero no del todo. Una réplica con 100 clientes da ${n0(r1c100.goodput)} req/s y p99 de ${n0(r1c100.p99)} ms. Tres réplicas con el triple de clientes dan ${n0(b300.goodput)} req/s y p99 de ${n0(b300.p99)} ms: la latencia se mantiene y el caudal se multiplica por ${(b300.goodput / r1c100.goodput).toFixed(2).replace('.', ',')}, una eficiencia del ${efic3} %.</p>
${tablaEscala}
<p class="nota">La serie de 2 réplicas fue la más ruidosa (entre 924 y 1302 req/s según la corrida), por lo que su eficiencia es menos confiable. NGINX consume más CPU con una réplica que con tres, aunque atiende menos tráfico; no investigamos el motivo.</p>
<p>La merma no se explica principalmente por el balanceador. Comparando una réplica directa contra la misma réplica detrás de NGINX, con 100 clientes, se pierde un ${costoLB} % de caudal (${n0(d100.goodput)} contra ${n0(r1c100.goodput)} req/s). Además, NGINX no llegó a saturarse en estas pruebas. La eficiencia sigue cayendo al agregar réplicas, hasta ${Math.round((media2('rep5') / uno / 5) * 100)} % con cinco, y lo atribuimos en parte a que todo comparte una misma máquina, aunque no pudimos aislarlo. A futuro sí habría un límite claro: con unas 500 req/s por réplica, el único worker de NGINX se saturaría cerca de las 10 réplicas.</p>

<h3>¿Cumple con el tiempo real y con lo que toleraría el negocio?</h3>
<p>Tomamos como restricción de tiempo real el máximo de 2000 ms del contrato. Es tiempo real <i>blando</i>: pasarse degrada el servicio, pero no es una falla catastrófica. Con esa vara:</p>
<ul>
<li><b>Hasta 400 clientes</b> se cumplen los tres objetivos, con un máximo de ${n0(b400.max)} ms.</li>
<li><b>Con el pool ampliado, de 500 a 1000 clientes,</b> la latencia máxima sigue cumpliendo (${n0(t1000.max)} ms) y el p99 también, pero el p95 no (${n0(t1000.p95)} ms). Un usuario esperaría más de lo pactado, aunque recibiría respuesta.</li>
<li><b>Con el pool de 1024 a partir de 480 clientes,</b> o con el pool ampliado cerca de los 1500, deja de cumplir: lo que falla ya no es el tiempo sino la disponibilidad.</li>
</ul>
<p>Tampoco hay una garantía estricta, porque nada acota la cola: el máximo depende de cuántos clientes lleguen. Las corridas individuales también varían. En 2 de 7 corridas adicionales con 100 clientes la distribución salió bimodal, con p95 de hasta 176 ms contra los 82 a 99 ms habituales. Sigue dentro del objetivo, pero no identificamos la causa.</p>
<p>Para GlobalLogistics, este despliegue <b>no alcanza tal como está</b>. En el TP2 asumimos picos de 10.000 req/s y medimos unas 1750, con un endpoint que ni siquiera consulta una base de datos. Extrapolando, llegar a esa cifra pediría al menos 20 réplicas y más de dos núcleos de NGINX, y es un piso optimista: la eficiencia venía cayendo y el servicio real haría trabajo de E/S que acá no existe. Además, hay un solo balanceador, que es un punto único de falla: la consigna lo pide así para esta prueba, pero contradice el requisito de alta disponibilidad 24/7.</p>

<h3>Limitaciones y qué cambiaríamos</h3>
<p>Generador y sistema comparten máquina, <code>ab</code> no simula tiempos de espera entre peticiones de un usuario (por eso la CPU se satura con tan pocos clientes) y consulta un único endpoint. Los umbrales absolutos valen para este entorno; lo trasladable son el orden de los fallos y sus causas. Para producción proponemos:</p>
<ul>
<li>Dimensionar el pool y los workers de NGINX para la concurrencia esperada, y ampliar el backlog de Node.</li>
<li>Usar health checks activos que retiren réplicas por su estado real (NGINX Plus, HAProxy o los <i>readiness probes</i> de Kubernetes), en lugar de deducirlo de los timeouts.</li>
<li>Rechazar el exceso de forma controlada con <i>rate limiting</i> y respuestas 429, como ya definía el contrato del TP2, antes de llegar a los límites.</li>
<li>Autoescalar por CPU, ya que la saturación aparece mucho antes que los errores y deja margen para reaccionar.</li>
<li>Replicar el balanceador para eliminar el punto único de falla.</li>
</ul>

<h2>Conclusión</h2>
<div class="conc">
<p>La arquitectura cumple lo que pide la consigna: un balanceador y tres réplicas levantadas con IaC, reparto verificable, tolerancia a la caída de una réplica sin peticiones fallidas y escalado horizontal con una eficiencia cercana al ${efic3} % a tres réplicas. Bajo carga moderada cumple holgadamente los objetivos de latencia.</p>
<p>El sistema degrada sus tiempos de respuesta desde que se saturan las CPU, cerca de los 10 clientes, de forma gradual y predecible; pierde el objetivo de p95 entre 400 y 450 clientes y deja de estar disponible cerca de los 480. La latencia máxima cumple la restricción de tiempo real blando de 2000 ms en todo el rango sin errores, aunque sin garantía estricta.</p>
<p>Este comportamiento se explica por la arquitectura desplegada: un proceso de Node por réplica, limitado a un núcleo, fija el caudal; las colas fijan la latencia; y los límites de conexiones y el health check pasivo definen cuándo el sistema pasa de estar lento a estar caído.</p>
</div>

<h2 class="salto" style="margin-top:0">Anexo: código de los manifiestos</h2>
<p>El proyecto completo, con el README y los resultados crudos, está en el <a href="${REPO}">repositorio</a>.</p>
<h3><code>docker-compose.yml</code></h3><pre>${leer('docker-compose.yml')}</pre>
<h3><code>nginx/nginx.conf</code></h3><pre>${leer('nginx/nginx.conf')}</pre>
<h3><code>api/server.js</code></h3><pre>${leer('api/server.js')}</pre>
<h3><code>api/Dockerfile</code></h3><pre>${leer('api/Dockerfile')}</pre>
</body></html>`;

const htmlPath = path.join(__dirname, 'informe.html');
fs.writeFileSync(htmlPath, html);

// ---------- impresión a PDF con Chrome ----------
async function imprimir() {
  const puerto = 9344;
  const tmp = path.join(process.env.TEMP || '/tmp', `chrome-tp3-${Date.now()}`);
  const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${puerto}`, `--user-data-dir=${tmp}`, 'about:blank'], { stdio: 'ignore' });
  try {
    let info;
    for (let i = 0; i < 40 && !info; i++) {
      await new Promise((r) => setTimeout(r, 300));
      try { info = await (await fetch(`http://127.0.0.1:${puerto}/json/new?about:blank`, { method: 'PUT' })).json(); } catch (e) { /* todavía arranca */ }
    }
    if (!info) throw new Error('Chrome no respondió');
    const ws = new WebSocket(info.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pend = new Map(); let onLoad;
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
      if (m.method === 'Page.loadEventFired' && onLoad) onLoad();
    };
    const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await cmd('Page.enable');
    const cargada = new Promise((r) => { onLoad = r; });
    await cmd('Page.navigate', { url: `file:///${htmlPath.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/').replace('C%3A', 'C:')}` });
    await cargada;
    await new Promise((r) => setTimeout(r, 500));
    const estilo = 'font:8px Segoe UI,Arial,sans-serif;color:#52514e;width:100%;padding:0 15mm;display:flex;justify-content:space-between';
    const res = await cmd('Page.printToPDF', {
      printBackground: true, preferCSSPageSize: false, paperWidth: 8.27, paperHeight: 11.69,
      marginTop: 0.72, marginBottom: 0.62, marginLeft: 0.75, marginRight: 0.75, displayHeaderFooter: true,
      headerTemplate: `<div style="${estilo}"><span>TP3 · Arquitectura de Sistemas 2026</span><span>Repositorio: ${REPO}</span></div>`,
      footerTemplate: `<div style="${estilo};justify-content:flex-end"><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    });
    if (!res.result) throw new Error(JSON.stringify(res));
    fs.writeFileSync(SALIDA, Buffer.from(res.result.data, 'base64'));
    ws.close();
    console.log('PDF generado:', SALIDA);
  } finally {
    ch.kill();
  }
}
imprimir().catch((e) => { console.error(e); process.exit(1); });
