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
   - [index.html — Layout & Component Structure](#indexhtml--layout--component-structure)
   - [app.js — Client Logic & Event Architecture](#appjs--client-logic--event-architecture)
   - [site.css — Design Tokens & Theming System](#sitecss--design-tokens--theming-system)
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
| Accepts feedback | Via a pinned bottom composer dock (auto-expanding up to 2,000 characters) |
| Classifies sentiment | Returns **Positive**, **Negative**, or **Neutral** with confidence polarity meter |
| Uses hybrid intelligence | Lexical rules + negation handling + ML.NET fallback |
| Diagnostic insights | Extracts detected signal words (cues) in real-time |
| Persists results | Stores feedback text, label, and UTC timestamp in SQL Server (`SentimentDb.Feedbacks`) |
| Delivers a modern UI | Linear/ChatGPT-style workspace with stream feed, session history, and true black dark mode |
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

## 🖥 Frontend Deep-Dive

The frontend is served as static files from `wwwroot/` by ASP.NET Core's `UseStaticFiles` middleware. It is designed as a **modern, developer-focused workspace** inspired by ChatGPT and Linear:

```
┌─────────────────┬────────────────────────────────────────────────────────┐
│     SIDEBAR     │                    WORKSPACE                           │
│                 │  [☰] Feedback Classification Workspace   ● API Active  │
│  [S] Studio [+] │  ────────────────────────────────────────────────────  │
│  ────────────── │                                                        │
│  ENGINE STATUS  │                 CENTRAL STREAM FEED                    │
│  SDCA + Lexicon │                                                        │
│  SentimentDb    │    [Empty State Benchmark Cards OR Messages Stream]   │
│  [2 pos 1 neu]  │                                                        │
│  ────────────── │    User Bubble: "The migration was brilliant..."   ──► │
│  RECENT HISTORY │                                                        │
│  ● Praise... [×]│    ◄── [S] ┌─── Classification Telemetry Card ───────┐ │
│  ● Defect... [×]│            │  POSITIVE                    14:32 UTC  │ │
│  ────────────── │            │  Polarity Metric: 88%                   │ │
│  [Clear History]│            │  Diagnostic: Favorable satisfaction     │ │
│  ────────────── │            │  Cues: [migration] [brilliant]          │ │
│  [Light|Dark|Auto│           │  [Copy Text]  [Copy JSON]  Persisted DB │ │
│                 │            └─────────────────────────────────────────┘ │
└─────────────────┴────────────────────────────────────────────────────────┤
                  │  ┌── Composer Dock ──────────────────────────────────┐ │
                  │  │ Type or paste feedback...                         │ │
                  │  │ 0 / 2,000 • ↵ Enter to analyze          [Analyze] │ │
                  │  └───────────────────────────────────────────────────┘ │
                  │  Persisted asynchronously to SQL Server (SentimentDb)  │
                  └────────────────────────────────────────────────────────┘
```

---

### `index.html` — Layout & Component Structure

#### 1. Collapsible Sidebar (`<aside class="sidebar" id="sidebar">`)

| Component | Selector / ID | Purpose |
|---|---|---|
| **Brand Identifier** | `.brand` | "Sentiment Studio" logo with purple gradient badge |
| **New Analysis Action** | `#new-analysis-btn` | Clears current feed and focuses composer (`Ctrl+K`) |
| **Telemetry Card** | `.telemetry-card` | Displays active engine (`SDCA + Lexicon`) and target DB (`SentimentDb`) |
| **Live Statistics** | `.telemetry-stats` | Dynamic counters (`#count-pos`, `#count-neu`, `#count-neg`) for session evaluations |
| **Analysis History** | `#history-list` | Clickable log of previous analyses with deletion button per item |
| **Clear History Action** | `#clear-history-btn` | Wipes the stored session history from memory and `localStorage` |
| **Theme Switcher** | `.theme-switcher` | 3-way toggle buttons for **Light**, **Dark** *(default active)*, and **Auto** |

#### 2. Workspace Header (`<header class="topbar">`)

| Element | ID / Class | Purpose |
|---|---|---|
| **Sidebar Toggle** | `#sidebar-toggle-btn` | Collapses or expands the left sidebar |
| **Workspace Title** | `.topbar-title` | "Feedback Classification Workspace" label |
| **API Status Dot** | `.live-dot` | Pulsating emerald dot confirming active backend connectivity |

#### 3. Central Stream Feed (`<div class="feed-container" id="feed-container">`)

**Empty State View (`#empty-state`):**
Shown when no text has been analyzed in the current session.
- **Title & Badge**: "Production Classification" / "Evaluate Customer Sentiment".
- **Benchmark Sample Cards**: One-click test scenarios to quickly demonstrate the engine:
  - *Favorable Signal*: Positive review with speed and satisfaction cues.
  - *Defect & Attrition*: Negative feedback with checkout crash and support neglect cues.
  - *Factual / Logistics*: Neutral message with shipping and invoice numbers.

**Active Conversation Stream (`#stream`):**
- **User Message Row** (`.user-row`): Clean right-aligned bubble containing the submitted feedback.
- **Loading Skeleton** (`.loading-row`): Shimmering skeleton loader rendered while the API request is processing.
- **Classification Card** (`.classification-card`):
  - **Sentiment Badge**: High-contrast state pill (`Positive`, `Negative`, or `Neutral`).
  - **Polarity Meter**: Dynamic percentage bar visualizing emotional polarity.
  - **Diagnostic Summary**: Clear, professional telemetry description of the detected tone.
  - **Detected Cues**: Extracted keywords highlighted as individual signal tags (e.g. `brilliant`, `seamless`, `failed`).
  - **Action Toolbar**: "Copy Text" button, "JSON" telemetry export button, and database persistence confirmation.

#### 4. Pinned Bottom Dock (`<footer class="dock">`)

| Element | ID / Class | Purpose |
|---|---|---|
| **Form Container** | `#composer-form` | Handles submission, keydown interception, and layout constraints |
| **Textarea** | `#composer-input` | Multi-line auto-expanding input (grows up to 190px, `maxlength="2000"`) |
| **Character Counter** | `#char-meter` | Real-time `0 / 2,000` counter; shifts to warning color past 1,850 chars |
| **Keyboard Hints** | `.shortcut-hint` | Displays `↵ Enter to analyze • ⇧↵ newline` |
| **Submit Button** | `#submit-btn` | Triggers POST request; disabled when empty, displays spinner state on submit |
| **Persistence Footnote** | `.dock-disclaimer` | Notes that submissions are stored in `SentimentDb.Feedbacks` |
| **Toast System** | `#toast` | Floating notification acknowledging copy or reset actions |

---

### `app.js` — Client Logic & Event Architecture

#### Key Modules & Functions

| Function / Module | Purpose |
|---|---|
| `LEXICON` | Client-side mirrored vocabulary sets (`positive`, `negative`, `factual`, `negation`) used to extract and highlight signal words in real time |
| `extractLexicalCues(text)` | Tokenizes input and detects matching dictionary cues for the diagnostic tags |
| `getSentimentProfile(sentiment)` | Returns color tokens, polarity percentage, badge styles, and diagnostic summaries |
| `initTheme()` & `setTheme(theme)` | Enforces default **Dark Theme** (`sentiment_studio_theme_v2`), sets `data-theme` on `<body>`, and syncs button states |
| `recordAnalysis(text, sentiment)` | Prepends entry to `analysisHistory`, caps at 50 records, and persists to `localStorage` |
| `renderHistoryList()` | Renders the sidebar history with color-coded status dots and delete listeners |
| `appendUserMessage(text)` | Adds user bubble to stream and scrolls feed smoothly to bottom |
| `appendLoadingIndicator()` | Renders the animated CSS shimmer skeleton while awaiting API response |
| `renderResultCard(...)` | Replaces the shimmer skeleton with the full diagnostic classification card |
| `updateComposer()` | Auto-sizes textarea height, updates character count, and toggles submit button availability |
| `showToast(message)` | Displays a 2.4-second floating status pill |

#### Keyboard Shortcuts

- **Enter** (without Shift): Submits feedback for classification.
- **Shift + Enter**: Inserts a new line in the textarea without submitting.
- **Ctrl + K** (or **Cmd + K**): Resets workspace and initiates a new analysis session.
- **Escape**: Clears the current text from the composer.

---

### `site.css` — Design Tokens & Theming System

The stylesheet implements a dual-theme architecture with **true neutral black dark mode** (zero purple tint):

#### Design Token Reference

| Token | Light Theme | Dark Theme (Default) | Role |
|---|---|---|---|
| `--bg-app` | `#f8fafc` (Cool Slate) | `#000000` (True Black) | Base canvas background |
| `--bg-sidebar` | `#f1f5f9` | `#0a0a0a` (Deep Charcoal) | Left navigation sidebar surface |
| `--bg-panel` | `#ffffff` | `#141414` (Neutral Dark) | Card & message surfaces |
| `--bg-composer` | `#ffffff` | `#1a1a1a` (Dark Gray) | Bottom input container surface |
| `--border-subtle` | `#e2e8f0` | `#222222` | Hairline dividers and outlines |
| `--border-strong` | `#cbd5e1` | `#333333` | Input borders and card containers |
| `--text-primary` | `#0f172a` (Slate 900) | `#ededed` (Off-white) | Primary headings and body text |
| `--text-secondary` | `#475569` | `#a1a1a1` | Metadata, summaries, subtitles |
| `--brand-gradient` | `#6366f1` → `#4f46e5` | `#ffffff` (Monochrome) | Primary button background |
| `--brand-btn-text` | `#ffffff` | `#000000` (High-contrast) | Text/icon inside primary button |
| `--pos-bar` | `#10b981` → `#059669` | `#34d399` → `#10b981` | Positive polarity meter gradient |
| `--neg-bar` | `#f43f5e` → `#e11d48` | `#fb7185` → `#f43f5e` | Negative polarity meter gradient |
| `--neu-bar` | `#f59e0b` → `#d97706` | `#fbbf24` → `#f59e0b` | Neutral polarity meter gradient |

#### Responsive Breakpoints

- **Desktop (`> 860px`)**: Full sidebar, 3-column benchmark grid, keyboard shortcut display.
- **Tablet (`680px – 860px`)**: Single-column benchmark cards, hidden keyboard shortcut hints.
- **Mobile (`≤ 680px`)**: Sidebar transforms into a slide-out overlay drawer toggleable via header icon; feed and input dock adapt with full-width bubble wrapping.

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
