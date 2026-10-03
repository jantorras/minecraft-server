# Panell web

SvelteKit + TypeScript. Parla amb el plugin Bridge (per `127.0.0.1`) i desa els seus
usuaris, sessions i registre d'auditoria en un SQLite.

## Desenvolupament

```
cp .env.example .env        # omple BRIDGE_TOKEN
npm install
npm run create-user -- elteunom owner
npm run dev
```

## Rols del panell

| Rol | Pot |
|---|---|
| `mod` | Veure-ho tot, sense canviar res |
| `admin` | Gestionar jugadors (rols, prefixos, tags), grups i tags |
| `owner` | Tot l'anterior + gestionar els comptes del panell |

Desplegament a la VM: [../docs/02-panell.md](../docs/02-panell.md).
