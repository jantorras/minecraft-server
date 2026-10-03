#!/usr/bin/env bash
# Instal·lació des de zero del panell en una VM Ubuntu nova. Els servidors de Minecraft
# (i els proxys) no els crea aquest script: es creen després des del panell, a «Servidors».
#
# Ús:
#   git clone https://github.com/jantorras/minecraft-server.git && cd minecraft-server && sudo ./install.sh
#
# Fa les preguntes al principi (usuari del panell i, si vols, túnel de Cloudflare) i la resta
# va sola: baixa els plugins (LuckPerms, PlaceholderAPI, TAB, Chunky), compila el Bridge i deixa el
# panell engegat. Un .jar que ja sigui a deploy/plugins/ (o deploy/plugins/velocity/ per als
# proxys) no es torna a baixar, per si vols fixar-ne una versió concreta.
#
# Variables opcionals (export abans d'executar; amb totes posades no pregunta res):
#   PANEL_ORIGIN, PANEL_PORT
#   PANEL_ADMIN_USER, PANEL_ADMIN_PASSWORD  primer usuari (owner) del panell
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
# Les preguntes, totes al principi: la resta de la instal·lació no necessita ningú davant.
PANEL_ADMIN_USER="${PANEL_ADMIN_USER:-}"
PANEL_ADMIN_PASSWORD="${PANEL_ADMIN_PASSWORD:-}"
if [ -z "$PANEL_ADMIN_USER" ] && [ ! -f "$PANEL_DIR/app/panel/data/panel.db" ] && [ -t 0 ]; then
	echo "Primer usuari (owner) del panell."
	read -r -p "Nom d'usuari (en blanc per crear-lo més tard): " PANEL_ADMIN_USER
fi
[[ "$PANEL_ADMIN_USER" =~ ^[A-Za-z0-9_.-]*$ ]] || die "El nom d'usuari només pot tenir lletres, xifres, punts, guions i guions baixos."
if [ -n "$PANEL_ADMIN_USER" ] && [ -z "$PANEL_ADMIN_PASSWORD" ]; then
	[ -t 0 ] || die "Falta PANEL_ADMIN_PASSWORD per a l'usuari «$PANEL_ADMIN_USER»."
	while [ "${#PANEL_ADMIN_PASSWORD}" -lt 10 ]; do
		read -r -s -p "Contrasenya (mínim 10 caràcters): " PANEL_ADMIN_PASSWORD
		echo
	done
fi
[ -z "$PANEL_ADMIN_USER" ] || [ "${#PANEL_ADMIN_PASSWORD}" -ge 10 ] || die "La contrasenya ha de tenir com a mínim 10 caràcters."

# Túnel de Cloudflare (opcional).
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
	# Límit dels registres de tots els contenidors: sense, creixen per sempre i omplen el disc.
	# Només en una instal·lació nova de Docker, per no reiniciar contenidors que ja corrin.
	if [ ! -f /etc/docker/daemon.json ]; then
		echo '{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }' >/etc/docker/daemon.json
		systemctl restart docker
	fi
else
	echo "Ja instal·lat."
fi

# Les imatges dels servidors es baixen en segon pla mentre es fa la resta, perquè crear el
# primer servidor des del panell no hagi d'esperar la baixada.
PULL_PIDS=()
for image in itzg/minecraft-server itzg/mc-proxy; do
	docker pull -q "$image" >/dev/null 2>&1 &
	PULL_PIDS+=("$!")
done

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
log "Baixant els plugins que faltin"
mkdir -p "$SCRIPT_DIR/deploy/plugins/velocity"
# URL de descàrrega de l'última versió de cada plugin. Si alguna falla només s'avisa:
# el plugin es pot posar a mà a deploy/plugins/ i tornar a executar l'script.
json() { curl -fsSL --max-time 30 "$1" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(($2)(JSON.parse(s))??'')}catch{}})"; }
luckperms_url() { json https://metadata.luckperms.net/data/downloads "j=>j.downloads['$1']"; }
papi_url() {
	local version
	version="$(curl -fsSL --max-time 30 'https://hangar.papermc.io/api/v1/projects/PlaceholderAPI/latest?channel=Release')" || return 0
	[ -n "$version" ] && echo "https://hangar.papermc.io/api/v1/projects/PlaceholderAPI/versions/$version/PAPER/download"
}
# TAB publica diversos .jar per versió; el de nom més curt és el de l'última versió de Minecraft.
tab_url() { json https://api.github.com/repos/NEZNAMY/TAB/releases/latest "j=>j.assets.map(a=>a.browser_download_url).filter(u=>u.endsWith('.jar')).sort((a,b)=>a.length-b.length)[0]"; }
# Chunky: genera el món per endavant (/chunky start) perquè explorar no faci anar lent el servidor.
chunky_url() { json 'https://api.modrinth.com/v2/project/chunky/version?loaders=%5B%22paper%22%5D' "j=>(j[0].files.find(f=>f.primary)||j[0].files[0]).url"; }

# fetch_plugin <carpeta> <patró del .jar que ja hi podria ser> <nom del fitxer> <url>
fetch_plugin() {
	local dir="$1" pattern="$2" file="$3" url="$4"
	if compgen -G "$dir/$pattern" >/dev/null; then
		echo "  $file: ja hi és"
	elif [ -n "$url" ] && curl -fsSL --max-time 120 -o "$dir/$file.part" "$url"; then
		mv "$dir/$file.part" "$dir/$file"
		echo "  $file: baixat"
	else
		rm -f "$dir/$file.part"
		echo "Avís: no he pogut baixar $file — posa'l a mà a $dir/ i torna a executar l'script."
	fi
}
fetch_plugin "$SCRIPT_DIR/deploy/plugins" '[Ll]uck[Pp]erms*.jar' LuckPerms-Bukkit.jar "$(luckperms_url bukkit || true)"
fetch_plugin "$SCRIPT_DIR/deploy/plugins" '[Pp]laceholder[Aa][Pp][Ii]*.jar' PlaceholderAPI.jar "$(papi_url || true)"
fetch_plugin "$SCRIPT_DIR/deploy/plugins" 'TAB*.jar' TAB.jar "$(tab_url || true)"
fetch_plugin "$SCRIPT_DIR/deploy/plugins" '[Cc]hunky*.jar' Chunky.jar "$(chunky_url || true)"
fetch_plugin "$SCRIPT_DIR/deploy/plugins/velocity" '[Ll]uck[Pp]erms*.jar' LuckPerms-Velocity.jar "$(luckperms_url velocity || true)"

# ---------------------------------------------------------------------------
log "Compilant el plugin Bridge"
# Dins d'un contenidor amb el JDK: així no cal instal·lar Java a la VM.
bridge_jar="$(compgen -G "$SCRIPT_DIR/bridge/build/libs/*.jar" | head -1 || true)"
if [ -n "$bridge_jar" ] && [ -z "$(find "$SCRIPT_DIR/bridge/src" "$SCRIPT_DIR/bridge/build.gradle.kts" -newer "$bridge_jar" -print -quit)" ]; then
	echo "Ja compilat."
elif docker run --rm -v "$SCRIPT_DIR/bridge:/src" -w /src eclipse-temurin:25-jdk sh ./gradlew --no-daemon build; then
	echo "Compilat."
else
	echo "Avís: no s'ha pogut compilar el Bridge; sense ell el panell no pot gestionar jugadors ni rols."
fi

# ---------------------------------------------------------------------------
log "Catàleg de plugins (el panell els copia a cada servidor nou)"
shopt -s nullglob
paper_jars=("$SCRIPT_DIR"/deploy/plugins/*.jar "$SCRIPT_DIR"/bridge/build/libs/*.jar)
velocity_jars=("$SCRIPT_DIR"/deploy/plugins/velocity/*.jar)
shopt -u nullglob
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

# En tornar a executar l'script es conserva l'adreça que ja tenia el panell.
if [ -z "${PANEL_ORIGIN:-}" ] && [ -f "$ENV_FILE" ]; then
	PANEL_ORIGIN="$(grep -m1 '^ORIGIN=' "$ENV_FILE" | cut -d= -f2- || true)"
fi
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
# Es canvia de directori abans del sudo: l'usuari «$PANEL_USER» no pot entrar a la carpeta des
# d'on s'executa l'script (el home de qui l'ha clonat) i fallaria amb «Permission denied».
(cd "$PANEL_DIR/app/panel" && sudo -H -u "$PANEL_USER" bash -c "npm ci --no-audit --no-fund && npm run build")

if [ -n "$PANEL_ADMIN_USER" ]; then
	log "Usuari «$PANEL_ADMIN_USER» (owner) del panell"
	# La contrasenya passa per l'entorn, no per la línia d'ordres (que es veu amb `ps`).
	(cd "$PANEL_DIR/app/panel" && PANEL_PASSWORD="$PANEL_ADMIN_PASSWORD" sudo -H --preserve-env=PANEL_PASSWORD -u "$PANEL_USER" \
		npm run --silent create-user -- "$PANEL_ADMIN_USER" owner)
fi

# ---------------------------------------------------------------------------
log "Servei systemd del panell"
cat >/etc/systemd/system/panell.service <<EOF
[Unit]
Description=Panell del servidor Minecraft
After=network.target docker.service

[Service]
User=$PANEL_USER
WorkingDirectory=$PANEL_DIR/app/panel
Environment=NODE_ENV=production
ExecStart=/usr/bin/node --env-file-if-exists=.env build
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
log "Acabant de baixar les imatges dels servidors"
for pid in "${PULL_PIDS[@]}"; do
	wait "$pid" || echo "Avís: no s'ha pogut baixar una imatge; es baixarà en crear el primer servidor."
done

# ---------------------------------------------------------------------------
log "Fet!"
cat <<EOF

Panell: $ORIGIN
Contrasenya de la base de dades de LuckPerms: $LUCKPERMS_DB_PASSWORD
(també és a $MC_ROOT/mariadb/docker-compose.yml i $ENV_FILE)

Ara:
  - Entra a $ORIGIN i crea el primer servidor a «Servidors».
EOF
if [ -z "$PANEL_ADMIN_USER" ]; then
	cat <<EOF
  - Si encara no tens cap usuari del panell, crea'n un (owner):
      cd $PANEL_DIR/app/panel && sudo -H -u $PANEL_USER npm run create-user -- <nom> owner
EOF
fi
if [ -f "$TUNNEL_COMPOSE" ]; then
	cat <<EOF
  - Túnel de Cloudflare: al tauler del túnel, afegeix un «Public Hostname» que apunti a
      http://localhost:$PANEL_PORT
    (el token és a $TUNNEL_COMPOSE; estat: docker logs cloudflared)
EOF
fi
