#!/usr/bin/env bash
# Batería completa de pruebas. Tarda alrededor de 1 hora. Los escenarios del informe también
# se pueden correr de a uno con los comandos del README; esto solo los automatiza.
# Uso (Linux, macOS o Git Bash en Windows): bash scripts/run-benchmarks.sh
set -u
cd "$(dirname "$0")/.."
export MSYS_NO_PATHCONV=1
DUR=20; REPS=3; PAUSA=5
OUT=resultados/crudo; mkdir -p "$OUT"

levantar() { # $1=réplicas  $2=archivos compose extra
  docker-compose -f docker-compose.yml $2 down --remove-orphans >/dev/null 2>&1
  docker-compose -f docker-compose.yml $2 up -d --wait --scale api="$1" >/dev/null 2>&1
  sleep 8
}

medir() { # $1=etiqueta  $2=concurrencia  $3=URL (opcional)
  for r in $(seq 1 $REPS); do
    f="$OUT/$1_c$2_r$r"
    desde=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    ( sleep 4; for _ in 1 2 3; do
        docker stats --no-stream --format '{{.Name}},{{.CPUPerc}}' | grep '^tp3-'
      done > "$f.stats" ) &
    docker-compose -f docker-compose.yml $EXTRA run --rm -T ab -l -r -t $DUR -n 2000000 -c "$2" "${3:-http://balanceador/}" > "$f.txt" 2>&1
    wait
    docker logs --since "$desde" tp3-balanceador-1 > "$f.nginx" 2>&1
    echo "$(date +%T) $1 c=$2 rep=$r: $(grep -E 'Requests per second' "$f.txt" | awk '{print $4}') req/s"
    sleep $PAUSA
  done
}

# 1. Base: 3 réplicas. Barrido de concurrencia, hasta muy por encima del control de
# admisión (1500 peticiones en curso).
EXTRA=""; levantar 3 ""
for c in 1 10 50 100 200 300 400 450 480 500 600 800 1000 1500 2000 3000 4000 6000; do medir base3 $c; done

# Carga sostenida: con corridas de 20 s no se ve lo que se agota con el tiempo (con la
# configuración original, a ~7700 req/s los puertos hacia las réplicas se acababan a los ~45 s).
REPS=1 DUR=120 medir sostenida3 100

# Techo del balanceador: /health casi no usa las réplicas; /nginx-health ni las toca.
medir salud3 100 http://balanceador/health; medir nginxpuro 100 http://balanceador/nginx-health

# 2. Escalabilidad: mismas pruebas variando réplicas.
levantar 1 ""
medir rep1 1
# Una réplica sin balanceador: sirve para aislar el costo de NGINX.
medir directo1 1 http://api:3000/; medir directo1 100 http://api:3000/
for n in 1 2 4 5; do
  levantar $n ""
  for c in 100 200; do medir "rep$n" $c; done
done

# 3. La configuración inicial con keepalive, para documentar el fallo en cascada.
EXTRA="-f docker-compose.keepalive.yml"; levantar 3 "$EXTRA"
for c in 100 150 200; do medir keepalive3 $c; done

# Deja el entorno como lo pide la consigna.
docker-compose -f docker-compose.yml -f docker-compose.keepalive.yml down >/dev/null 2>&1
docker-compose up -d --wait >/dev/null 2>&1
echo "FIN"
