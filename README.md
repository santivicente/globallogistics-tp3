# GlobalLogistics S.A. · Despliegue Cloud-Native (TP3)

Trabajo Práctico N° 3 de Arquitectura de Sistemas (Lic. en Sistemas de Información, 2026).

Un balanceador NGINX reparte el tráfico entre tres réplicas de un microservicio Node.js. Todo se levanta con un solo archivo de Docker Compose y se somete a pruebas de carga con Apache Benchmark.

```
cliente → NGINX (puerto 80) → api-1, api-2, api-3 (puerto 3000)
```

## Requisitos

Docker con Compose. No hace falta instalar nada más: la imagen de la API se construye sola y `ab` corre en un contenedor.

## Levantar el entorno

```bash
git clone https://github.com/santivicente/globallogistics-tp3.git
cd globallogistics-tp3
docker-compose up -d
docker-compose ps      # 1 balanceador y 3 réplicas, todos (healthy)
```

Si el puerto 80 está ocupado, se puede usar otro: `LB_PORT=8080 docker-compose up -d`.

## Comprobar el balanceo

Cada respuesta informa qué contenedor la atendió. Ejecutando varias veces:

```bash
curl http://localhost/
```

el campo `instancia` va rotando entre tres IDs.

## Health checks

- **Pasivo, en NGINX:** `max_fails=3 fail_timeout=10s`. Si una réplica falla tres veces en 10 s, sale de la rotación por 10 s. Si lo que falla es la conexión, la petición se reintenta en otra réplica.
- **Activo, en cada réplica:** un hilo aparte (`api/salud.js`) vigila que el event loop siga avanzando. El healthcheck de Docker lo consulta en el puerto 3001, así que una réplica saturada sigue figurando como sana. Si el event loop se detiene más de 10 s, el hilo termina el proceso y Docker vuelve a levantar la réplica.

```bash
docker-compose exec api wget -qO- http://127.0.0.1:3001/health   # {"estado":"ok","atraso_ms":...}
```

## Reproducir las pruebas de carga

`ab` corre dentro de la red de Compose. Así no se mide también el reenvío de puertos de Docker Desktop.

```bash
# Concurrencia moderada
docker-compose run --rm -T ab -l -r -t 20 -n 2000000 -c 100 http://balanceador/

# Concurrencia extrema: satura la CPU de las réplicas y las peticiones hacen cola
docker-compose run --rm -T ab -l -r -t 20 -n 2000000 -c 1000 http://balanceador/

# Sobrecarga: más de 1500 peticiones en curso; el exceso recibe 429 al instante
docker-compose run --rm -T ab -l -r -t 20 -n 2000000 -c 3000 http://balanceador/

# Carga sostenida: descarta que algo se agote con el tiempo
docker-compose run --rm -T ab -l -r -t 120 -n 5000000 -c 100 http://balanceador/

# Lo que dejó NGINX en el log
docker logs tp3-balanceador-1 2>&1 | grep -E "worker_connections|no live upstreams|timed out|Address not available"
```

| Flag | Significado |
|---|---|
| `-c` | clientes simultáneos |
| `-t` | duración en segundos |
| `-n` | tope de peticiones, puesto alto para que corte por tiempo |
| `-l` | acepta respuestas de distinto largo; sin esto, cada ID distinto contaría como fallo |
| `-r` | no aborta ante un error de conexión |

**Cuidado al leer el reporte:** `ab` cuenta los errores como peticiones completas, y como un error es instantáneo, las req/s suben y los percentiles bajan cuando el sistema está fallando. Hay que mirar siempre `Failed requests` y `Non-2xx responses`. En sobrecarga, los 429 del control de admisión también se cuentan como `Non-2xx responses`: lo que mide la capacidad es el caudal de respuestas 2xx.

### Variante de configuración

```bash
# Keepalive hacia las réplicas: reproduce el fallo en cascada (probar con -c 200)
docker-compose -f docker-compose.yml -f docker-compose.keepalive.yml up -d

# Volver a la configuración normal
docker-compose -f docker-compose.yml -f docker-compose.keepalive.yml down
docker-compose up -d
```

### Batería completa (opcional)

Requiere bash (Linux, macOS o Git Bash en Windows) y Node.js para el resumen. Tarda alrededor de 1 hora y sobrescribe `resultados/crudo/`.

```bash
bash scripts/run-benchmarks.sh
node scripts/parse-resultados.js    # genera resultados/resumen.csv
bash scripts/prueba-resiliencia.sh  # caída de réplica, autorreinicio, escalado y cuelgue
```

Conviene cerrar aplicaciones pesadas durante las pruebas, porque comparten la máquina con los contenedores.

## Bajar el entorno

```bash
docker-compose down
```

## Estructura

| Ruta | Contenido |
|---|---|
| `docker-compose.yml` | Manifiesto principal: 1 balanceador y 3 réplicas |
| `docker-compose.keepalive.yml` | Variante con keepalive, para reproducir el fallo en cascada |
| `api/` | Microservicio (`server.js`), su health check (`salud.js`) y su Dockerfile |
| `nginx/nginx.conf` | Balanceo, health checks y control de admisión |
| `scripts/` | Automatización de las pruebas |
| `resultados/` | Reportes crudos de `ab`, resumen y corrida inicial con keepalive |
| `informe/` | Capturas y generador del informe en PDF |
