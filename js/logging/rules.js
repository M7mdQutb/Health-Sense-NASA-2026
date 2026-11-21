/* Triage rules as data (from twin-py/twin/rules.json). toVerify:true = number/urgency NOT confirmed by the source file. */
window.TRIAGE_RULES = [
 {
  "id": "headache-co2",
  "types": [
   "headache"
  ],
  "when": {
   "ppCO2Gt": 3
  },
  "cause": "Elevated cabin CO2",
  "action": "Ventilate the cabin and re-measure ppCO2",
  "urgency": "self_treat",
  "source": "eclss-ochmo"
 },
 {
  "id": "headache-temp",
  "types": [
   "headache"
  ],
  "when": {
   "tempOutside": true
  },
  "cause": "Cabin temperature outside the 18\u201327 \u00b0C range",
  "action": "Adjust cabin temperature and re-check",
  "urgency": "watch",
  "source": "eclss-ochmo"
 },
 {
  "id": "headache-fluid",
  "types": [
   "headache"
  ],
  "when": {
   "daysInSpaceGte": 3
  },
  "cause": "Headward fluid shift",
  "action": "Log it, rest, and keep tracking",
  "urgency": "watch",
  "source": "hrp-risks",
  "toVerify": true
 },
 {
  "id": "vision-sans",
  "types": [
   "blurred_vision"
  ],
  "when": {
   "daysInSpaceGte": 7
  },
  "cause": "Possible SANS (spaceflight-associated neuro-ocular syndrome)",
  "action": "Log changes daily and report to ground",
  "urgency": "watch",
  "source": "hrp-risks",
  "toVerify": true
 },
 {
  "id": "vision-severe",
  "types": [
   "blurred_vision"
  ],
  "when": {
   "minSeverity": 7
  },
  "cause": "Sudden or severe vision change",
  "action": "Stop tasks that need sharp vision; contact ground first chance",
  "urgency": "contact_ground",
  "source": "ntrs-hhp",
  "toVerify": true
 },
 {
  "id": "breath-co2",
  "types": [
   "shortness_of_breath",
   "dizziness"
  ],
  "when": {
   "ppCO2Gt": 3
  },
  "cause": "Elevated cabin CO2",
  "action": "Ventilate the cabin and re-measure ppCO2",
  "urgency": "self_treat",
  "source": "eclss-ochmo"
 },
 {
  "id": "breath-o2",
  "types": [
   "shortness_of_breath"
  ],
  "when": {
   "ppO2Outside": true
  },
  "cause": "ppO2 outside the 145\u2013155 mmHg range",
  "action": "Check O2 supply and re-measure",
  "urgency": "self_treat",
  "source": "eclss-ochmo"
 },
 {
  "id": "breath-severe",
  "types": [
   "shortness_of_breath"
  ],
  "when": {
   "minSeverity": 7
  },
  "cause": "Severe breathing difficulty",
  "action": "Stop activity, check air readings, contact ground first chance",
  "urgency": "contact_ground",
  "source": "ntrs-hhp",
  "toVerify": true
 },
 {
  "id": "orthostatic",
  "types": [
   "orthostatic",
   "dizziness"
  ],
  "when": {},
  "cause": "Possible orthostatic hypotension after fluid shift",
  "action": "Sit or lie down, drink fluids, use compression garments",
  "urgency": "watch",
  "source": "hrp-risks"
 },
 {
  "id": "sleep",
  "types": [
   "sleep_disturbance",
   "fatigue",
   "stress"
  ],
  "when": {
   "sleepHoursLt": 6
  },
  "cause": "Short sleep or disrupted circadian rhythm",
  "action": "Follow the sleep routine and reduce evening light",
  "urgency": "watch",
  "source": "osdr-osd-1018",
  "toVerify": true
 },
 {
  "id": "stress",
  "types": [
   "stress",
   "sleep_disturbance"
  ],
  "when": {},
  "cause": "Isolation and workload stress",
  "action": "Take a short break, then log your mood",
  "urgency": "watch",
  "source": "hrp-hazards"
 },
 {
  "id": "msk-load",
  "types": [
   "pain",
   "numbness"
  ],
  "when": {
   "aredMissedGte": 3
  },
  "cause": "Low musculoskeletal loading after missed resistance sessions",
  "action": "Do an ARED session and a stretch",
  "urgency": "self_treat",
  "source": "hrp-risks",
  "toVerify": true
 },
 {
  "id": "any-severe",
  "types": [
   "*"
  ],
  "when": {
   "minSeverity": 7
  },
  "cause": "Severe symptom, cause unclear",
  "action": "Contact ground first chance",
  "urgency": "contact_ground",
  "source": "ntrs-hhp",
  "toVerify": true
 }
];
