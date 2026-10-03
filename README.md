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

## Instal·lar-ho tot en una VM nova

```bash
sudo ./install.sh
```

Posa abans els `.jar` de LuckPerms/PlaceholderAPI/TAB a `deploy/plugins/` (veure
[deploy/plugins/README.md](deploy/plugins/README.md)). L'script instal·la Docker, Node,
MariaDB, munta el contenidor del servidor i el panell, i et diu com crear el primer usuari.
Detalls i variables opcionals als comentaris de dalt de l'script, o a
[docs/01-infraestructura.md](docs/01-infraestructura.md) / [docs/02-panell.md](docs/02-panell.md)
si ho vols fer pas a pas.

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
