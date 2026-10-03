#!/usr/bin/env bash
# Instal·lació des de zero del servidor Minecraft (Docker) + panell, en una VM Ubuntu nova.
#
# Ús:
#   1. Copia tot aquest directori del projecte a la VM (scp -r, rsync, o git clone un cop hi hagi remot).
#   2. Posa a deploy/plugins/ els .jar de LuckPerms (Bukkit), PlaceholderAPI i TAB
#      (veure docs/01-infraestructura.md secció 5 per les URLs). El bridge-*.jar ja hi
#      és automàticament si l'has compilat (bridge/build/libs/).
#   3. sudo ./install.sh
#   4. Quan acabi, crea el primer usuari owner del panell (t'ho dirà el mateix script).
#
# Variables opcionals (export abans d'executar per canviar els valors per defecte):
#   MC_CONTAINER, MC_VERSION, MC_MEMORY, MC_SERVER_NAME, PANEL_ORIGIN, PANEL_PORT
#
# Pensat per una VM Ubuntu Server nova i neta. És raonablement idempotent (es pot
# tornar a córrer), però no s'ha provat de cap a cap contra una VM completament en
# blanc — prova-ho primer en una VM de prova abans de confiar-hi per un servidor real.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MC_CONTAINER="${MC_CONTAINER:-mc-claude}"
MC_VERSION="${MC_VERSION:-26.2}"
MC_MEMORY="${MC_MEMORY:-3G}"
MC_SERVER_NAME="${MC_SERVER_NAME:-Claude}"
PANEL_USER="panell"
PANEL_DIR="/opt/panell"
MC_DIR="/opt/minecraft"
PANEL_PORT="${PANEL_PORT:-3000}"
BOOT_TIMEOUT=180 # segons a esperar que el servidor digui "Done (" en cada arrencada

log() { echo -e "\n==> $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Executa'm com a root (sudo ./install.sh)."
[ -d "$SCRIPT_DIR/panel" ] && [ -d "$SCRIPT_DIR/bridge" ] || die "Executa'm des de l'arrel del projecte (on hi ha panel/ i bridge/)."

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
log "MariaDB"
if ! command -v mariadb &>/dev/null && ! command -v mysql &>/dev/null; then
	apt-get install -y mariadb-server
fi
systemctl enable --now mariadb

LUCKPERMS_DB_PASSWORD="${LUCKPERMS_DB_PASSWORD:-$(openssl rand -hex 16)}"
mysql -e "
	CREATE DATABASE IF NOT EXISTS luckperms;
	CREATE USER IF NOT EXISTS 'luckperms'@'localhost' IDENTIFIED BY '${LUCKPERMS_DB_PASSWORD}';
	ALTER USER 'luckperms'@'localhost' IDENTIFIED BY '${LUCKPERMS_DB_PASSWORD}';
	GRANT ALL ON luckperms.* TO 'luckperms'@'localhost';
	FLUSH PRIVILEGES;
"
echo "Base de dades luckperms llesta."

# ---------------------------------------------------------------------------
log "Usuari de sistema «$PANEL_USER»"
id "$PANEL_USER" &>/dev/null || useradd --system --create-home --home-dir "$PANEL_DIR" --shell /usr/sbin/nologin "$PANEL_USER"
usermod -aG docker "$PANEL_USER"
PANEL_UID="$(id -u "$PANEL_USER")"
PANEL_GID="$(id -g "$PANEL_USER")"

mkdir -p "$MC_DIR/data/plugins" "$MC_DIR/backups" "$PANEL_DIR/app"
chown -R "$PANEL_USER:$PANEL_USER" "$MC_DIR" "$PANEL_DIR"

# ---------------------------------------------------------------------------
log "Plugins"
shopt -s nullglob
jars=("$SCRIPT_DIR"/deploy/plugins/*.jar "$SCRIPT_DIR"/bridge/build/libs/*.jar)
shopt -u nullglob
if [ ${#jars[@]} -eq 0 ]; then
	echo "Avís: no he trobat cap .jar a deploy/plugins/ ni bridge/build/libs/."
	echo "  El servidor arrencarà sense plugins; copia'ls i torna a córrer aquest script."
else
	for j in "${jars[@]}"; do
		cp -n "$j" "$MC_DIR/data/plugins/"
		echo "  $(basename "$j")"
	done
fi
chown -R "$PANEL_USER:$PANEL_USER" "$MC_DIR/data"

# ---------------------------------------------------------------------------
log "docker-compose.yml"
RCON_PASSWORD="${RCON_PASSWORD:-$(openssl rand -hex 24)}"
cat >"$MC_DIR/docker-compose.yml" <<EOF
services:
  minecraft:
    image: itzg/minecraft-server
    container_name: $MC_CONTAINER
    restart: unless-stopped
    stdin_open: true
    tty: true
    network_mode: host
    environment:
      EULA: "TRUE"
      TYPE: "PAPER"
      VERSION: "$MC_VERSION"
      MEMORY: "$MC_MEMORY"
      UID: "$PANEL_UID"
      GID: "$PANEL_GID"
      ENABLE_RCON: "true"
      RCON_PASSWORD: "$RCON_PASSWORD"
      RCON_PORT: "25575"
      SERVER_NAME: "$MC_SERVER_NAME"
    volumes:
      - $MC_DIR/data:/data
EOF
chmod 600 "$MC_DIR/docker-compose.yml"

# docker logs acumula tot l'historial del contenidor encara que el reiniciem (stop/start,
# a diferència de down/up, no el recrea), així que cal mirar només els logs de *després*
# d'un moment donat — si no, un segon arrencada trobaria el "Done (" del primer cop i
# diria que ja ha acabat sense haver esperat de debò.
wait_for_done() {
	local since="$1"
	local waited=0
	while ! docker logs --since "$since" "$MC_CONTAINER" 2>&1 | grep -q "Done ("; do
		sleep 3
		waited=$((waited + 3))
		[ "$waited" -ge "$BOOT_TIMEOUT" ] && die "El servidor no ha arrencat en ${BOOT_TIMEOUT}s. Mira: docker logs $MC_CONTAINER"
	done
}

log "Primera arrencada (genera les configuracions per defecte dels plugins)"
boot_since="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
(cd "$MC_DIR" && docker compose up -d)
wait_for_done "$boot_since"
echo "Arrencat."

# ---------------------------------------------------------------------------
LP_CONFIG="$MC_DIR/data/plugins/LuckPerms/config.yml"
if [ -f "$LP_CONFIG" ]; then
	log "Configurant LuckPerms → MariaDB"
	(cd "$MC_DIR" && docker compose stop)
	db_line="$(grep -n '^[[:space:]]*database:' "$LP_CONFIG" | head -1 | cut -d: -f1)"
	if [ -n "$db_line" ]; then
		range_start=$((db_line - 8))
		[ "$range_start" -lt 1 ] && range_start=1
		sed -i \
			-e 's/^storage-method:.*/storage-method: mariadb/' \
			-e "${range_start},$((db_line + 8)) s/^\([[:space:]]*address:\).*/\1 localhost/" \
			-e "${range_start},$((db_line + 8)) s/^\([[:space:]]*database:\).*/\1 luckperms/" \
			-e "$((db_line + 1)),$((db_line + 8)) s/^\([[:space:]]*username:\).*/\1 luckperms/" \
			-e "$((db_line + 1)),$((db_line + 8)) s/^\([[:space:]]*password:\).*/\1 '${LUCKPERMS_DB_PASSWORD}'/" \
			"$LP_CONFIG"
	else
		echo "Avís: no trobo la clau «database:» a $LP_CONFIG — revisa-ho a mà (veure docs/01)."
	fi
	boot_since="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
	(cd "$MC_DIR" && docker compose start)
	wait_for_done "$boot_since"
	echo "LuckPerms reconfigurat i servidor tornat a arrencar."
else
	echo "Avís: no hi ha plugins/LuckPerms/config.yml (el jar no s'ha copiat?) — salto aquest pas."
fi

# ---------------------------------------------------------------------------
log "Grups base de LuckPerms"
# Una ordre RCON per crida (amb una petita pausa): enviar-les totes de cop pel mateix
# stream fa que LuckPerms es queixi de "another command is being executed" i en
# perdi alguna.
lp_groups=(
	"lp creategroup membre"
	"lp creategroup mod"
	"lp creategroup admin"
	"lp creategroup owner"
	"lp group membre parent add default"
	"lp group mod parent add membre"
	"lp group admin parent add mod"
	"lp group owner parent add admin"
	"lp group default setweight 0"
	"lp group membre setweight 10"
	"lp group mod setweight 50"
	"lp group admin setweight 100"
	"lp group owner setweight 1000"
	'lp group membre meta setprefix 10 "&7[Membre] "'
	'lp group mod meta setprefix 50 "&9[Mod] "'
	'lp group admin meta setprefix 100 "&c[Admin] "'
	'lp group owner meta setprefix 1000 "&6[Owner] "'
)
for cmd in "${lp_groups[@]}"; do
	docker exec "$MC_CONTAINER" rcon-cli "$cmd" >/dev/null || echo "Avís: ha fallat «$cmd»"
	sleep 0.3
done

# ---------------------------------------------------------------------------
BRIDGE_CONFIG="$MC_DIR/data/plugins/Bridge/config.yml"
BRIDGE_TOKEN=""
if [ -f "$BRIDGE_CONFIG" ]; then
	BRIDGE_TOKEN="$(grep -m1 '^[[:space:]]*token:' "$BRIDGE_CONFIG" | awk '{print $2}')"
fi
[ -n "$BRIDGE_TOKEN" ] || echo "Avís: no he trobat el token del Bridge a $BRIDGE_CONFIG — l'hauràs d'afegir a mà a .env."

# ---------------------------------------------------------------------------
log "Copiant el panell a $PANEL_DIR/app"
rsync -a --delete --exclude node_modules --exclude .svelte-kit --exclude build --exclude data "$SCRIPT_DIR/panel/" "$PANEL_DIR/app/panel/"
chown -R "$PANEL_USER:$PANEL_USER" "$PANEL_DIR"

LAN_IP="$(hostname -I | awk '{print $1}')"
ORIGIN="${PANEL_ORIGIN:-http://$LAN_IP:$PANEL_PORT}"

log "Generant .env del panell"
ENV_FILE="$PANEL_DIR/app/panel/.env"
cat >"$ENV_FILE" <<EOF
BRIDGE_URL=http://127.0.0.1:8765
BRIDGE_TOKEN=$BRIDGE_TOKEN

DATABASE_PATH=data/panel.db

ORIGIN=$ORIGIN
PORT=$PANEL_PORT
HOST=0.0.0.0

MC_CONTAINER=$MC_CONTAINER
MC_DATA_DIR=$MC_DIR/data
MC_BACKUPS_DIR=$MC_DIR/backups
MC_RCON_HOST=127.0.0.1
MC_RCON_PORT=25575
MC_RCON_PASSWORD=$RCON_PASSWORD
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
After=network.target docker.service mariadb.service

[Service]
User=$PANEL_USER
WorkingDirectory=$PANEL_DIR/app/panel
ExecStart=/usr/bin/npm start
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now panell

# ---------------------------------------------------------------------------
log "Tallafoc"
ufw allow OpenSSH
ufw allow 25565/tcp
ufw allow "$PANEL_PORT"/tcp
ufw deny 25575/tcp # RCON: només per localhost (el trànsit per loopback no passa pel tallafoc)
ufw --force enable

# ---------------------------------------------------------------------------
log "Fet!"
cat <<EOF

Panell:            $ORIGIN
Servidor Minecraft: port 25565
Contrasenya de la base de dades de LuckPerms: $LUCKPERMS_DB_PASSWORD
Contrasenya de RCON:                          $RCON_PASSWORD
(també són a $MC_DIR/docker-compose.yml i $ENV_FILE)

Encara et falta:
  1. Crea el primer usuari (owner) del panell:
       sudo -u $PANEL_USER bash -c "cd $PANEL_DIR/app/panel && npm run create-user -- <nom> owner"
  2. Entra a $ORIGIN i fes-te owner/admin tu i els teus amics.
  3. Configura la capçalera/peu del TAB des de la pàgina «TAB» del panell.
EOF
