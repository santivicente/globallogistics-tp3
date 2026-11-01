// Junta los reportes crudos de ab en resultados/resumen.csv (promedio de las 3 repeticiones,
// salvo el máximo, donde se conserva el peor valor observado).
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'resultados', 'crudo');
const num = (t, re) => { const m = t.match(re); return m ? Number(m[1]) : 0; };
const grupos = {};

for (const f of fs.readdirSync(dir).filter((x) => /_c\d+_r\d+\.txt$/.test(x))) {
  const [, escenario, c] = f.match(/^(.+)_c(\d+)_r\d+\.txt$/);
  const t = fs.readFileSync(path.join(dir, f), 'utf8');
  const base = f.replace(/\.txt$/, '');
  const nginx = fs.existsSync(path.join(dir, `${base}.nginx`)) ? fs.readFileSync(path.join(dir, `${base}.nginx`), 'utf8') : '';
  const cpu = {};
  const stats = path.join(dir, `${base}.stats`);
  if (fs.existsSync(stats)) {
    for (const l of fs.readFileSync(stats, 'utf8').trim().split('\n')) {
      const [n, v] = l.split(',');
      if (!n || !v) continue;
      const k = n.includes('balanceador') ? 'lb' : n.includes('-ab-') ? 'ab' : 'api';
      (cpu[k] = cpu[k] || {});
      (cpu[k][n] = cpu[k][n] || []).push(parseFloat(v));
    }
  }
  const prom = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const cpuProm = (k) => (cpu[k] ? prom(Object.values(cpu[k]).map(prom)) : NaN);
  const r = {
    completas: num(t, /Complete requests:\s+(\d+)/),
    fallidas: num(t, /Failed requests:\s+(\d+)/),
    no2xx: num(t, /Non-2xx responses:\s+(\d+)/),
    rps: num(t, /Requests per second:\s+([\d.]+)/),
    duracion: num(t, /Time taken for tests:\s+([\d.]+)/),
    connect: num(t, /\(Connect: (\d+)/),
    receive: num(t, /Receive: (\d+)/),
    length: num(t, /Length: (\d+)/),
    exceptions: num(t, /Exceptions: (\d+)/),
    media: num(t, /Time per request:\s+([\d.]+) \[ms\] \(mean\)/),
    goodput: 0,
    // La media de ab en 'Time per request' se calcula como c / throughput; esta es la medida.
    media_real: num(t, /Total:\s+\d+\s+(\d+)/),
    p50: num(t, /\n\s+50%\s+(\d+)/),
    p95: num(t, /\n\s+95%\s+(\d+)/),
    p99: num(t, /\n\s+99%\s+(\d+)/),
    max: num(t, /\n\s+100%\s+(\d+)/),
    cpu_api: cpuProm('api'),
    cpu_lb: cpuProm('lb'),
    cpu_ab: cpuProm('ab'),
    err_pool: (nginx.match(/worker_connections are not enough/g) || []).length,
    err_timeout: (nginx.match(/upstream timed out/g) || []).length,
    err_nolive: (nginx.match(/no live upstreams/g) || []).length,
    err_otros: (nginx.match(/\[(error|alert|crit)\]/g) || []).length,
  };
  // ab cuenta los errores como peticiones completas: el goodput son solo las respuestas 2xx por segundo.
  r.goodput = (r.completas - r.fallidas - r.no2xx) / (r.duracion || 1);
  const k = `${escenario}|${c}`;
  (grupos[k] = grupos[k] || []).push(r);
}

const cols = ['completas', 'fallidas', 'connect', 'receive', 'exceptions', 'no2xx', 'rps', 'goodput', 'media', 'media_real', 'p50', 'p95', 'p99', 'max', 'cpu_api', 'cpu_lb', 'cpu_ab', 'err_pool', 'err_timeout', 'err_nolive', 'err_otros'];
const filas = Object.entries(grupos).map(([k, rs]) => {
  const [escenario, c] = k.split('|');
  const fila = { escenario, c: Number(c), reps: rs.length };
  for (const col of cols) {
    const vals = rs.map((r) => r[col]).filter((v) => !Number.isNaN(v));
    fila[col] = col === 'max' ? Math.max(...vals) : vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
  }
  const rp = rs.map((r) => r.rps);
  fila.rps_min = Math.min(...rp);
  fila.rps_max = Math.max(...rp);
  return fila;
}).sort((a, b) => a.escenario.localeCompare(b.escenario) || a.c - b.c);

const head = ['escenario', 'c', 'reps', ...cols, 'rps_min', 'rps_max'];
const csv = [head.join(',')].concat(filas.map((f) => head.map((h) => (typeof f[h] === 'number' ? +f[h].toFixed(2) : f[h])).join(','))).join('\n');
fs.writeFileSync(path.join(__dirname, '..', 'resultados', 'resumen.csv'), csv + '\n');
console.log(csv);
