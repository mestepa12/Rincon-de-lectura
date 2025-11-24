document.addEventListener('DOMContentLoaded', () => {

    // --- AUTENTICACIÓN: El portero de nuestra aplicación ---
    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            console.log("Usuario autenticado:", user.email);
            // Pasamos el usuario a la función principal
            runApp(user); 
        } else {
            console.log("Usuario no autenticado. Redirigiendo a login...");
            if (window.location.pathname.indexOf('login.html') === -1) {
                window.location.href = 'login.html';
            }
        } 
    });

    // --- FUNCIÓN PRINCIPAL DE LA APP ---
    function runApp(user) {
        const db = firebase.firestore();
        const userBooksCollection = db.collection('users').doc(user.uid).collection('books');

        const SECTIONS = {
            'leyendo-ahora': 'Leyendo Ahora',
            'proximas-lecturas': 'Próximas Lecturas',
            'libros-terminados': 'Libros Terminados',
            'lista-deseos': 'Lista de Deseos'
        };
        
        let booksData = []; 

        // --- SELECTORES DOM ---
        const mainContent = document.getElementById('main-content');
        const toggleViewBtn = document.getElementById('toggle-view');
        const toggleThemeBtn = document.getElementById('toggle-theme');
        const searchBar = document.getElementById('search-bar');
        
        // Modal Añadir Libro y Búsqueda Google
        const addBookModal = document.getElementById('add-book-modal');
        const addBookForm = document.getElementById('add-book-form');
        const addBookBtn = document.getElementById('add-book-btn');
        const cancelAddBookBtn = document.getElementById('cancel-add-book');
        const totalPagesInput = document.getElementById('total-pages');
        const bookSearchInput = document.getElementById('book-search');
        const bookSearchResultsDiv = document.getElementById('book-search-results');

        // Modal Detalles
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
        const logoutBtn = document.getElementById('logout-btn');
        
        // ===============================================
        // === 1. INTEGRACIÓN API GOOGLE BOOKS ===========
        // ===============================================

        async function buscarLibroPorTitulo(titulo) {
            // Verificamos si la clave existe en config-dev.js
            if (typeof googleBooksApiKey === 'undefined' || !googleBooksApiKey) {
                console.error("Falta la variable googleBooksApiKey en config.js");
                return [];
            }

            const query = encodeURIComponent(titulo);
            const url = `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=5&key=${googleBooksApiKey}`;

            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
                
                const data = await response.json();

                if (data.items && data.items.length > 0) {
                    return data.items.map(item => {
                        const info = item.volumeInfo;
                        
                        // --- CORRECCIÓN AQUÍ ---
                        // 1. Declaramos la variable coverUrl antes de usarla
                        let coverUrl = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || '';
                        
                        // 2. Si hay imagen, la mejoramos
                        if (coverUrl) {
                            coverUrl = coverUrl
                                .replace(/^http:\/\//i, 'https://') // Forzar HTTPS
                                .replace('&edge=curl', '')      // Quitar borde doblado
                                .replace('&zoom=1', '&zoom=0'); // Pedir alta calidad
                        }

                        // 3. Ahora devolvemos el objeto usando la variable ya definida
                        return {
                            title: info.title || 'Sin título',
                            author: info.authors ? info.authors.join(', ') : 'Autor desconocido',
                            cover: coverUrl, // Ahora sí existe
                            totalPages: info.pageCount || 0,
                            link: info.infoLink || info.previewLink || ''
                        };
                    });
                }
                return [];
            } catch (error) {
                console.error("Error buscando en Google Books:", error);
                return [];
            }
        }

        function mostrarResultadosBusqueda(resultados) {
            bookSearchResultsDiv.innerHTML = '';
            if (resultados.length === 0) {
                bookSearchResultsDiv.innerHTML = '<div style="padding: 0.5rem; font-size: 0.9rem; color: var(--text-color);">No se encontraron resultados.</div>';
                return;
            }

            resultados.forEach(libro => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'result-item';
                // Estilo inline temporal o usar clase CSS .result-item
                itemDiv.innerHTML = `
                    <img src="${libro.cover || 'https://placehold.co/40x60?text=No+Img'}" alt="cover" style="width:40px; height:60px; object-fit:cover; border-radius:3px;">
                    <div style="margin-left: 10px;">
                        <h4 style="margin:0; font-size:0.9rem;">${libro.title}</h4>
                        <p style="margin:0; font-size:0.8rem; color:var(--accent-color);">${libro.author}</p>
                    </div>
                `;
                
                itemDiv.addEventListener('click', () => {
                    // Rellenar formulario
                    document.getElementById('title').value = libro.title;
                    document.getElementById('author').value = libro.author;
                    document.getElementById('cover').value = libro.cover;
                    document.getElementById('total-pages').value = libro.totalPages;
                    document.getElementById('googleLink').value = libro.link;
                    
                    // Limpiar búsqueda
                    bookSearchResultsDiv.innerHTML = '';
                    bookSearchInput.value = '';

                    // --- NUEVO: ABRIR EL DESPLEGABLE AUTOMÁTICAMENTE ---
                    // Así el usuario ve que los datos se han rellenado
                    document.getElementById('manual-data-details').open = true;
                });
                
                bookSearchResultsDiv.appendChild(itemDiv);
            });
        }

        let searchTimeout;
        if(bookSearchInput) {
            bookSearchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                const query = e.target.value.trim();

                if (query.length > 2) {
                    bookSearchResultsDiv.innerHTML = '<div style="padding:0.5rem;">Buscando...</div>';
                    searchTimeout = setTimeout(() => {
                        buscarLibroPorTitulo(query).then(mostrarResultadosBusqueda);
                    }, 500);
                } else {
                    bookSearchResultsDiv.innerHTML = '';
                }
            });
        }

        // ===============================================
        // === 2. FUNCIONES DE RENDERIZADO ===============
        // ===============================================

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

        // ===============================================
        // === 3. GESTIÓN DE MODALES Y EVENTOS ===========
        // ===============================================

        const openDetailModal = (bookId) => {
            const book = booksData.find(b => b.id === bookId);
            if (!book) return;
            
            bookDetailModal.dataset.bookId = book.id;
            detailCover.src = book.cover || '';
            detailTitle.textContent = book.title;
            detailAuthor.textContent = book.author;
            detailNotes.value = book.notes || '';
            detailAuthor.textContent = book.author;
            
            // Mostrar/Ocultar enlace de Google
            const googleLinkBtn = document.getElementById('detail-google-link');
            if (book.googleLink) {
                googleLinkBtn.href = book.googleLink;
                googleLinkBtn.style.display = 'inline-block';
            } else {
                googleLinkBtn.style.display = 'none';
            }

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
            
            // Rellenar select de mover
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

        // --- CRUD FIREBASE ---

        const handleAddBook = (e) => {
            e.preventDefault();
            const formData = new FormData(addBookForm);
            const newBook = {
                title: formData.get('title'),
                author: formData.get('author'),
                cover: formData.get('cover'),
                section: formData.get('section'),
                totalPages: parseInt(formData.get('totalPages'), 10) || 0,
                currentPage: 0,
                notes: '',
                rating: 0,
                googleLink: formData.get('googleLink') || '' // <--- ¡NUEVO! Guardamos en la BBDD
            };
        
            userBooksCollection.add(newBook).then(() => {
                console.log("Libro añadido a Firebase");
                addBookForm.reset();
                if(bookSearchResultsDiv) bookSearchResultsDiv.innerHTML = ''; // Limpiar búsqueda
                addBookModal.close();
            }).catch(error => console.error("Error al añadir libro:", error));
        };
        
        const handleSaveDetails = () => {
            const bookId = bookDetailModal.dataset.bookId; 
            const book = booksData.find(b => b.id === bookId);
            if (!book) return;

            const updatedData = {
                notes: detailNotes.value,
                cover: detailCover.src
            };
        
            if (book.section === 'leyendo-ahora') {
                const newPage = parseInt(currentPageInput.value, 10) || 0;
                updatedData.currentPage = newPage > book.totalPages ? book.totalPages : newPage;
            }
        
            userBooksCollection.doc(bookId).update(updatedData).then(() => {
                console.log("Detalles actualizados");
                bookDetailModal.close();
            }).catch(error => console.error("Error al guardar:", error));
        };

        const handleDeleteBook = (bookId) => {
            userBooksCollection.doc(String(bookId)).delete().catch(error => console.error("Error al eliminar:", error));
        };

        const handleMoveBook = (bookId, targetSection) => {
            const bookRef = userBooksCollection.doc(bookId); 
            bookRef.update({
                section: targetSection,
                currentPage: 0,
                rating: firebase.firestore.FieldValue.delete()
            }).catch(error => console.error("Error al mover:", error));
        };
        
        const handleRateBook = (bookId, rating) => {
            userBooksCollection.doc(String(bookId)).update({ rating: rating }).catch(error => console.error("Error al valorar:", error));
        };
        
        const handleMainContentClick = (e) => {
            const bookElement = e.target.closest('.book');
            if (!bookElement) return;

            if (e.target.matches('.star')) {
                handleRateBook(bookElement.dataset.id, parseInt(e.target.dataset.value, 10));
                return;
            }
            openDetailModal(bookElement.dataset.id);
        };

        const handleSearch = (e) => {
            const query = e.target.value.toLowerCase();
            document.querySelectorAll('.book').forEach(bookElement => {
                const title = bookElement.querySelector('h3').textContent.toLowerCase();
                const author = bookElement.querySelector('.author').textContent.toLowerCase();
                bookElement.classList.toggle('hidden', !title.includes(query) && !author.includes(query));
            });
        };

        // --- TEMA CLARO/OSCURO ---
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

        // --- LISTENER TIEMPO REAL FIREBASE ---
        userBooksCollection.onSnapshot(snapshot => {
            booksData = [];
            snapshot.forEach(doc => {
                const book = { id: doc.id, ...doc.data() }; 
                booksData.push(book);
            });
            // Orden alfabético por título
            booksData.sort((a, b) => a.title.localeCompare(b.title));
            renderBooks();
        }, error => {
            console.error("Error al recibir datos de Firebase: ", error);
            // Evitamos alert molesto si es por adblock, solo log
        });

        // --- ASIGNACIÓN DE EVENTOS ---
        addBookBtn.addEventListener('click', () => addBookModal.showModal());
        
        cancelAddBookBtn.addEventListener('click', () => {
            addBookForm.reset();
            if(bookSearchResultsDiv) bookSearchResultsDiv.innerHTML = '';
            document.getElementById('manual-data-details').open = false; // <--- AÑADIR ESTO
            addBookModal.close();
        });
        
        addBookForm.addEventListener('submit', handleAddBook);
        toggleViewBtn.addEventListener('click', () => mainContent.classList.toggle('list-view'));
        toggleThemeBtn.addEventListener('click', toggleTheme);
        mainContent.addEventListener('click', handleMainContentClick);
        searchBar.addEventListener('input', handleSearch);
        saveDetailsBtn.addEventListener('click', handleSaveDetails);
        cancelDetailModalBtn.addEventListener('click', () => bookDetailModal.close());
        
        currentPageInput.addEventListener('input', () => {
            const bookId = bookDetailModal.dataset.bookId;
            const book = booksData.find(b => b.id === bookId);
            if (book) updateProgressVisuals(parseInt(currentPageInput.value, 10), book.totalPages);
        });

        deleteBookModalBtn.addEventListener('click', () => {
            const bookId = bookDetailModal.dataset.bookId;
            if (bookId && confirm('¿Estás seguro de que quieres eliminar este libro?')) {
                handleDeleteBook(bookId);
                bookDetailModal.close();
            }
        });

        detailCoverContainer.addEventListener('click', () => {
            const bookId = bookDetailModal.dataset.bookId;
            const book = booksData.find(b => b.id === bookId);
            if (!book) return;
            const newCoverUrl = prompt('Introduce la nueva URL para la portada:', book.cover || '');
            if (newCoverUrl !== null) {
                detailCover.src = newCoverUrl || 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
                book.cover = newCoverUrl;
            }
        });
        
        moveBookSelect.addEventListener('change', () => {
            const bookId = bookDetailModal.dataset.bookId;
            const newSection = moveBookSelect.value;
            if (bookId && newSection) {
                handleMoveBook(bookId, newSection);
                bookDetailModal.close();
            }
        });

        logoutBtn.addEventListener('click', () => {
            firebase.auth().signOut();
        });

// --- CERRAR MODALES AL HACER CLIC FUERA ---
        const closeOnBackdropClick = (modal) => {
            modal.addEventListener('click', (e) => {
                const rect = modal.getBoundingClientRect();
                const isInDialog = (rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
                                    rect.left <= e.clientX && e.clientX <= rect.left + rect.width);
                if (!isInDialog) {
                    modal.close();
                }
            });
        };

        // Aplicamos la lógica a ambos modales
        if (addBookModal) closeOnBackdropClick(addBookModal);
        if (bookDetailModal) closeOnBackdropClick(bookDetailModal);

        setupTheme(); // (Esta línea ya la tenías al final)
    }
});