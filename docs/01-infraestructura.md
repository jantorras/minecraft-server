# Fase 0 – Infraestructura

Objectiu: tenir el servidor Paper funcionant dins Docker, amb LuckPerms sobre MariaDB,
TAB i el plugin Bridge exposant l'API al panell. El panell gestiona el contenidor
directament (iniciar/aturar/reiniciar, consola per RCON, còpies, fitxers) — no fem
servir Crafty Controller ni cap altre panell intermedi.

```
Proxmox
 └─ VM Ubuntu Server
     ├─ Docker
     │   └─ contenidor itzg/minecraft-server (xarxa "host")
     │        ├─ Servidor Paper 26.2 (Java 25)  → port 25565
     │        ├─ RCON (consola)                 → port 25575 (nomes per al panell)
     │        └─ plugins: LuckPerms, PlaceholderAPI, TAB, Bridge (API → 127.0.0.1:8765)
     ├─ Panell web (fase 2) → Docker socket + RCON + fs del bind mount + Bridge, tots per localhost
     └─ MariaDB (només localhost)
```

## 1. VM a Proxmox

- Ubuntu Server, **4 vCPU / 8 GB RAM / 40 GB disc** per començar.
- IP fixa (DHCP reservat o netplan).
- Activa el *QEMU guest agent* i còpies de seguretat de la VM a Proxmox (Datacenter → Backup).

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y qemu-guest-agent git curl ufw
```

## 2. Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
```

## 3. Servidor Minecraft (Docker, imatge itzg/minecraft-server)

Fem servir [itzg/minecraft-server](https://github.com/itzg/docker-minecraft-server):
accepta l'EULA, instal·la Paper i gestiona RCON per variables d'entorn — no cal
mantenir nosaltres la descàrrega del jar ni els flags de la JVM.

```bash
sudo mkdir -p /opt/minecraft/data /opt/minecraft/backups
```

`/opt/minecraft/docker-compose.yml` (mode `600`, només root — conté la contrasenya de RCON):

```yaml
services:
  minecraft:
    image: itzg/minecraft-server
    container_name: mc-claude
    restart: unless-stopped
    stdin_open: true
    tty: true
    network_mode: host # LuckPerms es connecta a MariaDB per "localhost"; amb xarxa
    # pròpia (bridge) caldria canviar l'adreça de LuckPerms i exposar MariaDB fora de 127.0.0.1.
    environment:
      EULA: "TRUE"
      TYPE: "PAPER"
      VERSION: "26.2"
      MEMORY: "3G"
      UID: "999" # uid/gid de l'usuari "panell" (veure fase 2) — així el panell pot
      GID: "987" # llegir/escriure els fitxers del servidor sense xocar permisos.
      ENABLE_RCON: "true"
      RCON_PASSWORD: "<genera'n una amb `openssl rand -hex 24`>"
      RCON_PORT: "25575"
      SERVER_NAME: "Claude"
    volumes:
      - /opt/minecraft/data:/data
```

```bash
cd /opt/minecraft && sudo docker compose up -d
sudo docker logs -f mc-claude   # fins que surti "Done (...)"
```

Amb `network_mode: host`, el port RCON (25575) queda exposat a tota la xarxa local
(no hi ha el filtratge per IP que fa `docker run -p 127.0.0.1:25575:25575`). Amb una
contrasenya forta n'hi ha prou en una LAN de confiança, però si vols blindar-ho del tot
cal un tallafoc (`ufw`) que bloquegi el 25575 des de fora de localhost.

## 4. MariaDB per a LuckPerms

```bash
sudo apt install -y mariadb-server
sudo mysql_secure_installation
sudo mysql -e "CREATE DATABASE luckperms; CREATE USER 'luckperms'@'localhost' IDENTIFIED BY 'CANVIA_AIXO'; GRANT ALL ON luckperms.* TO 'luckperms'@'localhost'; FLUSH PRIVILEGES;"
```

MariaDB només escolta a `127.0.0.1` i l'usuari `luckperms` només pot connectar des de
`localhost` — per això el contenidor ha d'anar en `network_mode: host` (si no, "localhost"
dins del contenidor no és el mateix "localhost" que el de la VM i LuckPerms no hi arriba).

## 5. Plugins

Posa'ls a `/opt/minecraft/data/plugins/` (o des del panell, pàgina **Fitxers**, un cop desplegat):

| Plugin | On |
|---|---|
| LuckPerms (Bukkit) | https://luckperms.net/download |
| PlaceholderAPI | https://hangar.papermc.io/HelpChat/PlaceholderAPI |
| TAB | https://github.com/NEZNAMY/TAB/releases |
| Bridge | `bridge/build/libs/bridge-0.1.0.jar` d'aquest projecte |

Reinicia el contenidor (`docker compose restart`) un cop perquè es generin les
configuracions.

### LuckPerms → MariaDB

`/opt/minecraft/data/plugins/LuckPerms/config.yml`:

```yaml
storage-method: mariadb
data:
  address: localhost
  database: luckperms
  username: luckperms
  password: 'CANVIA_AIXO'
```

### Grups base

Des de la consola (`docker exec mc-claude rcon-cli "..."`, o després des del panell):

```
lp creategroup membre
lp creategroup mod
lp creategroup admin
lp creategroup owner
lp group membre parent add default
lp group mod parent add membre
lp group admin parent add mod
lp group owner parent add admin
lp group default setweight 0
lp group membre setweight 10
lp group mod setweight 50
lp group admin setweight 100
lp group owner setweight 1000
lp group membre meta setprefix 10 "&7[Membre] "
lp group mod meta setprefix 50 "&9[Mod] "
lp group admin meta setprefix 100 "&c[Admin] "
lp group owner meta setprefix 1000 "&6[Owner] "
lp user <el_teu_nom> parent set owner
```

### TAB

TAB (v6.2.0 o superior, funciona amb Paper 26.2) agafa els prefixos de LuckPerms sol.
La capçalera, el peu, l'ordre dels grups i si surt el tag de `/tags` es configuren
des del panell (pàgina **TAB**), que edita `plugins/TAB/config.yml` i `groups.yml` i fa
`tab reload`.

### Bridge

Després del primer arrencada, `plugins/Bridge/config.yml` té un `token` generat.
**Guarda'l**: és la clau que farà servir el panell. Prova-ho des de la VM:

```bash
curl -H "Authorization: Bearer EL_TOKEN" http://localhost:8765/api/health
```

## 6. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 25565/tcp   # Minecraft
sudo ufw enable
```

El panell viu a la mateixa VM, així que el Bridge escolta només a `127.0.0.1:8765`
i aquest port **no** s'obre enlloc. El port del panell l'afegirem a la fase 2. El
port RCON (25575) queda exposat per `network_mode: host` (veure punt 3); si actives
`ufw`, bloqueja'l explícitament des de fora de localhost: `sudo ufw deny 25575/tcp`.

Al router, redirigeix només el **25565** cap a la VM.
