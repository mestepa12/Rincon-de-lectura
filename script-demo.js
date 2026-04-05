document.addEventListener('DOMContentLoaded', () => {
    // Array en memoria: Esto es lo que se borra al cerrar la pestaña
    let booksData = [
        { id: 'demo1', title: 'Libro de Ejemplo', author: 'Autor Demo', section: 'leyendo-ahora', totalPages: 300, currentPage: 150, cover: 'https://via.placeholder.com/150x225?text=Demo', notes: 'Esto es una nota de prueba.' }
    ];

    // Selectores (Mismos que tu app)
    const mainContent = document.getElementById('main-content');
    const toggleViewBtn = document.getElementById('toggle-view');
    const toggleThemeBtn = document.getElementById('toggle-theme');
    const searchBar = document.getElementById('search-bar');
    const addBookModal = document.getElementById('add-book-modal');
    const addBookForm = document.getElementById('add-book-form');
    const bookSearchInput = document.getElementById('book-search');
    const bookSearchResultsDiv = document.getElementById('book-search-results');
    const bookDetailModal = document.getElementById('book-detail-modal');

    // --- BÚSQUEDA GOOGLE BOOKS (Copiado de tu script.js) ---
    async function buscarLibro(titulo) {
        const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(titulo)}&maxResults=5&key=${googleBooksApiKey}`;
        const res = await fetch(url);
        const data = await res.json();
        return data.items || [];
    }

    bookSearchInput.addEventListener('input', async (e) => {
        const query = e.target.value;
        if (query.length > 3) {
            const libros = await buscarLibro(query);
            bookSearchResultsDiv.innerHTML = libros.map(item => `
                <div class="result-item" onclick="seleccionarLibro('${item.volumeInfo.title}', '${item.volumeInfo.authors?.[0]}', '${item.volumeInfo.imageLinks?.thumbnail}', ${item.volumeInfo.pageCount})">
                    <p><b>${item.volumeInfo.title}</b> - ${item.volumeInfo.authors?.[0]}</p>
                </div>
            `).join('');
        }
    });

    window.seleccionarLibro = (t, a, c, p) => {
        document.getElementById('title').value = t;
        document.getElementById('author').value = a || 'Desconocido';
        document.getElementById('cover').value = c || '';
        document.getElementById('total-pages').value = p || 0;
        bookSearchResultsDiv.innerHTML = '';
        document.getElementById('manual-data-details').open = true;
    };

    // --- RENDERIZADO (Misma lógica visual) ---
    const renderBooks = () => {
        document.querySelectorAll('.books-container').forEach(c => c.innerHTML = '');
        booksData.forEach(book => {
            const container = document.querySelector(`[data-section="${book.section}"]`);
            const art = document.createElement('article');
            art.className = 'book';
            art.innerHTML = `
                <img src="${book.cover}" class="book-cover">
                <div class="book-info">
                    <h3>${book.title}</h3>
                    <p class="author">${book.author}</p>
                </div>
            `;
            art.onclick = () => openModal(book.id);
            container.appendChild(art);
        });
    };

    // --- ACCIONES (Todo local, nada de Firebase) ---
    addBookForm.onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(addBookForm);
        const newBook = {
            id: Date.now().toString(),
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
        bookDetailModal.dataset.bookId = id;
        document.getElementById('detail-title').textContent = book.title;
        document.getElementById('detail-author').textContent = book.author;
        document.getElementById('detail-cover').src = book.cover;
        document.getElementById('detail-notes').value = book.notes;
        
        if(book.section === 'leyendo-ahora') {
            document.getElementById('detail-progress-section').style.display = 'block';
            document.getElementById('current-page').value = book.currentPage;
            document.getElementById('total-pages-display').textContent = `/ ${book.totalPages} páginas`;
            const perc = (book.currentPage / book.totalPages) * 100;
            document.getElementById('progress-bar-fill').style.width = perc + '%';
        } else {
            document.getElementById('detail-progress-section').style.display = 'none';
        }
        bookDetailModal.showModal();
    };

    document.getElementById('save-details-btn').onclick = () => {
        const id = bookDetailModal.dataset.bookId;
        const book = booksData.find(b => b.id === id);
        book.notes = document.getElementById('detail-notes').value;
        if(book.section === 'leyendo-ahora') {
            book.currentPage = parseInt(document.getElementById('current-page').value);
        }
        renderBooks();
        bookDetailModal.close();
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