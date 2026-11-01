#!/usr/bin/env bash
# Tres pruebas de resiliencia sobre el entorno ya levantado (tarda alrededor de 1,5 minutos).
# Uso: bash scripts/prueba-resiliencia.sh
set -u
cd "$(dirname "$0")/.."
export MSYS_NO_PATHCONV=1
ids() { for _ in $(seq 1 "$1"); do curl -s -m 5 http://localhost/ | sed -E 's/.*instancia":"([^"]+).*/\1/'; echo; done | sort | uniq -c; }

echo "### PRUEBA 1: se detiene una réplica en plena carga (t=10 s) y vuelve (t=20 s)"
docker-compose run --rm -T ab -l -r -t 30 -n 500000 -c 50 http://balanceador/ > /tmp/resiliencia-ab.txt 2>&1 &
sleep 10; echo "[t=10] docker stop tp3-api-2"; docker stop tp3-api-2 >/dev/null
sleep 10; echo "[t=20] docker start tp3-api-2"; docker start tp3-api-2 >/dev/null
wait
grep -E 'Complete requests|Failed requests|Non-2xx|Requests per second| 95%| 99%|100%' /tmp/resiliencia-ab.txt
sleep 12; echo "Reparto después de la vuelta:"; ids 9

echo; echo "### PRUEBA 2: muere el proceso de una réplica"
docker inspect -f 'antes:  reinicios={{.RestartCount}} estado={{.State.Status}}' tp3-api-3
docker exec tp3-api-3 sh -c 'kill 1'
sleep 13
docker inspect -f 'a 13 s: reinicios={{.RestartCount}} estado={{.State.Status}} salud={{.State.Health.Status}}' tp3-api-3

echo; echo "### PRUEBA 3: se escala a 5 réplicas sin reiniciar NGINX"
docker inspect -f 'NGINX iniciado: {{.State.StartedAt}}' tp3-balanceador-1
docker-compose up -d --wait --scale api=5 --no-recreate >/dev/null 2>&1; sleep 8
ids 15
docker inspect -f 'NGINX iniciado: {{.State.StartedAt}}' tp3-balanceador-1

docker-compose up -d --wait --scale api=3 --no-recreate >/dev/null 2>&1; sleep 8
echo; echo "De vuelta en 3 réplicas:"; ids 9
docker-compose ps --format '{{.Name}}  {{.Status}}'
