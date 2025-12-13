// --- CONFIGURAZIONE ---
const SUPABASE_URL = 'https://vdihgygqxjuhnppwktlq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkaWhneWdxeGp1aG5wcHdrdGxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwNDYyNzYsImV4cCI6MjA4MDYyMjI3Nn0.A-emTugF0lfrfHlIm7M6HXUFNwaDs_TRPE3NvLqJo2o';
const ADMIN_EMAIL = 'clauditavi@gmail.com';
const API_KEY = 'ebb1182d1fd6d6878f58136f06d5956e';

// --- VARIABILI GLOBALI ---
let supabase;
let allData = [];
let filteredData = [];
let userLibrary = new Map();
let currentSort = { key: 'retirement_date', direction: 'asc' };
let showOnlyCollection = false;
let showOnlyExclusives = false;
let currentUserEmail = "";
let currentEditingCod = null;
let viewMode = 'table'; 
let charts = {};

// --- INIZIALIZZAZIONE ---
try {
    if (window.supabase) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
            auth: { persistSession: true, storage: window.localStorage, autoRefreshToken: true, detectSessionInUrl: true }
        });
    }
} catch (err) { console.error("Errore inizializzazione Supabase:", err); }

window.onload = function() {
    try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
        window.initDarkMode();
        
        // Listener
        const sInput = document.getElementById('searchInput'); if(sInput) sInput.addEventListener('input', window.applyFilters);
        const tFilter = document.getElementById('themeFilter'); if(tFilter) tFilter.addEventListener('change', window.applyFilters);
        const yFilter = document.getElementById('yearFilter'); if(yFilter) yFilter.addEventListener('change', window.applyFilters);
        const cInput = document.getElementById('csvInput'); if(cInput) cInput.addEventListener('change', window.handleCsvUpload);
        const pwInput = document.getElementById('password'); if(pwInput) pwInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') window.handleAuth('login'); });

        if (supabase) {
            supabase.auth.onAuthStateChange((event, session) => {
                if (['SIGNED_IN', 'TOKEN_REFRESHED', 'INITIAL_SESSION'].includes(event)) {
                    if (session && session.user) window.unlockApp(session.user.email);
                }
            });
            window.checkSession();
        }
    } catch(e) { console.error("Init Error: ", e); }
};

// --- FUNZIONI GLOBALI (ESPOSTE A WINDOW) ---

window.safeUpdate = function(id, val) { const el = document.getElementById(id); if (el) el.innerText = val; }
window.formatDateItalian = function(d) { if (!d) return "-"; const date = new Date(d); return isNaN(date.getTime()) ? d : date.toLocaleDateString('it-IT'); }

window.initDarkMode = function() {
    if (localStorage.getItem('color-theme') === 'dark' || (!('color-theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    }
}

window.checkSession = async function() { 
    if(!supabase) return;
    const { data } = await supabase.auth.getSession(); 
    if (data.session) window.unlockApp(data.session.user.email); 
}

window.handleAuth = async function(type) {
    if (!supabase) return alert("Errore: Database non connesso.");
    const email = document.getElementById('email').value.trim(); 
    const password = document.getElementById('password').value.trim();
    if (!email || !password) return alert("Inserisci dati");
    
    try {
        const { data, error } = type === 'login' 
            ? await supabase.auth.signInWithPassword({ email, password }) 
            : await supabase.auth.signUp({ email, password });
            
        if(error) throw error;
        if(data.session) window.unlockApp(data.session.user.email);
        else if(type === 'signup') alert("Controlla la tua email!");
    } catch(e) { alert(e.message); }
}

window.unlockApp = function(email) {
    currentUserEmail = email;
    if (!localStorage.getItem(`itavix_welcome_seen_${currentUserEmail}`)) document.getElementById('welcomeOverlay').classList.remove('hidden');
    
    if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) { 
        ['btnAdmin', 'btnAddSet', 'btnUpdateMinifigs'].forEach(id => {
            const el = document.getElementById(id); if(el) el.classList.remove('hidden');
        }); 
    }
    
    document.getElementById('loginOverlay').classList.add('hidden');
    document.getElementById('appContent').classList.remove('blur-content', 'opacity-50');
    document.getElementById('userEmailDisplay').innerText = `Utente: ${email}`;
    
    window.loadLastUpdateDate(); 
    window.loadLibrary().then(() => { 
        window.fetchAllData(); 
        window.updateCharts(); 
    });
}

window.logout = async function() { if(supabase) await supabase.auth.signOut(); location.reload(); }

window.loadLibrary = async function() {
    if(!supabase) return;
    const { data } = await supabase.from('user_favorites').select('set_cod, status, quantity, paid').eq('user_email', currentUserEmail);
    if (data) { 
        userLibrary = new Map(); 
        data.forEach(row => userLibrary.set(row.set_cod, { status: row.status || 'wanted', qty: row.quantity || 1, paid: row.paid || 0 })); 
    }
}

window.fetchAllData = async function() {
    if(!supabase) return;
    const loader = document.getElementById('tableLoader'); 
    if(loader) loader.classList.remove('hidden');
    
    let allRows = []; let from = 0; const step = 1000; let keep = true;
    try {
        while (keep) {
            const { data, error } = await supabase.from('lego_sets').select('*').range(from, from + step - 1);
            if (error) throw new Error(error.message);
            if (data && data.length > 0) { allRows = allRows.concat(data); from += step; if (data.length < step) keep = false; } else { keep = false; }
        }
        window.processData(allRows);
    } catch (e) { alert("Errore caricamento: " + e.message); } 
    finally { if(loader) loader.classList.add('hidden'); }
}

window.processData = function(data) {
    allData = data.map(item => ({ ...item, _date: new Date(item.retirement_date || '2099-12-31'), _search: ((item.set_name || '') + ' ' + item.cod).toLowerCase(), _price: parseFloat(item.price || 0), _market: parseFloat(item.market_price || item.price || 0), _img: `https://images.brickset.com/sets/images/${item.cod}-1.jpg` }));
    
    const themes = [...new Set(allData.map(d => d.theme).filter(Boolean))].sort(); 
    const years = [...new Set(allData.map(d => d._date.getFullYear()))].sort().filter(y => !isNaN(y) && y < 2099);
    
    document.getElementById('themeFilter').innerHTML = '<option value="all">Tutti i Temi</option>' + themes.map(t => `<option value="${t}">${t}</option>`).join(''); 
    document.getElementById('yearFilter').innerHTML = '<option value="all">Tutti gli Anni</option>' + years.map(y => `<option value="${y}">${y}</option>`).join(''); 
    document.getElementById('newSetTheme').innerHTML = '<option value="">Seleziona...</option>' + themes.map(t => `<option value="${t}">${t}</option>`).join('');
    
    window.applyFilters();
}

window.loadLastUpdateDate = async function() { 
    if(!supabase) return;
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'last_data_update').single(); 
    if (data) safeUpdate('lastUpdateDate', new Date(data.value).toLocaleDateString('it-IT')); 
}

window.toggleViewMode = function() {
    viewMode = viewMode === 'table' ? 'grid' : 'table';
    document.getElementById('viewIcon').setAttribute('data-lucide', viewMode === 'table' ? 'layout-grid' : 'list');
    if(window.lucide) window.lucide.createIcons();
    window.render();
}

window.toggleDarkMode = function() {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('color-theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
}

window.toggleDashboard = function() { 
    document.getElementById('dashboardPanel').classList.toggle('hidden'); 
    window.updateCharts(); 
}

window.toggleViewFavorites = function() { 
    showOnlyCollection = !showOnlyCollection; showOnlyExclusives = false; 
    document.getElementById('exclBtnText').innerText = "Esclusive"; 
    document.getElementById('btnToggleExcl').className = "flex items-center px-3 py-2 bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 rounded-lg hover:bg-indigo-200 transition gap-2 text-xs md:text-sm font-bold";
    document.getElementById('favBtnText').innerText = showOnlyCollection ? "Mostra Tutti" : "Collezione"; 
    document.getElementById('btnToggleFavs').className = showOnlyCollection ? "p-2 bg-purple-600 text-white rounded flex items-center gap-1 font-bold text-xs" : "p-2 bg-yellow-100 text-yellow-800 rounded flex items-center gap-1 font-bold text-xs"; 
    window.applyFilters(); 
}

window.toggleExclusives = function() { 
    showOnlyExclusives = !showOnlyExclusives; showOnlyCollection = false; 
    document.getElementById('favBtnText').innerText = "Collezione"; 
    document.getElementById('btnToggleFavs').className = "p-2 bg-yellow-100 text-yellow-800 rounded flex items-center gap-1 font-bold text-xs";
    
    const btn = document.getElementById('btnToggleExcl');
    const txt = document.getElementById('exclBtnText');
    if (showOnlyExclusives) {
        btn.className = "flex items-center px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition gap-2 text-xs md:text-sm font-bold";
        txt.innerText = "Mostra Tutti";
    } else {
        btn.className = "flex items-center px-3 py-2 bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 rounded-lg hover:bg-indigo-200 transition gap-2 text-xs md:text-sm font-bold";
        txt.innerText = "Esclusive";
    }
    window.applyFilters(); 
}

window.updateSort = function(key) {
    if (currentSort.key === key) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.key = key;
        currentSort.direction = 'asc';
    }
    window.render();
}

window.applyFilters = function() {
    const s = document.getElementById('searchInput').value.toLowerCase(); 
    const t = document.getElementById('themeFilter').value; 
    const y = document.getElementById('yearFilter').value;

    filteredData = allData.filter(d => {
        const baseMatch = d._search.includes(s) && (t === 'all' || d.theme === t) && (y === 'all' || d._date.getFullYear().toString() === y);
        if (showOnlyExclusives) return baseMatch && d.is_exclusive === true;
        if (showOnlyCollection) return baseMatch && userLibrary.has(d.cod);
        return baseMatch;
    });
    window.render(); 
    window.updateDashboardStats(); 
    window.updateCharts();
}

window.render = function() {
    const container = document.getElementById('viewContainer');
    if(!container) return;
    container.innerHTML = '';
    
    filteredData.sort((a, b) => { 
        let vA = a[currentSort.key], vB = b[currentSort.key]; 
        if (currentSort.key === 'retirement_date') { vA = a._date; vB = b._date; } 
        if (currentSort.key === 'price') { vA = a._price; vB = b._price; } 
        return (vA < vB ? -1 : 1) * (currentSort.direction === 'asc' ? 1 : -1); 
    });

    if (viewMode === 'table') window.renderTable(container); 
    else window.renderGrid(container);
    
    if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
}

window.renderTable = function(container) {
    const table = document.createElement('table');
    table.className = "w-full text-left text-sm min-w-[900px]";
    table.innerHTML = `
    <thead class="bg-gray-100 dark:bg-gray-700 sticky top-0 text-xs font-bold text-gray-600 dark:text-gray-300 uppercase">
        <tr>
            <th class="p-3 w-28 text-center">Stato</th><th class="p-3 w-14 text-center">Img</th>
            <th class="p-3 cursor-pointer hover:text-blue-500" onclick="window.updateSort('cod')">Cod</th><th class="p-3 cursor-pointer hover:text-blue-500" onclick="window.updateSort('theme')">Tema</th><th class="p-3 cursor-pointer hover:text-blue-500" onclick="window.updateSort('set_name')">Nome</th>
            <th class="p-3 text-right cursor-pointer hover:text-blue-500" onclick="window.updateSort('pieces')" title="Pezzi"><img src="brick.png" class="w-4 h-4 inline"></th>
            <th class="p-3 text-right" title="Minifigs"><img src="testa.png" class="w-4 h-4 inline"></th>
            <th class="p-3 text-right cursor-pointer hover:text-blue-500" onclick="window.updateSort('price')">Listino</th><th class="p-3 text-right cursor-pointer hover:text-blue-500" onclick="window.updateSort('market_price')">Mercato</th><th class="p-3 text-right cursor-pointer hover:text-blue-500" onclick="window.updateSort('retirement_date')">Ritiro</th>
            <th class="p-3 text-center">Azioni</th>
        </tr>
    </thead>
    <tbody class="divide-y divide-gray-100 dark:divide-gray-700 dark:text-gray-200"></tbody>`;
    
    const tbody = table.querySelector('tbody');
    
    filteredData.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-purple-50 dark:hover:bg-gray-700 transition border-b border-gray-100 dark:border-gray-700";
        
        const now = new Date(); const diffDays = Math.ceil((row._date - now) / (1000 * 60 * 60 * 24));
        let retireClass = "text-gray-600 dark:text-gray-400"; if (row._date.getFullYear() === 2025) { retireClass = diffDays < 180 ? "text-red-600 font-bold bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded" : "text-orange-600 font-bold"; }
        const lib = userLibrary.get(row.cod); const isOwned = lib && lib.status === 'owned'; const isWanted = lib && lib.status === 'wanted';
        const marketClass = (row._market > row._price) ? "text-green-600 font-bold" : "text-gray-500";

        const btnOwned = `<button onclick="window.openCollectionModal(${row.cod})" class="p-1.5 rounded-md transition ${isOwned ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' : 'text-gray-300 hover:text-green-500'}"><i data-lucide="package" class="w-4 h-4"></i></button>`;
        const btnWanted = `<button onclick="window.updateSetStatus(${row.cod}, 'wanted')" class="p-1.5 rounded-md transition ${isWanted ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'text-gray-300 hover:text-red-500'}"><i data-lucide="heart" class="w-4 h-4"></i></button>`;
        let qtyControls = isOwned ? `<div class="flex items-center gap-1 text-xs font-mono mt-1 justify-center"><button onclick="window.updateQty(${row.cod}, -1)">-</button><span class="font-bold">${lib.qty}</span><button onclick="window.updateQty(${row.cod}, 1)">+</button></div>` : '';

        tr.innerHTML = `
            <td class="p-3 text-center align-top"><div class="flex justify-center gap-1">${btnOwned}${btnWanted}</div>${qtyControls}</td>
            <td class="p-3 text-center"><img src="${row._img}" loading="lazy" class="w-10 h-10 object-contain mx-auto cursor-pointer" onclick="window.openSetDetailModal(${row.cod})"></td>
            <td class="p-3 font-mono text-blue-500">${row.cod}</td>
            <td class="p-3"><span class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs font-bold">${row.theme}</span></td>
            <td class="p-3 font-medium dark:text-white">${row.set_name} ${row.is_exclusive ? '<i data-lucide="gem" class="w-3 h-3 text-purple-500 inline"></i>' : ''}</td>
            <td class="p-3 text-right text-gray-500">${row.pieces}</td>
            <td class="p-3 text-right">${row.minifigs > 0 ? `<span class="bg-yellow-100 px-1 rounded text-xs font-bold text-yellow-800 flex items-center justify-end gap-1"><img src="testa.png" class="w-3 h-3">${row.minifigs}</span>` : '-'}</td>
            <td class="p-3 text-right font-bold dark:text-white">€ ${row._price.toFixed(2)}</td>
            <td class="p-3 text-right ${marketClass}">€ ${row._market.toFixed(2)}</td>
            <td class="p-3 text-right"><span class="${retireClass}">${window.formatDateItalian(row.retirement_date)}</span></td>
            <td class="p-3 text-center">
                <div class="flex justify-center gap-1">
                    <button onclick="window.openEditSetModal(${row.cod})" class="text-gray-400 hover:text-blue-500"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
                    <button onclick="window.deleteSet(${row.cod})" class="text-gray-300 hover:text-red-600"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    container.appendChild(table);
}

window.renderGrid = function(container) {
    const grid = document.createElement('div');
    grid.className = "grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4";
    filteredData.forEach(row => {
        const lib = userLibrary.get(row.cod); const isOwned = lib && lib.status === 'owned';
        
        const now = new Date(); const diffDays = Math.ceil((row._date - now) / (1000 * 60 * 60 * 24));
        let retireClass = "text-gray-500"; 
        if (row._date.getFullYear() === 2025) { retireClass = diffDays < 180 ? "text-red-600 font-bold" : "text-orange-600 font-bold"; }
        const dateDisplay = window.formatDateItalian(row.retirement_date);

        const card = document.createElement('div');
        card.className = "lego-card bg-white dark:bg-gray-700 rounded-xl shadow border dark:border-gray-600 overflow-hidden flex flex-col";
        
        card.innerHTML = `
            <div class="relative h-40 bg-white p-4 cursor-pointer" onclick="window.openSetDetailModal(${row.cod})">
                <img src="${row._img}" loading="lazy" class="w-full h-full object-contain hover:scale-110 transition-transform duration-300">
                ${isOwned ? `<div class="absolute top-2 right-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow">x${lib.qty}</div>` : ''}
            </div>
            <div class="p-3 flex-1 flex flex-col">
                <div class="flex justify-between items-start">
                    <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate max-w-[100px]">${row.theme}</span>
                    <span class="text-[10px] font-mono text-blue-500">${row.cod}</span>
                </div>
                <h4 class="font-bold text-sm leading-tight mt-1 mb-2 dark:text-white line-clamp-2" title="${row.set_name}">${row.set_name}</h4>
                <div class="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 mb-2">
                    <span class="${retireClass}">Ritiro: ${dateDisplay}</span>
                    <span class="flex items-center gap-1 font-bold"><img src="testa.png" class="w-3 h-3"> ${row.minifigs || 0}</span>
                </div>
                <div class="mt-auto flex items-center justify-between">
                    <span class="text-sm font-bold text-gray-800 dark:text-gray-200">€ ${row._market.toFixed(0)}</span>
                    <div class="flex gap-1">
                        <button onclick="window.openEditSetModal(${row.cod})" class="p-2 rounded-full bg-gray-100 text-gray-400 hover:bg-blue-100 hover:text-blue-600 transition"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
                        <button onclick="window.openCollectionModal(${row.cod})" class="p-2 rounded-full ${isOwned ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400 hover:bg-yellow-100 hover:text-yellow-600'} transition"><i data-lucide="package" class="w-4 h-4"></i></button>
                    </div>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
    container.appendChild(grid);
}

window.updateDashboardStats = function() {
    let dbValue = 0; let collectionValue = 0; let collectionCount = 0; let totalPaid = 0;
    allData.forEach(d => dbValue += d._market);
    allData.forEach(d => { const lib = userLibrary.get(d.cod); if (lib && lib.status === 'owned') { collectionValue += d._market * lib.qty; if(lib.paid) totalPaid += lib.paid * lib.qty; collectionCount++; } });
    let roiText = "-"; let roiClass = "text-gray-500";
    if (totalPaid > 0) { const roiVal = ((collectionValue - totalPaid) / totalPaid) * 100; roiText = `ROI: ${roiVal > 0 ? '+' : ''}${roiVal.toFixed(1)}%`; roiClass = roiVal >= 0 ? "text-green-600" : "text-red-500"; }
    safeUpdate('statDBCount', allData.length.toLocaleString()); safeUpdate('statDBValue', `€ ${dbValue.toLocaleString('it-IT', { minimumFractionDigits: 0 })}`);
    safeUpdate('statCollCount', collectionCount.toLocaleString()); safeUpdate('statCollValue', `€ ${collectionValue.toLocaleString('it-IT', { minimumFractionDigits: 0 })}`);
    safeUpdate('statRetiring', filteredData.filter(d => d._date.getFullYear() === 2025).length); safeUpdate('statPieces', filteredData.reduce((a, b) => a + (b.pieces || 0), 0).toLocaleString());
    safeUpdate('dashDBValue', `€ ${dbValue.toLocaleString('it-IT', { minimumFractionDigits: 0 })}`); safeUpdate('dashCollectionValue', `€ ${collectionValue.toLocaleString('it-IT', { minimumFractionDigits: 0 })}`);
    const roiEl = document.getElementById('dashROI'); if(roiEl) { roiEl.innerText = roiText; roiEl.className = "text-xs font-bold mt-1 " + roiClass; }
}

window.updateCharts = function() {
    if (document.getElementById('dashboardPanel').classList.contains('hidden')) return; if (typeof Chart === 'undefined') return;
    const ownedSets = allData.filter(d => { const lib = userLibrary.get(d.cod); return lib && lib.status === 'owned'; }); if (ownedSets.length === 0) return;
    const themes = {}; ownedSets.forEach(d => { themes[d.theme] = (themes[d.theme] || 0) + (userLibrary.get(d.cod).qty); });
    if (charts.theme) charts.theme.destroy(); charts.theme = new Chart(document.getElementById('chartThemes'), { type: 'doughnut', data: { labels: Object.keys(themes), datasets: [{ data: Object.values(themes), backgroundColor: ['#ef4444', '#3b82f6', '#eab308', '#22c55e', '#a855f7', '#64748b'] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
    const years = {}; ownedSets.forEach(d => { const y = d._date.getFullYear(); if (y < 2099) years[y] = (years[y] || 0) + 1; });
    if (charts.retire) charts.retire.destroy(); charts.retire = new Chart(document.getElementById('chartRetirement'), { type: 'bar', data: { labels: Object.keys(years).sort(), datasets: [{ label: 'Set in Ritiro', data: Object.keys(years).sort().map(k => years[k]), backgroundColor: '#f97316' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
}

window.openAddSetModal = function() { document.getElementById('addSetModal').classList.remove('hidden'); }
window.closePriceModal = function() { document.getElementById('priceModal').classList.add('hidden'); }
window.closeWelcomeForUser = function() { document.getElementById('welcomeOverlay').classList.add('hidden'); if(currentUserEmail) localStorage.setItem(`itavix_welcome_seen_${currentUserEmail}`, 'true'); }
window.openWelcomeOverlay = function() { document.getElementById('welcomeOverlay').classList.remove('hidden'); }
window.openCollectionModal = function(cod) { const lib = userLibrary.get(cod); document.getElementById('collSetCod').value = cod; document.getElementById('collPaidPrice').value = lib ? (lib.paid || 0) : ""; document.getElementById('collQty').value = lib ? lib.qty : 1; if (!lib) { const set = allData.find(d => d.cod === cod); if(set) document.getElementById('collPaidPrice').value = set._price; } document.getElementById('collectionModal').classList.remove('hidden'); }
window.confirmAddToCollection = async function() { const cod = parseInt(document.getElementById('collSetCod').value); const price = parseFloat(document.getElementById('collPaidPrice').value) || 0; const qty = parseInt(document.getElementById('collQty').value) || 1; userLibrary.set(cod, { status: 'owned', qty: qty, paid: price }); const { error } = await supabase.from('user_favorites').upsert({ user_email: currentUserEmail, set_cod: cod, status: 'owned', quantity: qty, paid: price }, { onConflict: 'user_email, set_cod' }); if (!error) { document.getElementById('collectionModal').classList.add('hidden'); window.render(); window.updateDashboardStats(); window.updateCharts(); if(typeof confetti === 'function') confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } }); } else { alert("Errore salvataggio: " + error.message); } }
window.updateSetStatus = async function(cod, status) { if(status === 'owned') { window.openCollectionModal(cod); return; } const current = userLibrary.get(cod); if (current && current.status === status) { userLibrary.delete(cod); await supabase.from('user_favorites').delete().match({ user_email: currentUserEmail, set_cod: cod }); } else { const newData = { status: status, qty: 1 }; userLibrary.set(cod, newData); await supabase.from('user_favorites').upsert({ user_email: currentUserEmail, set_cod: cod, status: status, quantity: 1 }, { onConflict: 'user_email, set_cod' }); } window.render(); window.updateDashboardStats(); window.updateCharts(); }
window.updateQty = async function(cod, delta) { const current = userLibrary.get(cod); if (!current) return; let newQty = Math.max(1, current.qty + delta); current.qty = newQty; userLibrary.set(cod, current); await supabase.from('user_favorites').update({ quantity: newQty }).match({ user_email: currentUserEmail, set_cod: cod }); window.render(); window.updateDashboardStats(); window.updateCharts(); }
window.openSetDetailModal = function(cod) { const set = allData.find(d => d.cod === cod); if (!set) return; document.getElementById('detailImg').src = set._img; document.getElementById('detailCod').innerText = set.cod; document.getElementById('detailName').innerText = set.set_name; document.getElementById('detailTheme').innerText = set.theme; document.getElementById('detailMinifigs').innerText = set.minifigs || 0; const piecesLink = document.getElementById('detailPiecesLink'); if(piecesLink) { piecesLink.href = `https://www.bricklink.com/catalogItemInv.asp?S=${set.cod}-1`; document.getElementById('detailPieces').innerText = set.pieces; } document.getElementById('detailPrice').innerText = set._price > 0 ? `€ ${set._price.toFixed(2)}` : '-'; document.getElementById('detailMarket').innerText = set._market > 0 ? `€ ${set._market.toFixed(2)}` : '-'; document.getElementById('detailRetire').innerText = window.formatDateItalian(set.retirement_date); document.getElementById('detailLegoLink').href = `https://www.lego.com/it-it/product/${set.cod}`; document.getElementById('detailBricklinkLink').href = `https://www.bricklink.com/v2/catalog/catalogitem.page?S=${set.cod}-1`; document.getElementById('setDetailModal').classList.remove('hidden'); document.getElementById('setDetailModal').classList.add('flex'); if(window.lucide) window.lucide.createIcons(); }
window.closeSetDetailModal = function() { document.getElementById('setDetailModal').classList.add('hidden'); document.getElementById('setDetailModal').classList.remove('flex'); }
window.openEditSetModal = function(cod) { const set = allData.find(d => d.cod === cod); if(!set) return; document.getElementById('editSetCod').value = set.cod; document.getElementById('editSetTheme').value = set.theme || ''; document.getElementById('editSetName').value = set.set_name || ''; document.getElementById('editSetPieces').value = set.pieces || 0; document.getElementById('editSetMinifigs').value = set.minifigs || 0; document.getElementById('editSetPrice').value = set._price || ''; document.getElementById('editSetMarket').value = set._market || ''; document.getElementById('editSetExclusive').checked = set.is_exclusive === true; document.getElementById('editSetRetire').value = set.retirement_date || ''; document.getElementById('editSetModal').classList.remove('hidden'); }
window.saveSetChanges = async function() { const cod = parseInt(document.getElementById('editSetCod').value); const updates = { theme: document.getElementById('editSetTheme').value, set_name: document.getElementById('editSetName').value, pieces: parseInt(document.getElementById('editSetPieces').value || 0), minifigs: parseInt(document.getElementById('editSetMinifigs').value || 0), price: parseFloat(document.getElementById('editSetPrice').value || 0), market_price: parseFloat(document.getElementById('editSetMarket').value || 0), is_exclusive: document.getElementById('editSetExclusive').checked, retirement_date: document.getElementById('editSetRetire').value || null }; const { error } = await supabase.from('lego_sets').update(updates).eq('cod', cod); if (error) { alert("Errore: " + error.message); } else { const idx = allData.findIndex(d => d.cod === cod); if (idx !== -1) { allData[idx] = { ...allData[idx], ...updates, _price: updates.price, _market: updates.market_price, _date: new Date(updates.retirement_date || '2099-12-31') }; allData[idx]._search = ((updates.set_name || '') + ' ' + cod).toLowerCase(); } alert("Salvato!"); document.getElementById('editSetModal').classList.add('hidden'); window.applyFilters(); } }
window.deleteSet = async function(cod) { if (currentUserEmail.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) return; if (!confirm("Eliminare?")) return; const { error } = await supabase.from('lego_sets').delete().eq('cod', cod); if (error) alert(error.message); else { allData = allData.filter(d => d.cod !== cod); window.applyFilters(); alert("Eliminato."); } }
window.batchUpdateAllData = async function() { if (currentUserEmail.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) return; const setsToUpdate = allData.filter(d => !d.set_name || d.pieces === 0 || !d.minifigs || !d.retirement_date || d.minifigs === 0); if (setsToUpdate.length === 0) { alert("Tutti i set sono già completi!"); return; } if(!confirm(`Trovati ${setsToUpdate.length} set con dati incompleti. Vuoi scaricare i dati mancanti?`)) return; const modal = document.getElementById('updateModal'); const progress = document.getElementById('updateProgress'); const status = document.getElementById('updateStatus'); modal.classList.remove('hidden'); let updatedCount = 0; const total = setsToUpdate.length; const proxyUrl = "https://corsproxy.io/?"; for (let i = 0; i < total; i++) { const set = setsToUpdate[i]; status.innerText = `Aggiorno ${set.cod}... (${i + 1}/${total})`; progress.style.width = `${((i + 1) / total) * 100}%`; try { const urlSet = `https://rebrickable.com/api/v3/lego/sets/${set.cod}-1/`; const resSet = await fetch(proxyUrl + encodeURIComponent(urlSet), { headers: { 'Authorization': 'key ' + API_KEY, 'Accept': 'application/json' } }); if (resSet.status === 429) { status.innerText = "Attesa rate limit (60s)..."; await new Promise(r => setTimeout(r, 60000)); i--; continue; } const urlMf = `https://rebrickable.com/api/v3/lego/sets/${set.cod}-1/minifigs/`; const resMf = await fetch(proxyUrl + encodeURIComponent(urlMf), { headers: { 'Authorization': 'key ' + API_KEY, 'Accept': 'application/json' } }); if (resSet.ok) { const dataSet = await resSet.json(); let count = 0; if (resMf.ok) { const dataMf = await resMf.json(); count = dataMf.count || 0; } const updatePayload = { set_name: dataSet.name, pieces: dataSet.num_parts, minifigs: count }; if (dataSet.year && (!set.retirement_date || set.retirement_date === "")) { updatePayload.retirement_date = `${dataSet.year}-12-31`; } await supabase.from('lego_sets').update(updatePayload).eq('cod', set.cod); updatedCount++; } await new Promise(r => setTimeout(r, 1200)); } catch (e) { console.error(`Errore set ${set.cod}`, e); } } modal.classList.add('hidden'); alert(`Finito! Aggiornati ${updatedCount} set.`); window.fetchAllData(); };
window.addNewSet = async function() { const cod = parseInt(document.getElementById('newSetCod').value); const theme = document.getElementById('newSetTheme').value; const name = document.getElementById('newSetName').value; const pieces = parseInt(document.getElementById('newSetPieces').value || 0); const minifigs = parseInt(document.getElementById('newSetMinifigs').value || 0); const price = parseFloat(document.getElementById('newSetPrice').value || 0); const isExclusive = document.getElementById('newSetExclusive').checked; const date = document.getElementById('newSetDate').value; if (!cod || !name) return alert("Dati mancanti"); const { error } = await supabase.from('lego_sets').insert({ cod, theme, set_name: name, pieces, minifigs, price, market_price: price, is_exclusive: isExclusive, retirement_date: date ? new Date(date).toISOString().split('T')[0] : "" }); if (error) alert("Errore: " + error.message); else { alert("Aggiunto!"); document.getElementById('addSetModal').classList.add('hidden'); window.fetchAllData(); } }
window.fetchRebrickableData = async function() { const cod = document.getElementById('newSetCod').value; const apiKey = API_KEY; if (!cod) return alert("Inserisci codice"); const btn = event.currentTarget; const originalIcon = btn.innerHTML; btn.innerHTML = '<div class="loader border-white border-t-transparent w-4 h-4"></div>'; btn.disabled = true; try { const proxyUrl = "https://corsproxy.io/?"; const target = `https://rebrickable.com/api/v3/lego/sets/${cod}-1/`; const res = await fetch(proxyUrl + encodeURIComponent(target), { headers: {'Authorization': 'key '+apiKey, 'Accept': 'application/json'} }); if(!res.ok) throw new Error("Non trovato"); const data = await res.json(); document.getElementById('newSetName').value = data.name; document.getElementById('newSetPieces').value = data.num_parts; document.getElementById('newSetDate').value = `${data.year}-12-31`; const targetMf = `https://rebrickable.com/api/v3/lego/sets/${cod}-1/minifigs/`; const resMf = await fetch(proxyUrl + encodeURIComponent(targetMf), { headers: {'Authorization': 'key '+apiKey, 'Accept': 'application/json'} }); if(resMf.ok) { const dm = await resMf.json(); document.getElementById('newSetMinifigs').value = dm.count; } alert(`Trovato: ${data.name}`); } catch(e) { alert(e.message); } finally { btn.innerHTML = originalIcon; btn.disabled = false; if(window.lucide) window.lucide.createIcons(); } };
window.openPriceModal = function(cod) { currentEditingCod = cod; document.getElementById('modalSetCode').innerText = cod; document.getElementById('bricksetLink').href = `https://brickset.com/sets/${cod}-1`; const set = allData.find(d => d.cod === cod); if (set) { document.getElementById('suggestPrice').value = set._price; document.getElementById('suggestMarketPrice').value = set._market; document.getElementById('editIsExclusive').checked = set.is_exclusive === true; } document.getElementById('suggestSource').value = ''; document.getElementById('modalTitle').innerText = (currentUserEmail.toLowerCase() === ADMIN_EMAIL.toLowerCase()) ? "Aggiorna Dati (Admin)" : "Suggerisci Dati"; document.getElementById('priceModal').classList.remove('hidden'); }
window.submitSuggestion = async function() { const price = parseFloat(document.getElementById('suggestPrice').value); const market = parseFloat(document.getElementById('suggestMarketPrice').value); const isExcl = document.getElementById('editIsExclusive').checked; const source = document.getElementById('suggestSource').value; if (currentUserEmail.toLowerCase() === ADMIN_EMAIL.toLowerCase()) { const updateData = { is_exclusive: isExcl }; if (!isNaN(price)) updateData.price = price; if (!isNaN(market)) updateData.market_price = market; const { error } = await supabase.from('lego_sets').update(updateData).eq('cod', currentEditingCod); if (error) alert("Errore: " + error.message); else { alert("Aggiornato!"); window.closePriceModal(); window.fetchAllData(); } } else { if (!price || !source) return alert("Dati obbligatori"); const { error } = await supabase.from('price_suggestions').insert({ set_cod: currentEditingCod, user_email: currentUserEmail, new_price: price, source: source }); if (error) alert("Errore: " + error.message); else { alert("Inviato!"); window.closePriceModal(); } } }
window.openAdminPanel = async function() { document.getElementById('adminModal').classList.remove('hidden'); window.loadSuggestions(); }
window.loadSuggestions = async function() { const tbody = document.getElementById('adminTableBody'); tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center">Loading...</td></tr>'; const { data, error } = await supabase.from('price_suggestions').select('*').eq('status', 'pending').order('created_at'); tbody.innerHTML = ''; if (!data || data.length === 0) { document.getElementById('noSuggestions').classList.remove('hidden'); return; } document.getElementById('noSuggestions').classList.add('hidden'); data.forEach(s => { const tr = document.createElement('tr'); tr.className = "border-b border-gray-100 dark:border-gray-700"; tr.innerHTML = `<td class="p-2 font-mono">${s.set_cod}</td><td class="p-2 text-xs truncate max-w-[100px]">${s.user_email}</td><td class="p-2 font-bold text-green-600">€ ${s.new_price}</td><td class="p-2 text-xs italic">${s.source}</td><td class="p-2 text-right"><button onclick="window.approveSuggestion(${s.id}, ${s.set_cod}, ${s.new_price})" class="bg-green-100 text-green-700 p-1 rounded mr-1"><i data-lucide="check" class="w-4 h-4"></i></button><button onclick="window.rejectSuggestion(${s.id})" class="bg-red-100 text-red-700 p-1 rounded"><i data-lucide="x" class="w-4 h-4"></i></button></td>`; tbody.appendChild(tr); }); if (window.lucide) window.lucide.createIcons(); }
window.approveSuggestion = async function(id, cod, price) { await supabase.from('lego_sets').update({ price: price }).eq('cod', cod); await supabase.from('price_suggestions').update({ status: 'approved' }).eq('id', id); window.loadSuggestions(); window.fetchAllData(); }
window.rejectSuggestion = async function(id) { await supabase.from('price_suggestions').update({ status: 'rejected' }).eq('id', id); window.loadSuggestions(); }
window.handleCsvUpload = function(e) { const file = e.target.files[0]; if (!file) return; Papa.parse(file, { header: true, skipEmptyLines: true, delimiter: ";", complete: async function (results) { try { const rows = results.data.map(row => { const keys = Object.keys(row); const getK = (n) => keys.find(k => k && k.toLowerCase().includes(n)); let price = row[getK('price')] || row[getK('costo')] || '0'; if (typeof price === 'string') price = price.replace('€', '').replace(',', '.').trim(); const codVal = row[getK('cod')]; return { cod: parseInt(codVal), theme: row[getK('theme')], sub_theme: row[getK('sub')] || "", set_name: row[getK('name')], pieces: parseInt(row[getK('pieces')] || 0), price: parseFloat(price || 0), retirement_date: row[getK('date')] || row[getK('ritiro')] }; }).filter(r => r.cod); if (!rows.length) { alert("CSV vuoto"); e.target.value = ''; return; } const BATCH = 50; for (let i = 0; i < rows.length; i += BATCH) { const { error } = await supabase.from('lego_sets').upsert(rows.slice(i, i + BATCH), { onConflict: 'cod' }); if (error) throw error; } await supabase.from('app_settings').upsert({ key: 'last_data_update', value: new Date().toISOString() }); window.safeUpdate('lastUpdateDate', new Date().toLocaleDateString('it-IT')); alert("Completato!"); window.fetchAllData(); } catch (err) { alert("Errore import CSV"); } e.target.value = ''; } }); }
window.exportToCSV = function() { if (filteredData.length === 0) return alert("Nessun dato"); const dataToExport = filteredData.map(row => { const lib = userLibrary.get(row.cod); return { Codice: row.cod, Tema: row.theme, Nome: row.set_name, Pezzi: row.pieces, Prezzo: row._price, Ritiro: row.retirement_date, Posseduto: lib && lib.status === 'owned' ? 'SI' : 'NO', Desiderato: lib && lib.status === 'wanted' ? 'SI' : 'NO', Quantità: lib ? lib.qty : 0, Link: `https://www.lego.com/it-it/product/${row.cod}` }; }); const csv = Papa.unparse(dataToExport); const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `itavix_export.csv`; link.click(); }