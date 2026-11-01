const crypto = require('crypto');
const os = require('os');
const express = require('express');

const PORT = Number(process.env.PORT) || 3000;
// Trabajo de CPU por petición. Un endpoint que solo devuelve un JSON no satura nada:
// esto hace las veces de la validación y el cálculo que haría el servicio real.
// Usamos iteraciones fijas (y no "esperar N ms") para que el costo sea CPU de verdad
// y el límite de cpus del contenedor lo afecte. Con 0 se desactiva.
const CPU_WORK_ITERATIONS = Number(process.env.CPU_WORK_ITERATIONS) || 0;
const INSTANCIA = os.hostname(); // en Docker, el hostname es el ID corto del contenedor

const app = express();
app.disable('x-powered-by');

app.get('/', (req, res) => {
  if (CPU_WORK_ITERATIONS > 0) {
    crypto.pbkdf2Sync('envio', 'globallogistics', CPU_WORK_ITERATIONS, 32, 'sha256');
  }
  res.json({ servicio: 'api-envios', instancia: INSTANCIA, estado: 'ok' });
});

// Lo consulta el healthcheck de Docker. No hace trabajo de CPU a propósito:
// responde si el proceso está vivo y su event loop no está trabado.
app.get('/health', (req, res) => {
  res.json({ estado: 'ok', instancia: INSTANCIA, uptime: Math.round(process.uptime()) });
});

const server = app.listen(PORT, () => {
  console.log(`api-envios escuchando en :${PORT} (instancia ${INSTANCIA})`);
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
