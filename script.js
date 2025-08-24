document.addEventListener('DOMContentLoaded', () => {

    // --- AUTENTICACIÓN: El portero de nuestra aplicación ---
    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            // Si hay un usuario, significa que ha iniciado sesión.
            // Ejecutamos toda la lógica de la librería.
            console.log("Usuario autenticado:", user.email);
            runApp();
        } else {
            // Si no hay usuario, lo redirigimos a la página de login.
            console.log("Usuario no autenticado. Redirigiendo a login...");
            // Asegurarnos de no estar ya en login.html para evitar un bucle
            if (window.location.pathname.indexOf('login.html') === -1) {
                window.location.href = 'login.html';
            }
        }
    });

    // --- Toda la lógica de la app ahora está dentro de esta función ---
    function runApp() {
        const db = firebase.firestore();
        const booksCollection = db.collection('books');

        const SECTIONS = {
            'leyendo-ahora': 'Leyendo Ahora',
            'proximas-lecturas': 'Próximas Lecturas',
            'libros-terminados': 'Libros Terminados',
            'lista-deseos': 'Lista de Deseos'
        };
        
        let booksData = []; // El array local empieza vacío. Firebase lo llenará.

        // --- Selectores del DOM ---
        const mainContent = document.getElementById('main-content');
        const toggleViewBtn = document.getElementById('toggle-view');
        const toggleThemeBtn = document.getElementById('toggle-theme');
        const searchBar = document.getElementById('search-bar');
        const addBookModal = document.getElementById('add-book-modal');
        const addBookForm = document.getElementById('add-book-form');
        const addBookBtn = document.getElementById('add-book-btn');
        const cancelAddBookBtn = document.getElementById('cancel-add-book');
        const totalPagesInput = document.getElementById('total-pages');
        const detailCoverContainer = document.getElementById('detail-cover-container');
        const bookDetailModal = document.getElementById('book-detail-modal');
        const detailCover = document.getElementById('detail-cover');
        const detailTitle = document.getElementById('detail-title');
        const detailAuthor = document.getElementById('detail-author');
        const detailProgressSection = document.getElementById('detail-progress-section');
        const currentPageInput = document.getElementById('current-page');
        const totalPagesDisplay = document.getElementById('total-pages-display');
        const progressBar = document.getElementById('progress-bar-fill');
        const progressPercentage = document.getElementById('progress-percentage');
        const detailNotes = document.getElementById('detail-notes');
        const saveDetailsBtn = document.getElementById('save-details-btn');
        const moveBookSelect = document.getElementById('move-book-select');
        const deleteBookModalBtn = document.getElementById('delete-book-modal-btn');
        const cancelDetailModalBtn = document.getElementById('cancel-detail-modal');
        const logoutBtn = document.getElementById('logout-btn'); // Selector para el botón de cerrar sesión
        
        const createExtraInfoHTML = (book) => {
            if (book.section === 'leyendo-ahora') {
                const currentPage = book.currentPage || 0;
                const totalPages = book.totalPages || '??';
                return `<div class="book-extra-info"><span>Página ${currentPage} de ${totalPages}</span></div>`;
            }
            if (book.section === 'libros-terminados') {
                const stars = Array.from({ length: 5 }, (_, i) => `<button class="star ${i < (book.rating || 0) ? 'filled' : ''}" data-value="${i + 1}" aria-label="Valorar con ${i + 1} estrellas">★</button>`).join('');
                return `<div class="book-extra-info"><div class="rating-stars" role="group">${stars}</div></div>`;
            }
            return '';
        };

        const createBookElement = (book) => {
            const bookArticle = document.createElement('article');
            bookArticle.className = 'book';
            bookArticle.dataset.id = book.id;
            const defaultCover = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
            bookArticle.innerHTML = `
                <img src="${book.cover || defaultCover}" alt="Portada de ${book.title}" class="book-cover" loading="lazy">
                <div class="book-info">
                    <h3>${book.title}</h3>
                    <p class="author">${book.author}</p>
                    ${createExtraInfoHTML(book)}
                </div>
            `;
            return bookArticle;
        };

        const renderBooks = () => {
            document.querySelectorAll('.books-container').forEach(c => c.innerHTML = '');
            booksData.forEach(book => {
                const container = document.querySelector(`.books-container[data-section="${book.section}"]`);
                if (container) container.appendChild(createBookElement(book));
            });
        };
        
        const updateProgressVisuals = (currentPage, totalPages) => {
            if (!totalPages || totalPages <= 0) {
                progressPercentage.textContent = '-';
                progressBar.style.width = '0%';
                return;
            }
            const percentage = Math.round((currentPage / totalPages) * 100);
            progressPercentage.textContent = `${percentage}%`;
            progressBar.style.width = `${percentage}%`;
        };

        const openDetailModal = (bookId) => {
            const book = booksData.find(b => b.id === bookId);
            if (!book) return;
            bookDetailModal.dataset.bookId = book.id;
            detailCover.src = book.cover || '';
            detailTitle.textContent = book.title;
            detailAuthor.textContent = book.author;
            detailNotes.value = book.notes || '';
            if (book.section === 'leyendo-ahora') {
                detailProgressSection.style.display = 'block';
                const currentPage = book.currentPage || 0;
                const totalPages = book.totalPages || 0;
                currentPageInput.value = currentPage;
                currentPageInput.max = totalPages;
                totalPagesDisplay.textContent = `/ ${totalPages} páginas`;
                updateProgressVisuals(currentPage, totalPages);
            } else {
                detailProgressSection.style.display = 'none';
            }
            
            moveBookSelect.innerHTML = '';
            const defaultOption = document.createElement('option');
            defaultOption.textContent = 'Mover a otra sección...';
            defaultOption.disabled = true;
            defaultOption.selected = true;
            moveBookSelect.appendChild(defaultOption);
            Object.entries(SECTIONS).forEach(([key, name]) => {
                if (key !== book.section) {
                    const option = document.createElement('option');
                    option.value = key;
                    option.textContent = name;
                    moveBookSelect.appendChild(option);
                }
            });

            bookDetailModal.showModal();
        };

        const handleAddBook = (e) => {
            e.preventDefault();
            const formData = new FormData(addBookForm);
            const newBookId = Date.now();
            const newBook = {
                id: newBookId,
                title: formData.get('title'),
                author: formData.get('author'),
                cover: formData.get('cover'),
                section: formData.get('section'),
                totalPages: parseInt(totalPagesInput.value, 10) || 0,
                currentPage: 0, notes: '', rating: 0
            };
            booksCollection.doc(String(newBookId)).set(newBook).then(() => {
                console.log("Libro añadido a Firebase");
                addBookForm.reset();
                addBookModal.close();
            }).catch(error => console.error("Error al añadir libro:", error));
        };
        
        const handleSaveDetails = () => {
            const bookId = parseInt(bookDetailModal.dataset.bookId, 10);
            const book = booksData.find(b => b.id === bookId);
            if (!book) return;

            const updatedData = {
                notes: detailNotes.value,
                cover: book.cover // Guardamos la portada por si ha cambiado
            };

            if (book.section === 'leyendo-ahora') {
                const newPage = parseInt(currentPageInput.value, 10) || 0;
                updatedData.currentPage = newPage > book.totalPages ? book.totalPages : newPage;
            }

            booksCollection.doc(String(bookId)).update(updatedData).then(() => {
                console.log("Detalles actualizados en Firebase");
                bookDetailModal.close();
            }).catch(error => console.error("Error al guardar detalles:", error));
        };

        const handleDeleteBook = (bookId) => {
            booksCollection.doc(String(bookId)).delete().catch(error => console.error("Error al eliminar libro:", error));
        };

        const handleMoveBook = (bookId, targetSection) => {
            const bookRef = booksCollection.doc(String(bookId));
            bookRef.update({
                section: targetSection,
                currentPage: 0,
                rating: firebase.firestore.FieldValue.delete()
            }).catch(error => console.error("Error al mover el libro:", error));
        };
        
        const handleRateBook = (bookId, rating) => {
            booksCollection.doc(String(bookId)).update({ rating: rating }).catch(error => console.error("Error al valorar el libro:", error));
        };
        
        const handleCoverChange = (bookId, newCoverUrl) => {
             booksCollection.doc(String(bookId)).update({ cover: newCoverUrl }).catch(error => console.error("Error al cambiar la portada:", error));
        };

        const handleMainContentClick = (e) => {
            const bookElement = e.target.closest('.book');
            if (!bookElement) return;
            if (e.target.matches('.star')) {
                handleRateBook(parseInt(bookElement.dataset.id, 10), parseInt(e.target.dataset.value, 10));
                return;
            }
            openDetailModal(parseInt(bookElement.dataset.id, 10));
        };

        const handleSearch = (e) => {
            const query = e.target.value.toLowerCase();
            document.querySelectorAll('.book').forEach(bookElement => {
                const title = bookElement.querySelector('h3').textContent.toLowerCase();
                const author = bookElement.querySelector('.author').textContent.toLowerCase();
                bookElement.classList.toggle('hidden', !title.includes(query) && !author.includes(query));
            });
        };

        const setupTheme = () => {
            const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
            document.body.classList.toggle('dark-mode', savedTheme === 'dark');
            toggleThemeBtn.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
        };

        const toggleTheme = () => {
            const isDark = document.body.classList.toggle('dark-mode');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            toggleThemeBtn.textContent = isDark ? '☀️' : '🌙';
        };

        // --- EL CORAZÓN DE FIREBASE: ESCUCHADOR EN TIEMPO REAL ---
        booksCollection.onSnapshot(snapshot => {
            booksData = [];
            snapshot.forEach(doc => {
                booksData.push(doc.data());
            });
            booksData.sort((a, b) => a.title.localeCompare(b.title));
            renderBooks();
        }, error => {
            console.error("Error al recibir datos de Firebase: ", error);
            alert("No se pudo conectar a la base de datos.");
        });

        // --- EVENT LISTENERS ---
        addBookBtn.addEventListener('click', () => addBookModal.showModal());
        cancelAddBookBtn.addEventListener('click', () => addBookModal.close());
        addBookForm.addEventListener('submit', handleAddBook);
        toggleViewBtn.addEventListener('click', () => mainContent.classList.toggle('list-view'));
        toggleThemeBtn.addEventListener('click', toggleTheme);
        mainContent.addEventListener('click', handleMainContentClick);
        searchBar.addEventListener('input', handleSearch);
        saveDetailsBtn.addEventListener('click', handleSaveDetails);
        cancelDetailModalBtn.addEventListener('click', () => bookDetailModal.close());
        
        currentPageInput.addEventListener('input', () => {
            const bookId = parseInt(bookDetailModal.dataset.bookId, 10);
            const book = booksData.find(b => b.id === bookId);
            if (book) updateProgressVisuals(parseInt(currentPageInput.value, 10), book.totalPages);
        });

        deleteBookModalBtn.addEventListener('click', () => {
            const bookId = parseInt(bookDetailModal.dataset.bookId, 10);
            if (bookId && confirm('¿Estás seguro de que quieres eliminar este libro?')) {
                handleDeleteBook(bookId);
                bookDetailModal.close();
            }
        });

        detailCoverContainer.addEventListener('click', () => {
            const bookId = parseInt(bookDetailModal.dataset.bookId, 10);
            const book = booksData.find(b => b.id === bookId);
            if (!book) return;
            const newCoverUrl = prompt('Introduce la nueva URL para la portada:', book.cover || '');
            if (newCoverUrl !== null) {
                // Actualiza la imagen visualmente, el cambio se guarda con el botón "Guardar"
                detailCover.src = newCoverUrl || 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
                book.cover = newCoverUrl; // Actualizamos el dato local para que se guarde después
            }
        });
        
        moveBookSelect.addEventListener('change', () => {
            const bookId = parseInt(bookDetailModal.dataset.bookId, 10);
            const newSection = moveBookSelect.value;
            if (bookId && newSection) {
                handleMoveBook(bookId, newSection);
                bookDetailModal.close();
            }
        });

        logoutBtn.addEventListener('click', () => {
            firebase.auth().signOut();
        });

        // --- INICIALIZACIÓN ---
        setupTheme();
    }
});