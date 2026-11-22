# Integration notes — decisions where the task outputs disagreed
00_INTEGRATION_GUIDE.md won every conflict (it says so in §8).

1. **Stack.** The tasks arrived as vanilla JS (1-2), Flask (3-4), and Python-generated HTML + a Flask engine (5-6). They cannot share one store as-is, and 00 says "no backend". Tasks 3-6 were ported to JS onto Task 1's store; Tasks 1-2 are unchanged except the patches below. The React/TypeScript/Vite stack in the project description was **not** used.
2. **Scope vs the project description.** Description says 15 areas, 3 views, 1-5 rating, 2 s telemetry. Contract says 19 regions, 5 systems, 1-10 severity. Followed the contract; telemetry runs every 2 s (`sim.start(2000)`).
3. **Patches to Task 1 (`js/core/core.js`, marked `INTEGRATION PATCH`):** `addSymptom` keeps type/context/resolved and returns the entry (symptom colour is now an overlay in `js/layers`, so undo/resolve restore it); `completeCountermeasure` no longer awards XP or crew progress (Gamification owns both, no double counting); per-countermeasure `boost`; "missed 3 days" text.
4. **Patch to Task 2 (`js/twin/twin.js`):** body base colours read from `--twin-*` tokens instead of hard-coded hex.
5. **Tokens.** Task 6 used non-contract names (`--bg-deep`...). Now the 12 contract names. Status colours: cyan / amber / red as in the brief. Google Fonts link dropped (no internet at runtime); font stacks fall back to system fonts.
6. **Crew names.** Task 1's roster (Nour Hamdy, Mateo, Mei, Jonas) is used; Task 5's (Rayan, Nour, Omar, Salma) is not. Edit `js/core/core.js` to change.
7. **Layer bar.** Task 6's mock layers (Skin/Skeleton/Organs/Symptoms/Cabin) replaced by the 5 contract systems.
8. **Extra events.** Task 5's `sleep:recorded`, `nutrition:logged`, `cabin:day` are not in the contract. Sleep now comes from the `sleep` slice (Rest Cycle Sync); cabin days are derived from `environment:updated` (15 ticks = 1 demo day); nutrition is a direct call. No new event names.
9. **Invented numbers removed** (see TO_VERIFY.md).
10. **Sources.** 13 contract Source IDs (Task 6 expected 15; the contract lists 13).
