const form = document.getElementById('feedback-form');
const feedbackText = document.getElementById('feedback-text');
const characterCount = document.getElementById('character-count');
const analyzeButton = form.querySelector('button[type="submit"]');
const buttonLabel = document.getElementById('button-label');
const emptyResult = document.getElementById('empty-result');
const analysisResult = document.getElementById('analysis-result');
const errorMessage = document.getElementById('error-message');
const resultTitle = document.getElementById('result-title');
const resultIcon = document.getElementById('result-icon');
const sentimentLabel = document.getElementById('sentiment-label');
const sentimentMeterFill = document.getElementById('sentiment-meter-fill');
const resultDescription = document.getElementById('result-description');
const resetButton = document.getElementById('reset-button');
const settingsButton = document.getElementById('settings-button');
const settingsPanel = document.getElementById('settings-panel');
const settingsClose = document.getElementById('settings-close');
const backgroundColor = document.getElementById('background-color');
const backgroundColorValue = document.getElementById('background-color-value');
const fontSize = document.getElementById('font-size');
const fontSizeValue = document.getElementById('font-size-value');
const resetSettings = document.getElementById('reset-settings');

const defaultPreferences = {
    theme: 'light',
    backgroundColor: '#f7f8fc',
    fontSize: '100',
    density: 'comfortable'
};
const preferenceKey = 'sentiment-studio-preferences';

function savePreferences(preferences) {
    localStorage.setItem(preferenceKey, JSON.stringify(preferences));
}

function getPreferences() {
    try {
        return { ...defaultPreferences, ...JSON.parse(localStorage.getItem(preferenceKey) || '{}') };
    } catch {
        return { ...defaultPreferences };
    }
}

function selectOption(selector, attribute, value) {
    document.querySelectorAll(selector).forEach((option) => {
        option.classList.toggle('is-selected', option.dataset[attribute] === value);
    });
}

function applyPreferences(preferences) {
    document.body.dataset.theme = preferences.theme;
    document.body.style.setProperty('--page-background', preferences.backgroundColor);
    document.body.style.setProperty('--font-scale', `${Number(preferences.fontSize) / 100}`);
    document.body.classList.remove('density-compact', 'density-comfortable', 'density-spacious');
    document.body.classList.add(`density-${preferences.density}`);
    backgroundColor.value = preferences.backgroundColor;
    backgroundColorValue.textContent = preferences.backgroundColor.toUpperCase();
    fontSize.value = preferences.fontSize;
    fontSizeValue.textContent = `${preferences.fontSize}%`;
    selectOption('.theme-option', 'theme', preferences.theme);
    selectOption('.density-options button', 'density', preferences.density);
    document.querySelectorAll('.color-swatch').forEach((swatch) => {
        swatch.classList.toggle('is-selected', swatch.dataset.color.toLowerCase() === preferences.backgroundColor.toLowerCase());
    });
}

function updatePreference(name, value) {
    const preferences = getPreferences();
    preferences[name] = value;
    savePreferences(preferences);
    applyPreferences(preferences);
}

function toggleSettings(isOpen) {
    settingsPanel.hidden = !isOpen;
    settingsButton.setAttribute('aria-expanded', String(isOpen));
}

settingsButton.addEventListener('click', () => toggleSettings(settingsPanel.hidden));
settingsClose.addEventListener('click', () => toggleSettings(false));
document.querySelectorAll('.theme-option').forEach((option) => {
    option.addEventListener('click', () => updatePreference('theme', option.dataset.theme));
});
document.querySelectorAll('.density-options button').forEach((option) => {
    option.addEventListener('click', () => updatePreference('density', option.dataset.density));
});
document.querySelectorAll('.color-swatch').forEach((swatch) => {
    swatch.addEventListener('click', () => updatePreference('backgroundColor', swatch.dataset.color));
});
backgroundColor.addEventListener('input', () => updatePreference('backgroundColor', backgroundColor.value));
fontSize.addEventListener('input', () => updatePreference('fontSize', fontSize.value));
resetSettings.addEventListener('click', () => {
    savePreferences(defaultPreferences);
    applyPreferences(defaultPreferences);
});

const sentimentStyles = {
    positive: {
        title: 'That feels positive.',
        icon: '↗',
        description: 'This feedback carries an encouraging and optimistic tone.',
        color: '#15956d',
        meter: '88%'
    },
    negative: {
        title: 'That feels negative.',
        icon: '↘',
        description: 'This feedback suggests an opportunity to listen, improve, and follow up.',
        color: '#e15f52',
        meter: '28%'
    },
    neutral: {
        title: 'That feels neutral.',
        icon: '→',
        description: 'This feedback is balanced or factual without a strong emotional signal.',
        color: '#c28a24',
        meter: '56%'
    }
};

function updateCharacterCount() {
    characterCount.textContent = `${feedbackText.value.length.toLocaleString()} / 2,000`;
}

function getSentimentStyle(sentiment) {
    const normalized = String(sentiment || '').toLowerCase();
    if (normalized.includes('positive')) return sentimentStyles.positive;
    if (normalized.includes('negative')) return sentimentStyles.negative;
    return sentimentStyles.neutral;
}

function showError(message) {
    emptyResult.hidden = true;
    analysisResult.hidden = true;
    errorMessage.textContent = message;
    errorMessage.hidden = false;
    resultTitle.textContent = 'Something went wrong.';
    resultIcon.textContent = '!';
}

function showResult(sentiment) {
    const style = getSentimentStyle(sentiment);
    emptyResult.hidden = true;
    errorMessage.hidden = true;
    analysisResult.hidden = false;
    resultTitle.textContent = style.title;
    resultIcon.textContent = style.icon;
    sentimentLabel.textContent = sentiment || 'Neutral';
    sentimentLabel.style.color = style.color;
    sentimentMeterFill.style.width = style.meter;
    sentimentMeterFill.style.background = style.color;
    resultDescription.textContent = style.description;
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = feedbackText.value.trim();
    if (!text) return;

    analyzeButton.disabled = true;
    buttonLabel.textContent = 'Analyzing...';
    errorMessage.hidden = true;

    try {
        const response = await fetch('/api/Feedback/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ feedbackText: text })
        });

        if (!response.ok) {
            const message = await response.text();
            throw new Error(message || 'The analysis request could not be completed.');
        }

        const result = await response.json();
        showResult(result.sentiment);
    } catch (error) {
        showError(error.message || 'Unable to connect to the sentiment service. Please try again.');
    } finally {
        analyzeButton.disabled = false;
        buttonLabel.textContent = 'Analyze sentiment';
    }
});

feedbackText.addEventListener('input', updateCharacterCount);
resetButton.addEventListener('click', () => {
    feedbackText.value = '';
    updateCharacterCount();
applyPreferences(getPreferences());
    feedbackText.focus();
    emptyResult.hidden = false;
    analysisResult.hidden = true;
    errorMessage.hidden = true;
    resultTitle.textContent = 'Your insight will appear here';
    resultIcon.textContent = '◎';
});

updateCharacterCount();
