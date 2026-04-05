document.addEventListener('DOMContentLoaded', () => {
    // Array en memoria: Esto es lo que se borra al cerrar la pestaña
    let booksData = [
        { 
            id: 'demo1', 
            title: 'Mi Rincón de Lectura', 
            author: 'Miguel', 
            section: 'leyendo-ahora', 
            totalPages: 500, 
            currentPage: 125, 
            cover: 'portada-demo.jfif', 
            notes: 'Este es un libro de ejemplo en tu biblioteca temporal.' 
        }
    ];

    // Selectores
    const mainContent = document.getElementById('main-content');
    const toggleViewBtn = document.getElementById('toggle-view');
    const toggleThemeBtn = document.getElementById('toggle-theme');
    const searchBar = document.getElementById('search-bar');
    const addBookModal = document.getElementById('add-book-modal');
    const addBookForm = document.getElementById('add-book-form');
    const bookSearchInput = document.getElementById('book-search');
    const bookSearchResultsDiv = document.getElementById('book-search-results');
    const bookDetailModal = document.getElementById('book-detail-modal');

    // --- BÚSQUEDA GOOGLE BOOKS ---
    async function buscarLibro(titulo) {
        if (!titulo.trim()) return [];
        const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(titulo)}&maxResults=5&key=${googleBooksApiKey}`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            return data.items || [];
        } catch (error) {
            console.error("Error buscando libros:", error);
            return [];
        }
    }

    bookSearchInput.addEventListener('input', async (e) => {
        const query = e.target.value;
        if (query.length > 3) {
            const libros = await buscarLibro(query);
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

    window.seleccionarLibro = (t, a, c, p) => {
        document.getElementById('title').value = t;
        document.getElementById('author').value = a;
        document.getElementById('cover').value = c;
        document.getElementById('total-pages').value = p;
        bookSearchResultsDiv.innerHTML = '';
        document.getElementById('manual-data-details').open = true;
    };

    // --- RENDERIZADO ---
    const renderBooks = () => {
        const filterText = (searchBar.value || "").toLowerCase();
        document.querySelectorAll('.books-container').forEach(c => c.innerHTML = '');
        
        booksData.filter(b => b.title.toLowerCase().includes(filterText) || b.author.toLowerCase().includes(filterText))
        .forEach(book => {
            const container = document.querySelector(`[data-section="${book.section}"]`);
            if (!container) return;

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
        });
    };

    // --- ACCIONES ---
    addBookForm.onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(addBookForm);
        const newBook = {
            id: 'id-' + Date.now(),
            title: fd.get('title'),
            author: fd.get('author'),
            cover: fd.get('cover'),
            section: fd.get('section'),
            totalPages: parseInt(fd.get('totalPages')) || 0,
            currentPage: 0,
            notes: ''
        };
        booksData.push(newBook);
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
        
        const progSection = document.getElementById('detail-progress-section');
        if(book.section === 'leyendo-ahora') {
            progSection.style.display = 'block';
            document.getElementById('current-page').value = book.currentPage;
            document.getElementById('total-pages-display').textContent = `/ ${book.totalPages} páginas`;
            const perc = book.totalPages > 0 ? (book.currentPage / book.totalPages) * 100 : 0;
            document.getElementById('progress-bar-fill').style.width = perc + '%';
        } else {
            progSection.style.display = 'none';
        }
        bookDetailModal.showModal();
    };

    document.getElementById('save-details-btn').onclick = () => {
        const id = bookDetailModal.dataset.bookId;
        const book = booksData.find(b => b.id === id);
        if (book) {
            book.notes = document.getElementById('detail-notes').value;
            if(book.section === 'leyendo-ahora') {
                book.currentPage = parseInt(document.getElementById('current-page').value) || 0;
            }
            renderBooks();
            bookDetailModal.close();
        }
    };

    document.getElementById('delete-book-modal-btn').onclick = () => {
        const id = bookDetailModal.dataset.bookId;
        booksData = booksData.filter(b => b.id !== id);
        renderBooks();
        bookDetailModal.close();
    };

    // Tema y Vista
    toggleThemeBtn.onclick = () => {
        const isDark = document.body.classList.toggle('dark-mode');
        toggleThemeBtn.textContent = isDark ? '☀️' : '🌙';
    };
    toggleViewBtn.onclick = () => mainContent.classList.toggle('list-view');
    document.getElementById('add-book-btn').onclick = () => addBookModal.showModal();
    document.getElementById('cancel-add-book').onclick = () => addBookModal.close();

    renderBooks();
});