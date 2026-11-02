const crypto = require('crypto');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');
const express = require('express');

const PORT = Number(process.env.PORT) || 3000;
// Trabajo de CPU por petición. Un endpoint que solo devuelve un JSON no satura nada:
// esto hace las veces de la validación y el cálculo que haría el servicio real.
// Usamos iteraciones fijas (y no "esperar N ms") para que el costo sea CPU de verdad
// y el límite de cpus del contenedor lo afecte. Con 0 se desactiva.
const CPU_WORK_ITERATIONS = Number(process.env.CPU_WORK_ITERATIONS) || 0;
const INSTANCIA = os.hostname(); // en Docker, el hostname es el ID corto del contenedor
// Cola de conexiones pendientes del kernel. Con el valor por defecto de Node (511) se
// desbordaba cerca de los 1000 clientes: el kernel descartaba conexiones y NGINX las daba
// por fallidas. No puede superar net.core.somaxconn, que fija docker-compose.yml.
const BACKLOG = 4096;

const app = express();
app.disable('x-powered-by');

app.get('/', (req, res) => {
  if (CPU_WORK_ITERATIONS > 0) {
    crypto.pbkdf2Sync('envio', 'globallogistics', CPU_WORK_ITERATIONS, 32, 'sha256');
  }
  res.json({ servicio: 'api-envios', instancia: INSTANCIA, estado: 'ok' });
});

// No hace trabajo de CPU a propósito. Se atiende en el mismo event loop, detrás de las
// peticiones en cola, así que bajo saturación tarda: por eso el healthcheck de Docker no
// usa esta ruta sino el hilo de salud (salud.js).
app.get('/health', (req, res) => {
  res.json({ estado: 'ok', instancia: INSTANCIA, uptime: Math.round(process.uptime()) });
});

// Latido del event loop, compartido con el hilo de salud: mientras avanza, la réplica
// está viva aunque esté saturada; si se detiene, está colgada. Reloj monótono, para que
// un ajuste de hora no parezca un cuelgue.
const latido = new BigInt64Array(new SharedArrayBuffer(8));
const marcarLatido = () => Atomics.store(latido, 0, process.hrtime.bigint());
marcarLatido();
setInterval(marcarLatido, 250).unref();

const server = app.listen({ port: PORT, backlog: BACKLOG }, () => {
  console.log(`api-envios escuchando en :${PORT} (instancia ${INSTANCIA})`);
  new Worker(path.join(__dirname, 'salud.js'), { workerData: { latido } })
    .on('error', (err) => { console.error('hilo de salud:', err); process.exit(1); });
});

// Solo importa con la variante docker-compose.keepalive.yml: tiene que superar el keepalive
// de NGINX para que Node no cierre conexiones que NGINX cree abiertas.
server.keepAliveTimeout = 75000;
server.headersTimeout = 76000;

// Apagado ordenado: termina lo que está en curso antes de salir.
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
});
