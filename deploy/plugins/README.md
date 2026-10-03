# Plugins per a `install.sh`

Posa aquí els `.jar` de:

- LuckPerms (Bukkit) — https://luckperms.net/download
- PlaceholderAPI — https://hangar.papermc.io/HelpChat/PlaceholderAPI
- TAB — https://github.com/NEZNAMY/TAB/releases

El `.jar` del plugin Bridge (`bridge/build/libs/bridge-*.jar`) es copia automàticament,
no cal posar-lo aquí.

`install.sh` copia tot el que trobi en aquesta carpeta a `/opt/minecraft/plugins/paper/`, i el
panell ho copia a cada servidor normal que crees.

Els plugins dels proxys (per exemple LuckPerms per a Velocity) van a `velocity/` dins d'aquesta
carpeta; acaben a `/opt/minecraft/plugins/velocity/`.
