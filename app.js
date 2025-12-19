// --- CONFIGURAZIONE ---
const SUPABASE_URL = 'https://vdihgygqxjuhnppwktlq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkaWhneWdxeGp1aG5wcHdrdGxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwNDYyNzYsImV4cCI6MjA4MDYyMjI3Nn0.A-emTugF0lfrfHlIm7M6HXUFNwaDs_TRPE3NvLqJo2o';
const ADMIN_EMAIL = 'clauditavi@gmail.com';
const API_KEY = 'ebb1182d1fd6d6878f58136f06d5956e';

// --- VARIABILI ---
let supabaseClient;
let allData = [];
let filteredData = [];
let userLibrary = new Map();
let currentSort = { key: 'theme', direction: 'asc' };
let showOnlyCollection = false;
let showOnlyExclusives = false;
let currentUserEmail = "";
let currentEditingCod = null;
let viewMode = 'grid'; 
let renderLimit = 100;
let savedState = null;
let scrollTimeout; 

// --- INIT ---
try {
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
            auth: { persistSession: true, storageKey: 'itavix_session', storage: window.localStorage, autoRefreshToken: true, detectSessionInUrl: true }
        });
    }
} catch (err) { console.error("Init Error", err); }

// --- GLOBAL FUNCTIONS ---
window.openAddSetModal = function() { document.getElementById('addSetModal').classList.remove('hidden'); }
window.openCustomItemModal = function() { document.getElementById('customItemModal').classList.remove('hidden'); }
window.closePriceModal = function() { document.getElementById('priceModal').classList.add('hidden'); }
window.closeSetDetailModal = function() { document.getElementById('setDetailModal').classList.add('hidden'); }
window.openAdminPanel = function() { document.getElementById('adminModal').classList.remove('hidden'); }

window.safeUpdate = function(id, val) { const el = document.getElementById(id); if (el) el.innerHTML = val; }
window.formatDateItalian = function(d) { if (!d) return "-"; const date = new Date(d); return isNaN(date.getTime()) ? d : date.toLocaleDateString('it-IT'); }
function isUserAdmin() { return currentUserEmail && currentUserEmail.trim().toLowerCase() === ADMIN_EMAIL.trim().toLowerCase(); }
window.initDarkMode = function() { if (localStorage.getItem('color-theme') === 'dark' || (!('color-theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) { document.documentElement.classList.add('dark'); } }

window.handleImageError = function(img) {
    img.style.display = 'none'; 
    const fallback = img.nextElementSibling;
    if (fallback) fallback.classList.remove('hidden');
}

window.scrollToTop = function() {
    const container = document.getElementById('appContent');
    if(container) container.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- STATE MANAGEMENT ---
window.saveState = function() {
    const sInput = document.getElementById('searchInput');
    const container = document.getElementById('appContent'); 
    if (!sInput) return;
    
    const state = { 
        search: sInput.value, 
        theme: document.getElementById('themeFilter').value, 
        year: document.getElementById('yearFilter').value, 
        view: viewMode, 
        sort: currentSort, 
        onlyCollection: showOnlyCollection, 
        onlyExclusives: showOnlyExclusives,
        scroll: container ? container.scrollTop : 0
    };
    localStorage.setItem('itavix_app_state', JSON.stringify(state));
}

window.loadState = function() {
    const saved = localStorage.getItem('itavix_app_state');
    if (saved) {
        savedState = JSON.parse(saved);
        if (savedState.view) viewMode = savedState.view;
        if (savedState.sort) currentSort = savedState.sort;
        if (savedState.onlyCollection !== undefined) showOnlyCollection = savedState.onlyCollection;
        if (savedState.onlyExclusives !== undefined) showOnlyExclusives = savedState.onlyExclusives;

        const sInput = document.getElementById('searchInput');
        if (savedState.search && sInput) sInput.value = savedState.search;
        
        const icon = document.getElementById('viewIcon'); 
        if(icon) icon.setAttribute('data-lucide', viewMode === 'table' ? 'layout-grid' : 'list');
        
        const btnFav = document.getElementById('btnToggleFavs');
        if(btnFav) btnFav.className = showOnlyCollection ? "p-2 bg-[#007AFF] text-white rounded flex items-center gap-1 font-bold text-xs shrink-0" : "p-2 bg-yellow-100 text-yellow-800 rounded flex items-center gap-1 font-bold text-xs shrink-0";
        
        const btnExcl = document.getElementById('btnToggleExcl');
        const txtExcl = document.getElementById('exclBtnText');
        if(btnExcl && txtExcl) {
            btnExcl.className = showOnlyExclusives ? "flex items-center px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition gap-2 text-xs md:text-sm font-bold shrink-0" : "flex items-center px-3 py-2 bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 rounded-lg hover:bg-indigo-200 transition gap-2 text-xs md:text-sm font-bold shrink-0";
            txtExcl.innerText = showOnlyExclusives ? "Mostra Tutti" : "Esclusive";
        }
    }
}

// --- CORE ---
window.onload = function() {
    window.initDarkMode();
    window.loadState();
    
    const appContent = document.getElementById('appContent');
    if (appContent) {
        appContent.addEventListener('scroll', () => {
            const btnUp = document.getElementById('btnScrollTop');
            if (btnUp) {
                if (appContent.scrollTop > 300) {
                    btnUp.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
                } else {
                    btnUp.classList.add('opacity-0', 'pointer-events-none');
                }
            }
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => { window.saveState(); }, 200);
        });
    }

    const sInput = document.getElementById('searchInput'); if(sInput) sInput.addEventListener('input', window.applyFilters);
    const tFilter = document.getElementById('themeFilter'); if(tFilter) tFilter.addEventListener('change', window.applyFilters);
    const yFilter = document.getElementById('yearFilter'); if(yFilter) yFilter.addEventListener('change', window.applyFilters);
    
    // FIX: Aggiunta listener per Upload CSV
    const cInput = document.getElementById('csvInput'); if(cInput) cInput.addEventListener('change', window.handleCsvUpload);
    
    const pwInput = document.getElementById('password'); if(pwInput) pwInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') window.handleAuth('login'); });

    if (supabaseClient) {
        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (session && session.user) window.unlockApp(session.user.email);
        });
        window.checkSession();
    }
};

window.handleAuth = async function(type) {
    if (!supabaseClient) return alert("Errore DB: Client non inizializzato");
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    if (!email || !password) return alert("Inserisci dati");
    
    try {
        let result;
        if (type === 'login') result = await supabaseClient.auth.signInWithPassword({ email, password });
        else result = await supabaseClient.auth.signUp({ email, password });
        
        if (result.error) throw result.error;
        if (result.data.session) window.unlockApp(result.data.session.user.email);
        else if (type === 'signup') alert("Controlla email");
    } catch(e) { alert(e.message); }
}

window.checkSession = async function() { 
    if(!supabaseClient) return;
    const { data } = await supabaseClient.auth.getSession(); 
    if (data.session) window.unlockApp(data.session.user.email); 
}

window.unlockApp = function(email) {
    currentUserEmail = email;
    document.getElementById('loginOverlay').classList.add('hidden');
    document.getElementById('appContent').classList.remove('blur-content', 'opacity-50');
    document.getElementById('userEmailDisplay').innerText = `Utente: ${email}`;
    
    const adminMode = isUserAdmin();
    ['btnAdmin', 'btnAddSet', 'btnUpdateMinifigs'].forEach(id => {
        const el = document.getElementById(id); 
        if(el) { if (adminMode) el.classList.remove('hidden'); else el.classList.add('hidden'); }
    });
    
    const btnCustom = document.getElementById('btnAddCustom');
    if(btnCustom) btnCustom.classList.remove('hidden');
    
    if(window.lucide) window.lucide.createIcons();
    if(adminMode) window.checkAdminNotifications();
    
    window.loadLastUpdateDate();
    window.loadLibrary().then(() => window.fetchAllData());
}

window.logout = async function() { 
    if(supabaseClient) await supabaseClient.auth.signOut(); 
    location.reload(); 
}

// --- IMPORT / EXPORT (NUOVO) ---
window.exportToCSV = function() {
    if (userLibrary.size === 0) return alert("La tua collezione è vuota. Aggiungi dei set prima di esportare.");
    
    // Intestazioni (uso il punto e virgola per compatibilità Excel Italia)
    let csvContent = "Codice;Nome;Tema;Quantità;Pagato;Valore Unitario;Valore Totale;Data Ritiro\n";
    
    let exportedCount = 0;
    userLibrary.forEach((libItem, cod) => {
        const set = allData.find(d => d.cod === cod);
        if (set) {
            const name = (set.set_name || "Sconosciuto").replace(/;/g, ","); // Rimuove eventuali ; dal nome
            const valUnit = set._market || 0;
            const valTot = valUnit * (libItem.qty || 1);
            
            csvContent += `${cod};${name};${set.theme};${libItem.qty};${(libItem.paid||0).toFixed(2)};${valUnit.toFixed(2)};${valTot.toFixed(2)};${window.formatDateItalian(set.retirement_date)}\n`;
            exportedCount++;
        }
    });

    if(exportedCount === 0) return alert("Errore nell'export dei dati.");

    // Creazione Blob con BOM per supportare caratteri speciali (UTF-8)
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `iTavix_Backup_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

window.handleCsvUpload = function(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!window.Papa) return alert("Libreria CSV mancante. Ricarica la pagina.");

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async function(results) {
            if (results.data && results.data.length > 0) {
                let imported = 0;
                // Gestisce sia separatore virgola che punto e virgola provando a leggere la prima riga
                // Nota: PapaParse di solito lo rileva in automatico, ma qui assumiamo header standard
                
                for (const row of results.data) {
                    // Cerca colonne standard (Codice/Quantità/Pagato)
                    // Supporta chiavi in italiano (dal nostro export) o inglese generico
                    let cod = row['Codice'] || row['cod'] || row['Code'];
                    let qty = row['Quantità'] || row['qty'] || row['Quantity'] || 1;
                    let paid = row['Pagato'] || row['paid'] || row['Price'] || 0;

                    if (cod) {
                        cod = parseInt(cod);
                        qty = parseInt(qty);
                        paid = parseFloat(paid.toString().replace(',', '.')); // Fix virgola decimale

                        // Upsert nel DB
                        const { error } = await supabaseClient.from('user_favorites').upsert({
                            user_email: currentUserEmail,
                            set_cod: cod,
                            status: 'owned',
                            quantity: qty,
                            paid: paid
                        }, { onConflict: 'user_email, set_cod' });

                        if (!error) imported++;
                    }
                }
                alert(`Importazione completata! Caricati ${imported} set.`);
                window.location.reload();
            } else {
                alert("File CSV vuoto o non valido.");
            }
        }
    });
    // Reset input
    event.target.value = '';
}

// --- SET FUNCTIONS ---
window.addNewSet = async function() {
    if(!isUserAdmin()) return;
    const cod = parseInt(document.getElementById('newSetCod').value);
    const theme = document.getElementById('newSetTheme').value;
    const name = document.getElementById('newSetName').value;
    const pieces = parseInt(document.getElementById('newSetPieces').value || 0);
    const minifigs = parseInt(document.getElementById('newSetMinifigs').value || 0);
    const price = parseFloat(document.getElementById('newSetPrice').value || 0);
    const isExclusive = document.getElementById('newSetExclusive').checked;
    const date = document.getElementById('newSetDate').value;
    if (!cod || !name) return alert("Dati mancanti");
    const { error } = await supabaseClient.from('lego_sets').insert({ cod, theme, set_name: name, pieces, minifigs, price, market_price: price, is_exclusive: isExclusive, retirement_date: date ? new Date(date).toISOString().split('T')[0] : "" });
    if (error) alert("Errore: " + error.message); else { await window.updateDbTimestamp(); alert("Aggiunto!"); document.getElementById('addSetModal').classList.add('hidden'); window.fetchAllData(); }
}

window.fetchRebrickableData = async function() {
    const cod = document.getElementById('newSetCod').value;
    const apiKey = API_KEY;
    if (!cod) return alert("Inserisci codice");
    const btn = event.currentTarget;
    const originalIcon = btn.innerHTML;
    btn.innerHTML = '<div class="loader border-white border-t-transparent w-4 h-4"></div>';
    btn.disabled = true;
    try {
        const proxyUrl = "https://corsproxy.io/?";
        const target = `https://rebrickable.com/api/v3/lego/sets/${cod}-1/`;
        const res = await fetch(proxyUrl + encodeURIComponent(target), { headers: {'Authorization': 'key '+apiKey, 'Accept': 'application/json'} });
        if(!res.ok) throw new Error("Non trovato");
        const data = await res.json();
        document.getElementById('newSetName').value = data.name;
        document.getElementById('newSetPieces').value = data.num_parts;
        document.getElementById('newSetDate').value = `${data.year}-12-31`;
        const targetMf = `https://rebrickable.com/api/v3/lego/sets/${cod}-1/minifigs/`;
        const resMf = await fetch(proxyUrl + encodeURIComponent(targetMf), { headers: {'Authorization': 'key '+apiKey, 'Accept': 'application/json'} });
        if(resMf.ok) { const dm = await resMf.json(); document.getElementById('newSetMinifigs').value = dm.count; }
        alert(`Trovato: ${data.name}`);
    } catch(e) { alert(e.message); } finally { btn.innerHTML = originalIcon; btn.disabled = false; if(window.lucide) window.lucide.createIcons(); }
}

window.saveCustomItem = async function() {
    const cod = parseInt(document.getElementById('custCode').value);
    const name = document.getElementById('custName').value;
    const theme = document.getElementById('custTheme').value;
    const mf = parseInt(document.getElementById('custMinifigs').value || 0);
    const paid = parseFloat(document.getElementById('custPaid').value || 0);
    if(!cod || !name) return alert("Dati mancanti");
    await supabaseClient.from('lego_sets').upsert({ cod, set_name: name, theme: theme, minifigs: mf, pieces: 0, price: 0, market_price: 0 }, { onConflict: 'cod', ignoreDuplicates: true });
    await supabaseClient.from('user_favorites').upsert({ user_email: currentUserEmail, set_cod: cod, status: 'owned', quantity: 1, paid: paid }, { onConflict: 'user_email, set_cod' });
    alert("Salvato!");
    document.getElementById('customItemModal').classList.add('hidden');
    window.location.reload(); 
}

// --- UTILS ---
window.toggleExclusives = function() {
    showOnlyExclusives = !showOnlyExclusives;
    showOnlyCollection = false;
    const btn = document.getElementById('btnToggleExcl'); const txt = document.getElementById('exclBtnText'); const btnFav = document.getElementById('btnToggleFavs');
    if(showOnlyExclusives) { btn.className = "flex items-center px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition gap-2 text-xs md:text-sm font-bold shrink-0"; txt.innerText = "Mostra Tutti"; } else { btn.className = "flex items-center px-3 py-2 bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 rounded-lg hover:bg-indigo-200 transition gap-2 text-xs md:text-sm font-bold shrink-0"; txt.innerText = "Esclusive"; }
    btnFav.className = "p-2 bg-yellow-100 text-yellow-800 rounded flex items-center gap-1 font-bold text-xs shrink-0";
    window.applyFilters();
}
window.toggleViewFavorites = function() {
    showOnlyCollection = !showOnlyCollection;
    showOnlyExclusives = false;
    const btn = document.getElementById('btnToggleFavs'); const btnExcl = document.getElementById('btnToggleExcl'); const txtExcl = document.getElementById('exclBtnText');
    if(showOnlyCollection) { btn.className = "p-2 bg-[#007AFF] text-white rounded flex items-center gap-1 font-bold text-xs shrink-0"; } else { btn.className = "p-2 bg-yellow-100 text-yellow-800 rounded flex items-center gap-1 font-bold text-xs shrink-0"; }
    btnExcl.className = "flex items-center px-3 py-2 bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 rounded-lg hover:bg-indigo-200 transition gap-2 text-xs md:text-sm font-bold shrink-0"; txtExcl.innerText = "Esclusive";
    window.applyFilters();
}
window.toggleDashboard = function() { document.getElementById('dashboardPanel').classList.toggle('hidden'); const btn = document.getElementById('btnDash'); if(document.getElementById('dashboardPanel').classList.contains('hidden')) { btn.className = "p-2 text-gray-500 hover:text-purple-500 hover:bg-white dark:hover:bg-gray-600 rounded-full transition-all"; } else { btn.className = "p-2 text-purple-600 bg-purple-100 rounded-full transition-all"; } window.updateCharts(); }
window.toggleViewMode = function() { viewMode = viewMode === 'table' ? 'grid' : 'table'; document.getElementById('viewIcon').setAttribute('data-lucide', viewMode === 'table' ? 'layout-grid' : 'list'); if(window.lucide) window.lucide.createIcons(); window.saveState(); window.render(); }
window.toggleDarkMode = function() { document.documentElement.classList.toggle('dark'); localStorage.setItem('color-theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light'); }
window.updateSort = function(key) { currentSort.key = key; currentSort.direction = 'asc'; window.render(); }

// --- DATA ---
window.loadLibrary = async function() { if(!supabaseClient) return; const { data } = await supabaseClient.from('user_favorites').select('*').eq('user_email', currentUserEmail); if(data) { userLibrary = new Map(); data.forEach(row => userLibrary.set(row.set_cod, { status: row.status || 'wanted', qty: row.quantity || 1, paid: row.paid || 0 })); } }
window.fetchAllData = async function() { const loader = document.getElementById('tableLoader'); if(loader) loader.classList.remove('hidden'); let allRows = []; let from = 0; const step = 1000; let keep = true; try { while(keep) { const { data, error } = await supabaseClient.from('lego_sets').select('*').range(from, from + step - 1); if(error) throw error; if(data.length > 0) { allRows = allRows.concat(data); from += step; if(data.length < step) keep = false; } else { keep = false; } } window.processData(allRows); } catch(e) { console.error("Error Fetch:", e); } finally { if(loader) loader.classList.add('hidden'); } }

window.processData = function(data) { 
    allData = data.map(item => ({ ...item, _date: new Date(item.retirement_date || '2099-12-31'), _search: ((item.set_name||'') + ' ' + item.cod).toLowerCase(), _price: parseFloat(item.price || 0), _market: parseFloat(item.market_price || item.price || 0), _img: `https://images.brickset.com/sets/images/${item.cod}-1.jpg` })); 
    const themes = [...new Set(allData.map(d => d.theme).filter(Boolean))].sort(); 
    const years = [...new Set(allData.map(d => d._date.getFullYear()))].sort().filter(y => !isNaN(y) && y < 2099); 
    
    document.getElementById('themeFilter').innerHTML = '<option value="all">Tutti i Temi</option>' + themes.map(t => `<option value="${t}">${t}</option>`).join(''); 
    document.getElementById('yearFilter').innerHTML = '<option value="all">Tutti gli Anni</option>' + years.map(y => `<option value="${y}">${y}</option>`).join(''); 
    document.getElementById('newSetTheme').innerHTML = '<option value="">Seleziona...</option>' + themes.map(t => `<option value="${t}">${t}</option>`).join(''); 
    
    if (savedState) { 
        if(savedState.theme) document.getElementById('themeFilter').value = savedState.theme; 
        if(savedState.year) document.getElementById('yearFilter').value = savedState.year; 
    } 
    window.applyFilters(); 
}

window.applyFilters = function() {
    const s = document.getElementById('searchInput').value.toLowerCase();
    const t = document.getElementById('themeFilter').value;
    const y = document.getElementById('yearFilter').value;
    
    window.saveState();
    
    filteredData = allData.filter(d => {
        const matchesSearch = d._search.includes(s); 
        const matchesTheme = t === 'all' || d.theme === t;
        const matchesYear = y === 'all' || d._date.getFullYear().toString() === y;
        let matchesType = true;
        if (showOnlyExclusives) matchesType = d.is_exclusive === true;
        if (showOnlyCollection) matchesType = userLibrary.has(d.cod);
        return matchesSearch && matchesTheme && matchesYear && matchesType;
    });

    renderLimit = 100;
    window.render();
    window.updateDashboardStats();
    window.updateCharts();

    if (savedState && savedState.scroll && savedState.scroll > 0) {
        setTimeout(() => {
            const container = document.getElementById('appContent');
            if(container) container.scrollTo({ top: savedState.scroll, behavior: 'auto' });
            savedState.scroll = 0; 
        }, 150); 
    }
}

// --- RENDER ---
window.render = function() { 
    const container = document.getElementById('viewContainer'); if(!container) return; 
    container.innerHTML = ''; 
    filteredData.sort((a, b) => { let vA = a[currentSort.key], vB = b[currentSort.key]; if(currentSort.key === 'retirement_date') { vA = a._date; vB = b._date; } if(currentSort.key === 'price') { vA = a._price; vB = b._price; } return (vA < vB ? -1 : 1) * (currentSort.direction === 'asc' ? 1 : -1); }); 
    const slice = filteredData.slice(0, renderLimit); 
    if (viewMode === 'table') window.renderTable(container, slice); else window.renderGrid(container, slice); 
    if(filteredData.length > renderLimit) { container.innerHTML += `<div class="w-full text-center p-4"><button onclick="window.loadMoreItems()" class="bg-gray-200 dark:bg-gray-700 dark:text-white p-2 rounded shadow">Mostra Altri</button></div>`; } 
    if(window.lucide) window.lucide.createIcons(); 
}
window.loadMoreItems = function() { renderLimit += 100; window.render(); }

// --- GRID ---
window.renderGrid = function(container, data) { 
    const grid = document.createElement('div'); 
    grid.className = "grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6 p-2"; 
    const adminMode = isUserAdmin(); 
    
    data.forEach(row => { 
        const lib = userLibrary.get(row.cod); 
        const isOwned = lib && lib.status === 'owned'; 
        const now = new Date(); 
        const diffDays = Math.ceil((row._date - now) / (1000 * 60 * 60 * 24)); 
        let retireClass = "text-gray-500"; 
        if(row._date.getFullYear() === 2025) retireClass = diffDays < 180 ? "text-red-500 font-bold" : "text-orange-500 font-bold"; 
        let adminBtn = adminMode ? `<button onclick="event.stopPropagation(); window.openEditSetModal(${row.cod})" class="p-2 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-600"><i data-lucide="edit-3" class="w-4 h-4"></i></button>` : ""; 
        
        grid.innerHTML += `
        <div class="apple-card rounded-[2rem] overflow-hidden flex flex-col group">
            <div class="relative h-48 bg-white p-6 cursor-pointer flex items-center justify-center" onclick="window.openSetDetailModal(${row.cod})">
                <img src="${row._img}" loading="lazy" class="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110" onerror="window.handleImageError(this)">
                <div class="hidden absolute inset-0 flex items-center justify-center text-center p-4"><span class="text-xs text-gray-400 font-medium">Immagine ancora<br>non disponibile</span></div>
                ${isOwned ? `<div class="absolute top-4 right-4 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">x${lib.qty}</div>` : ''}
            </div>
            <div class="p-5 flex-1 flex flex-col justify-between bg-white/50 dark:bg-gray-800/50 backdrop-blur-md">
                <div>
                    <div class="flex justify-between items-start mb-2">
                        <span class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-lg text-[10px] font-bold text-gray-500 uppercase tracking-wider truncate max-w-[100px]">${row.theme}</span>
                        <div class="text-right">
                            <a href="https://www.lego.com/it-it/product/${row.cod}" target="_blank" onclick="event.stopPropagation()" class="text-[10px] font-mono text-blue-500 font-bold hover:underline">#${row.cod}</a>
                        </div>
                    </div>
                    <h4 class="font-bold text-sm leading-snug mb-3 dark:text-white line-clamp-2" title="${row.set_name}">${row.set_name}</h4>
                    <div class="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 mb-4">
                        <span class="${retireClass}">${window.formatDateItalian(row.retirement_date)}</span>
                        <div class="flex items-center gap-3">
                            <a href="https://www.bricklink.com/catalogItemInv.asp?S=${row.cod}-1" target="_blank" onclick="event.stopPropagation()" class="flex items-center gap-1 hover:text-blue-500 hover:underline">
                                <img src="brick.png" class="w-3 h-3 opacity-60"> ${row.pieces}
                            </a>
                            <span class="flex items-center gap-1 font-bold"><img src="testa.png" class="w-3 h-3 opacity-60"> ${row.minifigs || 0}</span>
                        </div>
                    </div>
                </div>
                <div class="flex items-center justify-between">
                    <span class="text-base font-bold text-slate-800 dark:text-white cursor-pointer" onclick="window.openPriceModal(${row.cod})">€ ${row._price.toFixed(2)}</span>
                    <div class="flex gap-2 relative z-20">
                        ${adminBtn}
                        <button onclick="event.stopPropagation(); window.openCollectionModal(${row.cod})" class="p-2.5 rounded-full ${isOwned ? 'bg-[#34C759] text-white shadow-lg shadow-green-500/30' : 'bg-gray-100 text-gray-400 hover:bg-[#007AFF] hover:text-white'} transition-all duration-300">
                            <i data-lucide="package" class="w-4 h-4"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>`; 
    }); 
    container.appendChild(grid); 
}

// --- TABLE / MOBILE LIST VIEW ---
window.renderTable = function(container, data) {
    const isMobile = window.innerWidth < 768;

    if (isMobile) {
        let html = `<div class="flex flex-col gap-3 pb-24">`;
        data.forEach(row => {
            const lib = userLibrary.get(row.cod);
            const isOwned = lib && lib.status === 'owned';
            const now = new Date();
            const diffDays = Math.ceil((row._date - now) / (1000 * 60 * 60 * 24));
            let retireClass = "text-gray-400";
            if(row._date.getFullYear() === 2025) retireClass = diffDays < 180 ? "text-red-500 font-bold" : "text-orange-500 font-bold";

            html += `
            <div class="bg-white dark:bg-gray-800 p-3 rounded-2xl flex gap-3 items-center shadow-sm border border-gray-100 dark:border-gray-700/50 relative" onclick="window.openSetDetailModal(${row.cod})">
                <div class="relative w-16 h-16 bg-white rounded-xl flex-shrink-0 p-1 flex items-center justify-center border border-gray-100 dark:border-gray-700 overflow-hidden">
                    <img src="${row._img}" loading="lazy" class="w-full h-full object-contain" onerror="window.handleImageError(this)">
                    <div class="hidden absolute inset-0 flex items-center justify-center text-center"><span class="text-[8px] text-gray-400 leading-tight">No Img</span></div>
                    ${isOwned ? `<div class="absolute -top-1 -right-1 bg-green-500 text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full border border-white">✓</div>` : ''}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-center mb-1">
                        <span class="text-[9px] font-bold text-gray-400 uppercase tracking-wide truncate pr-2 max-w-[80px]">${row.theme}</span>
                        <a href="https://www.lego.com/it-it/product/${row.cod}" target="_blank" onclick="event.stopPropagation()" class="text-[9px] font-mono text-blue-500 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded hover:underline">#${row.cod}</a>
                    </div>
                    <h4 class="font-bold text-sm text-slate-800 dark:text-white truncate mb-1 pr-6">${row.set_name}</h4>
                    <div class="flex justify-between items-end">
                        <div>
                            <div class="text-[9px] ${retireClass} mb-0.5">Ritiro: ${window.formatDateItalian(row.retirement_date)}</div>
                            <div class="font-bold text-sm text-slate-900 dark:text-gray-100">€ ${row._market.toFixed(2)}</div>
                        </div>
                        <button onclick="event.stopPropagation(); window.openCollectionModal(${row.cod})" class="absolute right-3 bottom-3 p-2 rounded-full z-10 ${isOwned ? 'bg-green-100 text-green-600' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}">
                            <i data-lucide="package" class="w-4 h-4"></i>
                        </button>
                    </div>
                </div>
            </div>`;
        });
        html += `</div>`;
        container.innerHTML = html;
        return;
    }

    let html = `<table class="w-full text-left text-sm min-w-[900px]"><thead class="bg-gray-50/50 dark:bg-gray-800/50 sticky top-0 text-xs font-bold text-gray-500 uppercase z-30 backdrop-blur-md"><tr><th class="p-4 rounded-l-2xl">Stato</th><th class="p-4 text-center">Img</th><th class="p-4">Cod</th><th class="p-4">Tema</th><th class="p-4">Nome</th><th class="p-4 text-right">Pezzi</th><th class="p-4 text-right">Minifigs</th><th class="p-4 text-right">Listino</th><th class="p-4 text-right">Mercato</th><th class="p-4 text-right">Ritiro</th><th class="p-4 text-center rounded-r-2xl">Azioni</th></tr></thead><tbody class="divide-y divide-gray-100 dark:divide-gray-800">`; 
    data.forEach(row => { 
        const lib = userLibrary.get(row.cod); 
        const isOwned = lib && lib.status === 'owned'; 
        const now = new Date(); 
        const diffDays = Math.ceil((row._date - now) / (1000 * 60 * 60 * 24)); 
        let retireClass = "text-gray-500"; 
        if(row._date.getFullYear() === 2025) retireClass = diffDays < 180 ? "text-red-500 font-bold" : "text-orange-500 font-bold"; 
        
        html += `<tr class="hover:bg-white/50 dark:hover:bg-gray-800/50 transition">
            <td class="p-4 text-center"><button onclick="event.stopPropagation(); window.openCollectionModal(${row.cod})" class="p-2 rounded-full ${isOwned ? 'text-green-500 bg-green-50' : 'text-gray-300 hover:text-blue-500'}"><i data-lucide="package" class="w-4 h-4"></i></button>${isOwned ? `<div class="text-[10px] font-bold mt-1 text-green-600">x${lib.qty}</div>` : ''}</td>
            <td class="p-4 text-center">
                <div class="relative w-12 h-12 mx-auto bg-white rounded-lg border border-gray-100 flex items-center justify-center overflow-hidden">
                    <img src="${row._img}" loading="lazy" class="w-full h-full object-contain p-1" onclick="window.openSetDetailModal(${row.cod})" onerror="window.handleImageError(this)">
                    <div class="hidden absolute inset-0 flex items-center justify-center text-center"><span class="text-[8px] text-gray-400">No Img</span></div>
                </div>
            </td>
            <td class="p-4 font-mono text-xs"><a href="https://www.lego.com/it-it/product/${row.cod}" target="_blank" onclick="event.stopPropagation()" class="text-blue-500 hover:underline">${row.cod}</a></td>
            <td class="p-4"><span class="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-md text-xs font-bold text-gray-500">${row.theme}</span></td>
            <td class="p-4 font-medium dark:text-white">${row.set_name}</td>
            <td class="p-4 text-right"><a href="https://www.bricklink.com/catalogItemInv.asp?S=${row.cod}-1" target="_blank" onclick="event.stopPropagation()" class="text-gray-500 hover:text-blue-500 hover:underline">${row.pieces}</a></td>
            <td class="p-4 text-right">${row.minifigs || '-'}</td>
            <td class="p-4 text-right font-bold" onclick="window.openPriceModal(${row.cod})">€ ${row._price.toFixed(2)}</td>
            <td class="p-4 text-right text-gray-500">€ ${row._market.toFixed(2)}</td>
            <td class="p-4 text-right"><span class="${retireClass}">${window.formatDateItalian(row.retirement_date)}</span></td>
            <td class="p-4 text-center text-xs text-gray-400">-</td>
        </tr>`; 
    }); 
    html += `</tbody></table>`; 
    container.innerHTML = html; 
}

// --- STATS ---
window.updateDashboardStats = function() {
    let dbVal = 0, collVal = 0, count = 0, myMinifigs = 0;
    
    if(allData && allData.length > 0) {
        allData.forEach(d => dbVal += (d._market || 0));
        allData.forEach(d => {
            const lib = userLibrary.get(d.cod);
            if(lib && lib.status === 'owned') {
                const q = parseInt(lib.qty || 1);
                collVal += (d._market || 0) * q;
                const mf = parseInt(d.minifigs || 0);
                myMinifigs += (mf * q);
                count++;
            }
        });
    }
    
    window.safeUpdate('statDBCount', allData.length);
    window.safeUpdate('statDBValue', '€ ' + dbVal.toLocaleString('it-IT', {maximumFractionDigits:0}));
    window.safeUpdate('statCollCount', count);
    window.safeUpdate('statCollValue', '€ ' + collVal.toLocaleString('it-IT', {maximumFractionDigits:0}));
    window.safeUpdate('statMinifigs', `<span class="flex items-center justify-center gap-1 text-purple-600 font-bold"><img src="testa.png" class="w-3 h-3 opacity-70"> ${myMinifigs.toLocaleString()}</span>`);
    window.safeUpdate('statRetiring', filteredData.filter(d => d._date.getFullYear() === 2025).length);
    window.safeUpdate('dashDBValue', '€ ' + dbVal.toLocaleString('it-IT', {maximumFractionDigits:0}));
    window.safeUpdate('dashCollectionValue', '€ ' + collVal.toLocaleString('it-IT', {maximumFractionDigits:0}));
}

window.updateCharts = function() {
    if (document.getElementById('dashboardPanel').classList.contains('hidden')) return;
    if (typeof Chart === 'undefined') return;
    const years = {};
    filteredData.forEach(d => { const y = d._date.getFullYear(); if (y < 2099) years[y] = (years[y] || 0) + 1; });
    if (window.charts && window.charts.retire) window.charts.retire.destroy(); 
    else window.charts = {}; 

    const ctx = document.getElementById('chartRetirement');
    if (ctx) {
        window.charts.retire = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(years).sort(),
                datasets: [{ label: 'Set per Anno Ritiro', data: Object.keys(years).sort().map(k => years[k]), backgroundColor: '#007AFF', borderRadius: 8 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { display: false } }, x: { grid: { display: false } } } }
        });
    }
}

// --- MODALS ---
window.openCollectionModal = function(cod) { 
    const lib = userLibrary.get(cod);
    document.getElementById('collSetCod').value = cod;
    document.getElementById('collPaidPrice').value = lib ? (lib.paid || '') : '';
    document.getElementById('collQty').value = lib ? (lib.qty || 1) : 1;
    if(!lib) {
        const set = allData.find(d => d.cod === cod);
        if(set) document.getElementById('collPaidPrice').value = set._price;
    }
    document.getElementById('collectionModal').classList.remove('hidden');
    document.getElementById('collectionModal').classList.add('flex');
}

window.confirmAddToCollection = async function() {
    const cod = parseInt(document.getElementById('collSetCod').value);
    const paid = parseFloat(document.getElementById('collPaidPrice').value) || 0;
    const qty = parseInt(document.getElementById('collQty').value) || 1;
    const { error } = await supabaseClient.from('user_favorites').upsert({ user_email: currentUserEmail, set_cod: cod, status: 'owned', quantity: qty, paid: paid }, { onConflict: 'user_email, set_cod' });
    if(!error) {
        userLibrary.set(cod, { status: 'owned', qty: qty, paid: paid });
        document.getElementById('collectionModal').classList.add('hidden');
        document.getElementById('collectionModal').classList.remove('flex');
        window.applyFilters();
    } else { alert("Errore: " + error.message); }
}

// --- UTILS ---
window.loadLastUpdateDate = async function() { if(!supabaseClient) return; const { data } = await supabaseClient.from('app_settings').select('value').eq('key', 'last_data_update').single(); if(data) window.safeUpdate('lastUpdateDate', new Date(data.value).toLocaleDateString()); }
window.closeWelcomeForUser = function() { document.getElementById('welcomeOverlay').classList.add('hidden'); localStorage.setItem(`itavix_welcome_seen_${currentUserEmail}`, 'true'); }
window.openWelcomeOverlay = function() { document.getElementById('welcomeOverlay').classList.remove('hidden'); }
window.openSetDetailModal = function(cod) { 
    const set = allData.find(d => d.cod === cod); 
    if (!set) return; 
    
    // FIX IMAGE IN DETAIL MODAL
    const imgEl = document.getElementById('detailImg');
    imgEl.src = set._img;
    // Reset stato immagine
    imgEl.style.display = 'block';
    const fallback = imgEl.nextElementSibling;
    if(fallback) fallback.classList.add('hidden');
    imgEl.onerror = function() { window.handleImageError(this); }; // Bind error handler
    
    document.getElementById('detailName').innerText = set.set_name;
    const elCod = document.getElementById('detailCod'); if(elCod) elCod.innerText = set.cod;
    const elTheme = document.getElementById('detailTheme'); if(elTheme) elTheme.innerText = set.theme;
    const elPieces = document.getElementById('detailPieces'); if(elPieces) elPieces.innerText = set.pieces;
    const elMinifigs = document.getElementById('detailMinifigs'); if(elMinifigs) elMinifigs.innerText = set.minifigs || 0;
    const elPrice = document.getElementById('detailPrice'); if(elPrice) elPrice.innerText = set._price ? `€ ${set._price.toFixed(2)}` : '-';
    const elMarket = document.getElementById('detailMarket'); if(elMarket) elMarket.innerText = set._market ? `€ ${set._market.toFixed(2)}` : '-';
    const elRetire = document.getElementById('detailRetire'); if(elRetire) elRetire.innerText = window.formatDateItalian(set.retirement_date);

    document.getElementById('detailLegoLink').href = `https://www.lego.com/it-it/product/${set.cod}`;
    document.getElementById('detailBricklinkLink').href = `https://www.bricklink.com/v2/catalog/catalogitem.page?S=${set.cod}-1`;

    document.getElementById('setDetailModal').classList.remove('hidden');
    document.getElementById('setDetailModal').classList.add('flex');
}
window.closeSetDetailModal = function() { document.getElementById('setDetailModal').classList.add('hidden'); document.getElementById('setDetailModal').classList.remove('flex'); }
window.closePriceModal = function() { document.getElementById('priceModal').classList.add('hidden'); }
window.openAddSetModal = function() { document.getElementById('addSetModal').classList.remove('hidden'); }
window.openAdminPanel = function() { document.getElementById('adminModal').classList.remove('hidden'); }
window.checkAdminNotifications = async function() {
    if (!isUserAdmin() || !supabaseClient) return;
    const { count, error } = await supabaseClient.from('price_suggestions').select('*', { count: 'exact', head: true }).eq('status', 'pending');
    const btn = document.getElementById('btnAdmin');
    if(btn) {
        if (!error && count > 0) {
            btn.classList.add('relative');
            btn.innerHTML = `<i data-lucide="shield" class="w-4 h-4"></i><span class="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full animate-pulse shadow-md">${count}</span>`;
        } else {
            btn.innerHTML = `<i data-lucide="shield" class="w-4 h-4"></i>`;
        }
    }
    if(window.lucide) window.lucide.createIcons();
}
window.openEditSetModal = function(cod) { if(!isUserAdmin()) return; const set = allData.find(d => d.cod === cod); if(!set) return; document.getElementById('editSetCod').value = set.cod; document.getElementById('editSetModal').classList.remove('hidden'); }
window.saveSetChanges = async function() { 
    if(!isUserAdmin()) return; 
    const cod = parseInt(document.getElementById('editSetCod').value); 
    const updates = { theme: document.getElementById('editSetTheme').value, set_name: document.getElementById('editSetName').value, pieces: parseInt(document.getElementById('editSetPieces').value || 0), minifigs: parseInt(document.getElementById('editSetMinifigs').value || 0), price: parseFloat(document.getElementById('editSetPrice').value || 0), market_price: parseFloat(document.getElementById('editSetMarket').value || 0), is_exclusive: document.getElementById('editSetExclusive').checked, retirement_date: document.getElementById('editSetRetire').value || null }; 
    const { error } = await supabaseClient.from('lego_sets').update(updates).eq('cod', cod); 
    if (error) { alert("Errore: " + error.message); } 
    else { await window.updateDbTimestamp(); alert("Salvato!"); document.getElementById('editSetModal').classList.add('hidden'); window.fetchAllData(); } 
}
window.batchUpdateAllData = async function() { if (!isUserAdmin()) return; const sets = allData.filter(d => !d.set_name || d.pieces === 0 || !d.minifigs); if (sets.length === 0) return alert("Dati completi."); if(!confirm(`Aggiornare ${sets.length} set?`)) return; document.getElementById('updateModal').classList.remove('hidden'); const progress = document.getElementById('updateProgress'); const status = document.getElementById('updateStatus'); for (let i = 0; i < sets.length; i++) { const s = sets[i]; status.innerText = `Aggiorno ${s.cod} (${i+1}/${sets.length})`; progress.style.width = `${((i+1)/sets.length)*100}%`; try { const url = `https://rebrickable.com/api/v3/lego/sets/${s.cod}-1/`; const res = await fetch("https://corsproxy.io/?" + encodeURIComponent(url), { headers: { 'Authorization': 'key ' + API_KEY } }); if (res.ok) { const d = await res.json(); await supabaseClient.from('lego_sets').update({ set_name: d.name, pieces: d.num_parts }).eq('cod', s.cod); } } catch(e) { console.error(e); } await new Promise(r => setTimeout(r, 1000)); } document.getElementById('updateModal').classList.add('hidden'); window.fetchAllData(); }