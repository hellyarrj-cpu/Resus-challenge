import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { safeGet, safeSet } from "./lib/storage";

/* ============================================================
   DR RICKY'S RESUS CHALLENGE — prototype v0.1
   Design: clinical monitor aesthetic. Deep teal-navy background,
   muted phosphor-green vitals readout, amber/red alert states.
   Monospace for vitals (reads like a real monitor), humanist
   sans for UI chrome and narrative text.
   ============================================================ */

const COLORS = {
  bg: "#0B1F26",
  panel: "#102832",
  panelLight: "#15323F",
  line: "#1E4552",
  text: "#EDEDE3",
  textDim: "#8FA9AF",
  green: "#3ED98B",
  greenDim: "#2A7A56",
  amber: "#E8A33D",
  red: "#E85D5D",
  redDim: "#7A2E2E",
};

/* ---------------- Scenario data ----------------
   Each scenario models ABCDE with a "truth" abnormality per
   letter, a correct intervention, and cascading wrong-answer
   branches that worsen vitals and add a complication note. */

const ANAPHYLAXIS = {
  id: "anaphylaxis",
  title: "Anaphylaxis",
  level: 1,
  category: "Airway / Breathing",
  brief:
    "A 24-year-old is brought to you 10 minutes after IV antibiotics. They are anxious, flushed, and struggling to breathe.",
  baseline: { hr: 132, bp: "88/52", spo2: 91, rr: 28, temp: 37.1, gcs: 15 },
  steps: [
    {
      letter: "A",
      prompt: "Airway — what do you assess/hear?",
      finding:
        "Audible stridor. Lips and tongue are visibly swollen. Voice is hoarse.",
      options: [
        { text: "Recognise angioedema/airway swelling — treat as anaphylaxis", correct: true },
        { text: "Airway is clear, move on", correct: false, complication: "Swelling progresses unnoticed — airway narrows further." },
        { text: "Ask the patient to speak louder", correct: false, complication: "Delay allows swelling to worsen." },
      ],
    },
    {
      letter: "B",
      prompt: "Breathing — what's the priority action?",
      finding: "Widespread wheeze, RR 28, SpO2 91% on air, using accessory muscles.",
      options: [
        { text: "High-flow oxygen 15L via non-rebreathe mask", correct: true },
        { text: "Reassure and recheck in 5 minutes", correct: false, complication: "SpO2 falls to 85% — hypoxia worsening." },
        { text: "Sit patient flat", correct: false, complication: "Increased respiratory distress; SpO2 drops further." },
      ],
    },
    {
      letter: "C",
      prompt: "Circulation — vitals show HR 132, BP 88/52. Immediate drug?",
      finding: "Weak, thready pulse. Cap refill 4 seconds. Skin mottled.",
      options: [
        { text: "IM Adrenaline 500mcg (0.5mL 1:1000), anterolateral thigh", correct: true },
        { text: "Oral antihistamine", correct: false, complication: "Too slow for anaphylactic shock — BP drops to 70/40." },
        { text: "IV fluids only, hold adrenaline", correct: false, complication: "Shock deepens without adrenaline on board." },
      ],
    },
    {
      letter: "D",
      prompt: "Disability — GCS check and blood glucose?",
      finding: "GCS 14 (confused), blood glucose 5.8 mmol/L.",
      options: [
        { text: "Note reduced GCS 2° hypoxia/shock, glucose normal — reassess after treatment", correct: true },
        { text: "Assume hypoglycaemia, give glucose", correct: false, complication: "Wastes time — glucose was never the problem." },
      ],
    },
    {
      letter: "E",
      prompt: "Exposure — what do you look for?",
      finding: "Urticarial rash spreading across chest and arms.",
      options: [
        { text: "Confirm widespread urticaria — consistent with anaphylaxis", correct: true },
        { text: "Cover the patient, skip exposure", correct: false, complication: "Missed rash pattern — diagnosis less certain to the team." },
      ],
    },
  ],
  reassess: {
    prompt: "2 minutes after IM adrenaline + O2 — reassess. HR 118, BP 96/60, SpO2 95%. What next?",
    options: [
      { text: "Improving — continue monitoring, prepare second dose if no further improvement in 5 min", correct: true },
      { text: "Discharge, patient looks better", correct: false, complication: "Premature — biphasic reaction risk unmanaged." },
    ],
  },
  escalate: {
    prompt: "Do you escalate this patient?",
    options: [
      { text: "Yes — call critical care outreach / emergency response for anaphylaxis with cardiovascular compromise", correct: true },
      { text: "No — manage on the ward alone", correct: false, complication: "Delayed senior input on a patient who nearly arrested." },
    ],
  },
};

const HYPOGLYCAEMIA = {
  id: "hypoglycaemia",
  title: "Hypoglycaemia (Unconscious)",
  level: 1,
  category: "Disability / Metabolic",
  brief:
    "A 58-year-old known type 1 diabetic is found unresponsive by a family member. It's unclear when they were last seen well.",
  baseline: { hr: 108, bp: "104/68", spo2: 96, rr: 18, temp: 36.4, gcs: 8 },
  steps: [
    {
      letter: "A",
      prompt: "Airway — what do you assess?",
      finding: "Snoring respirations, no gag response to jaw thrust.",
      options: [
        { text: "Airway at risk — open with head-tilt/chin-lift or jaw thrust, consider airway adjunct", correct: true },
        { text: "Leave as is, move to breathing", correct: false, complication: "Partial obstruction persists — SpO2 begins to fall." },
      ],
    },
    {
      letter: "B",
      prompt: "Breathing — RR 18, SpO2 96% on air. Action?",
      finding: "Breathing is shallow but adequate rate; no added sounds.",
      options: [
        { text: "Apply oxygen if SpO2 drops, otherwise monitor and reassess frequently", correct: true },
        { text: "High-flow oxygen regardless of SpO2", correct: false, complication: "Not harmful here, but distracts from the real priority — glucose check delayed." },
      ],
    },
    {
      letter: "C",
      prompt: "Circulation — HR 108, BP 104/68. Priority?",
      finding: "Pulse strong, skin cool and clammy, sweating profusely.",
      options: [
        { text: "Check capillary blood glucose immediately", correct: true },
        { text: "Gain IV access and give fluids without checking glucose", correct: false, complication: "Precious minutes lost — brain remains starved of glucose." },
      ],
    },
    {
      letter: "D",
      prompt: "Disability — glucose reads 1.8 mmol/L, GCS 8. Immediate treatment?",
      finding: "Unresponsive to voice, responds to pain only.",
      options: [
        { text: "IV 10% glucose (or IM glucagon if no IV access) per local protocol", correct: true },
        { text: "Oral glucose gel", correct: false, complication: "Unsafe — reduced GCS means aspiration risk. Glucose remains critically low." },
        { text: "Wait and recheck glucose in 15 minutes", correct: false, complication: "GCS drops further to 6 — delay is dangerous." },
      ],
    },
    {
      letter: "E",
      prompt: "Exposure — what do you check?",
      finding: "Insulin pump attached to abdomen, no injury or rash found.",
      options: [
        { text: "Note insulin delivery device and consider whether a bolus/malfunction contributed", correct: true },
        { text: "Skip — not relevant", correct: false, complication: "Missed clue that could explain recurrence risk." },
      ],
    },
  ],
  reassess: {
    prompt: "10 minutes after IV glucose — GCS now 14, glucose 6.2 mmol/L. What next?",
    options: [
      { text: "Give a long-acting carbohydrate snack once alert, monitor for rebound hypoglycaemia", correct: true },
      { text: "No further action needed, fully resolved", correct: false, complication: "Risk of rebound hypoglycaemia unmanaged." },
    ],
  },
  escalate: {
    prompt: "Do you escalate this patient?",
    options: [
      { text: "Yes — inform medical team; severe hypoglycaemia with reduced GCS needs review and monitoring plan", correct: true },
      { text: "No — patient is talking now, no escalation needed", correct: false, complication: "Underlying cause and recurrence risk not addressed." },
    ],
  },
};

const OPIOID_OVERDOSE = {
  id: "opioid_overdose",
  title: "Opioid Overdose",
  level: 1,
  category: "Airway / Breathing",
  brief:
    "A 33-year-old is found unresponsive in a hospital bathroom. Empty medication packaging is nearby.",
  baseline: { hr: 58, bp: "96/60", spo2: 82, rr: 6, temp: 36.0, gcs: 6 },
  steps: [
    {
      letter: "A",
      prompt: "Airway — what do you assess?",
      finding: "Airway patent but breathing very slow and shallow.",
      options: [
        { text: "Airway open, no obstruction — move to breathing urgently", correct: true },
        { text: "Assume airway is the main problem, ignore breathing rate", correct: false, complication: "Respiratory rate of 6 goes unaddressed — SpO2 falls further." },
      ],
    },
    {
      letter: "B",
      prompt: "Breathing — RR 6, SpO2 82%. Pinpoint pupils noted. Priority?",
      finding: "Shallow, infrequent breaths. Cyanosis around lips.",
      options: [
        { text: "Support ventilation (bag-valve-mask) and give high-flow oxygen while preparing naloxone", correct: true },
        { text: "Wait for naloxone before supporting breathing", correct: false, complication: "SpO2 drops to 74% during the delay." },
      ],
    },
    {
      letter: "C",
      prompt: "Circulation — HR 58, BP 96/60. Definitive treatment?",
      finding: "Pulse slow but palpable; peripheries cool.",
      options: [
        { text: "Give IV/IM naloxone per local protocol, titrated to effect", correct: true },
        { text: "Give adrenaline instead of naloxone", correct: false, complication: "Wrong drug for opioid toxicity — respiratory depression persists." },
      ],
    },
    {
      letter: "D",
      prompt: "Disability — GCS 6, pupils pinpoint. Blood glucose?",
      finding: "Glucose 5.4 mmol/L — normal.",
      options: [
        { text: "Glucose normal — reduced GCS consistent with opioid toxicity, reassess after naloxone", correct: true },
        { text: "Treat as hypoglycaemia regardless of normal glucose", correct: false, complication: "Wastes time on the wrong differential." },
      ],
    },
    {
      letter: "E",
      prompt: "Exposure — what do you look for?",
      finding: "Injection marks on both forearms, empty pill packet in pocket.",
      options: [
        { text: "Document findings — supports opioid overdose diagnosis and dosing history", correct: true },
        { text: "Skip exposure, diagnosis already obvious", correct: false, complication: "Missed evidence of possible co-ingestion." },
      ],
    },
  ],
  reassess: {
    prompt: "3 minutes after naloxone — RR now 14, SpO2 96%, GCS 13. What next?",
    options: [
      { text: "Continue close monitoring — naloxone wears off faster than most opioids, re-sedation risk", correct: true },
      { text: "Patient looks fine, no further monitoring needed", correct: false, complication: "Re-sedation and respiratory depression can recur unmonitored." },
    ],
  },
  escalate: {
    prompt: "Do you escalate this patient?",
    options: [
      { text: "Yes — critical care outreach review given severity of initial hypoxia and re-sedation risk", correct: true },
      { text: "No — naloxone worked, discharge when awake", correct: false, complication: "High risk of unwitnessed deterioration once naloxone wears off." },
    ],
  },
};

const ASTHMA = {
  id: "asthma",
  title: "Severe Asthma",
  level: 1,
  category: "Airway / Breathing",
  brief:
    "A 19-year-old with known asthma presents acutely breathless after running for a bus, using their inhaler with little effect.",
  baseline: { hr: 128, bp: "118/74", spo2: 90, rr: 32, temp: 36.8, gcs: 15 },
  steps: [
    {
      letter: "A",
      prompt: "Airway — what do you assess?",
      finding: "Patient can speak only in short phrases, audible wheeze.",
      options: [
        { text: "Airway patent but compromised by severe bronchospasm — proceed to breathing support", correct: true },
        { text: "No airway concern, skip ahead", correct: false, complication: "Deteriorating work of breathing goes unaddressed a little longer." },
      ],
    },
    {
      letter: "B",
      prompt: "Breathing — RR 32, SpO2 90%, silent chest developing. Priority?",
      finding: "Widespread wheeze fading to reduced air entry — a worrying sign.",
      options: [
        { text: "High-flow oxygen, nebulised salbutamol + ipratropium, prepare for senior/anaesthetic help", correct: true },
        { text: "Nebuliser only, no oxygen", correct: false, complication: "Hypoxia persists — SpO2 falls to 85%." },
        { text: "Reassure and wait for inhaler to work", correct: false, complication: "Silent chest progresses — this is a pre-arrest sign." },
      ],
    },
    {
      letter: "C",
      prompt: "Circulation — HR 128, BP 118/74. What do you add?",
      finding: "Tachycardic, warm peripheries, borderline high lactate likely from beta-agonist and work of breathing.",
      options: [
        { text: "IV access, consider IV magnesium sulfate and steroids per severe asthma protocol", correct: true },
        { text: "Beta-blocker to slow heart rate", correct: false, complication: "Dangerous — beta-blockers worsen bronchospasm." },
      ],
    },
    {
      letter: "D",
      prompt: "Disability — GCS 15 but becoming drowsy. Blood glucose?",
      finding: "Glucose 6.0 mmol/L, patient increasingly exhausted.",
      options: [
        { text: "Note exhaustion/drowsiness as a red flag for impending respiratory failure — alert senior help now", correct: true },
        { text: "Reassure, drowsiness is normal when tired from breathing hard", correct: false, complication: "Drowsiness here signals CO2 retention — delay is dangerous." },
      ],
    },
    {
      letter: "E",
      prompt: "Exposure — what do you check?",
      finding: "No rash, no signs of anaphylaxis or trauma.",
      options: [
        { text: "Confirm no alternative trigger — consistent with pure severe asthma exacerbation", correct: true },
        { text: "Skip — not needed", correct: false, complication: "Alternative diagnoses not formally excluded." },
      ],
    },
  ],
  reassess: {
    prompt: "15 minutes after treatment — RR 24, SpO2 94%, air entry improving. What next?",
    options: [
      { text: "Continue nebulisers and steroids, monitor closely, keep senior team informed", correct: true },
      { text: "Stop treatment, patient sounds better", correct: false, complication: "Stopping too early risks rapid relapse." },
    ],
  },
  escalate: {
    prompt: "Do you escalate this patient?",
    options: [
      { text: "Yes — critical care outreach given the silent chest/exhaustion episode, even though now improving", correct: true },
      { text: "No — no escalation needed now they're better", correct: false, complication: "A patient who had a silent chest needs senior review regardless of improvement." },
    ],
  },
};

const SEPSIS = {
  id: "sepsis",
  title: "Septic Shock",
  level: 2,
  category: "Circulation / Infection",
  brief:
    "An 71-year-old is referred from a care home with 2 days of worsening confusion and a productive cough. They look unwell and drowsy.",
  baseline: { hr: 124, bp: "82/48", spo2: 89, rr: 26, temp: 39.2, gcs: 13 },
  steps: [
    {
      letter: "A",
      prompt: "Airway — what do you assess?",
      finding: "Patent airway, patient can talk but confused and slow to respond.",
      options: [
        { text: "Airway patent — proceed to breathing", correct: true },
        { text: "Assume airway compromise, attempt intubation immediately", correct: false, complication: "Unnecessary and delays actual priorities — team confidence in your assessment drops." },
      ],
    },
    {
      letter: "B",
      prompt: "Breathing — RR 26, SpO2 89% on air, crackles at right base. Action?",
      finding: "Increased work of breathing, productive cough, dull percussion right base.",
      options: [
        { text: "High-flow oxygen, target saturations per protocol", correct: true },
        { text: "No oxygen needed, SpO2 will recover on its own", correct: false, complication: "SpO2 drops to 84% — organ perfusion worsening." },
      ],
    },
    {
      letter: "C",
      prompt: "Circulation — HR 124, BP 82/48, lactate 4.2. Priority bundle action?",
      finding: "Warm peripheries initially, cap refill 3s, reduced urine output reported.",
      options: [
        { text: "Sepsis Six: blood cultures, IV fluids, IV antibiotics, lactate, oxygen, monitor urine output", correct: true },
        { text: "Antibiotics only, skip fluids", correct: false, complication: "BP falls further to 74/40 without fluid resuscitation." },
        { text: "Wait for senior review before starting antibiotics", correct: false, complication: "Delay in antibiotics significantly worsens sepsis outcomes." },
      ],
    },
    {
      letter: "D",
      prompt: "Disability — GCS 13, glucose 7.1 mmol/L. Interpretation?",
      finding: "New confusion, disoriented to time and place.",
      options: [
        { text: "New confusion likely due to sepsis — treat as part of the septic picture, reassess after fluids", correct: true },
        { text: "Assume dementia, not relevant to current illness", correct: false, complication: "New/worsening confusion is a red flag that gets dismissed." },
      ],
    },
    {
      letter: "E",
      prompt: "Exposure — what do you check?",
      finding: "No rash or wounds; source likely respiratory given cough and chest findings.",
      options: [
        { text: "Full skin check to exclude other sources (line sites, pressure sores, wounds)", correct: true },
        { text: "Skip — source already obvious", correct: false, complication: "A second infective source could be missed." },
      ],
    },
  ],
  reassess: {
    prompt: "1 hour after Sepsis Six bundle — BP 96/58, HR 108, lactate improving. What next?",
    options: [
      { text: "Continue monitoring closely, reassess fluid balance and response, repeat lactate", correct: true },
      { text: "Bundle complete, no further monitoring required", correct: false, complication: "Ongoing deterioration could be missed without repeat review." },
    ],
  },
  escalate: {
    prompt: "Do you escalate this patient?",
    options: [
      { text: "Yes — critical care outreach given lactate >4 and hypotension not fully resolved", correct: true },
      { text: "No — bundle given, no escalation needed", correct: false, complication: "Ongoing shock physiology needs senior input regardless of bundle completion." },
    ],
  },
};

const DKA = {
  id: "dka",
  title: "Diabetic Ketoacidosis",
  level: 2,
  category: "Disability / Metabolic",
  brief:
    "A 22-year-old type 1 diabetic presents with vomiting, abdominal pain, and deep, laboured breathing over the last 24 hours.",
  baseline: { hr: 118, bp: "100/62", spo2: 97, rr: 30, temp: 37.0, gcs: 14 },
  steps: [
    {
      letter: "A",
      prompt: "Airway — what do you assess?",
      finding: "Airway patent, fruity/acetone smell on breath noted.",
      options: [
        { text: "Airway clear — note ketotic breath odour as a clue, proceed to breathing", correct: true },
        { text: "Ignore the smell, not clinically relevant", correct: false, complication: "A useful early diagnostic clue is dismissed." },
      ],
    },
    {
      letter: "B",
      prompt: "Breathing — RR 30, deep sighing respirations (Kussmaul breathing), SpO2 97%. Interpretation?",
      finding: "Deep, rapid breathing is a compensatory response to metabolic acidosis.",
      options: [
        { text: "Recognise Kussmaul breathing as compensation for acidosis — do not sedate or slow breathing", correct: true },
        { text: "Give opioids to settle the rapid breathing", correct: false, complication: "Dangerous — suppressing compensatory breathing worsens acidosis rapidly." },
      ],
    },
    {
      letter: "C",
      prompt: "Circulation — HR 118, BP 100/62, patient clinically dehydrated. Priority?",
      finding: "Dry mucous membranes, reduced skin turgor, glucose 28 mmol/L, ketones 5.6.",
      options: [
        { text: "IV 0.9% saline fluid resuscitation, then fixed-rate IV insulin per DKA protocol", correct: true },
        { text: "IV insulin bolus before any fluids", correct: false, complication: "Insulin before fluids risks a dangerous drop in potassium and BP." },
      ],
    },
    {
      letter: "D",
      prompt: "Disability — GCS 14, glucose 28 mmol/L. What else must you check urgently?",
      finding: "Patient increasingly drowsy, abdominal pain persists.",
      options: [
        { text: "Check serum potassium before/during insulin — DKA causes life-threatening potassium shifts", correct: true },
        { text: "No further bloods needed, start insulin", correct: false, complication: "Untreated hypokalaemia during insulin therapy risks cardiac arrhythmia." },
      ],
    },
    {
      letter: "E",
      prompt: "Exposure — what do you look for?",
      finding: "No wounds; check for a precipitant such as infection or missed insulin doses.",
      options: [
        { text: "Look for an infective source or other DKA trigger (e.g. missed insulin, illness)", correct: true },
        { text: "Skip — trigger doesn't matter right now", correct: false, complication: "An untreated trigger (e.g. infection) will prevent resolution." },
      ],
    },
  ],
  reassess: {
    prompt: "2 hours into treatment — glucose falling appropriately, ketones improving, potassium stable on replacement. What next?",
    options: [
      { text: "Continue fixed-rate insulin and fluids, hourly glucose/ketone monitoring per protocol", correct: true },
      { text: "Stop insulin once glucose is near-normal", correct: false, complication: "Stopping insulin too early leaves ketosis unresolved — DKA persists despite normal glucose." },
    ],
  },
  escalate: {
    prompt: "Do you escalate this patient?",
    options: [
      { text: "Yes — inform medical/diabetes team; severe DKA needs close monitoring, potentially HDU-level care", correct: true },
      { text: "No — insulin and fluids started, no escalation needed", correct: false, complication: "Severe DKA can deteriorate quickly and needs senior oversight." },
    ],
  },
};

const PULMONARY_OEDEMA = {
  id: "pulmonary_oedema",
  title: "Acute Heart Failure / Pulmonary Oedema",
  level: 2,
  category: "Breathing / Cardiac",
  brief:
    "An 80-year-old with known heart failure presents acutely breathless, unable to lie flat, with frothy pink sputum.",
  baseline: { hr: 116, bp: "168/94", spo2: 86, rr: 32, temp: 36.9, gcs: 15 },
  steps: [
    {
      letter: "A",
      prompt: "Airway — what do you assess?",
      finding: "Airway patent, patient sitting bolt upright, gasping for breath.",
      options: [
        { text: "Airway clear — keep patient sitting upright, proceed to breathing", correct: true },
        { text: "Lie the patient flat to assess more easily", correct: false, complication: "Lying flat sharply worsens breathlessness — SpO2 drops further." },
      ],
    },
    {
      letter: "B",
      prompt: "Breathing — RR 32, SpO2 86%, bilateral crackles to mid-zones, frothy sputum. Priority?",
      finding: "Widespread crackles, visibly struggling, using accessory muscles.",
      options: [
        { text: "High-flow oxygen, sit upright, consider CPAP if available/per protocol", correct: true },
        { text: "Fluid bolus to support blood pressure", correct: false, complication: "Dangerous — this patient is fluid-overloaded; more fluid worsens pulmonary oedema." },
      ],
    },
    {
      letter: "C",
      prompt: "Circulation — HR 116, BP 168/94. Priority drug?",
      finding: "Hypertensive, warm peripheries, jugular venous distension noted.",
      options: [
        { text: "IV furosemide (loop diuretic) and consider GTN if BP tolerates, per local protocol", correct: true },
        { text: "Beta-blocker to lower heart rate", correct: false, complication: "Risk of worsening acute decompensation — not first-line here." },
      ],
    },
    {
      letter: "D",
      prompt: "Disability — GCS 15, glucose 6.4 mmol/L. Anything relevant?",
      finding: "Alert but anxious and frightened by breathlessness.",
      options: [
        { text: "Reassure, monitor GCS as a marker of hypoxia/deterioration", correct: true },
        { text: "Sedate to reduce anxiety", correct: false, complication: "Sedation risks further respiratory depression in an already hypoxic patient." },
      ],
    },
    {
      letter: "E",
      prompt: "Exposure — what do you check?",
      finding: "Bilateral ankle oedema, weight gain reported over preceding days.",
      options: [
        { text: "Note peripheral oedema — supports fluid overload / decompensated heart failure", correct: true },
        { text: "Skip — not relevant to breathing problem", correct: false, complication: "Useful corroborating sign for the diagnosis is missed." },
      ],
    },
  ],
  reassess: {
    prompt: "30 minutes after furosemide and oxygen — SpO2 93%, RR 22, good urine output starting. What next?",
    options: [
      { text: "Continue monitoring fluid balance, oxygen, and response to diuretic; repeat observations regularly", correct: true },
      { text: "Stop oxygen immediately since they're improving", correct: false, complication: "Premature withdrawal risks desaturation before the patient has stabilised." },
    ],
  },
  escalate: {
    prompt: "Do you escalate this patient?",
    options: [
      { text: "Yes — inform medical/cardiology team given severity of initial presentation and CPAP consideration", correct: true },
      { text: "No — diuretic given, no escalation needed", correct: false, complication: "Significant decompensated heart failure needs senior review and ongoing input." },
    ],
  },
};

const SVT = {
  id: "svt",
  title: "Supraventricular Tachycardia (SVT)",
  level: 2,
  category: "Circulation / Cardiac",
  brief:
    "A 29-year-old presents with sudden-onset palpitations and lightheadedness that started 20 minutes ago while at rest.",
  baseline: { hr: 188, bp: "104/70", spo2: 98, rr: 20, temp: 36.7, gcs: 15 },
  steps: [
    {
      letter: "A",
      prompt: "Airway — what do you assess?",
      finding: "Airway patent, patient talking, visibly anxious.",
      options: [
        { text: "Airway clear — proceed to breathing", correct: true },
        { text: "Assume airway is the issue, delay cardiac assessment", correct: false, complication: "Wastes time on an assessment that isn't the priority here." },
      ],
    },
    {
      letter: "B",
      prompt: "Breathing — RR 20, SpO2 98%. Anything notable?",
      finding: "Breathing comfortable, no added sounds, mildly anxious-looking.",
      options: [
        { text: "Breathing unremarkable — apply oxygen only if SpO2 drops, move to circulation", correct: true },
        { text: "High-flow oxygen regardless of normal SpO2", correct: false, complication: "Not dangerous, but distracts from urgent cardiac assessment." },
      ],
    },
    {
      letter: "C",
      prompt: "Circulation — HR 188 regular, BP 104/70 (stable). First-line action?",
      finding: "Narrow-complex regular tachycardia on monitor, patient stable but symptomatic.",
      options: [
        { text: "Vagal manoeuvres (e.g. modified Valsalva) first, since patient is haemodynamically stable", correct: true },
        { text: "Synchronised DC cardioversion immediately", correct: false, complication: "Inappropriate first step for a stable patient — vagal manoeuvres/adenosine come first." },
        { text: "IV beta-blocker before trying vagal manoeuvres", correct: false, complication: "Skips the safer first-line step; not protocol order." },
      ],
    },
    {
      letter: "D",
      prompt: "Disability — GCS 15, glucose 5.6 mmol/L. Anything relevant?",
      finding: "Fully alert, anxious but orientated.",
      options: [
        { text: "No disability concerns — continue cardiac monitoring", correct: true },
        { text: "Sedate for anxiety before addressing the arrhythmia", correct: false, complication: "Unnecessary and delays the actual treatment needed." },
      ],
    },
    {
      letter: "E",
      prompt: "Exposure — what do you check?",
      finding: "No rash, no signs of thyroid disease or drug paraphernalia.",
      options: [
        { text: "Check for triggers — caffeine, stimulants, thyroid signs — while continuing monitoring", correct: true },
        { text: "Skip — not relevant to arrhythmia", correct: false, complication: "A reversible trigger could be missed." },
      ],
    },
  ],
  reassess: {
    prompt: "Vagal manoeuvres unsuccessful — HR still 186. What next per protocol?",
    options: [
      { text: "IV adenosine (rapid bolus with saline flush), with continuous ECG monitoring and resuscitation equipment ready", correct: true },
      { text: "Repeat vagal manoeuvres indefinitely instead of escalating treatment", correct: false, complication: "Delays effective treatment — patient remains symptomatic and tachycardic." },
    ],
  },
  escalate: {
    prompt: "Do you escalate this patient?",
    options: [
      { text: "Yes — cardiology/senior review given adenosine use and need for cardiac monitoring post-conversion", correct: true },
      { text: "No — rhythm converted, no escalation needed", correct: false, complication: "Underlying cause and recurrence risk go unassessed without cardiology input." },
    ],
  },
};

/* ---- Level 3: Time Critical ---- */

const PE = {
  id: "pe",
  title: "Pulmonary Embolism",
  level: 3,
  category: "Breathing / Circulation",
  brief:
    "A 54-year-old, 10 days post-hip replacement, develops sudden severe breathlessness and right-sided chest pain while getting out of bed.",
  baseline: { hr: 128, bp: "92/58", spo2: 87, rr: 30, temp: 37.0, gcs: 15 },
  steps: [
    {
      letter: "A",
      prompt: "Airway — what do you assess?",
      finding: "Airway patent, patient distressed and gasping.",
      options: [
        { text: "Airway clear — proceed urgently to breathing", correct: true },
        { text: "Delay to fully examine airway in detail", correct: false, complication: "Unnecessary delay while SpO2 continues to fall." },
      ],
    },
    {
      letter: "B",
      prompt: "Breathing — RR 30, SpO2 87%, pleuritic chest pain. Priority?",
      finding: "Tachypnoeic, sharp pain worse on inspiration, one-sided reduced air entry.",
      options: [
        { text: "High-flow oxygen, urgent senior review, arrange CTPA per protocol", correct: true },
        { text: "Reassure, likely just anxiety post-surgery", correct: false, complication: "Dangerous dismissal — SpO2 drops to 80% while true cause is missed." },
      ],
    },
    {
      letter: "C",
      prompt: "Circulation — HR 128, BP 92/58. What's the concern and action?",
      finding: "Tachycardic, borderline hypotensive, signs of right heart strain possible.",
      options: [
        { text: "Recognise possible massive/submassive PE with haemodynamic compromise — IV access, urgent senior/critical care input, consider anticoagulation per protocol", correct: true },
        { text: "Give a diuretic to help breathing", correct: false, complication: "Wrong direction entirely — this isn't fluid overload; BP falls further." },
      ],
    },
    {
      letter: "D",
      prompt: "Disability — GCS 15, glucose 5.8 mmol/L. Anything to note?",
      finding: "Alert, anxious, no focal neurology.",
      options: [
        { text: "No disability concern currently — continue close monitoring for deterioration", correct: true },
        { text: "Sedate for anxiety", correct: false, complication: "Risks masking early signs of further deterioration." },
      ],
    },
    {
      letter: "E",
      prompt: "Exposure — what do you check?",
      finding: "Right calf swollen, warm, and tender — possible DVT source.",
      options: [
        { text: "Examine legs for DVT signs — supports the working diagnosis", correct: true },
        { text: "Skip — not relevant to breathing problem", correct: false, complication: "A key corroborating sign for PE is missed." },
      ],
    },
  ],
  reassess: {
    prompt: "After oxygen and senior review — SpO2 91%, HR 120, awaiting CTPA. What next?",
    options: [
      { text: "Continuous monitoring, keep nil by mouth pending imaging, repeat observations frequently", correct: true },
      { text: "Discharge home to await outpatient scan", correct: false, complication: "Unsafe — a haemodynamically compromised suspected PE needs inpatient care." },
    ],
  },
  escalate: {
    prompt: "Do you escalate this patient?",
    options: [
      { text: "Yes — critical care outreach given hypoxia and haemodynamic compromise with suspected PE", correct: true },
      { text: "No — oxygen given, no escalation needed", correct: false, complication: "A potentially massive PE needs urgent senior-level input." },
    ],
  },
};

const STROKE = {
  id: "stroke",
  title: "Acute Stroke",
  level: 3,
  category: "Disability / Neurological",
  brief:
    "A 68-year-old is found by a colleague with sudden facial droop, slurred speech, and left arm weakness that started 40 minutes ago.",
  baseline: { hr: 92, bp: "178/98", spo2: 96, rr: 18, temp: 36.8, gcs: 14 },
  steps: [
    {
      letter: "A",
      prompt: "Airway — what do you assess?",
      finding: "Airway currently patent, slurred speech, mild drooling on the left.",
      options: [
        { text: "Airway patent but at risk — position to protect airway, monitor closely", correct: true },
        { text: "No airway concern at all, ignore drooling", correct: false, complication: "Aspiration risk from swallowing difficulty goes unmonitored." },
      ],
    },
    {
      letter: "B",
      prompt: "Breathing — RR 18, SpO2 96%. Action?",
      finding: "Breathing comfortable, no added sounds.",
      options: [
        { text: "Oxygen only if SpO2 falls below target — avoid unnecessary high-flow oxygen", correct: true },
        { text: "High-flow oxygen regardless of saturation", correct: false, complication: "Not indicated and not evidence-based for normoxic stroke patients." },
      ],
    },
    {
      letter: "C",
      prompt: "Circulation — HR 92, BP 178/98. Priority action?",
      finding: "Hypertensive, regular pulse.",
      options: [
        { text: "Do NOT aggressively lower BP — establish IV access, urgent CT head, act fast on stroke pathway", correct: true },
        { text: "Give IV antihypertensives immediately to lower BP", correct: false, complication: "Rapid BP lowering can worsen cerebral perfusion in acute stroke — protocol violation." },
      ],
    },
    {
      letter: "D",
      prompt: "Disability — GCS 14, glucose 5.9 mmol/L, FAST positive. Priority?",
      finding: "Facial droop, arm weakness, slurred speech — classic FAST-positive signs.",
      options: [
        { text: "Confirm time of onset, check glucose (done), activate stroke pathway/thrombolysis assessment urgently", correct: true },
        { text: "Wait an hour to see if symptoms resolve on their own", correct: false, complication: "Time is brain — the thrombolysis window narrows with delay." },
      ],
    },
    {
      letter: "E",
      prompt: "Exposure — what do you check?",
      finding: "No injuries from a fall, no other findings.",
      options: [
        { text: "Quick check for injury (e.g. from a fall) while not delaying the stroke pathway", correct: true },
        { text: "Full detailed exposure exam before calling the stroke team", correct: false, complication: "Unnecessary delay to time-critical treatment." },
      ],
    },
  ],
  reassess: {
    prompt: "CT head shows no bleed, time of onset confirmed within window. What next?",
    options: [
      { text: "Fast-track for thrombolysis/thrombectomy assessment per local stroke protocol", correct: true },
      { text: "Admit routinely, reassess with the team tomorrow", correct: false, complication: "Missing the treatment window significantly worsens outcomes." },
    ],
  },
  escalate: {
    prompt: "Do you escalate this patient?",
    options: [
      { text: "Yes — immediate stroke team/thrombolysis pathway activation", correct: true },
      { text: "No — routine referral is fine", correct: false, complication: "Time-critical treatment window is put at risk." },
    ],
  },
};

const GI_BLEED = {
  id: "gi_bleed",
  title: "Hypovolaemic Shock — GI Bleed",
  level: 3,
  category: "Circulation / Haemorrhage",
  brief:
    "A 61-year-old with known liver disease presents with large-volume haematemesis and is now pale, sweaty, and dizzy.",
  baseline: { hr: 138, bp: "76/44", spo2: 94, rr: 26, temp: 36.5, gcs: 14 },
  steps: [
    {
      letter: "A",
      prompt: "Airway — what do you assess?",
      finding: "Vomiting blood intermittently, airway at risk of aspiration.",
      options: [
        { text: "Position patient on their side, suction available, protect airway from aspiration", correct: true },
        { text: "Sit patient fully upright and leave unattended", correct: false, complication: "Aspiration risk during ongoing vomiting is not managed." },
      ],
    },
    {
      letter: "B",
      prompt: "Breathing — RR 26, SpO2 94%. Action?",
      finding: "Tachypnoeic secondary to shock, chest clear.",
      options: [
        { text: "High-flow oxygen while circulation is addressed", correct: true },
        { text: "No oxygen needed since SpO2 is only mildly low", correct: false, complication: "Oxygen delivery to tissues is already compromised by blood loss — every bit matters." },
      ],
    },
    {
      letter: "C",
      prompt: "Circulation — HR 138, BP 76/44. Priority actions?",
      finding: "Cold, clammy, prolonged cap refill, ongoing visible blood loss.",
      options: [
        { text: "Two large-bore IV access, urgent bloods including crossmatch, activate major haemorrhage protocol, call for senior/endoscopy help", correct: true },
        { text: "Single small IV cannula, no bloods needed yet", correct: false, complication: "Inadequate access for the scale of bleeding — resuscitation delayed." },
        { text: "Give large volumes of IV fluid only, no blood products considered", correct: false, complication: "Over-dilution without blood products worsens coagulopathy in major haemorrhage." },
      ],
    },
    {
      letter: "D",
      prompt: "Disability — GCS 14, glucose 6.0 mmol/L. Interpretation?",
      finding: "Drowsy and pale, consistent with hypovolaemia.",
      options: [
        { text: "Reduced GCS likely due to poor cerebral perfusion — reassess after fluid/blood resuscitation", correct: true },
        { text: "Unrelated to bleeding, no action needed", correct: false, complication: "A key marker of shock severity is dismissed." },
      ],
    },
    {
      letter: "E",
      prompt: "Exposure — what do you check?",
      finding: "Stigmata of chronic liver disease: jaundice, spider naevi noted.",
      options: [
        { text: "Note liver disease signs — raises suspicion of variceal bleeding, informs treatment", correct: true },
        { text: "Skip — not relevant to acute bleed", correct: false, complication: "Missed clue that changes treatment (e.g. terlipressin for varices)." },
      ],
    },
  ],
  reassess: {
    prompt: "After 2 units of blood — BP 96/58, HR 116, still bleeding. What next?",
    options: [
      { text: "Continue major haemorrhage protocol, urgent endoscopy, keep escalating senior involvement", correct: true },
      { text: "Stop transfusion since BP has improved slightly", correct: false, complication: "Ongoing active bleeding means resuscitation must continue." },
    ],
  },
  escalate: {
    prompt: "Do you escalate this patient?",
    options: [
      { text: "Yes — critical care and gastroenterology, major haemorrhage protocol active", correct: true },
      { text: "No — some blood given, monitor on the ward alone", correct: false, complication: "Ongoing major haemorrhage needs urgent senior-level and specialist input." },
    ],
  },
};

const TENSION_PNEUMOTHORAX = {
  id: "tension_pneumothorax",
  title: "Tension Pneumothorax",
  level: 3,
  category: "Breathing / Circulation",
  brief:
    "A 40-year-old develops sudden severe breathlessness and chest pain after a fall onto their side. They are rapidly deteriorating.",
  baseline: { hr: 134, bp: "80/50", spo2: 84, rr: 34, temp: 36.9, gcs: 14 },
  steps: [
    {
      letter: "A",
      prompt: "Airway — what do you assess?",
      finding: "Airway patent, patient extremely distressed.",
      options: [
        { text: "Airway clear — move urgently to breathing, this looks time-critical", correct: true },
        { text: "Spend time on detailed airway exam", correct: false, complication: "Critical delay — tension pneumothorax needs immediate action." },
      ],
    },
    {
      letter: "B",
      prompt: "Breathing — RR 34, SpO2 84%, tracheal deviation, absent breath sounds one side. Priority?",
      finding: "Hyper-resonant percussion one side, distended neck veins, tracheal shift.",
      options: [
        { text: "Immediate needle decompression (or per local protocol), then high-flow oxygen — do not wait for imaging", correct: true },
        { text: "Wait for a chest X-ray to confirm before treating", correct: false, complication: "Fatal delay — tension pneumothorax is a clinical diagnosis requiring immediate action." },
        { text: "Give oxygen only, no other intervention", correct: false, complication: "Oxygen alone does not relieve the tension — patient continues to deteriorate rapidly." },
      ],
    },
    {
      letter: "C",
      prompt: "Circulation — HR 134, BP 80/50. What's happening and what do you do?",
      finding: "Obstructive shock from tension physiology — falling BP, rising HR.",
      options: [
        { text: "Recognise obstructive shock — decompression is the definitive treatment, gain IV access alongside", correct: true },
        { text: "Large fluid bolus as the main treatment, skip decompression", correct: false, complication: "Fluids alone do not fix the underlying obstruction — patient continues to deteriorate." },
      ],
    },
    {
      letter: "D",
      prompt: "Disability — GCS 14, glucose 6.1 mmol/L. Interpretation?",
      finding: "Drowsy from hypoxia and shock.",
      options: [
        { text: "Reduced GCS due to hypoxia/shock — should improve rapidly once decompressed", correct: true },
        { text: "Unrelated finding, ignore", correct: false, complication: "Missed marker of how critically unwell the patient is." },
      ],
    },
    {
      letter: "E",
      prompt: "Exposure — what do you check?",
      finding: "Bruising over the affected side of the chest from the fall.",
      options: [
        { text: "Full chest exposure to check for wounds, bruising, or a rib fracture site", correct: true },
        { text: "Skip — already treated, no need to look further", correct: false, complication: "An open wound (open pneumothorax) could be missed." },
      ],
    },
  ],
  reassess: {
    prompt: "Immediately after decompression — SpO2 rising to 93%, BP 104/66, HR 110. What next?",
    options: [
      { text: "Prepare for formal chest drain insertion, continue oxygen and monitoring", correct: true },
      { text: "No further treatment needed now the immediate crisis has passed", correct: false, complication: "A definitive chest drain is still required — needle decompression is a temporising measure." },
    ],
  },
  escalate: {
    prompt: "Do you escalate this patient?",
    options: [
      { text: "Yes — immediate senior/critical care involvement for definitive chest drain and ongoing monitoring", correct: true },
      { text: "No — decompressed, no further escalation needed", correct: false, complication: "A patient who has had a tension pneumothorax needs urgent definitive management and senior oversight." },
    ],
  },
};

/* ---- Level 4: Complex ---- */

const CARDIOGENIC_SHOCK = {
  id: "cardiogenic_shock",
  title: "Cardiogenic Shock (Post-MI)",
  level: 4,
  category: "Circulation / Cardiac",
  brief:
    "A 66-year-old, 2 days post-myocardial infarction, becomes acutely breathless, cold, and hypotensive on the ward.",
  baseline: { hr: 122, bp: "78/52", spo2: 88, rr: 28, temp: 36.4, gcs: 14 },
  steps: [
    {
      letter: "A",
      prompt: "Airway — what do you assess?",
      finding: "Airway patent, patient pale and distressed.",
      options: [
        { text: "Airway clear — move to breathing urgently", correct: true },
        { text: "Detailed airway exam before anything else", correct: false, complication: "Delays treatment of a rapidly deteriorating patient." },
      ],
    },
    {
      letter: "B",
      prompt: "Breathing — RR 28, SpO2 88%, bilateral crackles. Priority?",
      finding: "Pulmonary oedema secondary to pump failure.",
      options: [
        { text: "High-flow oxygen, sit upright, urgent senior/cardiology involvement", correct: true },
        { text: "Large fluid bolus to raise blood pressure", correct: false, complication: "Dangerous — worsens pulmonary oedema in a failing heart." },
      ],
    },
    {
      letter: "C",
      prompt: "Circulation — HR 122, BP 78/52, cold peripheries. Priority?",
      finding: "Weak thready pulse, cap refill 4s, evidence of poor cardiac output.",
      options: [
        { text: "Recognise cardiogenic shock — urgent cardiology review, consider inotropes per protocol, avoid large fluid volumes", correct: true },
        { text: "Treat identically to hypovolaemic shock with aggressive fluids", correct: false, complication: "Worsens pulmonary oedema and cardiac strain — wrong shock type treated." },
      ],
    },
    {
      letter: "D",
      prompt: "Disability — GCS 14, glucose 6.8 mmol/L. Interpretation?",
      finding: "Drowsy, consistent with poor cerebral perfusion.",
      options: [
        { text: "Note reduced GCS as a marker of poor perfusion — reassess after treatment", correct: true },
        { text: "Not relevant, ignore", correct: false, complication: "An important marker of shock severity is missed." },
      ],
    },
    {
      letter: "E",
      prompt: "Exposure — what do you check?",
      finding: "Peripheral cyanosis, cool mottled skin on legs.",
      options: [
        { text: "Note peripheral perfusion signs — supports severity of cardiogenic shock", correct: true },
        { text: "Skip — not useful information", correct: false, complication: "A useful severity marker is missed." },
      ],
    },
  ],
  reassess: {
    prompt: "After oxygen and cardiology review, inotrope support started — BP 92/60, HR 110. What next?",
    options: [
      { text: "Continue close haemodynamic monitoring, likely needs critical care level support", correct: true },
      { text: "Stop monitoring closely now BP has improved slightly", correct: false, complication: "Cardiogenic shock remains high-risk and can deteriorate rapidly." },
    ],
  },
  escalate: {
    prompt: "Do you escalate this patient?",
    options: [
      { text: "Yes — critical care and cardiology urgently, likely needs higher level of care", correct: true },
      { text: "No — inotropes started, manage on the ward alone", correct: false, complication: "Cardiogenic shock needs a higher level of monitoring than a general ward can provide." },
    ],
  },
};

const HYPERKALAEMIA = {
  id: "hyperkalaemia",
  title: "Hyperkalaemia",
  level: 4,
  category: "Circulation / Metabolic",
  brief:
    "A 74-year-old with chronic kidney disease is found unwell by nursing staff, with palpitations and generalised weakness. ECG shows tented T waves and a widened QRS.",
  baseline: { hr: 44, bp: "98/60", spo2: 95, rr: 20, temp: 36.6, gcs: 14 },
  steps: [
    {
      letter: "A",
      prompt: "Airway — what do you assess?",
      finding: "Airway patent, patient conscious but weak.",
      options: [
        { text: "Airway clear — proceed to breathing", correct: true },
        { text: "Unnecessary delay assessing airway in detail", correct: false, complication: "Delays recognition of a cardiac emergency." },
      ],
    },
    {
      letter: "B",
      prompt: "Breathing — RR 20, SpO2 95%. Action?",
      finding: "Breathing unremarkable.",
      options: [
        { text: "No specific breathing intervention needed — move to circulation urgently", correct: true },
        { text: "High-flow oxygen as the main priority", correct: false, complication: "Distracts from the true emergency — arrhythmia risk." },
      ],
    },
    {
      letter: "C",
      prompt: "Circulation — HR 44, ECG shows tented T waves and widened QRS. Immediate treatment?",
      finding: "Bradycardic with dangerous ECG changes, potassium result 7.2 mmol/L.",
      options: [
        { text: "IV calcium gluconate immediately to stabilise the myocardium, then insulin/dextrose to lower potassium per protocol", correct: true },
        { text: "Wait for repeat bloods before treating", correct: false, complication: "Life-threatening arrhythmia risk — this is a medical emergency requiring immediate treatment." },
        { text: "Give potassium-sparing diuretic", correct: false, complication: "Dangerous — this would worsen hyperkalaemia further." },
      ],
    },
    {
      letter: "D",
      prompt: "Disability — GCS 14, glucose 5.5 mmol/L. Anything relevant?",
      finding: "Generalised weakness, mild drowsiness.",
      options: [
        { text: "Note weakness as a recognised feature of hyperkalaemia — reassess after treatment", correct: true },
        { text: "Unrelated finding, ignore", correct: false, complication: "A recognised symptom pattern is dismissed." },
      ],
    },
    {
      letter: "E",
      prompt: "Exposure — what do you check?",
      finding: "No rash; check for missed dialysis or new medications (e.g. ACE inhibitors, potassium supplements).",
      options: [
        { text: "Check for a precipitant — missed dialysis session, new nephrotoxic or potassium-raising medication", correct: true },
        { text: "Skip — not relevant right now", correct: false, complication: "The underlying cause of the crisis may be missed and could recur." },
      ],
    },
  ],
  reassess: {
    prompt: "After calcium gluconate and insulin/dextrose — HR 58, ECG changes resolving, repeat potassium pending. What next?",
    options: [
      { text: "Continuous cardiac monitoring, repeat potassium, involve renal team, consider dialysis if severe/refractory", correct: true },
      { text: "Stop monitoring now ECG has improved", correct: false, complication: "Potassium can rebound — ongoing monitoring is essential." },
    ],
  },
  escalate: {
    prompt: "Do you escalate this patient?",
    options: [
      { text: "Yes — renal/critical care team given severity of hyperkalaemia and ECG changes", correct: true },
      { text: "No — treated, no escalation needed", correct: false, complication: "Severe hyperkalaemia with ECG changes needs specialist input and possible dialysis." },
    ],
  },
};

const STATUS_EPILEPTICUS = {
  id: "status_epilepticus",
  title: "Status Epilepticus",
  level: 4,
  category: "Disability / Neurological",
  brief:
    "A 35-year-old with known epilepsy is having a witnessed generalised tonic-clonic seizure that has now lasted 6 minutes without stopping.",
  baseline: { hr: 132, bp: "146/88", spo2: 89, rr: 24, temp: 37.4, gcs: 3 },
  steps: [
    {
      letter: "A",
      prompt: "Airway — what do you assess/do?",
      finding: "Jaw clenched, at risk of airway obstruction during ongoing seizure.",
      options: [
        { text: "Position in recovery position where possible, do not force anything into the mouth, prepare airway adjuncts", correct: true },
        { text: "Force a bite block or object between the teeth", correct: false, complication: "Risk of dental/airway injury — not recommended practice." },
      ],
    },
    {
      letter: "B",
      prompt: "Breathing — RR 24, SpO2 89%. Action?",
      finding: "Cyanosis developing, irregular breathing during seizure activity.",
      options: [
        { text: "High-flow oxygen, monitor SpO2 continuously", correct: true },
        { text: "No oxygen needed, will resolve once seizure stops", correct: false, complication: "Ongoing hypoxia during prolonged seizure risks brain injury." },
      ],
    },
    {
      letter: "C",
      prompt: "Circulation — seizure ongoing at 6+ minutes. Immediate treatment?",
      finding: "This meets the definition of status epilepticus — needs urgent anticonvulsant treatment.",
      options: [
        { text: "IV/buccal/rectal benzodiazepine (e.g. lorazepam) per status epilepticus protocol, prepare second-line if it continues", correct: true },
        { text: "Wait longer to see if it self-terminates before treating", correct: false, complication: "Delayed treatment increases risk of prolonged status and neurological injury." },
      ],
    },
    {
      letter: "D",
      prompt: "Disability — GCS 3 during seizure, glucose check?",
      finding: "Glucose 5.7 mmol/L — normal, seizure is the primary problem.",
      options: [
        { text: "Confirm glucose is normal (exclude hypoglycaemic seizure), continue seizure management", correct: true },
        { text: "Skip glucose check, assume epilepsy explains everything", correct: false, complication: "A reversible cause (hypoglycaemia) could be missed in a seizing patient." },
      ],
    },
    {
      letter: "E",
      prompt: "Exposure — what do you check?",
      finding: "No injury from the seizure noted, no fever, no rash.",
      options: [
        { text: "Check for injury sustained during the seizure and any signs of a trigger (fever, trauma)", correct: true },
        { text: "Skip — not a priority right now", correct: false, complication: "A treatable trigger or injury could be missed." },
      ],
    },
  ],
  reassess: {
    prompt: "After first-line benzodiazepine — seizure continues at 12 minutes. What next?",
    options: [
      { text: "Give second-line anticonvulsant (e.g. IV phenytoin/levetiracetam) per protocol and call for senior/anaesthetic help", correct: true },
      { text: "Repeat the same benzodiazepine dose indefinitely", correct: false, complication: "Refractory status epilepticus needs escalation to second-line treatment, not repeated first-line doses." },
    ],
  },
  escalate: {
    prompt: "Do you escalate this patient?",
    options: [
      { text: "Yes — critical care/anaesthetic team urgently, refractory status epilepticus may need intubation and ICU care", correct: true },
      { text: "No — benzodiazepine given, manage on the ward alone", correct: false, complication: "Ongoing status epilepticus is a medical emergency requiring senior/critical care input." },
    ],
  },
};

const COPD_EXACERBATION = {
  id: "copd_exacerbation",
  title: "COPD Exacerbation with CO2 Retention",
  level: 4,
  category: "Breathing / Respiratory",
  brief:
    "A 70-year-old with known severe COPD presents increasingly breathless and drowsy after several days of a worsening chest infection.",
  baseline: { hr: 108, bp: "138/82", spo2: 84, rr: 26, temp: 37.8, gcs: 13 },
  steps: [
    {
      letter: "A",
      prompt: "Airway — what do you assess?",
      finding: "Airway patent, patient drowsy but rousable, using accessory muscles.",
      options: [
        { text: "Airway patent but monitor closely given drowsiness — proceed to breathing", correct: true },
        { text: "No concern, skip ahead quickly", correct: false, complication: "Drowsiness in COPD can signal CO2 narcosis — an important sign to track." },
      ],
    },
    {
      letter: "B",
      prompt: "Breathing — RR 26, SpO2 84% on air. What target and approach?",
      finding: "Known CO2 retainer — needs a controlled oxygen approach, not high-flow.",
      options: [
        { text: "Controlled oxygen therapy (e.g. 88-92% target) via Venturi mask, titrate carefully, check blood gas", correct: true },
        { text: "High-flow 15L oxygen to maximise saturations", correct: false, complication: "Risk of worsening CO2 retention and reduced respiratory drive in a known CO2 retainer." },
      ],
    },
    {
      letter: "C",
      prompt: "Circulation — HR 108, BP 138/82. What else do you add?",
      finding: "Tachycardic from work of breathing and infection.",
      options: [
        { text: "Nebulised bronchodilators, steroids, antibiotics if infective exacerbation, per COPD protocol", correct: true },
        { text: "Beta-blocker to reduce heart rate", correct: false, complication: "Risk of worsening bronchospasm — inappropriate here." },
      ],
    },
    {
      letter: "D",
      prompt: "Disability — GCS 13 (drowsy), glucose 6.5 mmol/L. Interpretation and action?",
      finding: "Increasing drowsiness alongside hypoxia and possible CO2 retention.",
      options: [
        { text: "Check arterial blood gas urgently — drowsiness may indicate CO2 narcosis needing escalation (e.g. NIV)", correct: true },
        { text: "Assume drowsiness is just tiredness from being unwell", correct: false, complication: "A dangerous sign of CO2 narcosis is missed — risk of respiratory arrest." },
      ],
    },
    {
      letter: "E",
      prompt: "Exposure — what do you check?",
      finding: "No rash; sputum purulent, suggesting infective exacerbation.",
      options: [
        { text: "Note purulent sputum supporting infective exacerbation, consistent with antibiotic treatment", correct: true },
        { text: "Skip — not needed", correct: false, complication: "A useful clue supporting the treatment plan is missed." },
      ],
    },
  ],
  reassess: {
    prompt: "ABG shows rising CO2 and worsening acidosis despite treatment. What next?",
    options: [
      { text: "Consider non-invasive ventilation (NIV) per protocol and urgent senior/respiratory review", correct: true },
      { text: "Increase oxygen flow rate further to fix low saturations", correct: false, complication: "Would worsen CO2 retention further — wrong direction for this problem." },
    ],
  },
  escalate: {
    prompt: "Do you escalate this patient?",
    options: [
      { text: "Yes — urgent respiratory/critical care review for NIV and closer monitoring", correct: true },
      { text: "No — nebulisers given, manage on the ward alone", correct: false, complication: "Worsening CO2 retention with acidosis needs urgent senior-level and NIV-capable care." },
    ],
  },
};

/* ---- Level 5: Expert ---- */

const POLYTRAUMA = {
  id: "polytrauma",
  title: "Polytrauma (Road Traffic Collision)",
  level: 5,
  category: "Trauma / Multi-system",
  brief:
    "A 27-year-old is brought in following a high-speed road traffic collision, with visible chest and abdominal injuries and reduced consciousness.",
  baseline: { hr: 128, bp: "84/50", spo2: 89, rr: 28, temp: 36.2, gcs: 10 },
  steps: [
    {
      letter: "A",
      prompt: "Airway — what do you assess, with C-spine control?",
      finding: "Gurgling sounds, blood in the mouth, reduced consciousness.",
      options: [
        { text: "Airway at risk — suction, airway adjunct, maintain manual in-line C-spine stabilisation throughout", correct: true },
        { text: "Move the neck freely to get a better look at the airway", correct: false, complication: "Risk of worsening a potential C-spine injury — stabilisation must be maintained." },
      ],
    },
    {
      letter: "B",
      prompt: "Breathing — RR 28, SpO2 89%, reduced air entry on the left with bruising. Priority?",
      finding: "Possible chest injury (e.g. pneumothorax/haemothorax) on the left side.",
      options: [
        { text: "High-flow oxygen, expose and examine the chest fully, treat any life-threatening chest injury immediately (e.g. decompression if tension physiology found)", correct: true },
        { text: "Ignore the chest for now, move straight to limb injuries", correct: false, complication: "A life-threatening chest injury is missed while attention goes elsewhere." },
      ],
    },
    {
      letter: "C",
      prompt: "Circulation — HR 128, BP 84/50, distended tender abdomen. Priority?",
      finding: "Signs of internal haemorrhage — likely abdominal source.",
      options: [
        { text: "Two large-bore IV access, activate major haemorrhage protocol, urgent surgical/trauma team involvement", correct: true },
        { text: "Wait for imaging before starting any resuscitation", correct: false, complication: "Unacceptable delay in a haemodynamically unstable trauma patient." },
      ],
    },
    {
      letter: "D",
      prompt: "Disability — GCS 10, pupils equal and reactive, glucose 6.2 mmol/L. Interpretation?",
      finding: "Reduced GCS could be head injury and/or shock — both need addressing.",
      options: [
        { text: "Treat as possible head injury AND haemorrhagic shock simultaneously — both explain reduced GCS", correct: true },
        { text: "Assume it's only shock, ignore possible head injury", correct: false, complication: "A significant head injury could be missed and undertreated." },
      ],
    },
    {
      letter: "E",
      prompt: "Exposure — what do you do?",
      finding: "Full-body exposure needed to find all injuries; keep the patient warm.",
      options: [
        { text: "Full exposure to find all injuries, log roll with C-spine precautions, actively keep the patient warm", correct: true },
        { text: "Leave clothing on to save time", correct: false, complication: "Life-threatening injuries elsewhere on the body could be missed entirely." },
      ],
    },
  ],
  reassess: {
    prompt: "After initial resuscitation — BP 96/60, HR 116, ongoing concern for internal bleeding. What next?",
    options: [
      { text: "Continue major haemorrhage protocol, urgent CT/theatre per trauma team decision, continuous reassessment", correct: true },
      { text: "Stop active management now BP has improved slightly", correct: false, complication: "A trauma patient with ongoing internal bleeding needs continued aggressive management." },
    ],
  },
  escalate: {
    prompt: "Do you escalate this patient?",
    options: [
      { text: "Yes — full trauma team/critical care activation given multi-system injury and haemodynamic instability", correct: true },
      { text: "No — initial treatment given, no further escalation needed", correct: false, complication: "Major polytrauma always needs a full trauma team response." },
    ],
  },
};

const MIXED_SHOCK = {
  id: "mixed_shock",
  title: "Mixed Septic/Cardiogenic Shock",
  level: 5,
  category: "Circulation / Complex",
  brief:
    "A 77-year-old with known heart failure develops a chest infection and rapidly deteriorates with a confusing mixed picture of shock.",
  baseline: { hr: 128, bp: "76/46", spo2: 87, rr: 30, temp: 38.9, gcs: 12 },
  steps: [
    {
      letter: "A",
      prompt: "Airway — what do you assess?",
      finding: "Airway patent but patient drowsy and struggling to protect it fully.",
      options: [
        { text: "Airway patent but at risk — monitor closely, position appropriately", correct: true },
        { text: "No concern, move on quickly", correct: false, complication: "Risk of airway compromise in a drowsy patient goes unmonitored." },
      ],
    },
    {
      letter: "B",
      prompt: "Breathing — RR 30, SpO2 87%, bilateral crackles AND signs of infection. Priority?",
      finding: "Mixed picture — pulmonary oedema features alongside infective signs.",
      options: [
        { text: "High-flow oxygen, urgent senior review — this needs careful balancing of fluids given mixed shock physiology", correct: true },
        { text: "Assume pure sepsis and give large-volume fluids without caution", correct: false, complication: "Risk of worsening pulmonary oedema given underlying heart failure." },
      ],
    },
    {
      letter: "C",
      prompt: "Circulation — HR 128, BP 76/46, lactate raised. What's the challenge here?",
      finding: "Both septic and cardiogenic components appear present — a genuinely complex picture.",
      options: [
        { text: "Recognise mixed shock — cautious, smaller fluid boluses with frequent reassessment, involve senior/critical care early, start antibiotics", correct: true },
        { text: "Give one large fluid bolus as per standard sepsis protocol without reassessing in between", correct: false, complication: "Risk of tipping a failing heart into overt pulmonary oedema." },
      ],
    },
    {
      letter: "D",
      prompt: "Disability — GCS 12, glucose 6.9 mmol/L. Interpretation?",
      finding: "Drowsy — could reflect poor perfusion from either shock type.",
      options: [
        { text: "Note reduced GCS as a marker of overall severity, reassess frequently as treatment progresses", correct: true },
        { text: "Ignore — not useful in a complex case like this", correct: false, complication: "An important trend marker for deterioration or improvement is lost." },
      ],
    },
    {
      letter: "E",
      prompt: "Exposure — what do you check?",
      finding: "Peripheral oedema present alongside signs of infection — supports the mixed picture.",
      options: [
        { text: "Note both infective and fluid-overload signs — helps confirm the mixed shock picture", correct: true },
        { text: "Skip — too complex to bother with", correct: false, complication: "Useful diagnostic information is missed in an already complex case." },
      ],
    },
  ],
  reassess: {
    prompt: "After a small fluid bolus and antibiotics — BP 88/54, but crackles slightly worse. What next?",
    options: [
      { text: "Pause further fluids, consider inotropic/vasopressor support, reassess with senior input rather than more fluid", correct: true },
      { text: "Give another large fluid bolus regardless of worsening crackles", correct: false, complication: "Would likely tip the patient into overt pulmonary oedema." },
    ],
  },
  escalate: {
    prompt: "Do you escalate this patient?",
    options: [
      { text: "Yes — critical care urgently given the complexity and competing treatment priorities", correct: true },
      { text: "No — antibiotics and some fluid given, manage on the ward alone", correct: false, complication: "This complex mixed shock picture needs senior/critical care input, not ward-level management alone." },
    ],
  },
};

const CO_POISONING = {
  id: "co_poisoning",
  title: "Carbon Monoxide Poisoning",
  level: 5,
  category: "Toxicology / Breathing",
  brief:
    "A family of three is brought in from a house with a faulty boiler. This patient, a 40-year-old, has a headache, nausea, and confusion. Their pulse oximeter reads 98%.",
  baseline: { hr: 110, bp: "128/78", spo2: 98, rr: 22, temp: 37.0, gcs: 13 },
  steps: [
    {
      letter: "A",
      prompt: "Airway — what do you assess?",
      finding: "Airway patent, patient confused but talking.",
      options: [
        { text: "Airway clear — proceed to breathing", correct: true },
        { text: "Assume airway compromise without evidence", correct: false, complication: "Unnecessary intervention delays the actual priority — high-flow oxygen." },
      ],
    },
    {
      letter: "B",
      prompt: "Breathing — RR 22, SpO2 reads 98%. Do you trust this reading?",
      finding: "Standard pulse oximetry cannot distinguish carboxyhaemoglobin from oxyhaemoglobin.",
      options: [
        { text: "Do NOT trust the SpO2 reading in suspected CO poisoning — give high-flow 100% oxygen regardless, and check carboxyhaemoglobin level", correct: true },
        { text: "Trust the normal-looking SpO2 and withhold oxygen", correct: false, complication: "Dangerous — standard SpO2 is unreliable in CO poisoning and true oxygen delivery may be critically impaired." },
      ],
    },
    {
      letter: "C",
      prompt: "Circulation — HR 110, BP 128/78. What else matters here?",
      finding: "Mild tachycardia; other family members are also affected, suggesting a common source.",
      options: [
        { text: "Treat with high-flow oxygen, check ECG (CO can cause cardiac ischaemia), consider hyperbaric oxygen referral if severe", correct: true },
        { text: "No specific circulatory concern, ignore cardiac assessment", correct: false, complication: "CO poisoning can cause silent cardiac ischaemia — missed without ECG." },
      ],
    },
    {
      letter: "D",
      prompt: "Disability — GCS 13 (confused), glucose 5.9 mmol/L. Interpretation?",
      finding: "Confusion is a classic feature of significant CO exposure.",
      options: [
        { text: "Recognise confusion/headache as classic CO toxicity features — supports urgent treatment and level of severity assessment", correct: true },
        { text: "Assume unrelated cause, do not link to CO exposure", correct: false, complication: "Delays recognition of toxicity severity and appropriate treatment." },
      ],
    },
    {
      letter: "E",
      prompt: "Exposure — what do you check, and what public health step matters?",
      finding: "No rash or injury; other household members also symptomatic.",
      options: [
        { text: "Note that other family members are affected — alert the team, ensure the property/gas supply is made safe and reported", correct: true },
        { text: "Treat this patient only, don't consider the wider household", correct: false, complication: "Other family members remain at risk if the source isn't addressed." },
      ],
    },
  ],
  reassess: {
    prompt: "Carboxyhaemoglobin level returns significantly elevated. What next?",
    options: [
      { text: "Continue high-flow oxygen, discuss hyperbaric oxygen therapy with poisons/specialist advice given severity", correct: true },
      { text: "Stop oxygen now the patient feels a bit better", correct: false, complication: "Carboxyhaemoglobin clearance takes time — stopping oxygen early prolongs toxicity." },
    ],
  },
  escalate: {
    prompt: "Do you escalate this patient?",
    options: [
      { text: "Yes — poisons information service/specialist advice given significant CO exposure and neurological symptoms", correct: true },
      { text: "No — oxygen given, no further input needed", correct: false, complication: "Significant CO poisoning needs specialist input regarding severity and hyperbaric therapy." },
    ],
  },
};

const RUPTURED_AAA = {
  id: "ruptured_aaa",
  title: "Ruptured Abdominal Aortic Aneurysm",
  level: 5,
  category: "Circulation / Vascular Emergency",
  brief:
    "A 72-year-old presents with sudden severe abdominal and back pain, collapsing shortly after arrival. A pulsatile abdominal mass is felt.",
  baseline: { hr: 138, bp: "70/40", spo2: 91, rr: 30, temp: 36.1, gcs: 12 },
  steps: [
    {
      letter: "A",
      prompt: "Airway — what do you assess?",
      finding: "Airway patent, patient pale, sweaty, and distressed.",
      options: [
        { text: "Airway clear — move urgently to breathing and circulation, this is time-critical", correct: true },
        { text: "Spend time on a detailed airway exam", correct: false, complication: "Critical delay — this patient is exsanguinating and needs urgent action." },
      ],
    },
    {
      letter: "B",
      prompt: "Breathing — RR 30, SpO2 91%. Action?",
      finding: "Tachypnoeic secondary to shock.",
      options: [
        { text: "High-flow oxygen while circulation is addressed in parallel", correct: true },
        { text: "Delay oxygen until circulation is fully sorted", correct: false, complication: "Oxygen delivery is already compromised — this should happen immediately and in parallel." },
      ],
    },
    {
      letter: "C",
      prompt: "Circulation — HR 138, BP 70/40, pulsatile abdominal mass. Priority?",
      finding: "Signs strongly suggest ruptured AAA — a surgical emergency.",
      options: [
        { text: "Permissive hypotension approach (cautious fluids, avoid normalising BP fully), urgent vascular surgery team and theatre activation, crossmatch blood urgently", correct: true },
        { text: "Aggressive fluids to fully normalise blood pressure before surgery", correct: false, complication: "Aggressive fluid resuscitation can worsen bleeding by raising pressure against a ruptured vessel — permissive hypotension is the evidence-based approach." },
        { text: "Wait for a CT scan before contacting vascular surgery", correct: false, complication: "Fatal delay — clinical suspicion alone should trigger immediate surgical team activation." },
      ],
    },
    {
      letter: "D",
      prompt: "Disability — GCS 12, glucose 6.0 mmol/L. Interpretation?",
      finding: "Drowsy secondary to profound shock.",
      options: [
        { text: "Reduced GCS reflects critical hypoperfusion — reinforces the urgency, reassess continuously", correct: true },
        { text: "Not relevant, ignore", correct: false, complication: "An important marker of how critical this presentation is gets missed." },
      ],
    },
    {
      letter: "E",
      prompt: "Exposure — what do you check?",
      finding: "Flank bruising (Grey Turner's sign) may be present with retroperitoneal bleeding.",
      options: [
        { text: "Look for flank/back bruising and any other signs supporting retroperitoneal haemorrhage, keep patient warm", correct: true },
        { text: "Skip exposure entirely, time is too short", correct: false, complication: "A brief targeted exposure is still fast and adds useful information without meaningfully delaying treatment." },
      ],
    },
  ],
  reassess: {
    prompt: "Vascular surgery and theatre alerted, blood products arriving. What next?",
    options: [
      { text: "Continue permissive hypotension strategy, transfuse as needed, transfer to theatre as the definitive treatment as fast as safely possible", correct: true },
      { text: "Delay transfer to theatre until BP is fully normal", correct: false, complication: "Definitive surgical control of bleeding should not be delayed waiting for full normalisation of BP." },
    ],
  },
  escalate: {
    prompt: "Do you escalate this patient?",
    options: [
      { text: "Yes — immediate vascular surgery and critical care activation, this is a surgical emergency", correct: true },
      { text: "No — fluids given, manage without further escalation", correct: false, complication: "A ruptured AAA is a time-critical surgical emergency requiring immediate senior-level activation." },
    ],
  },
};

const SCENARIOS = [
  ANAPHYLAXIS,
  HYPOGLYCAEMIA,
  OPIOID_OVERDOSE,
  ASTHMA,
  SEPSIS,
  DKA,
  PULMONARY_OEDEMA,
  SVT,
  PE,
  STROKE,
  GI_BLEED,
  TENSION_PNEUMOTHORAX,
  CARDIOGENIC_SHOCK,
  HYPERKALAEMIA,
  STATUS_EPILEPTICUS,
  COPD_EXACERBATION,
  POLYTRAUMA,
  MIXED_SHOCK,
  CO_POISONING,
  RUPTURED_AAA,
];

/* ---------------- Storage helpers ---------------- */

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// storage now imported from ./lib/storage

/* ---------------- Small UI atoms ---------------- */

function VitalsMonitor({ vitals, alert }) {
  return (
    <div
      style={{
        background: COLORS.panel,
        border: `1px solid ${COLORS.line}`,
        borderRadius: 6,
        padding: "14px 18px",
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "10px 18px",
        fontFamily: "'Space Mono', monospace",
      }}
    >
      {[
        ["HR", vitals.hr, "bpm"],
        ["BP", vitals.bp, "mmHg"],
        ["SpO2", vitals.spo2, "%"],
        ["RR", vitals.rr, "/min"],
        ["Temp", vitals.temp, "°C"],
        ["GCS", vitals.gcs, ""],
      ].map(([label, val, unit]) => (
        <div key={label}>
          <div style={{ fontSize: 11, color: COLORS.textDim, letterSpacing: 1 }}>
            {label}
          </div>
          <div
            style={{
              fontSize: 22,
              color: alert ? COLORS.red : COLORS.green,
              fontWeight: 700,
              lineHeight: 1.1,
            }}
          >
            {val}
            <span style={{ fontSize: 11, color: COLORS.textDim, marginLeft: 4 }}>
              {unit}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Banner() {
  return (
    <div
      style={{
        borderTop: `1px solid ${COLORS.line}`,
        marginTop: 28,
        paddingTop: 16,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        gap: 12,
        fontSize: 13,
        color: COLORS.textDim,
      }}
    >
      <div style={{ maxWidth: 480 }}>
        Our aim is to make these materials as accessible as possible. If
        you're an individual, or an institution such as a company or
        university using this resource, please consider a donation to
        support its ongoing creation.{" "}
        <a
          href="https://ko-fi.com/rickyhellyar"
          target="_blank"
          rel="noreferrer"
          style={{ color: COLORS.green }}
        >
          ko-fi.com/rickyhellyar
        </a>
      </div>
      <div>
        More resources at{" "}
        <a
          href="https://reflectionguide.com"
          target="_blank"
          rel="noreferrer"
          style={{ color: COLORS.green }}
        >
          reflectionguide.com
        </a>
      </div>
    </div>
  );
}

/* ---------------- Disclaimer gate ---------------- */

function DisclaimerGate({ onAccept }) {
  const [checked, setChecked] = useState(false);
  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: "'Inter', system-ui, sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 560 }}>
        <div style={{ fontSize: 12, color: COLORS.green, letterSpacing: 2, marginBottom: 8 }}>
          BEFORE YOU START
        </div>
        <h1 style={{ fontSize: 28, marginBottom: 16, lineHeight: 1.2 }}>
          Dr Ricky's Resus Challenge
        </h1>
        <div
          style={{
            background: COLORS.panel,
            border: `1px solid ${COLORS.line}`,
            borderRadius: 8,
            padding: 20,
            fontSize: 14,
            lineHeight: 1.6,
            color: COLORS.textDim,
          }}
        >
          <p style={{ marginTop: 0 }}>
            This game is an educational simulation designed to support
            learning and reinforce clinical reasoning using scenario-based
            exercises. It is intended for educational purposes only and must
            not be used as the sole basis for clinical decision-making.
          </p>
          <p>
            Clinical care should always be guided by current local policies,
            organisational procedures, professional judgement, and the
            latest recognised resuscitation and emergency care guidelines.
          </p>
          <p>
            While every effort has been made to ensure the scenarios are
            accurate at the time of publication, guidance evolves and errors
            may occur. The authors accept no liability for any loss or harm
            arising from reliance on this resource.
          </p>
          <p style={{ marginBottom: 0 }}>
            This resource is not affiliated with or endorsed by the
            Resuscitation Council UK or any other professional body unless
            explicitly stated.
          </p>
        </div>
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            marginTop: 18,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          I have read and understood this disclaimer.
        </label>
        <button
          disabled={!checked}
          onClick={onAccept}
          style={{
            marginTop: 18,
            width: "100%",
            padding: "12px 0",
            borderRadius: 6,
            border: "none",
            fontSize: 15,
            fontWeight: 600,
            cursor: checked ? "pointer" : "not-allowed",
            background: checked ? COLORS.green : COLORS.greenDim,
            color: checked ? "#08201A" : COLORS.textDim,
            transition: "background 0.15s",
          }}
        >
          Enter simulation
        </button>
        <Banner />
      </div>
    </div>
  );
}

/* ---------------- Scenario player ---------------- */

function ScenarioPlayer({ scenario, onFinish }) {
  const [stepIdx, setStepIdx] = useState(0); // -1 briefing, 0..4 ABCDE, 5 reassess, 6 escalate
  const [vitals, setVitals] = useState(scenario.baseline);
  const [alert, setAlert] = useState(false);
  const [log, setLog] = useState([]);
  const [wrongCount, setWrongCount] = useState(0);
  const [startTime] = useState(Date.now());
  const [feedback, setFeedback] = useState(null);

  const sequence = [
    { type: "brief" },
    ...scenario.steps.map((s) => ({ type: "abcde", step: s })),
    { type: "reassess", step: scenario.reassess },
    { type: "escalate", step: scenario.escalate },
  ];
  const current = sequence[stepIdx + 1] || sequence[sequence.length - 1];
  const isLast = stepIdx + 1 >= sequence.length - 1;
  const shuffledOptions = useMemo(() => {
    if (!current || !current.step || !current.step.options) return [];
    return shuffle(current.step.options);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx]);

  function choose(opt) {
    if (opt.correct) {
      setFeedback({ ok: true, text: "Correct." });
      setAlert(false);
    } else {
      setWrongCount((w) => w + 1);
      setAlert(true);
      setFeedback({ ok: false, text: opt.complication || "Incorrect." });
      // worsen vitals slightly on wrong answer
      setVitals((v) => ({
        ...v,
        hr: typeof v.hr === "number" ? v.hr + 8 : v.hr,
        spo2: typeof v.spo2 === "number" ? Math.max(70, v.spo2 - 3) : v.spo2,
      }));
      return; // let them try again on same step
    }
    setLog((l) => [...l, { step: current.step, ok: opt.correct }]);
    setTimeout(() => {
      setFeedback(null);
      setStepIdx((i) => i + 1);
      if (stepIdx + 2 === sequence.length - 1) {
        // just completed C-step area etc — not used, placeholder for future vitals easing
      }
    }, 700);
  }

  function next() {
    setFeedback(null);
    setStepIdx((i) => i + 1);
  }

  if (stepIdx + 1 >= sequence.length) {
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    onFinish({ scenario, log, wrongCount, elapsedSec, vitals });
    return null;
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 12, color: COLORS.green, letterSpacing: 2 }}>
            LEVEL {scenario.level} · {scenario.category.toUpperCase()}
          </div>
          <h2 style={{ margin: "4px 0 0", fontSize: 22 }}>{scenario.title}</h2>
        </div>
        <div style={{ fontSize: 12, color: COLORS.textDim }}>
          Errors: <span style={{ color: wrongCount > 0 ? COLORS.amber : COLORS.textDim }}>{wrongCount}</span>
        </div>
      </div>

      <VitalsMonitor vitals={vitals} alert={alert} />

      <div
        style={{
          background: COLORS.panelLight,
          border: `1px solid ${COLORS.line}`,
          borderRadius: 8,
          padding: 20,
          marginTop: 16,
          minHeight: 140,
        }}
      >
        {current.type === "brief" && (
          <>
            <p style={{ margin: "0 0 16px", lineHeight: 1.6 }}>{scenario.brief}</p>
            <button style={btnStyle(COLORS.green)} onClick={next}>
              Begin ABCDE assessment →
            </button>
          </>
        )}

        {current.type === "abcde" && (
          <>
            <div style={{ fontSize: 13, color: COLORS.green, marginBottom: 4, letterSpacing: 1 }}>
              {current.step.letter} — {current.step.prompt}
            </div>
            <p style={{ margin: "8px 0 16px", color: COLORS.textDim, lineHeight: 1.6 }}>
              {current.step.finding}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {shuffledOptions.map((opt, i) => (
                <button key={i} style={optionStyle} onClick={() => choose(opt)}>
                  {opt.text}
                </button>
              ))}
            </div>
          </>
        )}

        {(current.type === "reassess" || current.type === "escalate") && (
          <>
            <div style={{ fontSize: 13, color: COLORS.green, marginBottom: 4, letterSpacing: 1 }}>
              {current.type === "reassess" ? "REASSESS" : "ESCALATE?"}
            </div>
            <p style={{ margin: "8px 0 16px", lineHeight: 1.6 }}>{current.step.prompt}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {shuffledOptions.map((opt, i) => (
                <button key={i} style={optionStyle} onClick={() => choose(opt)}>
                  {opt.text}
                </button>
              ))}
            </div>
          </>
        )}

        {feedback && (
          <div
            style={{
              marginTop: 14,
              fontSize: 13,
              color: feedback.ok ? COLORS.green : COLORS.red,
            }}
          >
            {feedback.ok ? "✓ " : "✗ "}
            {feedback.text}
          </div>
        )}
      </div>
    </div>
  );
}

function btnStyle(color) {
  return {
    padding: "10px 18px",
    borderRadius: 6,
    border: "none",
    background: color,
    color: "#08201A",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  };
}

const optionStyle = {
  textAlign: "left",
  padding: "12px 14px",
  borderRadius: 6,
  border: `1px solid ${COLORS.line}`,
  background: COLORS.panel,
  color: COLORS.text,
  fontSize: 14,
  cursor: "pointer",
  lineHeight: 1.4,
};

/* ---------------- Results / stats screen ---------------- */

function ResultsScreen({ result, onRestart }) {
  const { scenario, log, wrongCount, elapsedSec } = result;
  const accuracyPct = Math.round(
    (log.filter((l) => l.ok).length / Math.max(1, log.length)) * 100
  );
  const score = Math.max(0, 1000 - wrongCount * 100 - elapsedSec * 2);

  const [saved, setSaved] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [history, setHistory] = useState(null);

  useEffect(() => {
    (async () => {
      // personal history, keyed by category
      const key = "progress:categories";
      const existing = (await safeGet(key, false)) || {};
      const catStats = existing[scenario.category] || { attempts: 0, totalWrong: 0, totalScore: 0 };
      catStats.attempts += 1;
      catStats.totalWrong += wrongCount;
      catStats.totalScore += score;
      existing[scenario.category] = catStats;
      await safeSet(key, existing, false);
      setHistory(existing);

      // shared leaderboard
      const lbKey = "leaderboard:scores";
      const board = (await safeGet(lbKey, true)) || [];
      board.push({ scenario: scenario.title, score, wrongCount, elapsedSec, ts: Date.now() });
      board.sort((a, b) => b.score - a.score);
      const trimmed = board.slice(0, 10);
      await safeSet(lbKey, trimmed, true);
      setLeaderboard(trimmed);
      setSaved(true);
    })();
  }, []);

  const strengths = [];
  const workOn = [];
  if (history) {
    Object.entries(history).forEach(([cat, s]) => {
      const avgWrong = s.totalWrong / s.attempts;
      if (avgWrong <= 0.5) strengths.push(cat);
      else workOn.push(cat);
    });
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <div style={{ fontSize: 12, color: COLORS.green, letterSpacing: 2 }}>SCENARIO COMPLETE</div>
      <h2 style={{ margin: "4px 0 18px", fontSize: 24 }}>{scenario.title}</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        <StatCard label="Score" value={score} color={COLORS.green} />
        <StatCard label="Accuracy" value={`${accuracyPct}%`} color={COLORS.green} />
        <StatCard label="Time" value={`${elapsedSec}s`} color={COLORS.green} />
      </div>

      <div
        style={{
          background: COLORS.panel,
          border: `1px solid ${COLORS.line}`,
          borderRadius: 8,
          padding: 18,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 13, color: COLORS.green, marginBottom: 10, letterSpacing: 1 }}>
          YOUR STRENGTHS AND AREAS TO WORK ON
        </div>
        {!history && <div style={{ fontSize: 13, color: COLORS.textDim }}>Saving…</div>}
        {history && (
          <>
            <div style={{ marginBottom: 8, fontSize: 14 }}>
              <span style={{ color: COLORS.green }}>Areas of strength: </span>
              <span style={{ color: COLORS.textDim }}>
                {strengths.length ? strengths.join(", ") : "Not enough data yet — keep playing."}
              </span>
            </div>
            <div style={{ fontSize: 14 }}>
              <span style={{ color: COLORS.amber }}>Areas to work on: </span>
              <span style={{ color: COLORS.textDim }}>
                {workOn.length ? workOn.join(", ") : "None flagged yet — nice work."}
              </span>
            </div>
          </>
        )}
      </div>

      <div
        style={{
          background: COLORS.panel,
          border: `1px solid ${COLORS.line}`,
          borderRadius: 8,
          padding: 18,
          marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 13, color: COLORS.green, marginBottom: 10, letterSpacing: 1 }}>
          LEADERBOARD (TOP 10, ALL PLAYERS)
        </div>
        {leaderboard.length === 0 && (
          <div style={{ fontSize: 13, color: COLORS.textDim }}>Loading…</div>
        )}
        {leaderboard.map((row, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 13,
              padding: "6px 0",
              borderBottom: i < leaderboard.length - 1 ? `1px solid ${COLORS.line}` : "none",
              color: COLORS.textDim,
            }}
          >
            <span>
              {i + 1}. {row.scenario}
            </span>
            <span style={{ color: COLORS.text }}>{row.score}</span>
          </div>
        ))}
      </div>

      <button style={btnStyle(COLORS.green)} onClick={onRestart}>
        Play again
      </button>
      <Banner />
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div
      style={{
        background: COLORS.panel,
        border: `1px solid ${COLORS.line}`,
        borderRadius: 8,
        padding: "14px 16px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 26, fontFamily: "'Space Mono', monospace", color, fontWeight: 700 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: COLORS.textDim, letterSpacing: 1, marginTop: 2 }}>
        {label.toUpperCase()}
      </div>
    </div>
  );
}

/* ---------------- Level select ---------------- */

function LevelSelect({ onPick }) {
  const levels = [1, 2, 3, 4, 5];
  const levelNames = {
    1: "Novice",
    2: "Acutely Unwell",
    3: "Time Critical",
    4: "Complex",
    5: "Expert",
  };
  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <div style={{ fontSize: 12, color: COLORS.green, letterSpacing: 2, marginBottom: 6 }}>
        CHOOSE A SCENARIO
      </div>
      <h2 style={{ margin: "0 0 18px", fontSize: 24 }}>Dr Ricky's Resus Challenge</h2>
      {levels.map((lvl) => {
        const scs = SCENARIOS.filter((s) => s.level === lvl);
        if (scs.length === 0) return null;
        return (
          <div key={lvl} style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 12, color: COLORS.textDim, letterSpacing: 1, marginBottom: 8 }}>
              LEVEL {lvl} · {levelNames[lvl].toUpperCase()}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {scs.map((sc) => (
                <button
                  key={sc.id}
                  onClick={() => onPick(sc)}
                  style={{
                    ...optionStyle,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>
                    <strong>{sc.title}</strong>
                    <span style={{ color: COLORS.textDim }}> — {sc.category}</span>
                  </span>
                  <span style={{ color: COLORS.green }}>Start →</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <Banner />
    </div>
  );
}

/* ---------------- Root ---------------- */

export default function App() {
  const [accepted, setAccepted] = useState(false);
  const [scenario, setScenario] = useState(null);
  const [result, setResult] = useState(null);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: "32px 20px",
      }}
    >
      {!accepted && <DisclaimerGate onAccept={() => setAccepted(true)} />}

      {accepted && !scenario && !result && <LevelSelect onPick={setScenario} />}

      {accepted && scenario && !result && (
        <ScenarioPlayer scenario={scenario} onFinish={setResult} />
      )}

      {accepted && result && (
        <ResultsScreen
          result={result}
          onRestart={() => {
            setScenario(null);
            setResult(null);
          }}
        />
      )}
    </div>
  );
}
