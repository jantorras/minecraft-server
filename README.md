# Servidor Minecraft

Servidor Paper (només plugins) amb un panell web propi per gestionar rols, tags i TAB.

## Estructura

| Carpeta | Què és |
|---|---|
| `docs/` | Guies d'instal·lació i operació |
| `bridge/` | Plugin de Paper que exposa una API HTTP per al panell (LuckPerms, tags, TAB) |
| `panel/` | Panell web (SvelteKit): jugadors, rols, grups, tags, registre, usuaris del panell |

## Fases

- [x] **Fase 0** – Infraestructura: [docs/01-infraestructura.md](docs/01-infraestructura.md)
- [x] **Fase 1** – Bridge: rols, prefixos, tags desbloquejables (`/tags`) i editor del TAB
- [x] **Fase 2** – Panell web: login, jugadors, rols, grups, tags, TAB, control del servidor (Docker + RCON,
  pàgina **Servidor**), gestor de fitxers (pàgina **Fitxers**), registre i usuaris del panell.
  Desplegament: [docs/02-panell.md](docs/02-panell.md)
- [ ] **Fase 3** – Plugins per donar vida al server (esdeveniments, temporades, missions)
- [ ] **Fase 4** – Extres (bot de Discord, whitelist des del panell)

## Tutorial: instal·lar el servidor en una VM nova

Això munta tot el que cal en una VM Ubuntu Server buida: el servidor Paper en Docker, MariaDB
per a LuckPerms, el plugin Bridge i el panell web, amb un tallafoc configurat.

### Què necessites

- Una VM **Ubuntu Server 24.04** (o 22.04) amb accés `sudo`. Recomanat: 2 vCPU, 6 GB de RAM
  (el servidor té 3 GB de heap) i 20 GB de disc.
- Un ordinador amb Java 25 **només si vols compilar el Bridge tu** (ho explico al pas 2).
- Els `.jar` de LuckPerms, PlaceholderAPI i TAB (enllaços al pas 2).

### Pas 1: descarrega el projecte a la VM

```bash
git clone https://github.com/jantorras/minecraft-server.git
cd minecraft-server
```

### Pas 2: posa els plugins a `deploy/plugins/`

Descarrega aquests `.jar` i copia'ls a `deploy/plugins/`:

| Plugin | Enllaç |
|---|---|
| LuckPerms (Bukkit) | https://luckperms.net/download |
| PlaceholderAPI | https://hangar.papermc.io/HelpChat/PlaceholderAPI |
| TAB | https://github.com/NEZNAMY/TAB/releases |

També cal el **Bridge** (el plugin d'aquest projecte). Compila'l en el teu ordinador i copia el jar
a `deploy/plugins/` juntament amb els altres:

```
cd bridge
./gradlew build        # Windows: .\gradlew.bat build
```

El jar queda a `bridge/build/libs/bridge-<versió>.jar`. Copia'l a `deploy/plugins/` (o fes servir
el mateix `scp` de més avall per enviar-lo a la VM).

Quan tinguis tots els `.jar` a `deploy/plugins/` del teu ordinador, envia'ls a la VM (des del teu
ordinador, en una terminal normal):

```
scp deploy/plugins/*.jar usuari@IP_DE_LA_VM:~/minecraft-server/deploy/plugins/
```

> Els `.jar` i el `build/` no es pugen a git, per això cal copiar-los a mà.

### Pas 3: executa l'instal·lador

```bash
sudo ./install.sh
```

Triga uns minuts. Fa això, per ordre: instal·la Docker, Node 24 i MariaDB; crea l'usuari
`panell`; arrenca el servidor una vegada per generar les configuracions dels plugins; passa
LuckPerms a MariaDB; crea els grups base (`membre`, `mod`, `admin`, `owner`); compila el panell
i el deixa com a servei `panell`; i configura el tallafoc.

Quan acabi, **apunta les contrasenyes que imprimeix** (base de dades de LuckPerms i RCON). També
es guarden a `/opt/minecraft/docker-compose.yml` i `/opt/panell/app/panel/.env`, però només
accessibles per root i per `panell`.

### Pas 4: crea el primer usuari del panell

```bash
sudo -u panell bash -c "cd /opt/panell/app/panel && npm run create-user -- <nom> owner"
```

El rol pot ser `owner`, `admin` o `mod`. Fes-te `owner` tu.

### Pas 5: entra al panell

Obre `http://IP_DE_LA_VM:3000` al navegador i inicia sessió. Des de la pàgina **Usuaris** pots crear
comptes per als amics. Després pots configurar la capçalera i el peu del TAB a la pàgina **TAB**.

### Pas 6: connecta't al joc

A Minecraft, afegeix el servidor amb l'adreça `IP_DE_LA_VM` (port 25565, és el per defecte).
La versió ha de ser la mateixa que `MC_VERSION` (per defecte **26.2**).

### Variables opcionals

Exporta-les abans d'executar `install.sh` per canviar els valors per defecte:

| Variable | Per defecte | Què fa |
|---|---|---|
| `MC_VERSION` | `26.2` | Versió de Paper |
| `MC_MEMORY` | `3G` | Memòria del servidor |
| `MC_SERVER_NAME` | `Claude` | Nom del servidor |
| `PANEL_ORIGIN` | `http://IP:3000` | URL pública del panell (útil si hi poses un domini) |
| `PANEL_PORT` | `3000` | Port del panell |

Exemple: `sudo MC_MEMORY=4G PANEL_PORT=8080 ./install.sh`

### Problemes habituals

- **«no he trobat cap .jar»**: no has copiat els plugins a `deploy/plugins/` abans de l'instal·lador.
- **El panell no respon**: mira `sudo journalctl -u panell -n 50`, i que el port 3000 estigui obert
  (`sudo ufw status`).
- **El servidor no arrenca**: `docker logs mc-claude --tail 100`.
- **El panell no parla amb el Bridge**: el `BRIDGE_TOKEN` de `.env` ha de coincidir amb el de
  `/opt/minecraft/data/plugins/Bridge/config.yml`.
- **Vols tornar a executar l'instal·lador**: es pot, és pensat per repetir-se sense trencar res.

### Seguretat: què no s'ha de pujar

Aquest repositori no conté cap contrasenya ni token. Les contrasenyes les genera l'instal·lador a
la VM, i la base de dades del panell (`panel/data/`) queda fora de git. Mai no hi pujis els fitxers
`.env` ni `docker-compose.yml`.

## Provar-ho tot en local (Windows)

```
powershell -ExecutionPolicy Bypass -File dev\start-local.ps1
```

Crea un servidor Paper de proves a `%USERPROFILE%\mc-dev` (fora de Proton Drive) amb LuckPerms,
PlaceholderAPI, TAB i el Bridge, l'engega en una finestra pròpia, configura `panel/.env`,
et demana el primer usuari i obre el panell a http://localhost:5173.
Cada cop que el tornis a executar recompila el Bridge (reinicia el servidor per carregar-lo).

## Compilar el Bridge

Cal Java 25.

```
cd bridge
./gradlew build        # Windows: .\gradlew.bat build
```

El jar queda a `bridge/build/libs/bridge-<versió>.jar`.

## API del Bridge

Totes les peticions porten `Authorization: Bearer <token>` (el token és a
`plugins/Bridge/config.yml`). Respostes en JSON; els errors tenen la forma
`{"error": "missatge"}` amb el codi HTTP corresponent (400, 401, 404, 405, 409, 500).

`{id}` de jugador = UUID o nom (el nom només funciona si el jugador ja ha entrat mai).

| Mètode | Ruta | Cos | Què fa |
|---|---|---|---|
| GET | `/api/health` | – | Estat del Bridge i jugadors connectats |
| GET | `/api/groups` | – | Llista de grups (ordenats per pes) |
| POST | `/api/groups` | `{name, displayName?, weight?, prefix?, suffix?, parents?}` | Crea un grup |
| GET | `/api/groups/{name}` | – | Detall d'un grup |
| PATCH | `/api/groups/{name}` | mateixos camps que POST, tots opcionals (`null` = esborrar) | Modifica un grup |
| DELETE | `/api/groups/{name}` | – | Esborra un grup (no `default`) |
| GET | `/api/players` | – | Tots els jugadors coneguts per LuckPerms |
| GET | `/api/players/{id}` | – | Detall d'un jugador |
| PUT | `/api/players/{id}/group` | `{group}` | Deixa el jugador amb **només** aquest grup |
| POST | `/api/players/{id}/groups` | `{group, durationSeconds?}` | Afegeix un grup (temporal si hi ha durada) |
| DELETE | `/api/players/{id}/groups/{group}` | – | Treu un grup |
| PATCH | `/api/players/{id}/meta` | `{prefix?, suffix?}` | Prefix/sufix personal (`null` = esborrar) |
| GET | `/api/tags` | – | Llista de tags |
| POST | `/api/tags` | `{id, display, description?, material?}` | Crea un tag |
| GET | `/api/tags/{id}` | – | Detall d'un tag |
| PATCH | `/api/tags/{id}` | `{display?, description?, material?}` | Modifica un tag |
| DELETE | `/api/tags/{id}` | – | Esborra un tag |
| POST | `/api/players/{id}/tags` | `{tag, durationSeconds?}` | Desbloqueja un tag al jugador (temporal si hi ha durada) |
| DELETE | `/api/players/{id}/tags/{tag}` | – | Treu un tag donat directament al jugador |
| PUT | `/api/players/{id}/tag` | `{tag}` (`null` = cap) | Tria el tag que porta (ha d'estar desbloquejat) |

| GET | `/api/tab` | – | Capçalera, peu, ordre dels grups i si surt el tag (plugin TAB) |
| PATCH | `/api/tab` | `{header?, footer?, groupOrder?, showTag?}` | Desa la config del TAB i fa `tab reload` |

El jugador retorna també `tag` (el tag actiu), `unlockedTags` (inclou els que venen
de grups) i `tagGrants` (només els donats directament, amb caducitat).

Notes:
- El prefix d'un grup es desa amb prioritat = pes del grup, així el grup més alt guanya.
- El prefix personal té prioritat 1000 (configurable) i passa per davant del del grup.
- Els prefixos fan servir codis `&` (`&c[Admin] `); el TAB i el xat els mostren igual.

## Tags al joc

- `/tags` obre un menú amb tots els tags: els desbloquejats es poden triar, els altres surten bloquejats.
  `/tags off` treu el tag.
- Desbloquejar = tenir el permís `bridge.tag.<id>`. Es pot donar per jugador (panell/API) o a un grup
  sencer: `lp group mod permission set bridge.tag.constructor true`.
- Si un tag caduca o es treu, el jugador el deixa de portar automàticament.
- Placeholders (PlaceholderAPI): `%bridge_tag%`, `%bridge_tag_spaced%` (amb espai davant si n'hi ha),
  `%bridge_tag_id%`.
- Definicions a `plugins/Bridge/tags.yml` (millor gestionar-les des del panell).
