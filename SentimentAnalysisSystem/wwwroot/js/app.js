/* ══════════════════════════════════════════════════════════════════════
   SENTIMENT STUDIO — CLIENT APPLICATION CORE
   ══════════════════════════════════════════════════════════════════════ */

// ── LEXICON DEFINITIONS (MIRRORS BACKEND LOGIC FOR CUE EXTRACTION) ────
const LEXICON = {
    positive: new Set([
        "amazing", "best", "brilliant", "clean", "comfortable", "delighted", "easy", "excellent",
        "fantastic", "fast", "friendly", "good", "great", "happy", "helpful", "impressed", "intuitive",
        "love", "pleasant", "pleased", "recommend", "reliable", "smooth", "satisfied", "solid", "top",
        "wonderful", "works", "worth"
    ]),
    negative: new Set([
        "annoying", "awful", "bad", "broken", "buggy", "cheap", "confusing", "crashes", "defective",
        "disappointed", "disappointing", "dirty", "delayed", "error", "expensive", "failed", "frustrating", "hate",
        "horrible", "ignored", "late", "poor", "rude", "sad", "slow", "terrible", "unhappy", "unhelpful",
        "unreliable", "useless", "weak", "worst", "wrong"
    ]),
    factual: new Set([
        "account", "arrived", "contains", "delivered", "invoice", "order", "package", "received",
        "scheduled", "shipment", "shipped", "status", "today", "tomorrow", "tracking", "updated", "yesterday"
    ]),
    negation: new Set([
        "not", "never", "no", "don't", "doesn't", "didn't", "isn't", "wasn't", "can't", "cannot"
    ])
};

// ── STATE MANAGEMENT ─────────────────────────────────────────────────
const STORAGE_KEYS = {
    THEME: 'sentiment_studio_theme_v2',
    HISTORY: 'sentiment_studio_history_v1',
    SIDEBAR_COLLAPSED: 'sentiment_studio_sidebar_collapsed'
};

let analysisHistory = [];

function loadHistory() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.HISTORY);
        analysisHistory = raw ? JSON.parse(raw) : [];
    } catch {
        analysisHistory = [];
    }
}

function saveHistory() {
    try {
        localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(analysisHistory));
    } catch {
        // quota exceeded or private mode
    }
}

// ── DOM ELEMENTS ─────────────────────────────────────────────────────
const elements = {
    body: document.body,
    sidebar: document.getElementById('sidebar'),
    sidebarToggleBtn: document.getElementById('sidebar-toggle-btn'),
    newAnalysisBtn: document.getElementById('new-analysis-btn'),
    clearHistoryBtn: document.getElementById('clear-history-btn'),
    historyList: document.getElementById('history-list'),
    emptyHistory: document.getElementById('empty-history'),
    countPos: document.getElementById('count-pos'),
    countNeu: document.getElementById('count-neu'),
    countNeg: document.getElementById('count-neg'),
    themeLightBtn: document.getElementById('theme-light-btn'),
    themeDarkBtn: document.getElementById('theme-dark-btn'),
    themeSystemBtn: document.getElementById('theme-system-btn'),
    feedContainer: document.getElementById('feed-container'),
    emptyState: document.getElementById('empty-state'),
    stream: document.getElementById('stream'),
    composerForm: document.getElementById('composer-form'),
    composerInput: document.getElementById('composer-input'),
    charMeter: document.getElementById('char-meter'),
    submitBtn: document.getElementById('submit-btn'),
    toast: document.getElementById('toast')
};

// ── THEME CONTROLLER ─────────────────────────────────────────────────
function setTheme(theme) {
    elements.body.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEYS.THEME, theme);

    [elements.themeLightBtn, elements.themeDarkBtn, elements.themeSystemBtn].forEach(btn => {
        if (!btn) return;
        btn.classList.toggle('is-active', btn.dataset.theme === theme);
    });
}

function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
    setTheme(saved);
}

// ── TOAST NOTIFICATIONS ──────────────────────────────────────────────
let toastTimeout;
function showToast(message) {
    if (!elements.toast) return;
    clearTimeout(toastTimeout);
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    toastTimeout = setTimeout(() => {
        elements.toast.hidden = true;
    }, 2400);
}

// ── CUE DETECTION EXTRACTOR ──────────────────────────────────────────
function extractLexicalCues(text) {
    const matches = (text.toLowerCase().match(/[a-z']+/g) || []);
    const detected = [];

    matches.forEach(word => {
        if (LEXICON.positive.has(word)) detected.push({ word, type: 'pos' });
        else if (LEXICON.negative.has(word)) detected.push({ word, type: 'neg' });
        else if (LEXICON.factual.has(word)) detected.push({ word, type: 'neu' });
        else if (LEXICON.negation.has(word)) detected.push({ word, type: 'negation' });
    });

    return detected;
}

// ── METRIC CALCULATION & STYLES ──────────────────────────────────────
const PROFILE = {
    Positive: {
        badgeClass: 'badge-pos',
        barColor: 'var(--pos-bar)',
        meterPct: '88%',
        summary: 'Net favorable sentiment detected. Vocabulary exhibits strong satisfaction and endorsement cues.',
        indicatorClass: 'pos'
    },
    Negative: {
        badgeClass: 'badge-neg',
        barColor: 'var(--neg-bar)',
        meterPct: '24%',
        summary: 'Critical or unfavorable tone detected. Contains explicit defect signals, friction points, or attrition indicators.',
        indicatorClass: 'neg'
    },
    Neutral: {
        badgeClass: 'badge-neu',
        barColor: 'var(--neu-bar)',
        meterPct: '54%',
        summary: 'Objective statement or logistical communication lacking strong emotional polarity.',
        indicatorClass: 'neu'
    }
};

function getSentimentProfile(sentiment) {
    const s = String(sentiment || '').toLowerCase();
    if (s.includes('positive')) return { ...PROFILE.Positive, name: 'Positive' };
    if (s.includes('negative')) return { ...PROFILE.Negative, name: 'Negative' };
    return { ...PROFILE.Neutral, name: 'Neutral' };
}

// ── HISTORY & TELEMETRY RENDERING ────────────────────────────────────
function updateTelemetryStats() {
    let pos = 0, neu = 0, neg = 0;
    analysisHistory.forEach(item => {
        const s = (item.sentiment || '').toLowerCase();
        if (s.includes('positive')) pos++;
        else if (s.includes('negative')) neg++;
        else neu++;
    });

    if (elements.countPos) elements.countPos.textContent = pos;
    if (elements.countNeu) elements.countNeu.textContent = neu;
    if (elements.countNeg) elements.countNeg.textContent = neg;
}

function renderHistoryList() {
    if (!elements.historyList) return;
    elements.historyList.innerHTML = '';

    if (analysisHistory.length === 0) {
        if (elements.emptyHistory) elements.emptyHistory.hidden = false;
        elements.historyList.appendChild(elements.emptyHistory);
        updateTelemetryStats();
        return;
    }

    if (elements.emptyHistory) elements.emptyHistory.hidden = true;

    analysisHistory.slice(0, 30).forEach((entry, idx) => {
        const prof = getSentimentProfile(entry.sentiment);
        const item = document.createElement('div');
        item.className = 'history-entry';
        item.innerHTML = `
            <div class="history-entry-content" title="${escapeHtml(entry.text)}">
                <span class="history-indicator ${prof.indicatorClass}"></span>
                <span class="history-text">${escapeHtml(entry.text)}</span>
            </div>
            <button class="history-delete-btn" type="button" title="Delete record" data-index="${idx}">&times;</button>
        `;

        item.querySelector('.history-entry-content').addEventListener('click', () => {
            elements.composerInput.value = entry.text;
            updateComposer();
            elements.composerInput.focus();
        });

        item.querySelector('.history-delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            analysisHistory.splice(idx, 1);
            saveHistory();
            renderHistoryList();
            showToast('Analysis removed from history');
        });

        elements.historyList.appendChild(item);
    });

    updateTelemetryStats();
}

function recordAnalysis(text, sentiment) {
    analysisHistory.unshift({
        id: Date.now(),
        text,
        sentiment,
        timestamp: new Date().toISOString()
    });
    if (analysisHistory.length > 50) analysisHistory.pop();
    saveHistory();
    renderHistoryList();
}

// ── UTILITIES ────────────────────────────────────────────────────────
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function scrollToBottom() {
    elements.feedContainer.scrollTo({
        top: elements.feedContainer.scrollHeight,
        behavior: 'smooth'
    });
}

function formatUtcTime() {
    const d = new Date();
    return d.toTimeString().split(' ')[0] + ' UTC';
}

// ── STREAM CLUSTER RENDERING ─────────────────────────────────────────
function appendUserMessage(text) {
    if (elements.emptyState) elements.emptyState.hidden = true;

    const cluster = document.createElement('div');
    cluster.className = 'message-cluster';
    cluster.innerHTML = `
        <div class="user-row">
            <div class="user-bubble">${escapeHtml(text)}</div>
        </div>
    `;
    elements.stream.appendChild(cluster);
    scrollToBottom();
    return cluster;
}

function appendLoadingIndicator(cluster) {
    const loadingRow = document.createElement('div');
    loadingRow.className = 'loading-row';
    loadingRow.innerHTML = `
        <div class="assistant-avatar">S</div>
        <div class="loading-shimmer">
            <div class="shimmer-line shimmer-w40"></div>
            <div class="shimmer-line shimmer-w80"></div>
            <div class="shimmer-line shimmer-w60"></div>
        </div>
    `;
    cluster.appendChild(loadingRow);
    scrollToBottom();
    return loadingRow;
}

function renderResultCard(cluster, loadingRow, text, sentiment) {
    const prof = getSentimentProfile(sentiment);
    const cues = extractLexicalCues(text);
    const cuesHtml = cues.length > 0
        ? cues.slice(0, 8).map(c => `<span class="cue-tag">${escapeHtml(c.word)}</span>`).join('')
        : '<span class="cue-tag" style="opacity:0.7">No overt lexical triggers</span>';

    const cardRow = document.createElement('div');
    cardRow.className = 'assistant-row';
    cardRow.innerHTML = `
        <div class="assistant-avatar">S</div>
        <div class="assistant-content">
            <div class="classification-card">
                <div class="card-top">
                    <div class="sentiment-badge-large ${prof.badgeClass}">
                        <span>${prof.name}</span>
                    </div>
                    <span class="card-timestamp mono">${formatUtcTime()}</span>
                </div>

                <div class="polarity-track">
                    <div class="polarity-header">
                        <span class="polarity-label">Classification Polarity Metric</span>
                        <span class="polarity-value mono">${prof.meterPct}</span>
                    </div>
                    <div class="polarity-bar">
                        <div class="polarity-fill" style="width:${prof.meterPct};background:${prof.barColor}"></div>
                    </div>
                </div>

                <div class="card-diagnostics">
                    <div class="diagnostic-text">${prof.summary}</div>
                    <div class="diagnostic-tags">
                        <span class="telemetry-label" style="font-size:9px">Signals:</span>
                        ${cuesHtml}
                    </div>
                </div>

                <div class="card-actions">
                    <div class="action-btn-group">
                        <button class="card-action-btn copy-text-btn" type="button" title="Copy feedback text">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                            </svg>
                            <span>Copy Text</span>
                        </button>
                        <button class="card-action-btn copy-json-btn" type="button" title="Copy JSON telemetry">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                            </svg>
                            <span>JSON</span>
                        </button>
                    </div>
                    <span class="telemetry-label mono" style="font-size:10px">Persisted to DB</span>
                </div>
            </div>
        </div>
    `;

    cardRow.querySelector('.copy-text-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(text);
        showToast('Feedback text copied to clipboard');
    });

    cardRow.querySelector('.copy-json-btn').addEventListener('click', () => {
        const payload = JSON.stringify({ text, sentiment, timestamp: new Date().toISOString() }, null, 2);
        navigator.clipboard.writeText(payload);
        showToast('Telemetry JSON copied');
    });

    loadingRow.replaceWith(cardRow);
    scrollToBottom();
}

function renderErrorCard(cluster, loadingRow, errorMessage) {
    const errorRow = document.createElement('div');
    errorRow.className = 'assistant-row';
    errorRow.innerHTML = `
        <div class="assistant-avatar" style="background:var(--neg-bar)">!</div>
        <div class="assistant-content">
            <div class="error-card" role="alert">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>${escapeHtml(errorMessage)}</span>
            </div>
        </div>
    `;
    loadingRow.replaceWith(errorRow);
    scrollToBottom();
}

// ── COMPOSER & AUTO-RESIZE ───────────────────────────────────────────
function updateComposer() {
    const len = elements.composerInput.value.length;
    elements.charMeter.textContent = `${len.toLocaleString()} / 2,000`;
    elements.charMeter.classList.toggle('warn', len > 1850);
    elements.submitBtn.disabled = len === 0;

    // Auto-resize
    elements.composerInput.style.height = 'auto';
    elements.composerInput.style.height = Math.min(elements.composerInput.scrollHeight, 190) + 'px';
}

elements.composerInput.addEventListener('input', updateComposer);

elements.composerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!elements.submitBtn.disabled) {
            elements.composerForm.requestSubmit();
        }
    } else if (e.key === 'Escape') {
        elements.composerInput.value = '';
        updateComposer();
    }
});

// ── FORM SUBMISSION ──────────────────────────────────────────────────
elements.composerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawText = elements.composerInput.value.trim();
    if (!rawText) return;

    // Reset input immediately
    elements.composerInput.value = '';
    updateComposer();
    elements.submitBtn.disabled = true;

    // Append to UI
    const cluster = appendUserMessage(rawText);
    const loadingRow = appendLoadingIndicator(cluster);

    try {
        const response = await fetch('/api/Feedback/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ feedbackText: rawText })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(errText || `Server responded with status ${response.status}`);
        }

        const data = await response.json();
        renderResultCard(cluster, loadingRow, rawText, data.sentiment);
        recordAnalysis(rawText, data.sentiment);

    } catch (err) {
        renderErrorCard(
            cluster,
            loadingRow,
            err.message || 'Unable to establish connection with the feedback classification API.'
        );
    } finally {
        updateComposer();
        elements.composerInput.focus();
    }
});

// ── SAMPLE BENCHMARK BUTTONS ─────────────────────────────────────────
document.querySelectorAll('.sample-card').forEach(card => {
    card.addEventListener('click', () => {
        elements.composerInput.value = card.dataset.text || '';
        updateComposer();
        elements.composerInput.focus();
    });
});

// ── NEW ANALYSIS / CLEAR ─────────────────────────────────────────────
function startNewAnalysis() {
    elements.stream.innerHTML = '';
    if (elements.emptyState) elements.emptyState.hidden = false;
    elements.composerInput.value = '';
    updateComposer();
    elements.composerInput.focus();
    showToast('Workspace reset');
}

elements.newAnalysisBtn.addEventListener('click', startNewAnalysis);

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        startNewAnalysis();
    }
});

// ── CLEAR HISTORY ────────────────────────────────────────────────────
elements.clearHistoryBtn.addEventListener('click', () => {
    if (analysisHistory.length === 0) return;
    if (confirm('Clear all session analysis history?')) {
        analysisHistory = [];
        saveHistory();
        renderHistoryList();
        showToast('History cleared');
    }
});

// ── SIDEBAR TOGGLE ───────────────────────────────────────────────────
function toggleSidebar(forceState) {
    const isCollapsed = typeof forceState === 'boolean'
        ? !forceState
        : elements.sidebar.classList.toggle('is-collapsed');

    if (typeof forceState === 'boolean') {
        elements.sidebar.classList.toggle('is-collapsed', isCollapsed);
    }

    localStorage.setItem(STORAGE_KEYS.SIDEBAR_COLLAPSED, isCollapsed ? 'true' : 'false');
}

elements.sidebarToggleBtn.addEventListener('click', () => toggleSidebar());

// ── THEME SWITCHER EVENT LISTENERS ───────────────────────────────────
elements.themeLightBtn.addEventListener('click', () => setTheme('light'));
elements.themeDarkBtn.addEventListener('click', () => setTheme('dark'));
elements.themeSystemBtn.addEventListener('click', () => setTheme('system'));

// ── INITIALIZATION ───────────────────────────────────────────────────
function init() {
    initTheme();
    loadHistory();
    renderHistoryList();

    const savedCollapsed = localStorage.getItem(STORAGE_KEYS.SIDEBAR_COLLAPSED) === 'true';
    if (savedCollapsed) {
        elements.sidebar.classList.add('is-collapsed');
    }

    updateComposer();
    elements.composerInput.focus();
}

document.addEventListener('DOMContentLoaded', init);
init();
