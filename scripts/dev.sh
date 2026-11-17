#!/usr/bin/env bash
# Avvia in locale, in un solo terminale, Next.js, il server WebSocket e il
# worker (`npm run dev:all`). Ogni riga di output è preceduta dal nome del
# processo. Con Ctrl-C, o se uno dei processi termina, li ferma tutti.
# MongoDB e Redis vanno avviati a parte (`docker compose up -d --wait db redis`).
#
# Opzioni:
#   --no-worker   non avvia il worker dei lavori in background
set -u
cd "$(dirname "$0")/.."

worker=1
for arg in "$@"; do
    case "$arg" in
        --no-worker) worker=0 ;;
        -h|--help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
        *) echo "Opzione sconosciuta: $arg" >&2; exit 2 ;;
    esac
done

# Only a warning: MONGODB_URI and REDIS_URL may point elsewhere.
for service in "MongoDB 27017" "Redis 6379"; do
    set -- $service
    if ! (exec 3<>"/dev/tcp/127.0.0.1/$2") 2>/dev/null; then
        echo "Attenzione: $1 non risponde sulla porta $2 (docker compose up -d --wait db redis)." >&2
    fi
done

# The output goes through a pipe for the prefix, so the tools would disable
# colors: force them, and color the prefixes, only on a terminal.
color=0
if [ -t 1 ]; then
    color=1
    export FORCE_COLOR=1
fi

pids=()
# Each process gets its own process group, so that stopping it also stops
# the children started by npm (next-server, tsx watch, …).
start() {
    local name=$1 script=$2 code=$3 prefix
    prefix="[$name] "
    [ "$color" = 1 ] && prefix=$'\e['"${code}m[$name]"$'\e[0m '
    PREFIX=$prefix setsid bash -c "npm run --silent $script 2>&1 | awk '{ print ENVIRON[\"PREFIX\"] \$0; fflush() }'" &
    pids+=("$!")
}

stopping=0
stop() {
    [ "$stopping" = 1 ] && return
    stopping=1
    echo "Arresto dei processi…" >&2
    for pid in "${pids[@]}"; do kill -TERM -- "-$pid" 2>/dev/null; done
    # tsx watch may ignore SIGTERM: force after a few seconds.
    for _ in 1 2 3 4 5; do
        alive=0
        for pid in "${pids[@]}"; do kill -0 -- "-$pid" 2>/dev/null && alive=1; done
        [ "$alive" = 0 ] && return
        sleep 1
    done
    for pid in "${pids[@]}"; do kill -KILL -- "-$pid" 2>/dev/null; done
}
trap 'stop; exit 130' INT TERM HUP
trap stop EXIT

start next dev 36
start ws ws-server:watch 35
[ "$worker" = 1 ] && start worker olifogli:worker 33

# Stop everything as soon as one process ends.
wait -n
status=$?
echo "Un processo è terminato (codice $status)." >&2
exit "$status"
