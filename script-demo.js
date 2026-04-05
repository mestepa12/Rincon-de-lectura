document.addEventListener('DOMContentLoaded', () => {
    // Array de libros (Demo)
    let booksData = [
        { 
            id: 'demo-1', 
            title: 'Mi Rincón de Lectura', 
            author: 'Miguel', 
            section: 'leyendo-ahora', 
            totalPages: 500, 
            currentPage: 125, 
            // CAMBIO: Usamos HTTPS para que Firebase no bloquee la imagen
            cover: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?q=80&w=1000&auto=format&fit=crop', 
            notes: 'Este es tu libro de ejemplo.' 
        }
    ];

    // Selectores del DOM
    const searchBar = document.getElementById('search-bar');
    const mainContent = document.getElementById('main-content');
    const addBookModal = document.getElementById('add-book-modal');
    const addBookForm = document.getElementById('add-book-form');
    const bookSearchInput = document.getElementById('book-search');
    const bookSearchResultsDiv = document.getElementById('book-search-results');
    const bookDetailModal = document.getElementById('book-detail-modal');

    // --- FUNCIÓN DE RENDERIZADO (EL MOTOR DEL BUSCADOR) ---
    const renderBooks = () => {
        // Leemos el texto de la barra superior
        const filterText = (searchBar ? searchBar.value : "").toLowerCase();
        
        // Limpiamos los contenedores antes de pintar
        document.querySelectorAll('.books-container').forEach(c => c.innerHTML = '');
        
        // Filtramos por título o autor
        const filteredBooks = booksData.filter(book => 
            book.title.toLowerCase().includes(filterText) || 
            book.author.toLowerCase().includes(filterText)
        );

        filteredBooks.forEach(book => {
            const container = document.querySelector(`[data-section="${book.section}"]`);
            if (!container) return;

            const art = document.createElement('article');
            art.className = 'book';
            art.innerHTML = `
                <img src="${book.cover || 'https://via.placeholder.com/150x225?text=Sin+Portada'}" 
                     class="book-cover" 
                     onerror="this.src='https://via.placeholder.com/150x225?text=Error+Carga'">
                <div class="book-info">
                    <h3>${book.title}</h3>
                    <p class="author">${book.author}</p>
                </div>
            `;
            art.onclick = () => openModal(book.id);
            container.appendChild(art);
        });
    };

    // --- EVENTO DEL BUSCADOR SUPERIOR ---
    if (searchBar) {
        // Usamos 'input' para que filtre mientras escribes
        searchBar.addEventListener('input', renderBooks);
    }

    // --- BÚSQUEDA EN GOOGLE BOOKS (MODAL) ---
    async function buscarEnGoogle(titulo) {
        if (!titulo.trim()) return [];
        const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(titulo)}&maxResults=5&key=${googleBooksApiKey}`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            return data.items || [];
        } catch (e) { return []; }
    }

    if (bookSearchInput) {
        bookSearchInput.addEventListener('input', async (e) => {
            const query = e.target.value;
            if (query.length > 3) {
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
            } else {
                bookSearchResultsDiv.innerHTML = '';
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

    // --- GESTIÓN DE LIBROS (AÑADIR, MODIFICAR, ELIMINAR) ---
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

    const openModal = (id) => {
        const book = booksData.find(b => b.id === id);
        if (!book) return;
        bookDetailModal.dataset.bookId = id;
        document.getElementById('detail-title').textContent = book.title;
        document.getElementById('detail-author').textContent = book.author;
        document.getElementById('detail-cover').src = book.cover;
        document.getElementById('detail-notes').value = book.notes;
        
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
        bookDetailModal.showModal();
    };

    document.getElementById('save-details-btn').onclick = () => {
        const book = booksData.find(b => b.id === bookDetailModal.dataset.bookId);
        if (book) {
            book.notes = document.getElementById('detail-notes').value;
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

    // Botones de interfaz
    document.getElementById('add-book-btn').onclick = () => addBookModal.showModal();
    document.getElementById('cancel-add-book').onclick = () => addBookModal.close();
    document.getElementById('toggle-theme').onclick = () => {
        const isDark = document.body.classList.toggle('dark-mode');
        document.getElementById('toggle-theme').textContent = isDark ? '☀️' : '🌙';
    };
    document.getElementById('toggle-view').onclick = () => mainContent.classList.toggle('list-view');

    // Inicializar la vista
    renderBooks();
});