# Primal Watch

A personal Pokémon TCG card tracker: browse rare cards set by set, see reported sold prices for raw (near mint), PSA 9 and PSA 10 copies, and save a watchlist with buy limits.

The app lives in [`site/`](site/). It is a dependency-free Node.js server (Node 24+, built-in SQLite).

```powershell
cd site
node server.mjs   # then open http://localhost:5173
```

`handoff.md` describes the current state, open work and next steps for whoever picks the project up next.
