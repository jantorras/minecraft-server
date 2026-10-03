#!/usr/bin/env bash
# Instal·lació des de zero del panell en una VM Ubuntu nova. Els servidors de Minecraft
# (i els proxys) no els crea aquest script: es creen després des del panell, a «Servidors».
#
# Ús:
#   1. Copia tot aquest directori del projecte a la VM (scp -r, rsync, o git clone un cop hi hagi remot).
#   2. Posa a deploy/plugins/ els .jar de LuckPerms (Bukkit), PlaceholderAPI i TAB
#      (veure docs/01-infraestructura.md secció 5 per les URLs), i a deploy/plugins/velocity/
#      els dels proxys (LuckPerms per a Velocity), si en vols. El bridge-*.jar ja hi és
#      automàticament si l'has compilat (bridge/build/libs/).
#   3. sudo ./install.sh
#   4. Quan acabi, crea el primer usuari owner del panell (t'ho dirà el mateix script).
#
# Variables opcionals (export abans d'executar per canviar els valors per defecte):
#   PANEL_ORIGIN, PANEL_PORT
#   CLOUDFLARE_TUNNEL_TOKEN  token d'un túnel de Cloudflare; si no hi és, l'script el demana
#                            (es pot deixar en blanc: el túnel és opcional)
#
# Pensat per una VM Ubuntu Server nova i neta. És raonablement idempotent (es pot
# tornar a córrer), però no s'ha provat de cap a cap contra una VM completament en
# blanc — prova-ho primer en una VM de prova abans de confiar-hi per un servidor real.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PANEL_USER="panell"
PANEL_DIR="/opt/panell"
MC_ROOT="/opt/minecraft"
PANEL_PORT="${PANEL_PORT:-3000}"
ENV_FILE="$PANEL_DIR/app/panel/.env"
# Xarxa Docker que comparteixen els servidors, els proxys i MariaDB (el panell hi compta).
NETWORK="mcnet"

log() { echo -e "\n==> $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Executa'm com a root (sudo ./install.sh)."
[ -d "$SCRIPT_DIR/panel" ] && [ -d "$SCRIPT_DIR/bridge" ] || die "Executa'm des de l'arrel del projecte (on hi ha panel/ i bridge/)."

# ---------------------------------------------------------------------------
# Túnel de Cloudflare (opcional): es pregunta al principi per no haver d'esperar la resta.
CLOUDFLARE_TUNNEL_TOKEN="${CLOUDFLARE_TUNNEL_TOKEN:-}"
TUNNEL_COMPOSE="$MC_ROOT/cloudflared/docker-compose.yml"
if [ -z "$CLOUDFLARE_TUNNEL_TOKEN" ] && [ ! -f "$TUNNEL_COMPOSE" ] && [ -t 0 ]; then
	echo "Vols publicar el panell amb un túnel de Cloudflare? (opcional)"
	echo "  Crea el túnel a Cloudflare Zero Trust → Networks → Tunnels i enganxa'n el token."
	read -r -p "Token del túnel (en blanc per saltar-ho): " CLOUDFLARE_TUNNEL_TOKEN
fi
if [ -n "$CLOUDFLARE_TUNNEL_TOKEN" ] && [ -z "${PANEL_ORIGIN:-}" ] && [ -t 0 ]; then
	echo "Amb quina adreça s'entrarà al panell pel túnel? Els formularis només funcionen des d'aquesta adreça."
	read -r -p "URL pública (p. ex. https://panell.exemple.cat; en blanc = la IP de la xarxa local): " PANEL_ORIGIN
fi

# ---------------------------------------------------------------------------
log "Paquets base"
apt-get update -y
apt-get install -y curl git ufw build-essential rsync openssl

# ---------------------------------------------------------------------------
log "Docker"
if ! command -v docker &>/dev/null; then
	curl -fsSL https://get.docker.com | sh
else
	echo "Ja instal·lat."
fi

# ---------------------------------------------------------------------------
log "Node.js 24"
if ! command -v node &>/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 24 ]; then
	curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
	apt-get install -y nodejs
else
	echo "Ja instal·lat ($(node -v))."
fi

# ---------------------------------------------------------------------------
log "Usuari de sistema «$PANEL_USER»"
id "$PANEL_USER" &>/dev/null || useradd --system --create-home --home-dir "$PANEL_DIR" --shell /usr/sbin/nologin "$PANEL_USER"
usermod -aG docker "$PANEL_USER"

mkdir -p "$MC_ROOT/servers" "$MC_ROOT/backups" "$MC_ROOT/plugins/paper" "$MC_ROOT/plugins/velocity" "$MC_ROOT/mariadb" "$PANEL_DIR/app"

# ---------------------------------------------------------------------------
log "Xarxa Docker «$NETWORK»"
docker network inspect "$NETWORK" &>/dev/null || docker network create "$NETWORK"

# ---------------------------------------------------------------------------
log "MariaDB (rols de LuckPerms, compartits per tots els servidors)"
# La imatge només aplica la contrasenya el primer cop que crea la base de dades, així que
# en tornar a córrer l'script cal reutilitzar la que ja hi ha al .env del panell.
if [ -z "${LUCKPERMS_DB_PASSWORD:-}" ] && [ -f "$ENV_FILE" ]; then
	LUCKPERMS_DB_PASSWORD="$(grep -m1 '^LP_DB_PASSWORD=' "$ENV_FILE" | cut -d= -f2- || true)"
fi
LUCKPERMS_DB_PASSWORD="${LUCKPERMS_DB_PASSWORD:-$(openssl rand -hex 16)}"
cat >"$MC_ROOT/mariadb/docker-compose.yml" <<EOF
services:
  mariadb:
    image: mariadb:11
    container_name: mariadb
    restart: unless-stopped
    networks:
      - $NETWORK
    environment:
      MARIADB_RANDOM_ROOT_PASSWORD: "1"
      MARIADB_DATABASE: "luckperms"
      MARIADB_USER: "luckperms"
      MARIADB_PASSWORD: "$LUCKPERMS_DB_PASSWORD"
    volumes:
      - ./data:/var/lib/mysql
networks:
  $NETWORK:
    external: true
EOF
chmod 600 "$MC_ROOT/mariadb/docker-compose.yml"
(cd "$MC_ROOT/mariadb" && docker compose up -d)

# ---------------------------------------------------------------------------
log "Catàleg de plugins (el panell els copia a cada servidor nou)"
shopt -s nullglob
paper_jars=("$SCRIPT_DIR"/deploy/plugins/*.jar "$SCRIPT_DIR"/bridge/build/libs/*.jar)
velocity_jars=("$SCRIPT_DIR"/deploy/plugins/velocity/*.jar)
shopt -u nullglob
if [ ${#paper_jars[@]} -eq 0 ]; then
	echo "Avís: no he trobat cap .jar a deploy/plugins/ ni bridge/build/libs/."
	echo "  Els servidors nous arrencaran sense plugins; copia'ls i torna a córrer aquest script."
fi
for j in ${paper_jars[@]+"${paper_jars[@]}"}; do
	cp "$j" "$MC_ROOT/plugins/paper/"
	echo "  paper: $(basename "$j")"
done
for j in ${velocity_jars[@]+"${velocity_jars[@]}"}; do
	cp "$j" "$MC_ROOT/plugins/velocity/"
	echo "  velocity: $(basename "$j")"
done

# ---------------------------------------------------------------------------
log "Copiant el panell a $PANEL_DIR/app"
rsync -a --delete --exclude node_modules --exclude .svelte-kit --exclude build --exclude data --exclude .env "$SCRIPT_DIR/panel/" "$PANEL_DIR/app/panel/"

# El directori de MariaDB és del contenidor; la resta, del panell.
chown "$PANEL_USER:$PANEL_USER" "$MC_ROOT"
chown -R "$PANEL_USER:$PANEL_USER" "$MC_ROOT/servers" "$MC_ROOT/backups" "$MC_ROOT/plugins" "$PANEL_DIR"

LAN_IP="$(hostname -I | awk '{print $1}')"
ORIGIN="${PANEL_ORIGIN:-http://$LAN_IP:$PANEL_PORT}"

log "Generant .env del panell"
cat >"$ENV_FILE" <<EOF
DATABASE_PATH=data/panel.db

ORIGIN=$ORIGIN
PORT=$PANEL_PORT
HOST=0.0.0.0

# On viuen els servidors que crea el panell (servers/, backups/, plugins/, trash/)
MC_ROOT=$MC_ROOT

# Base de dades de LuckPerms (contenidor «mariadb» a la xarxa $NETWORK)
LP_DB_ADDRESS=mariadb
LP_DB_NAME=luckperms
LP_DB_USER=luckperms
LP_DB_PASSWORD=$LUCKPERMS_DB_PASSWORD
EOF
chown "$PANEL_USER:$PANEL_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"

# ---------------------------------------------------------------------------
log "Instal·lant i compilant el panell (npm ci + build)"
sudo -u "$PANEL_USER" bash -c "cd '$PANEL_DIR/app/panel' && npm ci && npm run build"

# ---------------------------------------------------------------------------
log "Servei systemd del panell"
cat >/etc/systemd/system/panell.service <<EOF
[Unit]
Description=Panell del servidor Minecraft
After=network.target docker.service

[Service]
User=$PANEL_USER
WorkingDirectory=$PANEL_DIR/app/panel
ExecStart=/usr/bin/npm start
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable panell
systemctl restart panell

# ---------------------------------------------------------------------------
if [ -n "$CLOUDFLARE_TUNNEL_TOKEN" ]; then
	log "Túnel de Cloudflare"
	mkdir -p "$(dirname "$TUNNEL_COMPOSE")"
	# Xarxa del host: el túnel ha de poder arribar al panell a localhost:$PANEL_PORT.
	cat >"$TUNNEL_COMPOSE" <<EOF
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared
    restart: unless-stopped
    network_mode: host
    command: tunnel --no-autoupdate run
    environment:
      TUNNEL_TOKEN: "$CLOUDFLARE_TUNNEL_TOKEN"
EOF
	chmod 600 "$TUNNEL_COMPOSE"
	(cd "$(dirname "$TUNNEL_COMPOSE")" && docker compose up -d)
elif [ -f "$TUNNEL_COMPOSE" ]; then
	echo "Túnel de Cloudflare: es manté el que ja hi havia configurat."
fi

# ---------------------------------------------------------------------------
log "Tallafoc"
# Només cal obrir el panell: els ports que Docker publica (els dels servidors) no passen
# per ufw, i RCON i el Bridge de cada servidor només es publiquen a 127.0.0.1.
ufw allow OpenSSH
ufw allow "$PANEL_PORT"/tcp
ufw --force enable

# ---------------------------------------------------------------------------
log "Fet!"
cat <<EOF

Panell: $ORIGIN
Contrasenya de la base de dades de LuckPerms: $LUCKPERMS_DB_PASSWORD
(també és a $MC_ROOT/mariadb/docker-compose.yml i $ENV_FILE)

Encara et falta:
  1. Crea el primer usuari (owner) del panell:
       sudo -u $PANEL_USER bash -c "cd $PANEL_DIR/app/panel && npm run create-user -- <nom> owner"
  2. Entra a $ORIGIN i crea el primer servidor a «Servidors».
  3. Fes-te owner/admin tu i els teus amics, i configura el TAB des de la pàgina «TAB».
EOF
if [ -f "$TUNNEL_COMPOSE" ]; then
	cat <<EOF
  4. Túnel de Cloudflare: al tauler del túnel, afegeix un «Public Hostname» que apunti a
       http://localhost:$PANEL_PORT
     (el token és a $TUNNEL_COMPOSE; estat: docker logs cloudflared)
EOF
fi
