import { useState, useEffect, useCallback } from "react";

// ─── Spaced Repetition ────────────────────────────────────────────────────────
const INTERVALS = [0, 1, 3, 7, 14, 30];
const STORAGE_KEY = "vocab_words_v2";

function getToday() {
  return new Date().toISOString().split("T")[0];
}
function getDueWords(words) {
  const today = getToday();
  return words.filter((w) => !w.nextReview || w.nextReview <= today);
}
function advanceWord(word, remembered) {
  const currentLevel = word.level ?? 0;
  const newLevel = remembered
    ? Math.min(currentLevel + 1, INTERVALS.length - 1)
    : Math.max(0, currentLevel - 1);
  const days = INTERVALS[newLevel];
  const next = new Date();
  next.setDate(next.getDate() + days);
  return {
    ...word,
    level: newLevel,
    nextReview: next.toISOString().split("T")[0],
    lastReview: getToday(),
    reviewCount: (word.reviewCount ?? 0) + 1,
  };
}

// ─── Storage ──────────────────────────────────────────────────────────────────
function loadWords() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}
function saveWords(words) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
}

// ─── Telegram helpers ─────────────────────────────────────────────────────────
const tg = window.Telegram?.WebApp;
const tgTheme = {
  bg: tg?.themeParams?.bg_color || "#ffffff",
  text: tg?.themeParams?.text_color || "#1f2937",
  hint: tg?.themeParams?.hint_color || "#9ca3af",
  button: tg?.themeParams?.button_color || "#6366f1",
  buttonText: tg?.themeParams?.button_text_color || "#ffffff",
  secondary: tg?.themeParams?.secondary_bg_color || "#f3f4f6",
};

// ─── AI fetch ─────────────────────────────────────────────────────────────────
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_KEY;;

async function fetchWordInfo(word) {
  const prompt = `You are a helpful English teacher for a Persian beginner (A1-A2 level).
For the word "${word}", respond ONLY with a JSON object (no markdown, no backticks):
{
  "word": "${word}",
  "pronunciation": "IPA pronunciation",
  "phonetic": "simple phonetic for Persian speakers",
  "partOfSpeech": "noun/verb/adjective/etc",
  "meaning_fa": "Persian translation (simple, 1-3 words)",
  "definition_en": "Simple English definition (A1-A2 level, max 12 words)",
  "synonyms": ["synonym1", "synonym2"],
  "antonyms": ["antonym1"],
  "example_en": "A simple example sentence.",
  "example_fa": "ترجمه فارسی جمله مثال",
  "tip_fa": "یک نکته کوتاه برای یادآوری به فارسی"
}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3 },
      }),
    }
  );

  const data = await res.json();

  // ─── بخش جدید برای مچ کردن خطای گوگل ───
  if (data.error) {
    throw new Error(`گوگل خطا داد: [${data.error.status}] ${data.error.message}`);
  }

  if (!data.candidates || data.candidates.length === 0) {
    throw new Error("پاسخی از کاندیداهای گوگل دریافت نشد. ساختار پاسخ تغییر کرده است.");
  }
  // ───────────────────────────────────────

  const text = data.candidates[0].content.parts[0].text;
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}
// ─── Level Badge ──────────────────────────────────────────────────────────────
function LevelBadge({ level }) {
  const labels = ["جدید", "۱ روز", "۳ روز", "۷ روز", "۱۴ روز", "۳۰ روز"];
  const colors = ["#6366f1", "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444"];
  const c = colors[level ?? 0];
  return (
    <span style={{
      background: c + "22", color: c, border: `1px solid ${c}44`,
      borderRadius: 6, fontSize: 11, fontWeight: 700, padding: "2px 8px",
    }}>
      {labels[level ?? 0]}
    </span>
  );
}

// ─── Word Info Card ───────────────────────────────────────────────────────────
function WordInfoCard({ info, onSave }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
        borderRadius: 18, padding: "20px 20px 16px", color: "#fff",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1, direction: "ltr" }}>{info.word}</div>
            <div style={{ opacity: 0.8, fontSize: 13, marginTop: 4, direction: "ltr" }}>
              {info.pronunciation} · {info.partOfSpeech}
            </div>
            {info.phonetic && (
              <div style={{ opacity: 0.65, fontSize: 12, marginTop: 4 }}>تلفظ: {info.phonetic}</div>
            )}
          </div>
          <div style={{ background: "#ffffff22", borderRadius: 12, padding: "8px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{info.meaning_fa}</div>
            <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>معنی</div>
          </div>
        </div>
      </div>

      {/* Definition */}
      <div style={{ background: tgTheme.secondary, borderRadius: 14, padding: "14px 16px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: tgTheme.hint, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>تعریف</div>
        <div style={{ fontSize: 14, color: tgTheme.text, lineHeight: 1.6, direction: "ltr" }}>{info.definition_en}</div>
      </div>

      {/* Example */}
      <div style={{ background: tgTheme.secondary, borderRadius: 14, padding: "14px 16px", borderRight: "3px solid #6366f1" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: tgTheme.hint, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>مثال</div>
        <div style={{ fontSize: 14, color: tgTheme.text, fontStyle: "italic", direction: "ltr", marginBottom: 4 }}>{info.example_en}</div>
        <div style={{ fontSize: 13, color: tgTheme.hint }}>{info.example_fa}</div>
      </div>

      {/* Synonyms & Antonyms */}
      <div style={{ display: "flex", gap: 10 }}>
        {info.synonyms?.length > 0 && (
          <div style={{ flex: 1, background: tgTheme.secondary, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: tgTheme.hint, marginBottom: 6 }}>مترادف</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {info.synonyms.map((s) => (
                <span key={s} style={{ background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0", borderRadius: 6, padding: "2px 8px", fontSize: 12, direction: "ltr" }}>{s}</span>
              ))}
            </div>
          </div>
        )}
        {info.antonyms?.length > 0 && (
          <div style={{ flex: 1, background: tgTheme.secondary, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: tgTheme.hint, marginBottom: 6 }}>متضاد</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {info.antonyms.map((a) => (
                <span key={a} style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 6, padding: "2px 8px", fontSize: 12, direction: "ltr" }}>{a}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tip */}
      {info.tip_fa && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "12px 14px", display: "flex", gap: 8 }}>
          <span>💡</span>
          <div style={{ fontSize: 13, color: "#92400e", lineHeight: 1.7 }}>{info.tip_fa}</div>
        </div>
      )}

      {/* Save Button */}
      <button onClick={onSave} style={{
        background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
        color: "#fff", border: "none", borderRadius: 14,
        padding: "15px", fontSize: 15, fontWeight: 700, cursor: "pointer", width: "100%",
      }}>
        ذخیره در لیست من ✓
      </button>
    </div>
  );
}

// ─── Review Card ──────────────────────────────────────────────────────────────
function ReviewCard({ word, onResult }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div style={{
      background: tgTheme.bg, borderRadius: 20,
      border: "1px solid #e5e7eb", overflow: "hidden",
      boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
    }}>
      <div style={{
        background: "linear-gradient(135deg, #1e1b4b, #312e81)",
        padding: "20px", color: "#fff",
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      }}>
        <div>
          <div style={{ fontSize: 30, fontWeight: 800, direction: "ltr" }}>{word.word}</div>
          <div style={{ opacity: 0.6, fontSize: 12, marginTop: 4, direction: "ltr" }}>
            {word.info?.pronunciation} · {word.info?.partOfSpeech}
          </div>
        </div>
        <LevelBadge level={word.level} />
      </div>

      <div style={{ padding: "16px" }}>
        {!revealed ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
            <button onClick={() => setRevealed(true)} style={{
              background: tgTheme.secondary, border: "2px dashed #d1d5db",
              borderRadius: 14, padding: "14px 32px", fontSize: 15,
              color: tgTheme.hint, cursor: "pointer", fontWeight: 600,
            }}>
              👁 نشان بده
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: "#6366f1" }}>{word.info?.meaning_fa}</div>
              <div style={{ fontSize: 13, color: tgTheme.hint, marginTop: 4, direction: "ltr" }}>{word.info?.definition_en}</div>
            </div>
            <div style={{ background: tgTheme.secondary, borderRadius: 12, padding: "12px", borderRight: "3px solid #6366f1" }}>
              <div style={{ fontSize: 13, fontStyle: "italic", color: tgTheme.text, direction: "ltr" }}>{word.info?.example_en}</div>
              <div style={{ fontSize: 12, color: tgTheme.hint, marginTop: 4 }}>{word.info?.example_fa}</div>
            </div>
            {word.info?.tip_fa && (
              <div style={{ fontSize: 12, color: "#92400e", background: "#fffbeb", borderRadius: 8, padding: "8px 12px" }}>
                💡 {word.info.tip_fa}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button onClick={() => onResult(false)} style={{
                flex: 1, background: "#fef2f2", color: "#dc2626",
                border: "1px solid #fecaca", borderRadius: 12,
                padding: "13px", fontSize: 14, fontWeight: 700, cursor: "pointer",
              }}>😕 یادم نبود</button>
              <button onClick={() => onResult(true)} style={{
                flex: 1, background: "#ecfdf5", color: "#059669",
                border: "1px solid #a7f3d0", borderRadius: 12,
                padding: "13px", fontSize: 14, fontWeight: 700, cursor: "pointer",
              }}>✓ بلد بودم</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("review");
  const [words, setWords] = useState(() => loadWords());
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchedInfo, setFetchedInfo] = useState(null);
  const [error, setError] = useState("");
  const [reviewQueue, setReviewQueue] = useState([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [sessionDone, setSessionDone] = useState(false);
  const [stats, setStats] = useState({ correct: 0, wrong: 0 });

  useEffect(() => {
    const due = getDueWords(words);
    setReviewQueue(due);
    setReviewIndex(0);
    setSessionDone(false);
    setStats({ correct: 0, wrong: 0 });
  }, [words.length]);

  const persistWords = useCallback((updated) => {
    setWords(updated);
    saveWords(updated);
  }, []);

  const handleSearch = async () => {
    const w = input.trim().toLowerCase();
    if (!w) return;
    if (words.find((x) => x.word === w)) { setError("این کلمه قبلاً اضافه شده!"); return; }
    setError(""); setFetchedInfo(null); setLoading(true);
    try {
      const info = await fetchWordInfo(w);
      setFetchedInfo(info);
    } catch (err) {
      // نشان دادن دلیل اصلی خطا روی صفحه
      setError(`خطا: ${err.message || "مشکل نامشخص"}`);
      console.error(err);
    }
    setLoading(false);
  };

  const handleSave = () => {
    if (!fetchedInfo) return;
    const newWord = {
      id: Date.now(), word: fetchedInfo.word, info: fetchedInfo,
      level: 0, nextReview: getToday(), addedAt: getToday(), reviewCount: 0,
    };
    persistWords([newWord, ...words]);
    setFetchedInfo(null); setInput(""); setTab("review");
    tg?.HapticFeedback?.notificationOccurred("success");
  };

  const handleReviewResult = (remembered) => {
    const current = reviewQueue[reviewIndex];
    const updated = words.map((w) => w.id === current.id ? advanceWord(w, remembered) : w);
    persistWords(updated);
    setStats((s) => ({ correct: s.correct + (remembered ? 1 : 0), wrong: s.wrong + (remembered ? 0 : 1) }));
    tg?.HapticFeedback?.impactOccurred(remembered ? "medium" : "light");
    if (reviewIndex + 1 >= reviewQueue.length) setSessionDone(true);
    else setReviewIndex((i) => i + 1);
  };

  const dueCount = getDueWords(words).length;
  const currentCard = reviewQueue[reviewIndex];

  const tabs = [
    { id: "review", label: "مرور", emoji: "📋", badge: dueCount > 0 ? dueCount : null },
    { id: "add", label: "افزودن", emoji: "➕" },
    { id: "list", label: "لیست", emoji: "📚" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: tgTheme.bg, fontFamily: "'Segoe UI', system-ui, sans-serif", direction: "rtl", paddingBottom: 80 }}>
      {/* Header */}
      <div style={{
        background: tgTheme.bg, borderBottom: "1px solid #e5e7eb",
        padding: "12px 16px", display: "flex", alignItems: "center", gap: 8,
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <span style={{ fontSize: 20 }}>📖</span>
        <span style={{ fontWeight: 800, fontSize: 17, color: tgTheme.text }}>VocabLearn</span>
        <span style={{ marginRight: "auto", fontSize: 12, color: tgTheme.hint }}>{words.length} لغت</span>
      </div>

      {/* Content */}
      <div style={{ padding: "16px", maxWidth: 600, margin: "0 auto" }}>

        {/* ADD */}
        {tab === "add" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="کلمه انگلیسی..."
                style={{
                  flex: 1, border: "1.5px solid #e5e7eb", borderRadius: 12,
                  padding: "12px 14px", fontSize: 16, outline: "none",
                  direction: "ltr", background: tgTheme.bg, color: tgTheme.text,
                  fontFamily: "inherit",
                }}
              />
              <button onClick={handleSearch} disabled={loading || !input.trim()} style={{
                background: "#6366f1", color: "#fff", border: "none", borderRadius: 12,
                padding: "12px 18px", fontSize: 15, fontWeight: 700,
                cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                opacity: loading || !input.trim() ? 0.5 : 1,
              }}>
                {loading ? "..." : "جستجو"}
              </button>
            </div>
            {error && <div style={{ color: "#dc2626", fontSize: 13, background: "#fef2f2", borderRadius: 8, padding: "10px 14px" }}>{error}</div>}
            {loading && (
              <div style={{ textAlign: "center", padding: 40, color: tgTheme.hint }}>
                <div style={{ fontSize: 30, marginBottom: 8 }}>⏳</div>
                <div style={{ fontSize: 14 }}>در حال دریافت اطلاعات...</div>
              </div>
            )}
            {fetchedInfo && !loading && <WordInfoCard info={fetchedInfo} onSave={handleSave} />}
            {!fetchedInfo && !loading && !error && (
              <div style={{ textAlign: "center", padding: "48px 20px", color: tgTheme.hint }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>✨</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>یه کلمه انگلیسی بنویس</div>
                <div style={{ fontSize: 13, marginTop: 6 }}>تلفظ، معنی، مثال و نکته برات میاره</div>
              </div>
            )}
          </div>
        )}

        {/* REVIEW */}
        {tab === "review" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {words.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: tgTheme.hint }}>
                <div style={{ fontSize: 52, marginBottom: 16 }}>📚</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: tgTheme.text }}>هنوز لغتی نداری!</div>
                <div style={{ fontSize: 13, marginTop: 8 }}>از تب «افزودن» اولین کلمه‌ات رو اضافه کن</div>
                <button onClick={() => setTab("add")} style={{
                  marginTop: 20, background: "#6366f1", color: "#fff",
                  border: "none", borderRadius: 12, padding: "13px 28px",
                  fontSize: 14, fontWeight: 700, cursor: "pointer",
                }}>+ افزودن کلمه</button>
              </div>
            ) : sessionDone || dueCount === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 16px" }}>
                <div style={{ fontSize: 52, marginBottom: 12 }}>🎉</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: tgTheme.text }}>عالی بود!</div>
                <div style={{ fontSize: 14, color: tgTheme.hint, marginTop: 8, marginBottom: 20 }}>امروز همه لغت‌هات رو مرور کردی</div>
                <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                  {[
                    { val: stats.correct, label: "بلد بودم", bg: "#ecfdf5", color: "#059669" },
                    { val: stats.wrong, label: "یادم نبود", bg: "#fef2f2", color: "#dc2626" },
                    { val: words.length, label: "کل لغات", bg: "#f0f9ff", color: "#0284c7" },
                  ].map((s) => (
                    <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: "12px 16px", textAlign: "center" }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.val}</div>
                      <div style={{ fontSize: 11, color: tgTheme.hint, marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 13, color: tgTheme.hint, marginTop: 20 }}>فردا بیا دوباره مرور کن 📅</div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 13, color: tgTheme.hint }}>{reviewIndex + 1} از {reviewQueue.length} لغت</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <span style={{ fontSize: 13, color: "#059669" }}>✓ {stats.correct}</span>
                    <span style={{ fontSize: 13, color: "#dc2626" }}>✗ {stats.wrong}</span>
                  </div>
                </div>
                <div style={{ height: 4, background: "#e5e7eb", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
                    width: `${(reviewIndex / reviewQueue.length) * 100}%`, transition: "width 0.3s",
                  }} />
                </div>
                {currentCard && <ReviewCard key={currentCard.id + reviewIndex} word={currentCard} onResult={handleReviewResult} />}
              </>
            )}
          </div>
        )}

        {/* LIST */}
        {tab === "list" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {words.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: tgTheme.hint }}>
                <div style={{ fontSize: 40 }}>📭</div>
                <div style={{ marginTop: 8 }}>هنوز لغتی ندارید</div>
              </div>
            ) : words.map((w) => (
              <div key={w.id} style={{
                background: tgTheme.bg, border: "1px solid #e5e7eb",
                borderRadius: 14, padding: "14px 16px",
                display: "flex", alignItems: "center", gap: 12,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 16, color: tgTheme.text, direction: "ltr" }}>{w.word}</span>
                    <LevelBadge level={w.level} />
                  </div>
                  <div style={{ fontSize: 13, color: tgTheme.hint, marginTop: 3 }}>
                    {w.info?.meaning_fa} · {w.info?.partOfSpeech}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: tgTheme.hint, textAlign: "center" }}>
                  <div>مرور بعدی</div>
                  <div style={{ fontWeight: 700, color: w.nextReview <= getToday() ? "#dc2626" : tgTheme.text, marginTop: 2 }}>
                    {w.nextReview === getToday() ? "امروز" : w.nextReview}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: tgTheme.bg, borderTop: "1px solid #e5e7eb",
        display: "flex", padding: "8px 0 12px",
        boxShadow: "0 -4px 16px rgba(0,0,0,0.06)",
      }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); setFetchedInfo(null); setError(""); }} style={{
            flex: 1, background: "none", border: "none", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 2, position: "relative",
            color: tab === t.id ? "#6366f1" : tgTheme.hint,
          }}>
            <span style={{ fontSize: 22 }}>{t.emoji}</span>
            <span style={{ fontSize: 11, fontWeight: tab === t.id ? 700 : 400 }}>{t.label}</span>
            {t.badge && (
              <span style={{
                position: "absolute", top: 0, right: "50%", marginRight: -22,
                background: "#ef4444", color: "#fff", borderRadius: 10,
                fontSize: 10, fontWeight: 700, padding: "1px 6px", minWidth: 18, textAlign: "center",
              }}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
