# Primal Watch — session handoff

Updated: October 1–2, 2026 (Pacific). Repository: `d-roads/pokemon` (public), branch `main`.

> Draft written mid-session; the final section at the bottom is updated at the end of each session.

## Goals (from the collector)

1. Keep the clean, smooth design the collector likes.
2. Accurate prices and buy targets for rare cards, from actual reported sales, for raw near mint, PSA 9 and PSA 10.
3. Cover every rare card in the XY era, then the Black & White era (BW base through Legendary Treasures, including Dragon Vault).
4. **Alerts** when a wishlisted (watched) card is listed for a good price.
5. **The Dex**: a library of owned cards with total collection value and a P/L chart for cards bought.
6. Preserve the saved watchlist and buy limits (`site/data/primal-watch.sqlite`, never committed — the repo is public).
7. Commit each iteration to `d-roads/pokemon`; leave a handoff like this one at the end of every session.

## Where things live

- Original source folder on the collector's PC: `C:\Users\b345t\.codex\.chatgpt-projects\g-p-6a72b895d6288191b4624c5f5479fcae\primal-watch` (app in `site/`).
- Repository mirrors `site/` plus the packaging scripts and this handoff. The Next.js template files in the original root folder are unused and not mirrored.
- Run: `cd site && node server.mjs` → http://localhost:5173 (Node 24+).
