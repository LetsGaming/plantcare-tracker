#!/usr/bin/env bash
#
# Migrates a PM2 based PlantCare deployment to the Docker stack of this repository.
#
#   1. installs Docker and the Compose plugin when they are missing (Linux, needs root or sudo)
#   2. reads the old backend/.env and writes the compose .env from it (secrets are reused)
#   3. stops the PM2 app, so the SQLite file is consistent, and keeps a copy of the database
#   4. builds the images and copies the database and the uploaded images into the data volume
#   5. starts the stack, waits for it to be healthy and compares row counts of old and new database
#
# The old deployment is never modified except for stopping the PM2 app; it is restarted if a step fails
# before the new stack is verified. Uploaded images are mounted read-only while copying.
#
# Usage: scripts/migrate-pm2-to-docker.sh [options]
#   --backend-dir DIR   old backend directory (default: <repo>/backend)
#   --env-file FILE     old environment file (default: <backend-dir>/.env)
#   --pm2-name NAME     PM2 app name (default: plantcare-backend)
#   --http-port PORT    port the Docker stack publishes (default: 8080)
#   --backup-dir DIR    where the database backup goes (default: ~/plantcare-migration-<timestamp>)
#   --remove-pm2        delete the PM2 app and run `pm2 save` after a verified migration
#   --skip-docker-install  fail instead of installing Docker when it is missing
#   --force             overwrite an existing compose .env and a non-empty data volume
#   --dry-run           print what would happen without changing anything
#   --yes               do not ask for confirmation
#   -h, --help          show this help

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

BACKEND_DIR="$ROOT/backend"
ENV_FILE=""
PM2_NAME="plantcare-backend"
HTTP_PORT="8080"
BACKUP_DIR=""
REMOVE_PM2=0
SKIP_DOCKER_INSTALL=0
FORCE=0
DRY_RUN=0
ASSUME_YES=0

log() { printf '[migrate] %s\n' "$*"; }
warn() { printf '[migrate] WARNING: %s\n' "$*" >&2; }
die() { printf '[migrate] ERROR: %s\n' "$*" >&2; exit 1; }

usage() { sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed '$d' | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --backend-dir) BACKEND_DIR="$2"; shift 2 ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    --pm2-name) PM2_NAME="$2"; shift 2 ;;
    --http-port) HTTP_PORT="$2"; shift 2 ;;
    --backup-dir) BACKUP_DIR="$2"; shift 2 ;;
    --remove-pm2) REMOVE_PM2=1; shift ;;
    --skip-docker-install) SKIP_DOCKER_INSTALL=1; shift ;;
    --force) FORCE=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1 (see --help)" ;;
  esac
done

BACKEND_DIR="$(cd "$BACKEND_DIR" 2>/dev/null && pwd)" || die "Backend directory not found: $BACKEND_DIR"
[ -n "$ENV_FILE" ] || ENV_FILE="$BACKEND_DIR/.env"
[ -n "$BACKUP_DIR" ] || BACKUP_DIR="${HOME:-$PWD}/plantcare-migration-$(date +%Y%m%d-%H%M%S)"
COMPOSE_ENV="$ROOT/.env"

# ── helpers ──────────────────────────────────────────────────────────────────

# Runs a command, or only prints it in dry-run mode.
run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '[dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

confirm() {
  [ "$ASSUME_YES" -eq 1 ] || [ "$DRY_RUN" -eq 1 ] && return 0
  printf '[migrate] %s [y/N] ' "$1"
  read -r answer
  case "$answer" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

# Reads KEY from an env file without sourcing it (the file is data, not code).
env_get() {
  local key="$1" file="$2" value
  [ -f "$file" ] || return 0
  value="$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n 1 | cut -d= -f2- | tr -d '\r' || true)"
  value="${value%%[[:space:]]#*}"
  value="${value%"${value##*[![:space:]]}"}"
  value="${value#\"}"; value="${value%\"}"
  value="${value#\'}"; value="${value%\'}"
  printf '%s' "$value"
}

abs_path() {
  case "$1" in
    /*) printf '%s' "$1" ;;
    *) printf '%s/%s' "$BACKEND_DIR" "${1#./}" ;;
  esac
}

SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then SUDO="sudo"; fi

# ── 1. Docker and Compose ────────────────────────────────────────────────────

DOCKER=(docker)

install_docker() {
  [ "$SKIP_DOCKER_INSTALL" -eq 0 ] || die "Docker is missing and --skip-docker-install was given."
  [ "$(uname -s)" = "Linux" ] || die "Docker is missing. Install Docker Desktop for $(uname -s) and run this script again."
  if [ "$(id -u)" -ne 0 ] && [ -z "$SUDO" ]; then die "Installing Docker needs root or sudo."; fi
  log "Docker is not installed."
  confirm "Install Docker Engine and the Compose plugin with the official script from get.docker.com?" || die "Aborted."
  local installer
  installer="$(mktemp)"
  if command -v curl >/dev/null 2>&1; then
    run curl -fsSL https://get.docker.com -o "$installer"
  elif command -v wget >/dev/null 2>&1; then
    run wget -qO "$installer" https://get.docker.com
  else
    die "Neither curl nor wget is available to download the Docker installer."
  fi
  run $SUDO sh "$installer"
  rm -f "$installer"
  if command -v systemctl >/dev/null 2>&1; then run $SUDO systemctl enable --now docker; fi
}

install_compose_plugin() {
  [ "$SKIP_DOCKER_INSTALL" -eq 0 ] || die "The Docker Compose plugin is missing and --skip-docker-install was given."
  [ "$(uname -s)" = "Linux" ] || die "The Docker Compose plugin is missing. Update Docker Desktop and run this script again."
  confirm "Install the Docker Compose plugin with the system package manager?" || die "Aborted."
  if command -v apt-get >/dev/null 2>&1; then
    run $SUDO apt-get update
    run $SUDO apt-get install -y docker-compose-plugin
  elif command -v dnf >/dev/null 2>&1; then
    run $SUDO dnf install -y docker-compose-plugin
  elif command -v yum >/dev/null 2>&1; then
    run $SUDO yum install -y docker-compose-plugin
  else
    die "No supported package manager found. Install the Docker Compose plugin manually."
  fi
}

ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    install_docker
  fi
  if [ "$DRY_RUN" -eq 1 ] && ! command -v docker >/dev/null 2>&1; then
    log "Dry run: skipping the Docker checks because Docker is not installed."
    return 0
  fi
  if ! docker info >/dev/null 2>&1; then
    if [ "$DRY_RUN" -eq 1 ]; then
      log "Dry run: the Docker daemon is not reachable here, skipping the Docker checks."
      return 0
    fi
    if [ -n "$SUDO" ] && $SUDO docker info >/dev/null 2>&1; then
      DOCKER=($SUDO docker)
      warn "Using sudo for Docker. Add your user to the docker group to avoid this: sudo usermod -aG docker \$USER"
    else
      die "The Docker daemon is not reachable. Start it (systemctl start docker) or check your permissions."
    fi
  fi
  if ! "${DOCKER[@]}" compose version >/dev/null 2>&1; then
    install_compose_plugin
    "${DOCKER[@]}" compose version >/dev/null 2>&1 || die "Docker Compose is still not available after the installation."
  fi
  log "Docker $("${DOCKER[@]}" version --format '{{.Server.Version}}' 2>/dev/null || echo '?') and $("${DOCKER[@]}" compose version --short 2>/dev/null || echo 'compose') are ready."
}

compose() { "${DOCKER[@]}" compose --project-directory "$ROOT" "$@"; }

# ── 2. Read the old deployment ───────────────────────────────────────────────

command -v curl >/dev/null 2>&1 || [ "$DRY_RUN" -eq 1 ] || die "curl is required to verify the new stack. Install it and run this script again."
[ -f "$ROOT/docker-compose.yml" ] || die "docker-compose.yml not found in $ROOT. Run this script from a checkout of the repository."
[ -f "$ENV_FILE" ] || warn "No env file at $ENV_FILE, using defaults and generating no secrets from it."

OLD_DB="$(env_get DB_PATH "$ENV_FILE")"
OLD_UPLOADS="$(env_get NAS_PATH "$ENV_FILE")"
DB_PATH_ABS="$(abs_path "${OLD_DB:-./data/plantcare.db}")"
UPLOADS_ABS="$(abs_path "${OLD_UPLOADS:-./uploads}")"
DB_DIR="$(dirname "$DB_PATH_ABS")"
DB_FILE="$(basename "$DB_PATH_ABS")"

[ -f "$DB_PATH_ABS" ] || die "Database not found: $DB_PATH_ABS (set DB_PATH in $ENV_FILE or use --backend-dir)."
if [ -d "$UPLOADS_ABS" ]; then HAVE_UPLOADS=1; else HAVE_UPLOADS=0; warn "No uploads directory at $UPLOADS_ABS, skipping images."; fi

JWT_SECRET_OLD="$(env_get JWT_SECRET "$ENV_FILE")"
JWT_REFRESH_OLD="$(env_get JWT_REFRESH_SECRET "$ENV_FILE")"
[ -n "$JWT_SECRET_OLD" ] && [ -n "$JWT_REFRESH_OLD" ] || die "JWT_SECRET and JWT_REFRESH_SECRET must be set in $ENV_FILE."

log "Old deployment:"
log "  backend dir : $BACKEND_DIR"
log "  database    : $DB_PATH_ABS ($(du -h "$DB_PATH_ABS" | cut -f1))"
if [ "$HAVE_UPLOADS" -eq 1 ]; then log "  uploads     : $UPLOADS_ABS ($(du -sh "$UPLOADS_ABS" | cut -f1))"; fi
log "  PM2 app     : $PM2_NAME"
log "New stack: $ROOT/docker-compose.yml on port $HTTP_PORT"
confirm "Continue?" || die "Aborted."

ensure_docker

# ── 3. Compose environment ───────────────────────────────────────────────────

write_compose_env() {
  if [ -f "$COMPOSE_ENV" ] && [ "$FORCE" -eq 0 ]; then
    log "Keeping the existing $COMPOSE_ENV (use --force to replace it)."
    return 0
  fi
  if [ -f "$COMPOSE_ENV" ]; then run cp "$COMPOSE_ENV" "$COMPOSE_ENV.bak-$(date +%s)"; fi
  log "Writing $COMPOSE_ENV from the old environment."
  if [ "$DRY_RUN" -eq 1 ]; then return 0; fi
  (
    umask 077
    {
      echo "JWT_SECRET=$JWT_SECRET_OLD"
      echo "JWT_REFRESH_SECRET=$JWT_REFRESH_OLD"
      echo "JWT_EXPIRATION=$(env_get JWT_EXPIRATION "$ENV_FILE")"
      echo "JWT_REFRESH_EXPIRATION=$(env_get JWT_REFRESH_EXPIRATION "$ENV_FILE")"
      echo "OPENAI_API_KEY=$(env_get OPENAI_API_KEY "$ENV_FILE")"
      echo "ALLOWED_ORIGINS=$(env_get ALLOWED_ORIGINS "$ENV_FILE")"
      echo "PUBLIC_BASE_URL=$(env_get PUBLIC_BASE_URL "$ENV_FILE")"
      echo "HTTP_PORT=$HTTP_PORT"
      echo "VITE_API_URL=/api/v2"
    } | sed -e 's/^JWT_EXPIRATION=$/JWT_EXPIRATION=15m/' -e 's/^JWT_REFRESH_EXPIRATION=$/JWT_REFRESH_EXPIRATION=7d/' > "$COMPOSE_ENV"
  )
}
write_compose_env

# ── 4. Stop PM2, back up, build, copy ────────────────────────────────────────

PM2_WAS_STOPPED=0
rollback() {
  local code=$?
  if [ "$code" -ne 0 ] && [ "$PM2_WAS_STOPPED" -eq 1 ] && [ "$DRY_RUN" -eq 0 ]; then
    warn "Migration failed. Restarting the PM2 app $PM2_NAME."
    pm2 start "$PM2_NAME" >/dev/null 2>&1 || warn "Could not restart $PM2_NAME, run: pm2 start $PM2_NAME"
  fi
  exit "$code"
}
trap rollback EXIT

log "Building the images (this can take a few minutes)."
run compose build

if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
    log "Stopping the PM2 app $PM2_NAME for a consistent copy."
    run pm2 stop "$PM2_NAME"
    PM2_WAS_STOPPED=1
  else
    warn "PM2 has no app named $PM2_NAME. Assuming the backend is not running."
  fi
else
  warn "pm2 is not installed on this machine. Assuming the backend is not running."
  confirm "Is the old backend stopped?" || die "Stop the old backend first."
fi

log "Backing up the database to $BACKUP_DIR."
run mkdir -p "$BACKUP_DIR"
for suffix in "" "-wal" "-shm"; do
  if [ -f "$DB_PATH_ABS$suffix" ]; then run cp -p "$DB_PATH_ABS$suffix" "$BACKUP_DIR/$DB_FILE$suffix"; fi
done
run cp -p "$ENV_FILE" "$BACKUP_DIR/old.env" 2>/dev/null || true
run chmod -R go-rwx "$BACKUP_DIR"

COUNT_JS='
const Database = require("better-sqlite3");
const fs = require("fs");
const [src, label] = process.argv.slice(1);
const copy = "/tmp/count-" + label + ".db";
for (const s of ["", "-wal", "-shm"]) if (fs.existsSync(src + s)) fs.copyFileSync(src + s, copy + s);
const db = new Database(copy, { readonly: false });
const out = {};
for (const t of ["users", "plants", "watering_records", "substrates", "components", "images"]) {
  try { out[t] = db.prepare("SELECT COUNT(*) AS n FROM " + t).get().n; } catch { out[t] = null; }
}
console.log(JSON.stringify(out));
'

# Runs inside the backend image with the data volume mounted, as root so it can set ownership.
copy_into_volume() {
  compose create backend >/dev/null
  compose run --rm --no-deps -u root --entrypoint sh \
    -v "$DB_DIR:/migrate/db:ro" \
    -v "$( [ "$HAVE_UPLOADS" -eq 1 ] && echo "$UPLOADS_ABS" || echo "$BACKUP_DIR" ):/migrate/uploads:ro" \
    -e "DB_FILE=$DB_FILE" -e "HAVE_UPLOADS=$HAVE_UPLOADS" -e "FORCE=$FORCE" -e "COUNT_JS=$COUNT_JS" \
    backend -c '
      set -e
      if [ -e /data/plantcare.db ] && [ "$FORCE" != "1" ]; then
        echo "The data volume already holds a database. Use --force to replace it." >&2
        exit 3
      fi
      rm -f /data/plantcare.db /data/plantcare.db-wal /data/plantcare.db-shm
      for suffix in "" "-wal" "-shm"; do
        if [ -f "/migrate/db/$DB_FILE$suffix" ]; then cp -p "/migrate/db/$DB_FILE$suffix" "/data/plantcare.db$suffix"; fi
      done
      mkdir -p /data/uploads
      if [ "$HAVE_UPLOADS" = "1" ]; then cp -a /migrate/uploads/. /data/uploads/; fi
      chown -R node:node /data
      echo "SOURCE $(cd /app && node -e "$COUNT_JS" "/migrate/db/$DB_FILE" src)"
      echo "TARGET $(cd /app && node -e "$COUNT_JS" /data/plantcare.db dst)"
      echo "FILES $(find /data/uploads -type f | wc -l)"
    '
}

log "Copying the database and the uploaded images into the data volume."
if [ "$DRY_RUN" -eq 1 ]; then
  log "Dry run: would copy $DB_PATH_ABS and $UPLOADS_ABS into the plantcare-data volume."
  COPY_OUT=""
else
  COPY_OUT="$(copy_into_volume)" || die "Copying into the data volume failed (see above)."
  printf '%s\n' "$COPY_OUT"
  SRC_COUNT="$(printf '%s\n' "$COPY_OUT" | sed -n 's/^SOURCE //p')"
  DST_COUNT="$(printf '%s\n' "$COPY_OUT" | sed -n 's/^TARGET //p')"
  [ -n "$SRC_COUNT" ] && [ "$SRC_COUNT" = "$DST_COUNT" ] || die "Row counts differ between the old and the copied database."
  if [ "$HAVE_UPLOADS" -eq 1 ]; then
    SRC_FILES="$(find "$UPLOADS_ABS" -type f | wc -l | tr -d ' ')"
    DST_FILES="$(printf '%s\n' "$COPY_OUT" | sed -n 's/^FILES //p' | tr -d ' ')"
    [ "$SRC_FILES" = "$DST_FILES" ] || die "Uploaded file counts differ ($SRC_FILES in the old folder, $DST_FILES in the volume)."
  fi
fi

# ── 5. Start and verify ──────────────────────────────────────────────────────

log "Starting the Docker stack."
run compose up -d --wait --wait-timeout 240

if [ "$DRY_RUN" -eq 0 ]; then
  base="http://127.0.0.1:$HTTP_PORT"
  health_ok=0
  for _ in $(seq 1 30); do
    if curl -fsS "$base/healthz" >/dev/null 2>&1 && curl -fsS "$base/api/v2/health" 2>/dev/null | grep -q '"status":"ok"'; then
      health_ok=1; break
    fi
    sleep 2
  done
  [ "$health_ok" -eq 1 ] || die "The new stack did not become healthy. Logs: docker compose logs backend"
  log "The new stack answers on $base."
fi

# The new stack is verified: from here on a failure must not restart the old app.
PM2_WAS_STOPPED=0

if [ "$REMOVE_PM2" -eq 1 ] && command -v pm2 >/dev/null 2>&1; then
  log "Removing the PM2 app $PM2_NAME."
  run pm2 delete "$PM2_NAME"
  run pm2 save
fi

cat <<EOF

[migrate] Done.
  App            : http://localhost:$HTTP_PORT
  Database copy  : $BACKUP_DIR
  Old data       : untouched in $DB_DIR and $UPLOADS_ABS (delete it once you are happy)
  Logs           : docker compose logs -f backend

Next steps:
  - Sign in with an existing account and check a few plants and photos.
  - If a reverse proxy on this host pointed to the old backend (port 5000), point it to 127.0.0.1:$HTTP_PORT instead,
    and keep forwarding X-Forwarded-Proto so cookies get the Secure flag.
  - Image URLs are converted to relative paths by the backend migrations on its first start.
$( [ "$REMOVE_PM2" -eq 1 ] && echo "  - PM2 app removed. If you used 'pm2 startup', remove it with: pm2 unstartup" || echo "  - The PM2 app is stopped, not removed. Remove it with: pm2 delete $PM2_NAME && pm2 save" )
EOF
