import React, { useState, useEffect, useRef } from "react";
import { Wind, Activity, Droplet, Brain, Eye, AlertTriangle, CheckCircle2, XCircle, Syringe, Heart, RotateCcw } from "lucide-react";

// ---------------------------------------------------------------------------
// SCENARIO DATA — this is the "script" for one case. Every future scenario
// (sepsis, DKA, stroke, etc.) will follow this exact same shape, so once this
// engine works, adding the other 39 is just writing more objects like this.
// ---------------------------------------------------------------------------

const SCENARIO = {
  title: "Anaphylaxis",
  subtitle: "Post-antibiotic reaction — Bay 4",
  brief:
    "You're called to a 34-year-old who received IV co-amoxiclav 8 minutes ago for a chest infection. The nurse says they 'suddenly came out in a rash and started struggling to breathe.'",
  startVitals: { hr: 128, sbp: 88, spo2: 91, rr: 28, temp: 37.1, gcs: 15 },

  steps: [
    // ---------------- AIRWAY ----------------
    {
      letter: "A",
      label: "Airway",
      icon: "wind",
      assessment:
        "You look in the mouth and listen at the airway. There's audible stridor and visible swelling of the lips and tongue.",
      question: "What do you do first?",
      options: [
        {
          text: "Give IM adrenaline 500mcg into the anterolateral thigh",
          correct: true,
          feedback:
            "Correct. Adrenaline is the single most important drug in anaphylaxis and should never be delayed once it's suspected — it works on the airway swelling, breathing and circulation all at once.",
          vitals: { hr: -6, spo2: +3, sbp: +6 },
        },
        {
          text: "Give an antihistamine and wait to see if it settles",
          correct: false,
          feedback:
            "Antihistamines don't treat the life-threatening features of anaphylaxis and waiting costs time. The swelling worsens while you wait.",
          vitals: { hr: +10, spo2: -4, sbp: -8 },
          cascade:
            "The tongue swelling increases. Stridor becomes louder and the patient starts pointing at their throat, panicking.",
        },
        {
          text: "Call for a senior review before doing anything",
          correct: false,
          feedback:
            "Getting help is right — but not instead of treating. In anaphylaxis, adrenaline comes first, help is called alongside it, not before it.",
          vitals: { hr: +8, spo2: -3, sbp: -6 },
          cascade:
            "Precious time passes. The airway swelling is now visibly worse.",
        },
      ],
    },
    // ---------------- BREATHING ----------------
    {
      letter: "B",
      label: "Breathing",
      icon: "activity",
      assessment:
        "Sats are low, there's audible wheeze throughout both lung fields, and the patient is using their accessory muscles to breathe.",
      question: "What's your next action?",
      options: [
        {
          text: "High-flow oxygen 15L via non-rebreathe mask",
          correct: true,
          feedback:
            "Correct. Every anaphylaxis patient gets high-flow oxygen, regardless of their starting sats.",
          vitals: { spo2: +5, hr: -3 },
        },
        {
          text: "Nasal cannula at 2L",
          correct: false,
          feedback:
            "Not enough oxygen is being delivered for a patient this unwell — anaphylaxis needs high-flow, high-concentration oxygen.",
          vitals: { spo2: -3, hr: +5 },
          cascade: "Sats continue to drift down. The patient looks more anxious and breathless.",
        },
        {
          text: "Sit the patient up and reassure them",
          correct: false,
          feedback:
            "Reassurance matters, but on its own it does nothing for the falling oxygen levels — oxygen needs to go on now.",
          vitals: { spo2: -4, hr: +6 },
          cascade: "The wheeze worsens and the patient becomes visibly more distressed and tachypnoeic.",
        },
      ],
    },
    // ---------------- CIRCULATION ----------------
    {
      letter: "C",
      label: "Circulation",
      icon: "droplet",
      assessment:
        "Blood pressure is low, heart rate is fast and thready, and the patient's peripheries are cool and mottled.",
      question: "What do you do?",
      options: [
        {
          text: "IV access x2 and a 500ml crystalloid fluid bolus, reassess after",
          correct: true,
          feedback:
            "Correct. Anaphylaxis causes massive vasodilation and fluid leak — a rapid fluid bolus supports the circulation while the adrenaline takes effect.",
          vitals: { sbp: +12, hr: -6 },
        },
        {
          text: "Sit and wait for the adrenaline to work before doing anything else",
          correct: false,
          feedback:
            "Adrenaline alone may not be enough to correct significant fluid loss into the tissues — fluids are needed too, without delay.",
          vitals: { sbp: -8, hr: +10 },
          cascade: "The blood pressure drops further. The patient becomes drowsy and confused.",
        },
        {
          text: "Give a small 100ml fluid bolus 'to be cautious'",
          correct: false,
          feedback:
            "Under-resuscitating a hypotensive anaphylaxis patient just delays proper treatment — this needs a full, rapid bolus.",
          vitals: { sbp: -4, hr: +5 },
          cascade: "Blood pressure remains critically low and the patient looks increasingly unwell.",
        },
      ],
    },
    // ---------------- DISABILITY ----------------
    {
      letter: "D",
      label: "Disability",
      icon: "brain",
      assessment:
        "The patient is drowsy and slow to respond to questions. Blood glucose is checked and normal.",
      question: "What's the priority here?",
      options: [
        {
          text: "Recognise this as reduced consciousness from anaphylactic shock — continue treating A, B and C and reassess GCS closely",
          correct: true,
          feedback:
            "Correct. Falling consciousness here is a red flag of shock, not a separate problem — the fix is finishing the ABC treatment, not a new intervention.",
          vitals: { gcs: +1 },
        },
        {
          text: "Assume this is unrelated and request an urgent CT head",
          correct: false,
          feedback:
            "This distracts from the real, treatable cause. A CT here delays life-saving treatment for a problem that isn't neurological.",
          vitals: { gcs: -1, hr: +6 },
          cascade: "While arranging imaging, the patient becomes harder to rouse.",
        },
      ],
    },
    // ---------------- EXPOSURE ----------------
    {
      letter: "E",
      label: "Exposure",
      icon: "eye",
      assessment:
        "Widespread urticarial rash and flushing are visible across the chest and arms. The antibiotic infusion is still running.",
      question: "What do you do?",
      options: [
        {
          text: "Stop the antibiotic infusion immediately and document it clearly as the likely trigger",
          correct: true,
          feedback:
            "Correct. Removing the trigger stops any further reaction and is essential information for the patient's future care.",
          vitals: {},
        },
        {
          text: "Leave the infusion running since it's 'nearly finished'",
          correct: false,
          feedback:
            "Any ongoing exposure to the trigger keeps feeding the reaction — it must be stopped straight away.",
          vitals: { hr: +5, sbp: -4 },
          cascade: "The rash spreads further and the patient's observations dip again.",
        },
      ],
    },
  ],

  escalation: {
    question:
      "The patient has been treated through ABCDE. What's your final decision?",
    options: [
      {
        text: "Call the resus/critical care outreach team and arrange a monitored bed",
        correct: true,
        feedback:
          "Correct. Anaphylaxis can biphasic-relapse hours later, so this patient needs monitoring and senior review — never just discharge and hope.",
      },
      {
        text: "Observe on the ward for 30 minutes then discharge if stable",
        correct: false,
        feedback:
          "Far too short an observation period, and no senior review — this risks missing a biphasic reaction.",
      },
    ],
  },
};

const ICONS = { wind: Wind, activity: Activity, droplet: Droplet, brain: Brain, eye: Eye };

// ---------------------------------------------------------------------------
// VITALS MONITOR — a small bedside-monitor-style readout across the top.
// This is the "signature" visual element: numbers move in real time as the
// player makes choices, exactly like a real patient monitor.
// ---------------------------------------------------------------------------
function VitalsMonitor({ vitals, flash }) {
  const rows = [
    { key: "hr", label: "HR", unit: "bpm", danger: vitals.hr > 120 || vitals.hr < 50 },
    { key: "sbp", label: "SBP", unit: "mmHg", danger: vitals.sbp < 90 },
    { key: "spo2", label: "SpO₂", unit: "%", danger: vitals.spo2 < 94 },
    { key: "rr", label: "RR", unit: "/min", danger: vitals.rr > 24 || vitals.rr < 10 },
    { key: "gcs", label: "GCS", unit: "/15", danger: vitals.gcs < 15 },
  ];
  return (
    <div className="grid grid-cols-5 gap-px bg-slate-600 rounded-lg overflow-hidden border border-slate-300">
      {rows.map((r) => (
        <div key={r.key} className="bg-[#0B1120] px-3 py-2 flex flex-col items-center">
          <span className="text-[10px] tracking-widest text-slate-200 font-mono font-semibold">{r.label}</span>
          <span
            className={`font-mono text-xl md:text-2xl font-bold tabular-nums transition-colors duration-500 ${
              r.danger ? "text-red-400" : "text-lime-300"
            } ${flash ? "animate-pulse" : ""}`}
          >
            {vitals[r.key]}
          </span>
          <span className="text-[9px] text-slate-400 font-mono">{r.unit}</span>
        </div>
      ))}
    </div>
  );
}

function clampVitals(v) {
  return {
    hr: Math.max(30, Math.min(220, v.hr)),
    sbp: Math.max(40, Math.min(180, v.sbp)),
    spo2: Math.max(60, Math.min(100, v.spo2)),
    rr: Math.max(6, Math.min(50, v.rr)),
    temp: v.temp,
    gcs: Math.max(3, Math.min(15, v.gcs)),
  };
}

export default function ResusChallenge() {
  const [screen, setScreen] = useState("consent"); // consent -> brief -> playing -> escalation -> summary
  const [agreed, setAgreed] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [vitals, setVitals] = useState(SCENARIO.startVitals);
  const [flash, setFlash] = useState(false);
  const [feedback, setFeedback] = useState(null); // {text, correct, cascade}
  const [log, setLog] = useState([]); // record of choices for the summary screen
  const [startTime, setStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (screen === "playing" || screen === "escalation") {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      return () => clearInterval(timerRef.current);
    }
  }, [screen]);

  function startGame() {
    setScreen("brief");
  }

  function beginABCDE() {
    setStartTime(Date.now());
    setScreen("playing");
  }

  function choose(option, currentQuestionLabel) {
    setFlash(true);
    setTimeout(() => setFlash(false), 700);

    setVitals((v) => clampVitals({ ...v, ...Object.fromEntries(Object.entries(v).map(([k]) => [k, v[k] + (option.vitals?.[k] || 0)])) }));

    setLog((l) => [...l, { step: currentQuestionLabel, correct: option.correct, text: option.text }]);
    setFeedback(option);
  }

  function advance() {
    setFeedback(null);
    if (stepIndex < SCENARIO.steps.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      setScreen("escalation");
    }
  }

  function chooseEscalation(option) {
    setLog((l) => [...l, { step: "Escalation", correct: option.correct, text: option.text }]);
    setFeedback(option);
  }

  function finishGame() {
    clearInterval(timerRef.current);
    setScreen("summary");
  }

  function restart() {
    setScreen("consent");
    setAgreed(false);
    setStepIndex(0);
    setVitals(SCENARIO.startVitals);
    setFeedback(null);
    setLog([]);
    setElapsed(0);
  }

  const correctCount = log.filter((l) => l.correct).length;
  const total = log.length;
  const mins = Math.floor(elapsed / 60).toString().padStart(2, "0");
  const secs = (elapsed % 60).toString().padStart(2, "0");

  // ---------------- CONSENT SCREEN ----------------
  if (screen === "consent") {
    return (
      <Shell>
        <div className="max-w-lg mx-auto mt-10 bg-white border border-slate-300 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-amber-400">
            <AlertTriangle size={20} />
            <h2 className="font-mono text-sm tracking-widest uppercase">Before you start</h2>
          </div>
          <p className="text-slate-600 text-sm leading-relaxed">
            Dr Ricky's Resus Challenge is an educational simulation designed to support clinical reasoning practice.
            It must not be used as the sole basis for real clinical decision-making. Always follow local policy,
            professional judgement and current guidelines. Accuracy is not guaranteed as clinical guidance evolves,
            and the authors accept no liability for any loss or harm arising from use of this resource.
          </p>
          <p className="text-slate-600 text-xs">
            This resource is not affiliated with or endorsed by the Resuscitation Council UK or any other
            professional body unless explicitly stated.
          </p>
          <label className="flex items-start gap-2 text-sm text-slate-600 pt-2">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 accent-emerald-500"
            />
            I understand and accept this disclaimer
          </label>
          <button
            disabled={!agreed}
            onClick={startGame}
            className="w-full py-3 rounded-lg font-mono text-sm tracking-wide uppercase bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 text-white transition-colors"
          >
            Continue
          </button>
        </div>
      </Shell>
    );
  }

  // ---------------- BRIEF SCREEN ----------------
  if (screen === "brief") {
    return (
      <Shell>
        <div className="max-w-lg mx-auto mt-10 bg-white border border-slate-300 rounded-2xl p-6 space-y-4">
          <span className="text-[11px] font-mono tracking-widest text-emerald-700 uppercase">Level 1 · Novice</span>
          <h2 className="text-2xl font-bold text-slate-900">{SCENARIO.title}</h2>
          <p className="text-slate-600 text-sm">{SCENARIO.subtitle}</p>
          <p className="text-slate-600 leading-relaxed">{SCENARIO.brief}</p>
          <button
            onClick={beginABCDE}
            className="w-full py-3 rounded-lg font-mono text-sm tracking-wide uppercase bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
            Begin assessment
          </button>
        </div>
      </Shell>
    );
  }

  // ---------------- PLAYING SCREEN ----------------
  if (screen === "playing") {
    const step = SCENARIO.steps[stepIndex];
    const Icon = ICONS[step.icon];
    return (
      <Shell>
        <div className="max-w-2xl mx-auto mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <VitalsMonitor vitals={vitals} flash={flash} />
          </div>
          <div className="flex items-center justify-between text-xs font-mono text-slate-600">
            <span>⏱ {mins}:{secs}</span>
            <span>{SCENARIO.steps.map((s) => s.letter).join(" ")}</span>
          </div>

          <div className="bg-white border border-slate-300 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-emerald-700">
              <Icon size={20} />
              <h3 className="font-mono text-sm tracking-widest uppercase">
                {step.letter} — {step.label}
              </h3>
            </div>

            {!feedback && (
              <>
                <p className="text-slate-600 leading-relaxed">{step.assessment}</p>
                <p className="text-slate-900 font-medium pt-1">{step.question}</p>
                <div className="space-y-2 pt-2">
                  {step.options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => choose(opt, step.label)}
                      className="w-full text-left px-4 py-3 rounded-lg border border-slate-300 hover:border-emerald-600 hover:bg-emerald-50 text-slate-800 text-sm transition-colors"
                    >
                      {opt.text}
                    </button>
                  ))}
                </div>
              </>
            )}

            {feedback && (
              <div className="space-y-3">
                <div
                  className={`flex items-start gap-2 p-3 rounded-lg border ${
                    feedback.correct
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-rose-300 bg-rose-50"
                  }`}
                >
                  {feedback.correct ? (
                    <CheckCircle2 className="text-emerald-700 shrink-0 mt-0.5" size={18} />
                  ) : (
                    <XCircle className="text-rose-600 shrink-0 mt-0.5" size={18} />
                  )}
                  <p className="text-sm text-slate-800">{feedback.feedback}</p>
                </div>
                {feedback.cascade && (
                  <p className="text-sm text-amber-700 italic pl-1">{feedback.cascade}</p>
                )}
                <button
                  onClick={advance}
                  className="w-full py-2.5 rounded-lg font-mono text-sm tracking-wide uppercase bg-slate-700 hover:bg-slate-600 text-white transition-colors"
                >
                  {stepIndex < SCENARIO.steps.length - 1 ? "Next step" : "Continue to escalation decision"}
                </button>
              </div>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  // ---------------- ESCALATION SCREEN ----------------
  if (screen === "escalation") {
    return (
      <Shell>
        <div className="max-w-2xl mx-auto mt-6 space-y-4">
          <VitalsMonitor vitals={vitals} flash={false} />
          <div className="bg-white border border-slate-300 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-emerald-700">
              <Heart size={20} />
              <h3 className="font-mono text-sm tracking-widest uppercase">Final decision</h3>
            </div>
            {!feedback && (
              <>
                <p className="text-slate-900 font-medium">{SCENARIO.escalation.question}</p>
                <div className="space-y-2 pt-2">
                  {SCENARIO.escalation.options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => chooseEscalation(opt)}
                      className="w-full text-left px-4 py-3 rounded-lg border border-slate-300 hover:border-emerald-600 hover:bg-emerald-50 text-slate-800 text-sm transition-colors"
                    >
                      {opt.text}
                    </button>
                  ))}
                </div>
              </>
            )}
            {feedback && (
              <div className="space-y-3">
                <div
                  className={`flex items-start gap-2 p-3 rounded-lg border ${
                    feedback.correct
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-rose-300 bg-rose-50"
                  }`}
                >
                  {feedback.correct ? (
                    <CheckCircle2 className="text-emerald-700 shrink-0 mt-0.5" size={18} />
                  ) : (
                    <XCircle className="text-rose-600 shrink-0 mt-0.5" size={18} />
                  )}
                  <p className="text-sm text-slate-800">{feedback.feedback}</p>
                </div>
                <button
                  onClick={finishGame}
                  className="w-full py-2.5 rounded-lg font-mono text-sm tracking-wide uppercase bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                >
                  See results
                </button>
              </div>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  // ---------------- SUMMARY SCREEN ----------------
  if (screen === "summary") {
    const weakAreas = log.filter((l) => !l.correct).map((l) => l.step);
    return (
      <Shell>
        <div className="max-w-lg mx-auto mt-10 bg-white border border-slate-300 rounded-2xl p-6 space-y-5">
          <div className="text-center space-y-1">
            <span className="text-[11px] font-mono tracking-widest text-emerald-700 uppercase">Scenario complete</span>
            <h2 className="text-2xl font-bold text-slate-900">{SCENARIO.title}</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 border border-slate-300 rounded-xl p-4 text-center">
              <div className="text-3xl font-mono font-bold text-emerald-700">{correctCount}/{total}</div>
              <div className="text-[10px] text-slate-600 font-mono tracking-widest uppercase mt-1">Correct decisions</div>
            </div>
            <div className="bg-slate-50 border border-slate-300 rounded-xl p-4 text-center">
              <div className="text-3xl font-mono font-bold text-emerald-700">{mins}:{secs}</div>
              <div className="text-[10px] text-slate-600 font-mono tracking-widest uppercase mt-1">Time taken</div>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-mono tracking-widest text-slate-500 uppercase">Areas to work on</h3>
            {weakAreas.length === 0 ? (
              <p className="text-emerald-700 text-sm">Clean sweep — every decision was correct.</p>
            ) : (
              <p className="text-amber-700 text-sm">Review: {weakAreas.join(", ")}</p>
            )}
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={restart}
              className="w-full py-3 rounded-lg font-mono text-sm tracking-wide uppercase bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-2 transition-colors"
            >
              <RotateCcw size={16} /> Play again
            </button>
            <a
              href="https://ko-fi.com/rickyhellyar"
              target="_blank"
              rel="noreferrer"
              className="w-full text-center py-3 rounded-lg font-mono text-sm tracking-wide uppercase border border-slate-300 text-slate-600 hover:border-emerald-600 transition-colors flex items-center justify-center gap-2"
            >
              <Syringe size={16} /> Support future scenarios
            </a>
          </div>
          <p className="text-[11px] text-slate-500 text-center pt-1">
            More resources at reflectionguide.com
          </p>
        </div>
      </Shell>
    );
  }

  return null;
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 px-4 pb-16">
      <div className="max-w-2xl mx-auto pt-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Heart className="text-emerald-700" size={18} />
          <span className="font-mono text-sm tracking-widest text-slate-600">DR RICKY'S RESUS CHALLENGE</span>
        </div>
      </div>
      {children}
    </div>
  );
}
