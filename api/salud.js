// Health check de la réplica. Corre en un hilo aparte, con su propio event loop, para
// responder aunque el hilo principal esté saturado de CPU. Así distingue una réplica
// ocupada (el latido avanza) de una colgada (el latido se detuvo), algo que el health
// check pasivo de NGINX no puede hacer: para él las dos son timeouts.
const fs = require('fs');
const http = require('http');
const { workerData } = require('worker_threads');

const PUERTO = 3001;      // solo lo consulta el healthcheck de Docker, desde el contenedor
const LIMITE_MS = 10000;  // con la cola acotada por NGINX, el latido se atrasa ~1 s como mucho
const atrasoMs = () => Number(process.hrtime.bigint() - Atomics.load(workerData.latido, 0)) / 1e6;

http.createServer((req, res) => {
  const ms = Math.round(atrasoMs());
  res.writeHead(ms <= LIMITE_MS ? 200 : 503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ estado: ms <= LIMITE_MS ? 'ok' : 'colgada', atraso_ms: ms }));
}).listen(PUERTO, '127.0.0.1');

// Una réplica colgada sigue aceptando conexiones a nivel de kernel, así que NGINX solo la
// detecta cuando fallan peticiones reales, y vuelve a probarla cada 10 s. Matarla la
// convierte en una caída común: Docker la reinicia y, mientras tanto, NGINX recibe
// "conexión rechazada" y reintenta en otra réplica sin que el cliente lo note.
// Requiere "init: true" en Compose: el kernel no deja que el PID 1 se mate a sí mismo.
setInterval(() => {
  const ms = Math.round(atrasoMs());
  if (ms > LIMITE_MS) {
    // writeSync: la consola de un worker se escribe a través del hilo principal, que está trabado.
    fs.writeSync(2, `event loop detenido hace ${ms} ms: se reinicia la réplica\n`);
    process.kill(process.pid, 'SIGKILL');
  }
}, 1000);
