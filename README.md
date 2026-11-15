# 🧠 Sentiment Studio — AI Sentiment Analysis System

> An end-to-end ASP.NET Core web application that classifies customer feedback as **Positive**, **Negative**, or **Neutral** using a hybrid ML.NET + lexical-rules engine, persists results to SQL Server, and serves a polished, themeable frontend — all from a single deployable project.

---

## 📋 Table of Contents

1. [Project Overview](#-project-overview)
2. [Technology Stack](#-technology-stack)
3. [Architecture](#-architecture)
4. [Backend Deep-Dive](#-backend-deep-dive)
   - [Program.cs — Application Bootstrap](#programcs--application-bootstrap)
   - [FeedbackController — REST API](#feedbackcontroller--rest-api)
   - [SentimentAnalysisService — Hybrid ML Engine](#sentimentanalysisservice--hybrid-ml-engine)
   - [Data Models](#data-models)
   - [Database Layer (EF Core)](#database-layer-ef-core)
5. [Frontend Deep-Dive](#-frontend-deep-dive)
   - [index.html — Page Structure & All UI Fields](#indexhtml--page-structure--all-ui-fields)
   - [app.js — Client Logic](#appjs--client-logic)
   - [site.css — Visual Design System](#sitecss--visual-design-system)
6. [Data Flow — End-to-End Request Lifecycle](#-data-flow--end-to-end-request-lifecycle)
7. [Database Schema](#-database-schema)
8. [API Reference](#-api-reference)
9. [Getting Started](#-getting-started)
10. [Project Structure](#-project-structure)
11. [Known Limitations & Future Improvements](#-known-limitations--future-improvements)

---

## 🎯 Project Overview

**Sentiment Studio** solves a common business problem: organizations receive large volumes of customer reviews, comments, and messages that cannot be read and classified manually at scale. This system provides a fast, consistent first-level emotional-tone classification of any piece of text.

**What it does:**

| Capability | Detail |
|---|---|
| Accepts feedback | Via a browser text form (up to 2,000 characters) |
| Classifies sentiment | Returns **Positive**, **Negative**, or **Neutral** |
| Uses hybrid intelligence | Lexical rules + negation handling + ML.NET fallback |
| Persists results | Stores feedback text, label, and UTC timestamp in SQL Server |
| Delivers a full UI | Themed, responsive, single-page-like experience with no framework |
| Developer-friendly | Swagger/OpenAPI endpoint available in development mode |

---

## 🛠 Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | .NET | 10.0 |
| Web Framework | ASP.NET Core Web API | 10.0 |
| Machine Learning | ML.NET | 3.0.0 |
| ML Trainer | SDCA Logistic Regression (via `Microsoft.ML`) | — |
| ORM | Entity Framework Core | 7.0.10 |
| Database | SQL Server / LocalDB | — |
| API Docs | Swashbuckle / Swagger | 11.0.1 |
| Frontend | HTML5, CSS3, Vanilla JavaScript | — |
| Fonts | DM Sans, Space Grotesk (Google Fonts) | — |

---

## 🏗 Architecture

The application follows a **layered monolithic architecture** where the frontend, API, ML service, and database are all hosted by a single ASP.NET Core process.

```
┌──────────────────────────────────────────────────┐
│                   Browser (Client)               │
│         index.html + site.css + app.js           │
│         Fetch API  →  POST /api/Feedback/analyze │
└────────────────────┬─────────────────────────────┘
                     │ HTTPS JSON
┌────────────────────▼─────────────────────────────┐
│          ASP.NET Core Web API  (.NET 10)         │
│  ┌──────────────────────────────────────────┐    │
│  │         FeedbackController               │    │
│  │   POST /api/Feedback/analyze             │    │
│  └──────┬─────────────────────┬────────────┘    │
│         │                     │                   │
│  ┌──────▼──────────┐  ┌───────▼──────────────┐  │
│  │ SentimentAnalysis│  │  FeedbackContext      │  │
│  │ Service (ML.NET) │  │  (Entity Framework)  │  │
│  │  • Lexical rules │  │  SQL Server LocalDB  │  │
│  │  • SDCA model    │  │  Feedbacks table     │  │
│  └──────────────────┘  └──────────────────────┘  │
└──────────────────────────────────────────────────┘
```

---

## 🔧 Backend Deep-Dive

### `Program.cs` — Application Bootstrap

The entry point wires up all services and middleware in the standard ASP.NET Core minimal-hosting style.

```
Services registered:
  FeedbackContext           → AddDbContext  (Scoped)   — SQL Server via connection string
  SentimentAnalysisService  → AddSingleton             — trains ML model once at startup
  Controllers               → AddControllers           — maps API routes
  Swagger                   → AddEndpointsApiExplorer + AddSwaggerGen
```

**Middleware pipeline (in order):**

| Middleware | Purpose |
|---|---|
| `UseSwagger` / `UseSwaggerUI` | Exposes `/swagger` in Development |
| `UseHttpsRedirection` | Forces HTTPS on all requests |
| `UseDefaultFiles` | Serves `index.html` when `/` is requested |
| `UseStaticFiles` | Serves `/css/site.css`, `/js/app.js` from `wwwroot` |
| `MapControllers` | Routes API requests to controller actions |

> **Why Singleton for the ML service?** ML model training is relatively expensive. Registering `SentimentAnalysisService` as a singleton means the model is trained exactly once during application start, and every subsequent request reuses the already-trained `PredictionEngine`.

---

### `FeedbackController` — REST API

**File:** `Controllers/FeedbackController.cs`  
**Route prefix:** `api/[controller]` → `api/Feedback`

| Endpoint | Method | Route | Description |
|---|---|---|---|
| `AnalyzeFeedback` | `POST` | `/api/Feedback/analyze` | Analyzes sentiment and stores result |

**Request → `FeedbackRequest`**

```json
{ "feedbackText": "The product is excellent and easy to use" }
```

**Response → `FeedbackResponse`**

```json
{ "sentiment": "Positive" }
```

**Controller logic step-by-step:**

1. Receives `FeedbackRequest` from the JSON body.
2. Returns `400 Bad Request` if `FeedbackText` is null or whitespace.
3. Calls `SentimentAnalysisService.AnalyzeSentiment(text)` to get the label.
4. Constructs a `Feedback` entity with the text, label, and `DateTime.UtcNow`.
5. Persists the entity to SQL Server via `_db.SaveChangesAsync()`.
6. Returns `200 OK` with a `FeedbackResponse` containing the label.

---

### `SentimentAnalysisService` — Hybrid ML Engine

**File:** `Services/SentimentAnalysisService.cs`

This is the core intelligence of the application. It uses a **three-stage hybrid pipeline** to classify text:

```
Input text
    │
    ▼
Stage 1: Lexical Scoring  ──→  score > 0 → "Positive"
    │                     ──→  score < 0 → "Negative"
    │ (score == 0, no clear sentiment words)
    ▼
Stage 2: Factual Language Detection  ──→  contains factual word → "Neutral"
    │ (no factual words found)
    ▼
Stage 3: ML.NET SDCA Model  ──→  |Score| < 0.15 → "Neutral"
                             ──→  Score > 0      → "Positive"
                             ──→  Score ≤ 0      → "Negative"
```

---

#### Stage 1 — Lexical Scoring with Negation Handling

The input is tokenized using the regex `[a-z']+`. Each token is checked against curated word sets:

**Positive word list** (adds +1 to score):
```
amazing, best, brilliant, clean, comfortable, delighted, easy, excellent,
fantastic, fast, friendly, good, great, happy, helpful, impressed, intuitive,
love, pleasant, pleased, recommend, reliable, smooth, satisfied, solid, top,
wonderful, works, worth
```

**Negative word list** (adds -1 to score):
```
annoying, awful, bad, broken, buggy, cheap, confusing, crashes, defective,
disappointed, disappointing, dirty, delayed, error, expensive, failed,
frustrating, hate, horrible, ignored, late, poor, rude, sad, slow, terrible,
unhappy, unhelpful, unreliable, useless, weak, worst, wrong
```

**Negation words** (flip the next sentiment word's sign):
```
not, never, no, don't, doesn't, didn't, isn't, wasn't, can't, cannot
```

> Example: `"This is not good"` → `good` = +1, preceded by `not` → flipped to -1 → **Negative**.

---

#### Stage 2 — Factual Language Detection

If Stage 1 produces a neutral score, the service checks whether any token belongs to the factual vocabulary. If so, it immediately returns **Neutral** without calling the ML model.

**Factual word list:**
```
account, arrived, contains, delivered, invoice, order, package, received,
scheduled, shipment, shipped, status, today, tomorrow, tracking, updated, yesterday
```

> Example: `"The order arrived today"` → contains `order`, `arrived`, `today` → **Neutral**.

---

#### Stage 3 — ML.NET SDCA Logistic Regression

If neither stage above produces a decision, the ML model is used as a fallback.

**Training pipeline:**

```
TSV file (sentiment-labelled-sentences.tsv)
       │
       ▼
  MLContext.Data.LoadFromTextFile<SentimentData>
       │  (tab-separated, with header)
       ▼
  Transforms.Text.FeaturizeText("Features", nameof(Text))
       │  (converts text → numerical feature vector using word/n-gram counts)
       ▼
  BinaryClassification.Trainers.SdcaLogisticRegression
       │  (learns from Boolean labels: 1 = Positive, 0 = Negative)
       ▼
  ITransformer model  →  PredictionEngine<SentimentData, SentimentPrediction>
```

**Prediction output — `SentimentPrediction`:**

| Property | Type | Meaning |
|---|---|---|
| `Prediction` | `bool` | ML predicted label (`true` = Positive) |
| `Score` | `float` | Raw decision function value |

The `Score` value is used (not `Prediction`) to apply a **confidence threshold**:  
- `|Score| < 0.15` → **Neutral** (model is uncertain)  
- `Score > 0` → **Positive**  
- `Score ≤ 0` → **Negative**

---

### Data Models

#### `SentimentData` — ML Training Input

```csharp
[LoadColumn(0)] public string Text { get; set; }     // The feedback sentence
[LoadColumn(1)] public bool   Sentiment { get; set; } // true=Positive, false=Negative
```

Loaded from `Data/sentiment-labelled-sentences.tsv` (tab-separated, with header).

---

#### `FeedbackRequest` — API Request DTO

```csharp
public string FeedbackText { get; set; }  // The raw feedback text from the client
```

Deserialized from the JSON body of `POST /api/Feedback/analyze`.

---

#### `FeedbackResponse` — API Response DTO

```csharp
public string Sentiment { get; set; }  // "Positive" | "Negative" | "Neutral"
```

Serialized to JSON and returned to the client.

---

#### `Feedback` — Database Entity

```csharp
public int      id            { get; set; }  // Auto-increment primary key
public string   FeedbackText  { get; set; }  // Original submitted text
public string   Sentiment     { get; set; }  // Classified label
public DateTime DateSubmitted { get; set; }  // UTC timestamp of submission
```

Maps to the `Feedbacks` table in SQL Server.

---

#### `SentimentPrediction` — ML Output

```csharp
[ColumnName("PredictedLabel")]
public bool  Prediction { get; set; }  // ML predicted class (true/false)
public float Score      { get; set; }  // Raw decision score used for thresholding
```

---

### Database Layer (EF Core)

#### `FeedbackContext`

Inherits from `DbContext`. Exposes `DbSet<Feedback> Feedbacks` which maps to the `Feedbacks` table. Configured with SQL Server in `Program.cs` using the `SentimentDb` connection string.

#### Connection String (`appsettings.json`)

```json
"SentimentDb": "Server=(localdb)\\MSSQLLocalDB;Database=SentimentDb;Trusted_Connection=true;TrustServerCertificate=true"
```

#### EF Core Migration — `InitialCreate`

Creates the `Feedbacks` table with:

| Column | SQL Type | Constraint |
|---|---|---|
| `id` | `int` | Primary Key, Identity (auto-increment from 1) |
| `FeedbackText` | `nvarchar(max)` | NOT NULL |
| `Sentiment` | `nvarchar(max)` | NOT NULL |
| `DateSubmitted` | `datetime2` | NOT NULL |

> `DateTime.UtcNow` is used so timestamps are time-zone-independent and consistent across deployments.

---

## 🖥 Frontend Deep-Dive

The frontend is served as **static files** from `wwwroot/` by ASP.NET Core's `UseStaticFiles` middleware. It is a classic multi-file single-page interface — no build step, no framework.

---

### `index.html` — Page Structure & UI Layout

The interface features an **un-slopped, production-grade workspace** inspired by modern developer and telemetry tools (Linear / Raycast / ChatGPT):

#### Layout Components

| Component | Selector / ID | Purpose |
|---|---|---|
| **Collapsible Sidebar** | `#sidebar` | Houses brand header, engine telemetry, live sentiment counter, session history, and theme switcher |
| **Telemetry Card** | `.telemetry-card` | Displays active engine status (`SDCA + Lexicon`), DB binding (`SentimentDb`), and live counters for positive/neutral/negative classifications |
| **Analysis History** | `#history-list` | Persistent record of past analyses with status indicators, quick re-load on click, and individual deletion |
| **Theme Switcher** | `.theme-switcher` | Instant toggle between Light, Dark, and System modes |
| **Workspace Header** | `.topbar` | Sidebar toggle button, workspace title, and live API status indicator |
| **Central Feed** | `#feed-container` | Houses the benchmark sample prompt cards in empty state, and the conversation stream once analysis begins |
| **Sample Benchmark Cards** | `.sample-card` | Pre-configured realistic evaluation samples (Favorable Signal, Defect/Attrition, Factual/Logistics) |
| **Message Stream** | `#stream` | Chronological cluster of user input bubbles and structured diagnostic cards |
| **Classification Card** | `.classification-card` | Displays bold sentiment badge, polarity meter percentage bar, detailed analytical explanation, detected lexical cue pills, UTC timestamp, and action buttons ("Copy Text", "JSON") |
| **Bottom Composer Dock** | `.dock` | Pinned multi-line auto-expanding textarea, live character counter with warning thresholds, keyboard shortcut hints, and submit action |
| **Toast System** | `#toast` | Non-intrusive floating feedback notifications for user actions |

> All settings are saved to `localStorage` under the key `sentiment-studio-preferences` as a JSON object and restored on every page load.

---

#### `<main class="page-shell">` — Main Content

**Hero Section** (`.hero`)

| Element | Content |
|---|---|
| `.eyebrow` | "FEEDBACK INTELLIGENCE" (decorative label) |
| `<h1>` | "Understand how your customers feel." |
| `.hero-copy` | Descriptive subtitle about the tool's purpose |

---

**Workspace Section** (`.workspace`) — The Two-Panel Analyzer

**Panel 1 — Input Panel** (`.input-panel`)

| Element | ID / Attribute | Purpose |
|---|---|---|
| Panel kicker | `.panel-kicker` | "01 / WRITE YOUR FEEDBACK" |
| Panel heading `<h2>` | — | "What would you like to analyze?" |
| Sparkle icon | `.sparkle` | Decorative `✦` symbol |
| `<form id="feedback-form">` | `#feedback-form` | Wraps the input and submit button |
| Visually-hidden `<label>` | `for="feedback-text"` | Accessible label (screen readers only) |
| `<textarea>` | `#feedback-text` | **Main input field** — `maxlength="2000"`, `required`, placeholder text, resizable vertically |
| Character counter | `#character-count` | Live count: `0 / 2,000` (updates on `input` event) |
| Submit button | `.analyze-button` | "Analyze sentiment →" — disabled + shows "Analyzing..." while request is pending |
| Button label | `#button-label` | Text inside button (toggled by JS) |
| Button arrow | `.button-arrow` | `→` arrow badge inside button |
| Privacy note | `.privacy-note` | "Your feedback is analyzed securely and stored for insights." |

---

**Panel 2 — Result Panel** (`.result-panel`, `#result-panel`, `aria-live="polite"`)

Three mutually exclusive states, controlled by JS `hidden` attribute:

**State A — Empty (default):**

| Element | ID | Content |
|---|---|---|
| Empty orbit | `.empty-orbit` | Animated `✦` icon in a dashed circle |
| Empty text | — | "Share a thought to reveal its sentiment." |

**State B — Analysis Result** (`#analysis-result`):

| Element | ID | Purpose |
|---|---|---|
| Panel kicker | `.panel-kicker` | "02 / YOUR RESULT" |
| Result title | `#result-title` | e.g. "That feels positive." |
| Result icon | `#result-icon` | `↗` (Positive), `↘` (Negative), `→` (Neutral), `◎` (default) |
| Sentiment label | `#sentiment-label` | Large text: "Positive" / "Negative" / "Neutral" (color-coded) |
| Sentiment meter | `.sentiment-meter` → `#sentiment-meter-fill` | Horizontal progress bar — 88% green (Positive), 56% amber (Neutral), 28% red (Negative) |
| Result description | `#result-description` | Human-readable interpretation of the sentiment |
| Reset button | `#reset-button` | "Analyze another ↗" — clears form and resets UI |

**State C — Error** (`#error-message`, `role="alert"`):

| Element | ID | Purpose |
|---|---|---|
| Error message | `#error-message` | Shows API or network error text; announced to screen readers via `role="alert"` |

---

**Trust Row** (`.trust-row`) — Feature Benefits Strip

| Icon | Heading | Subtext |
|---|---|---|
| `◒` | Clear signals | "Instantly understand the tone" |
| `⌁` | Built for speed | "Results in just a moment" |
| `✧` | Simple by design | "No analysis expertise needed" |

---

#### `<footer class="site-footer">`

Displays: `SENTIMENT STUDIO • FEEDBACK, MADE CLEAR`

---

### `app.js` — Client Logic

#### DOM References

All interactive elements are captured at the top of the file (form, textarea, buttons, panels, settings controls, etc.).

#### User Preferences System

| Function | Purpose |
|---|---|
| `getPreferences()` | Reads & parses `localStorage["sentiment-studio-preferences"]`; falls back to defaults on error |
| `savePreferences(prefs)` | Serializes preferences to `localStorage` |
| `applyPreferences(prefs)` | Sets CSS custom properties, body classes, and control states to match saved preferences |
| `updatePreference(name, value)` | Updates one preference, saves, and applies |

**Default preferences object:**
```js
{ theme: 'light', backgroundColor: '#f7f8fc', fontSize: '100', density: 'comfortable' }
```

#### Sentiment Result Styles

Three visual profiles applied when a result is shown:

| Sentiment | Title | Icon | Description | Color | Meter Width |
|---|---|---|---|---|---|
| Positive | "That feels positive." | `↗` | "encouraging and optimistic tone" | `#15956d` (green) | 88% |
| Negative | "That feels negative." | `↘` | "opportunity to listen, improve, and follow up" | `#e15f52` (coral) | 28% |
| Neutral | "That feels neutral." | `→` | "balanced or factual without a strong emotional signal" | `#c28a24` (amber) | 56% |

#### Form Submission Flow

```
User clicks "Analyze sentiment"
  → preventDefault() (no page reload)
  → Disable button, label = "Analyzing..."
  → fetch POST /api/Feedback/analyze { feedbackText }
  → if !response.ok  → showError(message)
  → else             → showResult(result.sentiment)
  → finally: re-enable button, restore label
```

#### Event Listeners Summary

| Event | Element | Action |
|---|---|---|
| `submit` | `#feedback-form` | Calls API, shows result |
| `input` | `#feedback-text` | Updates character counter |
| `click` | `#reset-button` | Clears textarea, resets UI to empty state |
| `click` | `#settings-button` | Toggles settings panel |
| `click` | `#settings-close` | Closes settings panel |
| `click` | `.theme-option` | Updates `theme` preference |
| `click` | `.density-options button` | Updates `density` preference |
| `click` | `.color-swatch` | Updates `backgroundColor` preference |
| `input` | `#background-color` | Updates `backgroundColor` preference (custom picker) |
| `input` | `#font-size` | Updates `fontSize` preference |
| `click` | `#reset-settings` | Resets all preferences to defaults |

---

### `site.css` — Visual Design System

#### CSS Custom Properties (Design Tokens)

| Variable | Light Value | Dark Value | Purpose |
|---|---|---|---|
| `--ink` | `#17213b` | `#edf0ff` | Primary text color |
| `--muted` | `#6d7690` | `#aeb6d1` | Secondary/subtle text |
| `--line` | `#e7e9f2` | `#343a56` | Borders and dividers |
| `--purple` | `#6d4aff` | `#a998ff` | Brand accent color |
| `--purple-dark` | `#5436df` | `#8873f5` | Hover state of brand color |
| `--mint` | `#dff9ee` | `#193d38` | Positive result background tint |
| `--green` | `#15956d` | `#63d5a9` | Positive sentiment text |
| `--coral` | `#ff755f` | `#ff755f` | Negative accent |
| `--yellow` | `#f7c95c` | `#f7c95c` | Sparkle/neutral accent |
| `--surface` | `rgba(255,255,255,.86)` | `rgba(30,35,59,.9)` | Panel backgrounds (glassmorphism) |
| `--page-background` | `#f7f8fc` | `#171b2d` | Full-page background (user-customizable) |
| `--font-scale` | `1` | `1` | Multiplier for base font size |

#### Responsive Breakpoints

| Breakpoint | Behavior |
|---|---|
| `> 760px` | Side-by-side two-column workspace panels |
| `≤ 760px` | Single-column stacked panels; trust row vertical |
| `≤ 430px` | Smaller topbar, full-width analyze button, status pill hidden |

---

## 🔄 Data Flow — End-to-End Request Lifecycle

```
1. User types feedback in textarea
        ↓
2. Character counter updates live (JS `input` event)
        ↓
3. User clicks "Analyze sentiment"
        ↓
4. app.js: preventDefault(), disables button, sets "Analyzing..."
        ↓
5. fetch POST /api/Feedback/analyze
   Body: { "feedbackText": "<user text>" }
        ↓
6. FeedbackController: validates → not null/empty → passes to service
        ↓
7. SentimentAnalysisService:
   a. Lexical scoring + negation check
   b. Factual language detection (if score = 0)
   c. ML.NET SDCA prediction (fallback)
   → returns "Positive" | "Negative" | "Neutral"
        ↓
8. Controller creates Feedback entity { text, sentiment, DateTime.UtcNow }
        ↓
9. EF Core SaveChangesAsync() → INSERT into Feedbacks table (SQL Server)
        ↓
10. Controller returns 200 OK: { "sentiment": "Positive" }
        ↓
11. app.js: showResult() → updates result panel, icon, meter, description
        ↓
12. User sees result without page reload (aria-live announces to screen readers)
```

---

## 🗄 Database Schema

**Table: `Feedbacks`** (SQL Server / LocalDB — `SentimentDb`)

| Column | SQL Type | Constraint | Description |
|---|---|---|---|
| `id` | `int` | Primary Key, Identity(1,1) | Auto-incrementing unique row identifier |
| `FeedbackText` | `nvarchar(max)` | NOT NULL | Full text of the submitted feedback |
| `Sentiment` | `nvarchar(max)` | NOT NULL | Classification result: `Positive`, `Negative`, or `Neutral` |
| `DateSubmitted` | `datetime2` | NOT NULL | UTC timestamp of when the analysis was performed |

---

## 📡 API Reference

### `POST /api/Feedback/analyze`

Analyzes the sentiment of the provided feedback text and stores the result.

**Request**

```http
POST /api/Feedback/analyze
Content-Type: application/json

{
  "feedbackText": "The product is excellent and easy to use"
}
```

| Field | Type | Required | Max Length | Description |
|---|---|---|---|---|
| `feedbackText` | `string` | ✅ Yes | 2,000 chars (frontend) | The feedback text to analyze |

**Success Response — `200 OK`**

```json
{
  "sentiment": "Positive"
}
```

| Field | Type | Possible Values |
|---|---|---|
| `sentiment` | `string` | `"Positive"`, `"Negative"`, `"Neutral"` |

**Error Response — `400 Bad Request`**

```
FeedbackText Cannot be empty
```

Returned when `feedbackText` is null, empty, or whitespace-only.

**Swagger UI** (Development only): `https://localhost:<port>/swagger`

---

## 🚀 Getting Started

### Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- SQL Server LocalDB (included with Visual Studio) or a full SQL Server instance
- Visual Studio 2022+ or the .NET CLI

### Setup Steps

**1. Clone the repository**
```bash
git clone <repo-url>
cd -AI-Sentiment-Analysis
```

**2. Configure the connection string**

Edit `SentimentAnalysisSystem/appsettings.json`:
```json
{
  "ConnectionStrings": {
    "SentimentDb": "Server=(localdb)\\MSSQLLocalDB;Database=SentimentDb;Trusted_Connection=true;TrustServerCertificate=true"
  }
}
```
Adjust the server name for a non-LocalDB instance.

**3. Apply the database migration**
```bash
cd SentimentAnalysisSystem
dotnet ef database update
```

**4. Run the application**
```bash
dotnet run
```
Or press **F5** in Visual Studio.

**5. Open in browser**

Navigate to `https://localhost:<port>` (displayed in terminal output).

**6. Test the API (optional)**

```bash
curl -X POST https://localhost:<port>/api/Feedback/analyze \
  -H "Content-Type: application/json" \
  -d "{\"feedbackText\": \"I love this product\"}"
```

Expected: `{"sentiment":"Positive"}`

---

## 📁 Project Structure

```
-AI-Sentiment-Analysis/
├── SentimentAnalysisSystem.slnx              # Solution file
└── SentimentAnalysisSystem/
    ├── Program.cs                            # App bootstrap, DI, middleware
    ├── SentimentAnalysisSystem.csproj        # Package references, target framework
    ├── appsettings.json                      # DB connection string, logging
    ├── appsettings.Development.json          # Development overrides
    │
    ├── Controllers/
    │   └── FeedbackController.cs             # POST /api/Feedback/analyze
    │
    ├── Services/
    │   └── SentimentAnalysisService.cs       # Hybrid lexical + ML.NET engine
    │
    ├── Models/
    │   ├── Feedback.cs                       # DB entity (id, FeedbackText, Sentiment, DateSubmitted)
    │   ├── FeedbackRequest.cs                # API request DTO (FeedbackText)
    │   ├── FeedbackResponse.cs               # API response DTO (Sentiment)
    │   ├── SentimentData.cs                  # ML training data model
    │   └── SentimentPrediction.cs            # ML prediction output model
    │
    ├── Data/
    │   ├── FeedbackContext.cs                # EF Core DbContext
    │   └── sentiment-labelled-sentences.tsv  # ML training dataset (TSV)
    │
    ├── Migrations/
    │   ├── 20261114134310_InitialCreate.cs   # Creates Feedbacks table
    │   └── FeedbackContextModelSnapshot.cs   # EF Core model snapshot
    │
    └── wwwroot/                              # Static frontend files
        ├── index.html                        # Main UI page
        ├── css/
        │   └── site.css                      # Design system, themes, responsive layout
        └── js/
            └── app.js                        # Form, API, results, settings logic
```

---

## ⚠ Known Limitations & Future Improvements

### Current Limitations

| Area | Limitation |
|---|---|
| Training data | Small binary (positive/negative only) dataset; Neutral is rule-based, not learned |
| Negation | Simple one-word lookback; complex grammar like double negation is not handled |
| Vocabulary | Fixed lexical word lists; domain-specific slang not covered |
| Security | No server-side length validation; no authentication or rate limiting |
| ML evaluation | No train/test split; no accuracy, precision, recall, or F1 metrics reported |
| Confidence | `Score` is not a calibrated probability |
| Scalability | `PredictionEngine` is single-threaded by design; for production, use `PredictionEnginePool` |

### Suggested Improvements

- Add a larger, domain-specific, reviewed dataset with true neutral labels
- Implement server-side length validation mirroring the 2,000-character frontend limit
- Add authentication/authorization, CORS configuration, and rate limiting for production
- Report ML evaluation metrics (accuracy, F1, confusion matrix) on a held-out test set
- Expose stored feedback via a `GET /api/Feedback` endpoint for reporting and dashboards
- Add pagination, filtering, and trend charts for the feedback history
- Use `PredictionEnginePool` for thread-safe, high-throughput prediction
- Store connection strings in a secret store or environment variables in production
- Add CI/CD pipelines with automated testing

---

*Built with ASP.NET Core · ML.NET · Entity Framework Core · Vanilla JS*
