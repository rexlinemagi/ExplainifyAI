# ExplainifyAI 🤖
### Offline AI Tutor for Computer Science Students

> A fully offline, AI-powered mobile tutoring application built with React Native (Expo). No internet required at runtime. No external APIs. No cloud dependencies.

---

## What It Does

ExplainifyAI is a personal CS tutor that lives entirely on your device. Students can:

- **Ask questions** about CS topics through a chat interface — explanations are returned instantly from a bundled local dataset
- **Take quizzes** with randomised answer options, a countdown timer, and motivational feedback
- **Upload PDFs** and have the app detect which CS topics are covered
- **Track progress** through streaks, accuracy charts, and topic breakdowns
- **Study in their language** — English, Tamil, Hindi, Telugu, and Malayalam supported

Everything works fully offline. No login to any server, no API key, no subscription.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native (Expo SDK 54) |
| Language | TypeScript |
| Navigation | expo-router (file-based) |
| Database | SQLite via expo-sqlite |
| Charts | react-native-chart-kit |
| PDF (web) | pdfjs-dist |
| PDF (mobile) | fflate + custom CMap parser |
| Auth state | React Context |
| XP persistence | AsyncStorage |

---

## Dataset Pipeline (Google Colab)

The knowledge base was built using two Python scripts run on Google Colab before the app was built:

**`explainifyai.py`**
- Scrapes CS topic explanations from Wikipedia using `requests` + `BeautifulSoup`
- Produces `cs_data_en.json`
- Translates explanations into Tamil, Hindi, Telugu, and Malayalam using `sarvamai/sarvam-translate`

**`quiz_generator_and_injector.py`**
- Loads `Qwen/Qwen2.5-1.5B-Instruct` via Hugging Face Transformers in bfloat16
- Generates 5 MCQ + 3 True/False questions per topic from the explanation text
- Injects quiz objects into all 5 language dataset files

**`quiz_question_translator.py`**
- Translates quiz question text into each language using `sarvamai/sarvam-translate`
- Adds a `translatedQ` field to each question entry (options remain in English)

**`hindi_quiz_translator.py`**
- Hindi-only version using `Helsinki-NLP/opus-mt-en-hi` — no HF token required

---

## Project Structure

```
ExplainifyAI/
├── app/
│   ├── _layout.tsx          # Root layout, DB init, AuthProvider
│   ├── index.tsx            # Login screen
│   ├── signup.tsx           # Registration screen
│   ├── home.tsx             # Dashboard with streak, stats, quick actions
│   ├── learn.tsx            # AI Lab — chat interface + avatar + XP
│   ├── quiz.tsx             # Quiz screen — timer, bilingual, motivation
│   ├── quizSetup.tsx        # Quiz configuration
│   ├── ExplorePage.tsx      # Resource Vault — PDF upload and management
│   ├── AnalyticsPage.tsx    # Charts, streaks, topic breakdown
│   ├── settings.tsx         # Language selection, logout
│   └── topicDetail.tsx      # Full topic explanation + quiz CTA
├── scripts/
│   ├── Engine.ts            # AI engine — topic matching, fuzzy search, quiz builder
│   └── PdfParser.ts         # PDF text extraction (pdfjs web / fflate mobile)
├── database/
│   └── database.ts          # SQLite singleton, all DB functions
├── hooks/
│   └── AuthContext.tsx      # Auth state, language change
└── assets/
    └── datasets/
        ├── cs_data_en.json
        ├── cs_data_ta.json
        ├── cs_data_hi.json
        ├── cs_data_te.json
        └── cs_data_ml.json
```

---

## Getting Started

### Prerequisites

- Node.js v18+
- Expo CLI: `npm install -g expo-cli`
- Expo Go app on your phone (Android or iOS)

### Installation

```bash
# Clone the repo
git clone https://github.com/rexlinemagi/ExplainifyAI.git
cd ExplainifyAI

# Install dependencies
npm install

# Start the dev server
npx expo start
```

Scan the QR code with Expo Go. That's it — no environment variables, no API keys, no backend.

### Production Build

```bash
# Android APK
eas build --platform android

# iOS
eas build --platform ios
```

---

## Database Schema

Six SQLite tables, all keyed by `user_id` with `ON DELETE CASCADE`:

| Table | Purpose |
|---|---|
| `users` | Accounts — username, email, password, preferred language |
| `user_pdfs` | Uploaded PDF records — filename, local URI |
| `topics_studied` | Topics queried per user — name, count, last accessed |
| `quiz_scores` | Quiz results — topic, score, total, date |
| `chat_messages` | Persistent chat history — role, content, timestamp |
| `study_days` | One row per calendar day studied — powers streak calculation |

---

## Features Summary

| Feature | Details |
|---|---|
| Offline AI chat | Substring + Levenshtein fuzzy matching, top-3 suggestions |
| Bilingual quiz | English + selected language shown simultaneously |
| Quiz timer | 30s MCQ / 15s True/False, animated countdown bar |
| Option randomisation | Fisher-Yates shuffle with correct-index remapping |
| Motivational messages | Consecutive-correct streak counter triggers banners |
| Animated avatar | 3-state (idle / talking / celebrate) using React Native Animated API |
| XP system | Persisted per user via AsyncStorage, level-up celebration toast |
| Study streaks | Calendar-day tracking via `study_days` table |
| PDF upload | Topic extraction from uploaded study materials |
| Analytics | Line, pie, and bar charts — all dynamically sized |
| Multi-user | Full data isolation per account, ON DELETE CASCADE |
| 5 languages | English, Tamil, Hindi, Telugu, Malayalam |

---

## Authors

**Joice Collins** — 23/UCSA/207  
**Rexline Magi** — 23/UCSA/212

Bachelor of Computer Applications  
Stella Maris College (Autonomous), Chennai  
November 2025 – March 2026