# Competitive platform roadmap

The `echgammon/competitive.mjs` module provides **pure, deterministic foundations only**:
Elo expectation/update, seeded single-elimination round-one brackets with explicit byes,
and a basic request-envelope validator. It does **not** create accounts, persist ratings,
validate complete moves, operate matchmaking, authenticate players, prevent replay,
or host tournaments. No simulated players should be described as online humans.

For real competitive play, implement a server-authoritative game service, persistent
accounts and matches, per-game sequential moves and nonce deduplication, reconnect,
clock synchronization, cheating/rate-limit protections, secure sessions and moderation.
Apply ratings only after a server-confirmed result, in a database transaction that
cannot be applied twice. The hybrid Echgammon rules must remain canonical.

Delivery phases: 1) auth and profiles; 2) real-time friend rooms and matchmaking;
3) server-side rules and clocks; 4) persistent ranked queues and ratings; 5) scheduled
and open tournaments; 6) anti-cheat, audit logs, safety and load testing; 7) scalable
coaching, puzzle catalog and analytics. Each phase needs its own integration tests.
