// Nutrition Converter App
// Constants
const KJ_PER_KCAL = 4.184;
const G_PER_OZ = 28.3495;
const ACTIVITY_FACTORS = { 
    sedentary: 1.2, 
    light: 1.375, 
    moderate: 1.55, 
    very: 1.725, 
    extra: 1.9 
};
const MACRO_ENERGY = {
    protein: 4,
    carbs: 4,
    fat: 9,
    sugars: 0 // informational only
};

// Daily Log Constants
const LS_TARGET = 'nutrition:dailyTarget';
const LS_LOG = 'nutrition:dailyLog:v2';

// Helper Functions
const toNumber = (str) => {
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
};

const round1 = (n) => Math.round(n * 10) / 10;
const r0 = (n) => Math.round(n);  // kcal whole numbers
const r1 = (n) => Math.round(n * 10) / 10; // for kJ

const formatEnergy = (n, unit) => `${round1(n)} ${unit}`;

// TDEE Helper Functions
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const isPartial = (raw) => raw === '' || raw.endsWith('.') || raw === '-' || raw === '-.';
const readNum = (el) => {
  const raw = el.value.trim();
  if (isPartial(raw)) return { value: NaN, partial: true };
  const n = Number(raw);
  return { value: Number.isFinite(n) ? n : NaN, partial: false };
};

const toKj = (kcal) => r1(kcal * KJ_PER_KCAL);

function bmrMifflin({ sex, kg, cm, age }) {
    return sex === 'm'
        ? (10 * kg + 6.25 * cm - 5 * age + 5)
        : (10 * kg + 6.25 * cm - 5 * age - 161);
}

function setPair(kcalId, kjId, kcal) {
    const elKcal = document.getElementById(kcalId);
    const elKj = document.getElementById(kjId);
    if (elKcal) elKcal.textContent = `${r0(kcal)} kcal`;
    if (elKj) elKj.textContent = `${toKj(kcal)} kJ`;
}

function clampOnBlur(el, min, max, integer = false) {
    el.addEventListener('blur', () => {
        const r = readNum(el);
        if (!Number.isFinite(r.value)) return; // empty/invalid → leave
        let v = clamp(r.value, min, max);
        if (integer) v = Math.round(v);
        el.value = v;           // write back only now
        computeTDEE();          // recompute after clamping
    });
}

const saveLS = (key, value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.warn('Failed to save to localStorage:', e);
    }
};

const loadLS = (key, defaultValue = null) => {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
        console.warn('Failed to load from localStorage:', e);
        return defaultValue;
    }
};

const copyText = async (text) => {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        return true;
    }
};

const maybeShare = async ({ title, text }) => {
    if (navigator.share) {
        try {
            await navigator.share({ title, text });
            return true;
        } catch (e) {
            if (e.name !== 'AbortError') {
                console.warn('Share failed:', e);
            }
        }
    }
    return false;
};

// Theme Management
const handleThemeToggle = () => {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    html.setAttribute('data-theme', newTheme);
    saveLS('nutrition:theme', newTheme);
    
    // Force Tailwind to re-evaluate dark mode classes
    if (newTheme === 'dark') {
        html.classList.add('dark');
    } else {
        html.classList.remove('dark');
    }
};

// Reset Functions
const resetKcalKj = () => {
    const kcal = document.getElementById('kcal-input');
    const kj = document.getElementById('kj-input');
    kcal.value = '';
    kj.value = '';
    kcal.focus();
    renderKcalKj(); // ensure outputs show 0.0
};



// Module 1: Kcal ↔ kJ Converter
const initConverter = () => {
    const kcalInput = document.getElementById('kcal-input');
    const kjInput = document.getElementById('kj-input');
    const resetBtn = document.getElementById('reset-converter');
    
    let updating = false;
    
    const updateFromKcal = () => {
        if (updating) return;
        updating = true;
        
        const kcal = toNumber(kcalInput.value);
        if (kcal >= 0) {
            const kj = kcal * KJ_PER_KCAL;
            kjInput.value = round1(kj);
        }
        
        updating = false;
    };
    
    const updateFromKj = () => {
        if (updating) return;
        updating = true;
        
        const kj = toNumber(kjInput.value);
        if (kj >= 0) {
            const kcal = kj / KJ_PER_KCAL;
            kcalInput.value = round1(kcal);
        }
        
        updating = false;
    };
    
    const renderKcalKj = () => {
        // This function ensures outputs are properly formatted
        // Called after reset to show 0.0 values
    };
    
    kcalInput.addEventListener('input', updateFromKcal);
    kjInput.addEventListener('input', updateFromKj);
    resetBtn.addEventListener('click', resetKcalKj);
};

// Module 2: Daily Calorie Targets (BMR/TDEE)
function computeTDEE() {
    const sex = document.getElementById('sex-m').checked ? 'm' : 'f';
    
    // Read values with readNum() - no writing back during input events
    const ageEl = document.getElementById('tdee-age');
    const htEl = document.getElementById('tdee-height');
    const wtEl = document.getElementById('tdee-weight');
    
    const ageR = readNum(ageEl);
    const htR = readNum(htEl);
    const wtR = readNum(wtEl);
    
    const ageMin = 14, ageMax = 90, htMin = 120, htMax = 220, wtMin = 35, wtMax = 250;
    
    const ageUse = Number.isFinite(ageR.value) ? clamp(ageR.value, ageMin, ageMax) : NaN;
    const htUse = Number.isFinite(htR.value) ? clamp(htR.value, htMin, htMax) : NaN;
    const wtUse = Number.isFinite(wtR.value) ? clamp(wtR.value, wtMin, wtMax) : NaN;
    
    if (!Number.isFinite(ageUse) || !Number.isFinite(htUse) || !Number.isFinite(wtUse)) {
        setPair('tdee-maint-kcal', 'tdee-maint-kj', 0);
        setPair('tdee-slow-kcal', 'tdee-slow-kj', 0);
        setPair('tdee-mod-kcal', 'tdee-mod-kj', 0);
        setPair('tdee-rapid-kcal', 'tdee-rapid-kj', 0);
        document.getElementById('tdee-rapid-warn')?.classList.add('hidden');
        return;
    }
    
    const act = document.getElementById('tdee-activity').value || 'sedentary';
    
    const bmr = bmrMifflin({ sex, kg: wtUse, cm: htUse, age: ageUse });
    const tdee = bmr * (ACTIVITY_FACTORS[act] || 1.2);
    
    const slowDef = 550, modDef = 825, rapidDef = 1100;
    const targets = {
        maintain: r0(tdee),
        slow: r0(Math.max(0, tdee - slowDef)),
        moderate: r0(Math.max(0, tdee - modDef)),
        rapid: r0(Math.max(0, tdee - rapidDef)),
    };
    
    // safety floors
    const floor = sex === 'm' ? 1500 : 1200;
    const minSafe = Math.max(r0(bmr), floor);
    const flagRapid = targets.rapid < minSafe;
    
    // write UI
    setPair('tdee-maint-kcal', 'tdee-maint-kj', targets.maintain);
    setPair('tdee-slow-kcal', 'tdee-slow-kj', targets.slow);
    setPair('tdee-mod-kcal', 'tdee-mod-kj', targets.moderate);
    setPair('tdee-rapid-kcal', 'tdee-rapid-kj', targets.rapid);
    document.getElementById('tdee-rapid-warn').classList.toggle('hidden', !flagRapid);
    
    // return for tests
    return { bmr: r0(bmr), tdee: r0(tdee), targets, minSafe };
}

function resetTDEE() {
    document.getElementById('sex-m').checked = true;
    ['tdee-age', 'tdee-height', 'tdee-weight'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('tdee-activity').value = 'sedentary';
    ['tdee-maint-kcal', 'tdee-slow-kcal', 'tdee-mod-kcal', 'tdee-rapid-kcal'].forEach(id => document.getElementById(id).textContent = '0 kcal');
    ['tdee-maint-kj', 'tdee-slow-kj', 'tdee-mod-kj', 'tdee-rapid-kj'].forEach(id => document.getElementById(id).textContent = '0 kJ');
    document.getElementById('tdee-rapid-warn').classList.add('hidden');
}

const initTDEE = () => {
    // Bind compute on input
    ['tdee-age', 'tdee-height', 'tdee-weight'].forEach(id => {
        const el = document.getElementById(id);
        el.addEventListener('input', computeTDEE);
    });
    document.getElementById('sex-m').addEventListener('change', computeTDEE);
    document.getElementById('sex-f').addEventListener('change', computeTDEE);
    document.getElementById('tdee-activity').addEventListener('change', computeTDEE);

    // Bind blur clamping
    clampOnBlur(document.getElementById('tdee-age'), 14, 90, true);
    clampOnBlur(document.getElementById('tdee-height'), 120, 220, false);
    clampOnBlur(document.getElementById('tdee-weight'), 35, 250, false);

    // initial render
    computeTDEE();
};



// Daily Log v2 Helper Functions
const loadTarget = () => {
    return loadLS(LS_TARGET, { kcal: 2000 });
};

const saveTarget = (obj) => {
    saveLS(LS_TARGET, obj);
};

const loadLog = () => {
    return loadLS(LS_LOG, {});
};

const saveLog = (data) => {
    saveLS(LS_LOG, data);
};

const addEntry = (dateISO, value, unit) => {
    const data = loadLog();
    const kcal = unit === 'kJ' ? (value / KJ_PER_KCAL) : value;
    const entry = { 
        id: crypto.randomUUID(), 
        at: Date.now(), 
        kcal: Math.round(Math.max(0, +kcal)) 
    };
    data[dateISO] ??= { entries: [] };
    data[dateISO].entries.push(entry);
    saveLog(data);
    renderDaily();
};

const removeEntry = (dateISO, id) => {
    const data = loadLog();
    if (!data[dateISO]) return;
    data[dateISO].entries = data[dateISO].entries.filter(e => e.id !== id);
    saveLog(data);
    renderDaily();
};

const clearDay = (dateISO) => {
    const data = loadLog();
    delete data[dateISO];
    saveLog(data);
    renderDaily();
};

const getTotals = (dateISO) => {
    const data = loadLog();
    const target = loadTarget().kcal || 0;
    const entries = (data[dateISO]?.entries || []);
    const consumed = entries.reduce((t, e) => t + e.kcal, 0);
    const pct = target ? Math.min(100, Math.round((consumed / target) * 100)) : 0;
    const remaining = Math.max(0, target - consumed);
    const over = Math.max(0, consumed - target);
    return { target, consumed, pct, remaining, over, entries };
};

const getProgressBarColor = (pct) => {
    if (pct < 70) return 'bg-success';
    if (pct <= 100) return 'bg-warning';
    return 'bg-danger';
};

const renderDaily = () => {
    const dateISO = document.getElementById('daily-date').value;
    const unit = document.getElementById('daily-unit').value;
    const { target, consumed, pct, remaining, over, entries } = getTotals(dateISO);
    
    // Convert for display
    const targetDisp = unit === 'kJ' ? r1(target * KJ_PER_KCAL) : r0(target);
    const consumedDisp = unit === 'kJ' ? r1(consumed * KJ_PER_KCAL) : r0(consumed);
    const remainingDisp = unit === 'kJ' ? r1(remaining * KJ_PER_KCAL) : r0(remaining);
    const overDisp = unit === 'kJ' ? r1(over * KJ_PER_KCAL) : r0(over);
    
    // Update progress bar
    const progressFill = document.getElementById('daily-progress-fill');
    progressFill.style.width = `${Math.min(100, pct)}%`;
    progressFill.className = `h-full ${getProgressBarColor(pct)} transition-[width] duration-300 ease-out`;
    
    const pb = document.getElementById('daily-progress');
    pb.setAttribute('aria-valuenow', String(pct));
    
    // Update progress text
    const progressText = document.getElementById('daily-progress-text');
    const statusText = over > 0 ? `${overDisp} ${unit} over` : `${remainingDisp} ${unit} remaining`;
    progressText.textContent = `${consumedDisp} / ${targetDisp} ${unit} (${pct}%) • ${statusText}`;
    
    // Render entries list
    const list = document.getElementById('daily-entries');
    if (entries.length === 0) {
        list.innerHTML = '<li class="text-muted text-sm py-2">No entries for this date</li>';
    } else {
        list.innerHTML = entries.map(e => {
            const v = unit === 'kJ' ? r1(e.kcal * KJ_PER_KCAL) : r0(e.kcal);
            return `<li class="flex items-center justify-between py-2 px-3 bg-surface2 rounded-lg">
                <span class="text-text">${new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span class="font-medium text-primary">${v} ${unit}</span>
                <button class="delete-entry inline-flex items-center justify-center rounded-lg bg-danger px-2 py-1 text-xs font-medium text-white hover:bg-danger/90 focus:outline-none focus:ring-2 focus:ring-danger/50 transition-colors" data-id="${e.id}">Delete</button>
            </li>`;
        }).join('');
        
        // Bind delete buttons
        list.querySelectorAll('.delete-entry').forEach(btn => {
            btn.addEventListener('click', () => removeEntry(dateISO, btn.dataset.id));
        });
    }
};

const copyDailySummary = async () => {
    const dateISO = document.getElementById('daily-date').value;
    const unit = document.getElementById('daily-unit').value;
    const { target, consumed, pct, remaining, over, entries } = getTotals(dateISO);
    
    const targetDisp = unit === 'kJ' ? r1(target * KJ_PER_KCAL) : r0(target);
    const consumedDisp = unit === 'kJ' ? r1(consumed * KJ_PER_KCAL) : r0(consumed);
    const remainingDisp = unit === 'kJ' ? r1(remaining * KJ_PER_KCAL) : r0(remaining);
    const overDisp = unit === 'kJ' ? r1(over * KJ_PER_KCAL) : r0(over);
    
    const date = new Date(dateISO).toLocaleDateString();
    const statusText = over > 0 ? `${overDisp} ${unit} over target` : `${remainingDisp} ${unit} remaining`;
    
    let summary = `Daily Log - ${date}\n`;
    summary += `Target: ${targetDisp} ${unit}\n`;
    summary += `Consumed: ${consumedDisp} ${unit} (${pct}%)\n`;
    summary += `Status: ${statusText}\n\n`;
    
    if (entries.length > 0) {
        summary += `Entries:\n`;
        entries.forEach(e => {
            const v = unit === 'kJ' ? r1(e.kcal * KJ_PER_KCAL) : r0(e.kcal);
            const time = new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            summary += `• ${time}: ${v} ${unit}\n`;
        });
    } else {
        summary += `No entries for this date.`;
    }
    
    const success = await copyText(summary);
    if (success) {
        // Optional: Show a brief success indicator
        const btn = document.getElementById('copy-daily-summary');
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = originalText; }, 1000);
    }
};

const printDaily = () => {
    document.body.classList.add('printing-daily');
    window.print();
    window.addEventListener('afterprint', () => document.body.classList.remove('printing-daily'), { once: true });
};

// Module 4: Daily Log v2
const initDaily = () => {
    const dailyTarget = document.getElementById('daily-target');
    const dailyDate = document.getElementById('daily-date');
    const dailyUnit = document.getElementById('daily-unit');
    const dailyEntryValue = document.getElementById('daily-entry-value');
    const dailyEntryUnit = document.getElementById('daily-entry-unit');
    const addEntryBtn = document.getElementById('add-daily-entry');
    
    // Set today's date
    const today = new Date().toISOString().split('T')[0];
    dailyDate.value = today;
    
    const updateTarget = () => {
        const target = toNumber(dailyTarget.value);
        if (target >= 0) {
            saveTarget({ kcal: target });
            renderDaily();
        }
    };
    
    const handleAddEntry = () => {
        const value = toNumber(dailyEntryValue.value);
        const unit = dailyEntryUnit.value;
        
        if (value > 0) {
            addEntry(dailyDate.value, value, unit);
            dailyEntryValue.value = '';
        }
    };
    
    const handlePresetClick = (e) => {
        const value = toNumber(e.target.dataset.value);
        const unit = dailyEntryUnit.value;
        const currentValue = toNumber(dailyEntryValue.value) || 0;
        dailyEntryValue.value = currentValue + value;
    };
    
    // Event listeners
    dailyTarget.addEventListener('input', updateTarget);
    dailyDate.addEventListener('change', renderDaily);
    dailyUnit.addEventListener('change', renderDaily);
    dailyEntryValue.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAddEntry();
    });
    addEntryBtn.addEventListener('click', handleAddEntry);
    
    // Preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', handlePresetClick);
    });
    
    // Load saved target
    const savedTarget = loadTarget();
    if (savedTarget.kcal) {
        dailyTarget.value = savedTarget.kcal;
    }
    
    // Initial render
    renderDaily();
};

// Module 5: Favorites
const initFavorites = () => {
    const nameInput = document.getElementById('favorite-name');
    const energyInput = document.getElementById('favorite-energy');
    const energyUnitSelect = document.getElementById('favorite-energy-unit');
    const perSelect = document.getElementById('favorite-per');
    const saveBtn = document.getElementById('save-favorite');
    const searchInput = document.getElementById('favorite-search');
    const favoritesList = document.getElementById('favorites-list');
    
    let favorites = loadLS('nutrition:favorites:v1', []);
    
    const saveFavorite = () => {
        const name = nameInput.value.trim();
        const energy = toNumber(energyInput.value);
        
        if (!name || energy <= 0) {
            alert('Please enter a name and valid energy value');
            return;
        }
        
        const favorite = {
            id: Date.now(),
            name,
            energy,
            unit: energyUnitSelect.value,
            per: perSelect.value
        };
        
        favorites.push(favorite);
        saveLS('nutrition:favorites:v1', favorites);
        
        // Clear form
        nameInput.value = '';
        energyInput.value = '';
        
        renderFavorites();
    };
    
    const deleteFavorite = (id) => {
        favorites = favorites.filter(f => f.id !== id);
        saveLS('nutrition:favorites:v1', favorites);
        renderFavorites();
    };
    
    const loadFavorite = (favorite) => {
        // Note: Serving module has been removed
        console.log('Favorite loaded:', favorite);
        // Could be extended to load into other modules in the future
    };
    
    const renderFavorites = () => {
        const searchTerm = searchInput.value.toLowerCase();
        const filtered = favorites.filter(f => 
            f.name.toLowerCase().includes(searchTerm)
        );
        
        favoritesList.innerHTML = filtered.map(favorite => `
            <div class="flex items-center justify-between p-3 bg-surface2 rounded-lg border border-border hover:border-primary/30 transition-colors duration-200">
                <div class="flex-1">
                    <div class="font-medium">${favorite.name}</div>
                    <div class="text-sm text-muted">
                        ${formatEnergy(favorite.energy, favorite.unit)} per ${favorite.per}
                    </div>
                </div>
                <div class="flex space-x-2">
                    <button onclick="loadFavorite(${JSON.stringify(favorite).replace(/"/g, '&quot;')})" 
                            class="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 hover:shadow-md hover:shadow-primary/25">
                        Load
                    </button>
                    <button onclick="deleteFavorite(${favorite.id})" 
                            class="inline-flex items-center justify-center rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white hover:bg-danger/90 focus:outline-none focus:ring-2 focus:ring-danger/50 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 hover:shadow-md hover:shadow-danger/25">
                        Delete
                    </button>
                </div>
            </div>
        `).join('');
    };
    
    saveBtn.addEventListener('click', saveFavorite);
    searchInput.addEventListener('input', renderFavorites);
    
    // Initial render
    renderFavorites();
    
    // Make functions globally available for onclick handlers
    window.loadFavorite = loadFavorite;
    window.deleteFavorite = deleteFavorite;
};



// PWA Support
const initPWA = () => {
    // Register service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js')
            .then(registration => {
                console.log('SW registered:', registration);
            })
            .catch(error => {
                console.log('SW registration failed:', error);
            });
    }
    
    // Install prompt
    let deferredPrompt;
    const installPrompt = document.getElementById('install-prompt');
    const installBtn = document.getElementById('install-btn');
    
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        installPrompt.classList.remove('hidden');
    });
    
    installBtn.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                installPrompt.classList.add('hidden');
            }
            deferredPrompt = null;
        }
    });
    
    window.addEventListener('appinstalled', () => {
        installPrompt.classList.add('hidden');
        deferredPrompt = null;
    });
};

// Initialize everything
const init = () => {
    // Restore theme
    const savedTheme = loadLS('nutrition:theme', 'light');
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    // Set Tailwind dark mode class
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    
    // Initialize modules
    initConverter();
    initTDEE();
    initDaily();
    initFavorites();
    initPWA();
    
    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', handleThemeToggle);
    
    console.log('Nutrition Converter initialized');
};

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
