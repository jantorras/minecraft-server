# Servidor Minecraft

Servidors de Minecraft (Paper, només plugins) en Docker, amb un panell web propi per crear-los i
gestionar-los: jugadors, rols, tags, TAB, plugins, fitxers i consola.

## Instal·lació ràpida

En una VM Ubuntu Server nova:

```bash
git clone https://github.com/jantorras/minecraft-server.git && cd minecraft-server && sudo ./install.sh
```

Respon les preguntes del principi (usuari del panell i, si vols, túnel de Cloudflare), espera uns
minuts, entra al panell i crea el primer servidor a **Servidors**. El detall és al
[tutorial](#tutorial-installar-ho-en-una-vm-nova).

## Estructura

| Carpeta | Què és |
|---|---|
| `install.sh` | Instal·lador: deixa el panell i tot el que necessita a punt en una VM nova |
| `panel/` | Panell web (SvelteKit) |
| `bridge/` | Plugin de Paper que exposa una API HTTP per al panell (LuckPerms, tags, TAB) |
| `deploy/plugins/` | Plugins que es copien als servidors nous (l'instal·lador els baixa sol) |
| `dev/` | Script per provar-ho tot en local a Windows |
| `docs/` | Guies antigues del muntatge manual d'un sol servidor (vegeu la nota de més avall) |

## Què fa el panell

| Pàgina | Què s'hi fa | Rol mínim |
|---|---|---|
| **Inici** | Resum del servidor triat i últimes accions | mod |
| **Servidor** | Estat, CPU i memòria; iniciar, aturar, reiniciar i còpies de seguretat; consola en viu (xat inclòs) | mod per veure l'estat, admin per controlar-lo i veure la consola, owner per enviar ordres |
| **Servidors** | Crear, reconfigurar i treure servidors normals (Paper) i proxys (Velocity) | mod per mirar, owner per canviar |
| **Fitxers** | Navegar, editar, pujar i esborrar fitxers del servidor | admin |
| **Plugins** | Veure tots els `.jar` del servidor, pujar-ne, activar-los, desactivar-los i esborrar-los | admin |
| **Jugadors**, **Grups**, **Tags**, **TAB** | Rols de LuckPerms, prefixos, tags desbloquejables i la llista del tabulador | mod per mirar, admin per canviar |
| **Registre** | Qui ha fet què des del panell | mod |
| **Usuaris del panell** | Comptes per entrar al panell | owner |

Quan hi ha més d'un servidor, el selector del menú tria sobre quin treballen totes les pàgines.
Els rols de LuckPerms són compartits: un canvi de rol val per a tots els servidors.

## Fases

- [x] **Fase 0** – Infraestructura
- [x] **Fase 1** – Bridge: rols, prefixos, tags desbloquejables (`/tags`) i editor del TAB
- [x] **Fase 2** – Panell web: login, jugadors, rols, grups, tags, TAB, control del servidor, gestor de
  fitxers, registre i usuaris del panell
- [x] **Fase 2b** – Diversos servidors i proxys creats des del panell, gestor de plugins, consola en
  viu i instal·lador d'una sola ordre (escrit; **encara no provat de cap a cap en una VM nova**)
- [ ] **Fase 3** – Plugins per donar vida al server (esdeveniments, temporades, missions)
- [ ] **Fase 4** – Extres (bot de Discord, whitelist des del panell)

## Tutorial: instal·lar-ho en una VM nova

Això munta tot el que cal en una VM Ubuntu Server buida: Docker, MariaDB per a LuckPerms, els
plugins, el Bridge i el panell web, amb un tallafoc configurat. Els servidors de Minecraft es
creen després des del panell.

### Què necessites

- Una VM **Ubuntu Server 24.04** (o 22.04) amb accés `sudo` i sortida a Internet. Recomanat:
  2 vCPU, 6 GB de RAM i 20 GB de disc per a un servidor (cada servidor normal fa servir 3 GB de
  memòria per defecte; un proxy, 512 MB).
- Res més: ni Java ni cap plugin baixat a mà.

### Pas 1: descarrega el projecte i executa l'instal·lador

```bash
git clone https://github.com/jantorras/minecraft-server.git
cd minecraft-server
sudo ./install.sh
```

Et fa unes preguntes al principi i després va sol (triga uns minuts):

- **Usuari i contrasenya** del primer compte (`owner`) del panell.
- **Token d'un túnel de Cloudflare**, si vols publicar el panell amb un domini. Deixa'l en blanc
  si no en vols.

Tota la resta és automàtica: instal·la Docker i Node 24; baixa l'última versió de LuckPerms,
PlaceholderAPI i TAB; compila el plugin Bridge dins d'un contenidor (no cal Java a la VM); engega
MariaDB (els rols de LuckPerms, compartits per tots els servidors); compila el panell, el deixa
com a servei `panell` i configura el tallafoc.

L'instal·lador **no crea cap servidor de Minecraft**: es creen després des del panell (pas 3).

Si vols una versió concreta d'un plugin, posa'n el `.jar` a `deploy/plugins/` abans d'executar
l'instal·lador i no el baixarà (els dels proxys Velocity van a `deploy/plugins/velocity/`).

Quan acabi imprimeix la contrasenya de la base de dades de LuckPerms. També es guarda a
`/opt/minecraft/mariadb/docker-compose.yml` i `/opt/panell/app/panel/.env`, només accessible per
root i per `panell`.

Per afegir més comptes del panell des de la terminal (també es pot des de la pàgina **Usuaris**):

```bash
cd /opt/panell/app/panel && sudo -H -u panell npm run create-user -- <nom> owner
```

### Pas 2: entra al panell

Obre `http://IP_DE_LA_VM:3000` al navegador i inicia sessió. Des de la pàgina **Usuaris** pots crear
comptes per als amics. Després pots configurar la capçalera i el peu del TAB a la pàgina **TAB**.

### Pas 3: crea el servidor

A la pàgina **Servidors** del panell (cal ser `owner`), omple «Nou servidor»: un nom, un
identificador curt (per exemple `survival`), el tipus **Normal (Paper)** i el port públic `25565`.
La primera vegada baixa la imatge de Docker i pot trigar uns minuts; l'estat es va actualitzant
sol. En acabar, el panell hi ha copiat els plugins, hi ha configurat LuckPerms i el Bridge, i ha
creat els grups base (`membre`, `mod`, `admin`, `owner`).

Si vols més d'un servidor darrere d'una sola adreça, crea primer un **Proxy (Velocity)** al port
`25565` i després els servidors normals triant aquell proxy (sense port públic). Amb el selector
del menú tries sobre quin servidor treballen la resta de pàgines.

Cada servidor viu a `/opt/minecraft/servers/<identificador>/` (`docker-compose.yml` + `data/`).
«Treure» un servidor n'atura el contenidor i en mou les dades a `/opt/minecraft/trash/`.

### Pas 4: connecta't al joc

A Minecraft, afegeix el servidor amb l'adreça `IP_DE_LA_VM` (i el port, si no és el 25565).

### Afegir plugins

A la pàgina **Plugins** puja el `.jar` i reinicia el servidor des de **Servidor**. També hi
apareixen sols els `.jar` que copiïs a mà a `/opt/minecraft/servers/<identificador>/data/plugins/`.
Un `owner` pot marcar un plugin «Al catàleg» perquè es copiï a tots els servidors que es creïn
després.

### Actualitzar el panell

```bash
cd minecraft-server && git pull && sudo ./install.sh
```

Tornar a executar l'instal·lador recompila el panell (i el Bridge, si ha canviat) i el reinicia.
No toca els servidors ni les seves dades, conserva l'adreça del panell i no torna a fer les
preguntes que ja estan resoltes. Un Bridge nou només arriba als servidors que es creïn després;
als que ja existeixen, puja'l des de la pàgina **Plugins**.

### Variables opcionals

Exporta-les abans d'executar `install.sh` per canviar els valors per defecte:

| Variable | Per defecte | Què fa |
|---|---|---|
| `PANEL_ORIGIN` | `http://IP:3000` | URL pública del panell (útil si hi poses un domini) |
| `PANEL_PORT` | `3000` | Port del panell |
| `PANEL_ADMIN_USER`, `PANEL_ADMIN_PASSWORD` | *(es demanen)* | Primer usuari (`owner`) del panell |
| `CLOUDFLARE_TUNNEL_TOKEN` | *(es demana)* | Token d'un túnel de Cloudflare per publicar el panell (opcional) |

**Túnel de Cloudflare (opcional).** En començar, l'instal·lador demana el token d'un túnel; deixa'l
en blanc si no en vols. Si el poses, engega `cloudflared` en un contenidor i et demana l'adreça
pública del panell (els formularis només funcionen des d'aquella adreça). Després, al tauler de
Cloudflare, afegeix al túnel un *Public Hostname* que apunti a `http://localhost:3000`.

Exemple: `sudo PANEL_PORT=8080 ./install.sh`

### Problemes habituals

- **«no he pogut baixar …»**: baixa aquell `.jar` a mà, posa'l a `deploy/plugins/` i torna a executar l'instal·lador.
- **El panell no respon**: mira `sudo journalctl -u panell -n 50`, i que el port 3000 estigui obert
  (`sudo ufw status`).
- **Puc mirar el panell però els botons donen error**: hi estàs entrant per una adreça diferent de
  la configurada (`ORIGIN` a `/opt/panell/app/panel/.env`). Passa sobretot si fas servir el túnel
  de Cloudflare i hi entres per la IP local.
- **La compilació del Bridge falla**: compila'l al teu ordinador (vegeu «Compilar el Bridge»),
  copia el `.jar` a `bridge/build/libs/` de la VM i torna a executar l'instal·lador.
- **Un servidor es queda en «Error»**: la pàgina **Servidors** en diu el motiu; mira també
  `docker logs mc-<identificador> --tail 100` i prem «Reintentar».
- **«el Bridge no respon»** després de crear un servidor: falta el `bridge-*.jar` a
  `/opt/minecraft/plugins/paper/` (torna a executar l'instal·lador i mira si la compilació falla).
- **Vols tornar a executar l'instal·lador**: es pot, és pensat per repetir-se sense trencar res.

### Seguretat: què no s'ha de pujar

Aquest repositori no conté cap contrasenya ni token. Les contrasenyes les genera l'instal·lador a
la VM, i la base de dades del panell (`panel/data/`) queda fora de git. Mai no hi pujis els fitxers
`.env` ni `docker-compose.yml`.

La consola (RCON) i el Bridge de cada servidor només escolten a `127.0.0.1` de la VM. En canvi, el
port públic de cada servidor queda obert a la xarxa encara que `ufw` no en tingui cap regla,
perquè Docker publica els ports pel seu compte.

### Instal·lacions antigues (un sol servidor)

Les guies de `docs/` expliquen el muntatge manual anterior, amb un sol servidor configurat al
`.env` (`MC_CONTAINER`, `BRIDGE_URL`...). El panell encara el fa servir mentre no es creï cap
servidor des de **Servidors**; quan se'n crea un, el servidor antic deixa de sortir al panell.
No executis el nou `install.sh` sobre una instal·lació antiga: en sobreescriuria el `.env`.

## Provar-ho tot en local (Windows)

```
powershell -ExecutionPolicy Bypass -File dev\start-local.ps1
```

Crea un servidor Paper de proves a `%USERPROFILE%\mc-dev` (fora de Proton Drive) amb LuckPerms,
PlaceholderAPI, TAB i el Bridge, l'engega en una finestra pròpia, configura `panel/.env`,
et demana el primer usuari i obre el panell a http://localhost:5173.
Cada cop que el tornis a executar recompila el Bridge (reinicia el servidor per carregar-lo).

## Compilar el Bridge

A la VM no cal: `install.sh` el compila dins d'un contenidor. Per compilar-lo al teu ordinador cal
Java 25.

```
cd bridge
./gradlew build        # Windows: .\gradlew.bat build
```

El jar queda a `bridge/build/libs/bridge-<versió>.jar`.

## API del Bridge

Totes les peticions porten `Authorization: Bearer <token>` (el token és a
`plugins/Bridge/config.yml`; als servidors creats des del panell el genera el panell). Respostes en JSON; els errors tenen la forma
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
