import { googleBooksApiKey } from './config.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Datos iniciales (Demo)
    let booksData = [
        { 
            id: 'demo-1', 
            title: 'Mi Rincón de Lectura', 
            author: 'Miguel', 
            section: 'leyendo-ahora', 
            totalPages: 500, 
            currentPage: 125, 
            // Usamos HTTPS para que no salga el icono de imagen rota
            cover: 'portada-demo.jfif', 
            notes: 'Este es tu libro de ejemplo. ¡Prueba el buscador de arriba!' 
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
                art.innerHTML = `
                    <img src="${book.cover || 'https://via.placeholder.com/150x225?text=Sin+Portada'}" class="book-cover">
                    <div class="book-info">
                        <h3>${book.title}</h3>
                        <p class="author">${book.author}</p>
                    </div>
                `;
                art.onclick = () => openModal(book.id);
                container.appendChild(art);
            }
        });
    }

    // 4. Búsqueda en Google Books (Para añadir nuevos)
    async function buscarEnGoogle(titulo) {
        if (!titulo.trim()) return [];
        const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(titulo)}&maxResults=5&key=${googleBooksApiKey}`;
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

    if (bookSearchInput) {
        bookSearchInput.addEventListener('input', async (e) => {
            const query = e.target.value;
            if (query.length > 2) {
                const libros = await buscarEnGoogle(query);
                bookSearchResultsDiv.innerHTML = libros.map(item => {
                    const info = item.volumeInfo;
                    const cover = info.imageLinks ? info.imageLinks.thumbnail.replace('http://', 'https://') : '';
                    return `
                        <div class="result-item" onclick="seleccionarLibro('${info.title.replace(/'/g, "\\'")}', '${(info.authors?.[0] || 'Desconocido').replace(/'/g, "\\'")}', '${cover}', ${info.pageCount || 0})">
                            <p><b>${info.title}</b> - ${info.authors?.[0] || 'Desconocido'}</p>
                        </div>
                    `;
                }).join('');
            }
        });
    }

    window.seleccionarLibro = (t, a, c, p) => {
        document.getElementById('title').value = t;
        document.getElementById('author').value = a;
        document.getElementById('cover').value = c;
        document.getElementById('total-pages').value = p;
        bookSearchResultsDiv.innerHTML = '';
        document.getElementById('manual-data-details').open = true;
    };

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
        document.getElementById('progress-bar-fill').style.width = Math.min(perc, 100) + '%';
    } else {
        prog.style.display = 'none';
    }

    // 3. RELLENAR EL SELECT (¡Aquí está la magia!)
    const moveSelect = document.getElementById('move-book-select');
    
    // Limpiamos y ponemos la opción por defecto
    moveSelect.innerHTML = '<option value="" disabled selected>Selecciona un destino...</option>';
    
    // Recorremos las secciones y añadimos las que NO son la actual
    Object.entries(SECTIONS).forEach(([key, name]) => {
        if (key !== book.section) {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = name;
            moveSelect.appendChild(opt);
        }
    });

    // 4. Abrir por fin el modal
    bookDetailModal.showModal();
}

    document.getElementById('save-details-btn').onclick = () => {
        const book = booksData.find(b => b.id === bookDetailModal.dataset.bookId);
        if (book) {
            book.notes = document.getElementById('detail-notes').value;

            const newSection = document.getElementById('move-book-select').value;
            if (newSection) book.section = newSection;

            if (book.section === 'leyendo-ahora') {
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
    document.getElementById('toggle-view').onclick = () => mainContent.classList.toggle('list-view');

    // Lanzamos el primer render para mostrar el libro de Miguel
    renderBooks();
});