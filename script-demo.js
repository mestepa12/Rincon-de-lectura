import { googleBooksApiKey } from './config.js';
import { loadChart, loadHtml2canvas } from './lazy-libs.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Datos iniciales (Demo): biblioteca precargada para que la demo
    // se sienta viva desde el primer segundo.
    let booksData = [
        // — Leyendo ahora (progreso a la mitad) —
        {
            id: 'demo-1',
            title: 'El Nombre del Viento',
            author: 'Patrick Rothfuss',
            section: 'leyendo-ahora',
            totalPages: 880,
            currentPage: 440,
            cover: 'https://covers.openlibrary.org/b/isbn/9780756404741-M.jpg',
            genre: 'Fantasía',
            notes: '¡Este es un libro de ejemplo! Prueba a actualizar tu progreso o usa el buscador de arriba para añadir los tuyos.'
        },
        {
            id: 'demo-2',
            title: 'Los Pilares de la Tierra',
            author: 'Ken Follett',
            section: 'leyendo-ahora',
            totalPages: 1040,
            currentPage: 520,
            cover: 'https://covers.openlibrary.org/b/isbn/9780451166890-M.jpg',
            genre: 'Novela histórica',
            notes: ''
        },
        // — Terminados (con valoración, género y reseña) —
        {
            id: 'demo-3',
            title: 'Cien Años de Soledad',
            author: 'Gabriel García Márquez',
            section: 'libros-terminados',
            totalPages: 496,
            currentPage: 496,
            rating: 5,
            genre: 'Realismo mágico',
            cover: 'https://covers.openlibrary.org/b/isbn/9780060883287-M.jpg',
            notes: 'Obra maestra absoluta. Macondo y los Buendía se quedan contigo para siempre.'
        },
        {
            id: 'demo-4',
            title: '1984',
            author: 'George Orwell',
            section: 'libros-terminados',
            totalPages: 328,
            currentPage: 328,
            rating: 4,
            genre: 'Distopía',
            cover: 'https://covers.openlibrary.org/b/isbn/9780451524935-M.jpg',
            notes: 'Inquietante y más vigente que nunca. Imposible no subrayar frases.'
        },
        {
            id: 'demo-5',
            title: 'Orgullo y Prejuicio',
            author: 'Jane Austen',
            section: 'libros-terminados',
            totalPages: 416,
            currentPage: 416,
            rating: 4,
            genre: 'Clásico romántico',
            cover: 'https://covers.openlibrary.org/b/isbn/9780141439518-M.jpg',
            notes: 'Elizabeth Bennet es uno de los mejores personajes de la literatura.'
        },
        // — Lista de deseos —
        {
            id: 'demo-6',
            title: 'Proyecto Hail Mary',
            author: 'Andy Weir',
            section: 'lista-deseos',
            totalPages: 496,
            currentPage: 0,
            genre: 'Ciencia ficción',
            cover: 'https://covers.openlibrary.org/b/isbn/9780593135204-M.jpg',
            notes: ''
        }
    ];


    const SECTIONS = {
    'leyendo-ahora': 'Leyendo Ahora',
    'proximas-lecturas': 'Próximas Lecturas',
    'libros-terminados': 'Libros Terminados',
    'lista-deseos': 'Lista de Deseos',
    'libros-abandonados': 'Libros Abandonados'
};

    const LOGROS = [
        { id: 'primer_libro',     icono: '📖', nombre: 'Rompehielos',     descripcion: 'Añade tu primer libro.' },
        { id: 'primer_terminado', icono: '✅', nombre: 'Primera Victoria', descripcion: 'Termina tu primer libro.' },
        { id: 'cinco_libros',     icono: '📚', nombre: 'Coleccionista',    descripcion: 'Acumula 5 libros.' },
        { id: 'maraton',          icono: '🏃', nombre: 'Maratón Lector',   descripcion: 'Lee más de 1.000 páginas en total.' },
        { id: 'critico',          icono: '⭐', nombre: 'Crítico Literario', descripcion: 'Valóra 3 libros terminados.' },
        { id: 'racha_7',          icono: '🔥', nombre: 'Una Semana',       descripcion: 'Mantén una racha de 7 días.' },
        { id: 'racha_30',         icono: '💥', nombre: 'Imparable',        descripcion: 'Mantén una racha de 30 días.' },
    ];

    // 2. Selectores
    const searchBar = document.getElementById('search-bar');
    const mainContent = document.getElementById('main-content');
    const addBookModal = document.getElementById('add-book-modal');
    const addBookForm = document.getElementById('add-book-form');
    const bookSearchInput = document.getElementById('book-search');
    const bookSearchResultsDiv = document.getElementById('book-search-results');
    const bookDetailModal = document.getElementById('book-detail-modal');
    const streakCounter = document.getElementById('streak-counter');
    let pieChartInst = null;
    let barChartInst = null;

    // === SEMILLA DEMO: estado de usuario rico en la primera visita ===
    // Solo si no hay estado previo, para no pisar el progreso de quien
    // ya haya jugado con la demo.
    if (!localStorage.getItem('demo_racha')) {
        localStorage.setItem('demo_racha', '14');
        localStorage.setItem('demo_ultima_lectura', new Date().toISOString().split('T')[0]);
        localStorage.setItem('demo_logros', JSON.stringify([
            'primer_libro', 'primer_terminado', 'cinco_libros',
            'maraton', 'critico', 'racha_7'
        ]));
    }

    // === RACHA DEMO: inicializar desde localStorage ===
    if (streakCounter) {
        const racha = parseInt(localStorage.getItem('demo_racha') || '0', 10);
        streakCounter.textContent = `🔥 ${racha}`;
    }

    function updateStreakDemo() {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const todayStr = hoy.toISOString().split('T')[0];
        const savedDate = localStorage.getItem('demo_ultima_lectura');
        let racha = parseInt(localStorage.getItem('demo_racha') || '0', 10);
        if (!savedDate) { racha = 1; }
        else {
            const ultima = new Date(savedDate); ultima.setHours(0,0,0,0);
            const d = Math.round((hoy - ultima) / 86400000);
            if (d === 0) return; else if (d === 1) racha++; else racha = 1;
        }
        localStorage.setItem('demo_ultima_lectura', todayStr);
        localStorage.setItem('demo_racha', String(racha));
        if (streakCounter) {
            streakCounter.textContent = `🔥 ${racha}`;
            streakCounter.classList.remove('streak-updated');
            void streakCounter.offsetWidth;
            streakCounter.classList.add('streak-updated');
        }
    }

    const mostrarToastLogro = (logro) => {
        const t = document.createElement('div');
        t.className = 'logro-toast';
        t.innerHTML = `<span class="logro-toast-icono">${logro.icono}</span><div><div class="logro-toast-titulo">¡Logro desbloqueado!</div><div class="logro-toast-nombre">${logro.nombre}</div></div>`;
        document.body.appendChild(t);
        setTimeout(() => t.classList.add('logro-toast-visible'), 10);
        setTimeout(() => { t.classList.remove('logro-toast-visible'); setTimeout(() => t.remove(), 500); }, 4500);
    };

    const renderLogros = (desbloqueados = []) => {
        const grid = document.getElementById('logros-grid');
        if (!grid) return;
        grid.innerHTML = '';
        LOGROS.forEach(logro => {
            const ok = desbloqueados.includes(logro.id);
            const div = document.createElement('div');
            div.className = `logro-card ${ok ? 'logro-desbloqueado' : 'logro-bloqueado'}`;
            div.innerHTML = `<div class="logro-icono">${logro.icono}</div><div class="logro-nombre">${logro.nombre}</div><div class="logro-desc">${logro.descripcion}</div><div class="logro-estado">${ok ? '✓ Obtenido' : '🔒'}</div>`;
            grid.appendChild(div);
        });
    };

    const evaluarLogros = () => {
        const desbloqueados = new Set(JSON.parse(localStorage.getItem('demo_logros') || '[]'));
        const racha = parseInt(localStorage.getItem('demo_racha') || '0', 10);
        const nuevos = [];
        if (!desbloqueados.has('primer_libro')     && booksData.length >= 1) nuevos.push('primer_libro');
        if (!desbloqueados.has('primer_terminado') && booksData.some(b => b.section === 'libros-terminados')) nuevos.push('primer_terminado');
        if (!desbloqueados.has('cinco_libros')     && booksData.length >= 5) nuevos.push('cinco_libros');
        const totalPags = booksData.reduce((s, b) => s + (b.currentPage || 0), 0);
        if (!desbloqueados.has('maraton')          && totalPags >= 1000) nuevos.push('maraton');
        const valorados = booksData.filter(b => b.section === 'libros-terminados' && b.rating > 0);
        if (!desbloqueados.has('critico')          && valorados.length >= 3) nuevos.push('critico');
        if (!desbloqueados.has('racha_7')          && racha >= 7)  nuevos.push('racha_7');
        if (!desbloqueados.has('racha_30')         && racha >= 30) nuevos.push('racha_30');
        if (nuevos.length > 0) {
            const actualizados = [...desbloqueados, ...nuevos];
            localStorage.setItem('demo_logros', JSON.stringify(actualizados));
            renderLogros(actualizados);
            nuevos.forEach(id => { const l = LOGROS.find(x => x.id === id); if (l) mostrarToastLogro(l); });
        }
    };

    // === ESTADÍSTICAS (demo) ===
    const renderStats = async () => {
        await loadChart(); // carga Chart.js bajo demanda (define window.Chart)
        if (pieChartInst) { pieChartInst.destroy(); pieChartInst = null; }
        if (barChartInst) { barChartInst.destroy(); barChartInst = null; }
        const isDark = document.body.classList.contains('dark-mode');
        const tc = isDark ? '#E2E8F0' : '#4E443A';
        const gc = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
        const COLORS = ['#9A3B3B','#A1887F','#5B9B6B','#60A5FA','#718096'];
        const counts = {};
        Object.keys(SECTIONS).forEach(k => counts[k] = 0);
        booksData.forEach(b => { if (counts[b.section] !== undefined) counts[b.section]++; });
        const pieCtx = document.getElementById('pieChart');
        if (pieCtx && typeof Chart !== 'undefined') {
            pieChartInst = new Chart(pieCtx, {
                type: 'doughnut',
                data: { labels: Object.values(SECTIONS), datasets: [{ data: Object.keys(SECTIONS).map(k => counts[k]), backgroundColor: COLORS, borderWidth: 0, hoverOffset: 6 }] },
                options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: tc, font: { size: 11 }, padding: 8 } } } }
            });
        }
        const pags = {
            'Leyendo':     booksData.filter(b => b.section === 'leyendo-ahora').reduce((s,b) => s+(b.currentPage||0), 0),
            'Terminados':  booksData.filter(b => b.section === 'libros-terminados').reduce((s,b) => s+(b.totalPages||0), 0),
            'Abandonados': booksData.filter(b => b.section === 'libros-abandonados').reduce((s,b) => s+(b.currentPage||0), 0),
        };
        const barCtx = document.getElementById('barChart');
        if (barCtx && typeof Chart !== 'undefined') {
            barChartInst = new Chart(barCtx, {
                type: 'bar',
                data: { labels: Object.keys(pags), datasets: [{ data: Object.values(pags), backgroundColor: ['#9A3B3B','#5B9B6B','#718096'], borderRadius: 8, borderWidth: 0 }] },
                options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks:{color:tc}, grid:{color:gc} }, y: { ticks:{color:tc}, grid:{color:gc}, beginAtZero:true } } }
            });
        }
        const totalPags = Object.values(pags).reduce((s,v) => s+v, 0);
        const summary = document.getElementById('stats-summary');
        if (summary) {
            summary.innerHTML = [
                ['📚', booksData.length, 'Libros totales'],
                ['✅', counts['libros-terminados']||0, 'Terminados'],
                ['📖', totalPags.toLocaleString('es'), 'Páginas leídas'],
            ].map(([ico,val,lbl]) => `<div class="stat-card"><div class="stat-ico">${ico}</div><div class="stat-num">${val}</div><div class="stat-lbl">${lbl}</div></div>`).join('');
        }
    };

    // 3. Función de Renderizado (Filtrado)
    function renderBooks() {
        const filterText = (searchBar ? searchBar.value : "").toLowerCase();
        
        // Limpiamos todos los contenedores
        document.querySelectorAll('.books-container').forEach(c => c.innerHTML = '');
        
        // Filtramos los libros
        const filtered = booksData.filter(book => 
            book.title.toLowerCase().includes(filterText) || 
            book.author.toLowerCase().includes(filterText)
        );

        filtered.forEach(book => {
            const container = document.querySelector(`[data-section="${book.section}"]`);
            if (container) {
                const art = document.createElement('article');
                art.className = 'book';
                // DOM directo: título/autor pueden venir de Google Books
                const img = document.createElement('img');
                img.className = 'book-cover';
                img.loading = 'lazy';
                img.alt = `Portada de ${book.title}`;
                img.src = book.cover || 'https://via.placeholder.com/150x225?text=Sin+Portada';
                const info = document.createElement('div');
                info.className = 'book-info';
                const h3 = document.createElement('h3');
                h3.textContent = book.title;
                const pa = document.createElement('p');
                pa.className = 'author';
                pa.textContent = book.author;
                info.append(h3, pa);
                art.append(img, info);
                art.onclick = () => openModal(book.id);
                container.appendChild(art);
            }
        });
    }

    // 4. Búsqueda en Google Books (Para añadir nuevos)
    async function buscarEnGoogle(titulo) {
        if (!titulo.trim()) return [];
        const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(titulo)}&maxResults=5&langRestrict=es&country=ES&key=${googleBooksApiKey}`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            return data.items || [];
        } catch (e) { return []; }
    }

    // 5. Eventos de la Interfaz
    if (searchBar) {
        // 'input' detecta cada tecla, 'search' detecta cuando borras con la X del input
        searchBar.addEventListener('input', renderBooks);
        searchBar.addEventListener('search', renderBooks);
        console.log("✅ Buscador detectado y vinculado.");
    } else {
        console.error("❌ ERROR: No se encontró el elemento con ID 'search-bar'");
    }

    const seleccionarLibro = (t, a, c, p) => {
        document.getElementById('title').value = t;
        document.getElementById('author').value = a;
        document.getElementById('cover').value = c;
        document.getElementById('total-pages').value = p;
        bookSearchResultsDiv.innerHTML = '';
        document.getElementById('manual-data-details').open = true;
    };

    if (bookSearchInput) {
        bookSearchInput.addEventListener('input', async (e) => {
            const query = e.target.value;
            if (query.length > 2) {
                const libros = await buscarEnGoogle(query);
                // Construcción vía DOM (sin innerHTML ni onclick inline) para
                // que títulos/autores de la API no puedan inyectar HTML
                bookSearchResultsDiv.innerHTML = '';
                libros.forEach(item => {
                    const info = item.volumeInfo;
                    let cover = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || '';
                    if (cover) {
                        cover = cover
                            .replace(/^http:\/\//i, 'https://')
                            .replace('&edge=curl', '')
                            .replace('&zoom=1', '&zoom=0');
                    }
                    if (!cover) {
                        const isbn = info.industryIdentifiers
                            ?.find(id => id.type === 'ISBN_13' || id.type === 'ISBN_10')
                            ?.identifier;
                        if (isbn) cover = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
                    }
                    const title = info.title || '';
                    const author = info.authors?.[0] || 'Desconocido';
                    const div = document.createElement('div');
                    div.className = 'result-item';
                    const p = document.createElement('p');
                    const b = document.createElement('b');
                    b.textContent = title;
                    p.append(b, ` - ${author}`);
                    div.appendChild(p);
                    div.addEventListener('click', () => seleccionarLibro(title, author, cover, info.pageCount || 0));
                    bookSearchResultsDiv.appendChild(div);
                });
            }
        });
    }

    // 6. Acciones de Formulario
    addBookForm.onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(addBookForm);
        booksData.push({
            id: 'id-' + Date.now(),
            title: fd.get('title'),
            author: fd.get('author'),
            cover: fd.get('cover'),
            section: fd.get('section'),
            totalPages: parseInt(fd.get('totalPages')) || 0,
            currentPage: 0,
            notes: ''
        });
        renderBooks();
        evaluarLogros();
        addBookModal.close();
        addBookForm.reset();
    };

function openModal(id) {
    const book = booksData.find(b => b.id === id);
    if (!book) return;

    // 1. Rellenar datos básicos
    bookDetailModal.dataset.bookId = id;
    document.getElementById('detail-title').textContent = book.title;
    document.getElementById('detail-author').textContent = book.author;
    document.getElementById('detail-cover').src = book.cover;
    document.getElementById('detail-notes').value = book.notes;
    
    // 2. Gestionar la caja de progreso
    const prog = document.getElementById('detail-progress-section');
    if (book.section === 'leyendo-ahora') {
        prog.style.display = 'block';
        document.getElementById('current-page').value = book.currentPage;
        document.getElementById('total-pages-display').textContent = `/ ${book.totalPages} págs`;
        const perc = book.totalPages > 0 ? (book.currentPage / book.totalPages) * 100 : 0;
        document.getElementById('progress-bar-fill').style.transform = `scaleX(${Math.min(perc, 100) / 100})`;
    } else {
        prog.style.display = 'none';
    }

    // Rellenar select: todas las secciones, la actual preseleccionada
    const moveSelect = document.getElementById('move-book-select');
    moveSelect.innerHTML = '';
    Object.entries(SECTIONS).forEach(([key, name]) => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = key === book.section ? `📍 ${name} (actual)` : name;
        if (key === book.section) opt.selected = true;
        moveSelect.appendChild(opt);
    });

    // 4. Abrir por fin el modal
    bookDetailModal.showModal();
}

    document.getElementById('save-details-btn').onclick = () => {
        const book = booksData.find(b => b.id === bookDetailModal.dataset.bookId);
        if (book) {
            book.notes = document.getElementById('detail-notes').value;

            const newSection = document.getElementById('move-book-select').value;
            if (newSection !== book.section) {
                // Cambio de sección: resetear progreso y valoración
                book.section = newSection;
                book.currentPage = 0;
                book.rating = 0;
            } else if (book.section === 'leyendo-ahora') {
                const oldPage = book.currentPage || 0;
                const newPage = parseInt(document.getElementById('current-page').value) || 0;
                if (newPage > oldPage) updateStreakDemo();
                book.currentPage = newPage;
            }

            renderBooks();
            evaluarLogros();
            bookDetailModal.close();
        }
    };

    // === LOGROS: Botón abrir/cerrar modal ===
    const logrosBtn = document.getElementById('logros-btn');
    const logrosModal = document.getElementById('logros-modal');
    const closeLogrosBtn = document.getElementById('close-logros-btn');
    if (logrosBtn && logrosModal) {
        logrosBtn.addEventListener('click', () => {
            renderLogros(JSON.parse(localStorage.getItem('demo_logros') || '[]'));
            logrosModal.showModal();
        });
    }
    if (closeLogrosBtn && logrosModal) {
        closeLogrosBtn.addEventListener('click', () => logrosModal.close());
    }

    // === ESTADÍSTICAS: Botón abrir/cerrar modal ===
    const statsBtn = document.getElementById('stats-btn');
    const statsModal = document.getElementById('stats-modal');
    const closeStatsBtn = document.getElementById('close-stats-btn');
    if (statsBtn && statsModal) {
        statsBtn.addEventListener('click', () => { renderStats(); statsModal.showModal(); });
    }
    if (closeStatsBtn && statsModal) {
        closeStatsBtn.addEventListener('click', () => statsModal.close());
    }

    // === COMPARTIR EN IG/TIKTOK (demo) ===
    const mostrarToastShare = () => {
        const t = document.createElement('div');
        t.style.cssText = `position:fixed;bottom:80px;right:1rem;background:#2D3748;color:white;
            padding:0.8rem 1.2rem;border-radius:10px;font-size:0.83rem;max-width:290px;
            z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.35);opacity:0;transition:opacity 0.3s;
            line-height:1.4;border-left:4px solid #60A5FA;`;
        t.innerHTML = '📸 <b>Generando imagen…</b><br><span style="opacity:0.85">Si la portada es de Google Books y la URL ha cambiado, puede que no aparezca en la imagen.</span>';
        // Appendear al dialog abierto para superar el top-layer del navegador
        const target = document.querySelector('dialog[open]') || document.body;
        target.appendChild(t);
        setTimeout(() => t.style.opacity = '1', 10);
        setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 7000);
    };

    // Ver script.js: normaliza URLs http:// y el "edge=curl" de Google Books
    const normalizarCoverUrl = (url) => (url || '')
        .replace(/^http:\/\//i, 'https://')
        .replace('&edge=curl', '')
        .replace(/(covers\.openlibrary\.org\/b\/.+)-M\.jpg$/i, '$1-L.jpg');

    const fetchImageAsDataUrl = async (url) => {
        if (!url) return null;
        const toDataUrl = async (fetchUrl) => {
            const resp = await fetch(fetchUrl, { cache: 'force-cache' });
            if (!resp.ok) throw new Error('failed');
            const blob = await resp.blob();
            return new Promise((res, rej) => {
                const reader = new FileReader();
                reader.onload = () => res(reader.result);
                reader.onerror = rej;
                reader.readAsDataURL(blob);
            });
        };
        const limpia = normalizarCoverUrl(url);
        try { return await toDataUrl(limpia); } catch {}
        try { return await toDataUrl(`https://wsrv.nl/?url=${encodeURIComponent(limpia)}&w=600`); } catch {}
        try { return await toDataUrl(`https://corsproxy.io/?${encodeURIComponent(limpia)}`); } catch {}
        return null;
    };

    const portadaPlaceholder = (titulo) => {
        const inicial = (titulo || '').trim().charAt(0).toUpperCase() || '?';
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="720">' +
            '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0" stop-color="#5d2a2e"/><stop offset="1" stop-color="#2b1214"/></linearGradient></defs>' +
            '<rect width="480" height="720" fill="url(#g)"/>' +
            '<rect x="16" y="16" width="448" height="688" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>' +
            '<text x="240" y="440" font-family="Georgia, serif" font-size="240" fill="rgba(253,251,247,0.85)" text-anchor="middle">' + inicial + '</text>' +
            '</svg>';
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    };

    const tonoDominante = (imgEl) => {
        try {
            const c = document.createElement('canvas');
            c.width = c.height = 24;
            const cx = c.getContext('2d');
            cx.drawImage(imgEl, 0, 0, 24, 24);
            const d = cx.getImageData(0, 0, 24, 24).data;
            let r = 0, g = 0, b = 0, n = 0;
            for (let i = 0; i < d.length; i += 4) {
                if (d[i + 3] < 200) continue;
                r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
            }
            if (!n) return null;
            r = r / n / 255; g = g / n / 255; b = b / n / 255;
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            if (max === min) return { h: 350, s: 30 };
            const dif = max - min;
            let h;
            if (max === r) h = ((g - b) / dif) % 6;
            else if (max === g) h = (b - r) / dif + 2;
            else h = (r - g) / dif + 4;
            h = Math.round(h * 60);
            if (h < 0) h += 360;
            const l = (max + min) / 2;
            const s = Math.round((dif / (1 - Math.abs(2 * l - 1))) * 100);
            return { h, s: Math.min(60, Math.max(28, s)) };
        } catch { return null; }
    };

    const fondoTarjeta = ({ h, s }) =>
        'radial-gradient(130% 85% at 50% 0%, rgba(255, 240, 220, 0.10), transparent 55%), ' +
        'radial-gradient(140% 90% at 50% 115%, rgba(0, 0, 0, 0.5), transparent 60%), ' +
        `linear-gradient(160deg, hsl(${h}, ${s}%, 9%) 0%, hsl(${h}, ${s}%, 19%) 48%, hsl(${h}, ${s}%, 32%) 100%)`;

    const shareAsImage = async (book) => {
        mostrarToastShare();
        const card = document.getElementById('export-card');
        const coverEl = document.getElementById('export-cover');

        const coverDataUrl = await fetchImageAsDataUrl(book.cover);
        card.style.background = ''; // degradado de marca del CSS por defecto
        await new Promise((res) => { coverEl.onload = coverEl.onerror = res; coverEl.src = coverDataUrl || portadaPlaceholder(book.title); });
        coverEl.style.display = '';
        if (coverDataUrl) {
            const tono = tonoDominante(coverEl);
            if (tono) card.style.background = fondoTarjeta(tono);
        }

        document.getElementById('export-title').textContent = book.title || '';
        document.getElementById('export-author').textContent = book.author || '';
        document.getElementById('export-notes').textContent = book.notes || '';
        const r = book.rating || 0;
        document.getElementById('export-stars').textContent = r > 0 ? '★'.repeat(r) + '☆'.repeat(5 - r) : '';
        card.style.display = 'flex';
        try {
            const html2canvas = await loadHtml2canvas(); // carga bajo demanda
            const canvas = await html2canvas(card, { scale: 2, useCORS: false, allowTaint: false, logging: false });
            const link = document.createElement('a');
            link.download = `${(book.title || 'libro').replace(/[^a-z0-9]/gi,'_')}_resena.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (err) {
            console.error('Error generando imagen:', err);
            alert('No se pudo generar la imagen.');
        } finally {
            card.style.display = 'none';
            coverEl.style.display = '';
        }
    };


    const shareIgBtn = document.getElementById('share-ig-btn');
    if (shareIgBtn) {
        shareIgBtn.addEventListener('click', () => {
            const book = booksData.find(b => b.id === bookDetailModal.dataset.bookId);
            if (book) shareAsImage(book);
        });
    }

    document.getElementById('delete-book-modal-btn').onclick = () => {
        booksData = booksData.filter(b => b.id !== bookDetailModal.dataset.bookId);
        renderBooks();
        bookDetailModal.close();
    };



    // Botones Header
    document.getElementById('add-book-btn').onclick = () => addBookModal.showModal();
    document.getElementById('cancel-add-book').onclick = () => addBookModal.close();
    document.getElementById('toggle-theme').onclick = () => {
        const isDark = document.body.classList.toggle('dark-mode');
        document.getElementById('toggle-theme').textContent = isDark ? '☀️' : '🌙';
    };
    document.getElementById('toggle-view').onclick = () => {
        mainContent.classList.toggle('list-view');
        const btn = document.getElementById('toggle-view');
        btn.textContent = mainContent.classList.contains('list-view') ? '⊞' : '☰';
    };

    // Lanzamos el primer render para mostrar el libro de Miguel
    renderBooks();
});