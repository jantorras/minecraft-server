# Fase 2 – Desplegar el panell a la VM

El panell viu a la mateixa VM Ubuntu que el Crafty i parla amb el Bridge per
`127.0.0.1:8765`.

```
Internet ──HTTPS──▶ Caddy (443) ──▶ Panell Node (127.0.0.1:3000) ──▶ Bridge (127.0.0.1:8765)
```

## 1. Node.js 24

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs build-essential   # build-essential per a better-sqlite3 si cal compilar
node -v
```

## 2. Copiar i compilar

```bash
sudo useradd --system --create-home --home-dir /opt/panell panell
sudo -u panell git clone <el-vostre-repo> /opt/panell/app   # o copia la carpeta panel/ amb scp
cd /opt/panell/app/panel
sudo -u panell npm ci
sudo -u panell npm run build
```

## 3. Configuració

```bash
sudo -u panell cp .env.example .env
sudo -u panell nano .env
```

```ini
BRIDGE_URL=http://127.0.0.1:8765
BRIDGE_TOKEN=<token de plugins/Bridge/config.yml>
DATABASE_PATH=/opt/panell/data/panel.db
ORIGIN=https://panell.el-teu-domini.cat
HOST=127.0.0.1
PORT=3000
```

`ORIGIN` ha de ser exactament l'adreça amb què obriu el panell al navegador; si no,
els formularis donaran l'error «Cross-site POST form submissions are forbidden».

### Connectar amb el servidor Docker (opcional però recomanat)

Permet veure CPU/RAM/jugadors, iniciar, aturar, reiniciar, fer còpies, gestionar
fitxers i (només owners) enviar ordres a la consola — tot sense cap panell intermedi
(veure docs/01-infraestructura.md).

1. L'usuari que executa el panell (`panell`) ha de ser del grup `docker`, per poder
   parlar amb `/var/run/docker.sock`:
   ```bash
   sudo usermod -aG docker panell
   sudo systemctl restart panell   # cal rellançar el procés perquè agafi el grup nou
   ```
2. Afegeix al `.env` (mateixos valors que `/opt/minecraft/docker-compose.yml`):

```ini
MC_CONTAINER=mc-claude
MC_DATA_DIR=/opt/minecraft/data
MC_BACKUPS_DIR=/opt/minecraft/backups
MC_RCON_HOST=127.0.0.1
MC_RCON_PORT=25575
MC_RCON_PASSWORD=<la mateixa RCON_PASSWORD del docker-compose.yml>
```

Si no poses res d'això, el panell funciona igual, només sense els controls de
servidor ni el gestor de fitxers.

**Nota de seguretat:** pertànyer al grup `docker` dona accés root-equivalent a la VM
(qui pugui parlar amb el socket de Docker pot muntar qualsevol path de l'amfitrió dins
d'un contenidor). És acceptable perquè és un servei de confiança en una VM dedicada,
però no ho facis en una màquina compartida amb altres usuaris sense pensar-hi.

## 4. Primer usuari (owner)

```bash
sudo -u panell npm run create-user -- elteunom owner
```

Demana la contrasenya per consola. La resta de comptes es creen des del panell
(«Usuaris del panell»). El mateix script serveix per recuperar l'accés si oblides la contrasenya.

## 5. Servei systemd

`/etc/systemd/system/panell.service`:

```ini
[Unit]
Description=Panell del servidor Minecraft
After=network.target

[Service]
User=panell
WorkingDirectory=/opt/panell/app/panel
ExecStart=/usr/bin/npm start
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now panell
journalctl -u panell -f
```

## 6. HTTPS amb Caddy

Cal un domini (o subdomini) apuntant a la IP pública de casa i els ports 80 i 443
redirigits al router cap a la VM.

```bash
sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`:

```
panell.el-teu-domini.cat {
	reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo systemctl reload caddy
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

Caddy obté i renova el certificat sol.

**Alternativa sense obrir ports:** instal·lar Tailscale a la VM i als vostres
dispositius i entrar pel nom de Tailscale. Més segur, però cada admin ha d'instal·lar-lo.

## 7. Actualitzar

```bash
cd /opt/panell/app && sudo -u panell git pull
cd panel && sudo -u panell npm ci && sudo -u panell npm run build
sudo systemctl restart panell
```

## Còpies de seguretat

El fitxer `/opt/panell/data/panel.db` té els comptes i el registre. Inclou `/opt/panell/data`
a les còpies (la còpia de la VM de Proxmox ja el cobreix).
