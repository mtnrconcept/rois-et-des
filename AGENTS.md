# Project workflow

Work only on an isolated worktree and a dedicated feature branch. Never write or merge directly to main.
Before editing, inspect git status, the active branch, current remote state, this file, the source, relevant PRs and CI. Verify GitHub and the hosting connector. Verify Supabase/Vercel access when requested; this game has no backend, database, payment system or secrets. Do not modify unrelated projects.
Read docs/echgammon-implementation.md and the in-game rules. The supplied poster defines the classic game; additional rulings must be explicit. Do not turn dice failures into checkmate, discard temporarily unusable dice, or mix chess pieces with race checkers.
Write regression tests before changing rules. Run npm test, npm run check and npm run build. Run tests/echgammon.browser.py with Python/Playwright when changing the interface. OFFLINE_BROWSER=1 is a documented local fallback that executes actual assets but replaces storage with an in-memory adapter; it is not a native-persistence/network test.
Preserve source conventions and existing files outside the task. Never fabricate file, branch, migration, commit, test, PR or deployment results. Explain missing access precisely. Keep a complete changed-file list and a clean commit. Leave the PR open and main untouched unless the user later explicitly requests otherwise.
