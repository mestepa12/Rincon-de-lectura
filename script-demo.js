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
    'lista-deseos': 'Lista de Deseos'
};

    // 2. Selectores
    const searchBar = document.getElementById('search-bar');
    const mainContent = document.getElementById('main-content');
    const addBookModal = document.getElementById('add-book-modal');
    const addBookForm = document.getElementById('add-book-form');
    const bookSearchInput = document.getElementById('book-search');
    const bookSearchResultsDiv = document.getElementById('book-search-results');
    const bookDetailModal = document.getElementById('book-detail-modal');

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
                if (newSection) {
                    book.section = newSection;
                }
            if (book.section === 'leyendo-ahora') {
                book.currentPage = parseInt(document.getElementById('current-page').value) || 0;
            }
            renderBooks();
            bookDetailModal.close();
        }
    };

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