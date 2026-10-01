CREATE TABLE IF NOT EXISTS watchlist (user_id TEXT NOT NULL, card_id TEXT NOT NULL, grade TEXT NOT NULL, target REAL, created_at TEXT NOT NULL, PRIMARY KEY (user_id,card_id,grade));
CREATE TABLE IF NOT EXISTS market_cache (card_id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, fetched_at TEXT NOT NULL);
