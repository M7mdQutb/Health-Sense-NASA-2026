# TO VERIFY — one list for the whole app
Also shown in the app: **Data sources** button (top right). Nothing below is presented as an official number.

**Official numbers in code** (00 §ي, all `eclss-ochmo`): ppCO₂ < 3 mmHg · ppO₂ 145–155 mmHg · cabin 18–27 °C · 3035 kcal/day.

| Item | Verify against | Status in the app |
|---|---|---|
| Radiation warning limit | `srag` | `null` — no radiation alert and no radiation colouring until filled (`Core.C.TO_VERIFY.radiationWarnLimit`) |
| Bone density limit | `nasa-std-3001` | `null`, not used |
| Orthostatic blood-pressure limit | `nasa-std-3001` | `null`, not used |
| SpO₂ limits | `physionet-bidmc` | `null` — SpO₂ shown without a status colour |
| Caution margin 15% around official ranges | `eclss-ochmo` | UI heuristic, not official |
| Region score bands (<40 critical, ≤70 caution) | `hrp-risks` | UI heuristic on mock scores |
| Triage rules flagged `toVerify` (headache-fluid, vision-sans, vision-severe, breath-severe, sleep, msk-load, any-severe) | `ntrs-hhp` | urgency + day/sleep/ARED triggers are placeholders (`js/logging/rules.js`) |
| Demo values: countermeasure durations, +20 score boost, 600 s link delay, XP table, 40 h crew goal, 10 min alert window | — | game/demo design, not NASA data |

Removed from the Task 3-4 version (they were invented numbers): ppCO₂ critical = 5, ppO₂ critical deviation = 10, SpO₂ 95/90, radiation 50/80 % of limit.
