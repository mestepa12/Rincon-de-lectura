import { firebaseConfig } from './auth.js';
import { googleBooksApiKey } from './config.js';

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, onSnapshot, orderBy, serverTimestamp, deleteField, writeBatch, limit } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

// 1. Inicialización (Igual que en auth.js)
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

document.addEventListener('DOMContentLoaded', () => {

    // --- EL PORTERO: Vigilando la entrada ---
    onAuthStateChanged(auth, (user) => {
        if (user && user.emailVerified) {
            console.log("Usuario verificado:", user.email);
            runApp(user); 
        }
    });
        // --- FUNCIÓN DE MIGRACIÓN (SOLO PARA TRASPASAR DATOS) ---
/*    async function migrarLibrosAntiguos(user) {
        const db = firebase.firestore();
        const oldRef = db.collection('users').doc(user.uid).collection('books');
        const newRef = db.collection('books');

        try {
            const snapshot = await oldRef.get();

            if (snapshot.empty) {
                console.log("No hay libros antiguos para migrar.");
                return;
            }

            console.log(`Encontrados ${snapshot.size} libros antiguos. Iniciando migración...`);

            const batch = db.batch(); // Usamos lotes para que sea seguro y rápido

            snapshot.forEach(doc => {
                const data = doc.data();
                const newDocRef = newRef.doc(); // Crea una referencia vacía en la nueva colección

                // 1. Preparamos el libro nuevo con la etiqueta de dueño
                batch.set(newDocRef, {
                    ...data,
                    userId: user.uid // ¡Importante! Añadimos la firma
                });

                // 2. Preparamos el borrado del libro viejo
                batch.delete(doc.ref);
            });

            // Ejecutamos todos los cambios a la vez
            await batch.commit();
            console.log("¡Migración completada con éxito! Recarga la página.");
            alert("Hemos actualizado tu biblioteca al nuevo sistema. Tus libros ya deberían aparecer.");
            window.location.reload();

        } catch (error) {
            console.error("Error durante la migración:", error);
        }
    }                       */
    
    // --- FUNCIÓN PRINCIPAL DE LA APP ---
    function runApp(user) {
        // Referencias a colecciones (Sintaxis V10)
        const booksCollection = collection(db, 'books');
        const userBooksCollection = collection(db, 'books');
        const SECTIONS = {
            'leyendo-ahora': 'Leyendo Ahora',
            'proximas-lecturas': 'Próximas Lecturas',
            'libros-terminados': 'Libros Terminados',
            'lista-deseos': 'Lista de Deseos',
            'libros-abandonados': 'Libros Abandonados'
        };

        const LOGROS = [
            // — Biblioteca —
            { id: 'primer_libro',           icono: '📖', nombre: 'Rompehielos',        descripcion: 'Añade tu primer libro.' },
            { id: 'cinco_libros',           icono: '📚', nombre: 'Coleccionista',       descripcion: 'Acumula 5 libros.' },
            { id: 'diez_libros',            icono: '🗂️',  nombre: 'Bibliófilo',          descripcion: 'Acumula 10 libros.' },
            { id: 'veinticinco_libros',     icono: '🏛️',  nombre: 'Gran Biblioteca',    descripcion: 'Acumula 25 libros.' },
            { id: 'cincuenta_libros',       icono: '🌐',  nombre: 'Archivo Personal',   descripcion: 'Acumula 50 libros.' },
            // — Libros terminados —
            { id: 'primer_terminado',       icono: '✅', nombre: 'Primera Victoria',   descripcion: 'Termina tu primer libro.' },
            { id: 'cinco_terminados',       icono: '🎖️',  nombre: 'Lector Constante',  descripcion: 'Termina 5 libros.' },
            { id: 'diez_terminados',        icono: '🏆', nombre: 'Devorador de Libros',descripcion: 'Termina 10 libros.' },
            { id: 'veinticinco_terminados', icono: '👑', nombre: 'Gran Lector',         descripcion: 'Termina 25 libros.' },
            // — Páginas —
            { id: 'maraton',                icono: '🏃', nombre: 'Maratón Lector',      descripcion: 'Lee más de 1.000 páginas en total.' },
            { id: 'paginas_2000',           icono: '📜', nombre: 'Expedición Literaria',descripcion: 'Lee más de 2.000 páginas en total.' },
            { id: 'paginas_5000',           icono: '🗺️',  nombre: 'Lector Épico',       descripcion: 'Lee más de 5.000 páginas en total.' },
            { id: 'paginas_10000',          icono: '🌟', nombre: 'Leyenda Lectora',     descripcion: 'Lee más de 10.000 páginas en total.' },
            { id: 'lector_voraz',           icono: '⚡', nombre: 'Lector Voraz',        descripcion: 'Lee más de 100 páginas en un solo día.' },
            // — Objetivos —
            { id: 'objetivo_diario',        icono: '🎯', nombre: 'Meta Cumplida',       descripcion: 'Alcanza tu objetivo diario de páginas.' },
            // — Valoraciones —
            { id: 'critico',                icono: '⭐', nombre: 'Crítico Literario',   descripcion: 'Valora 3 libros terminados.' },
            { id: 'critico_pro',            icono: '🎭', nombre: 'Crítico Pro',          descripcion: 'Valora 10 libros terminados.' },
            { id: 'perfeccionista',         icono: '✨', nombre: 'Perfeccionista',       descripcion: 'Valora 3 libros con 5 estrellas.' },
            // — Notas y lista de deseos —
            { id: 'anotador',               icono: '✍️',  nombre: 'El Anotador',        descripcion: 'Añade notas a 5 libros distintos.' },
            { id: 'deseos_10',              icono: '💭', nombre: 'Soñador de Libros',   descripcion: 'Añade 10 libros a tu lista de deseos.' },
            // — Racha —
            { id: 'racha_7',                icono: '🔥', nombre: 'Una Semana',           descripcion: 'Mantén una racha de 7 días.' },
            { id: 'racha_14',               icono: '🗓️',  nombre: 'Dos Semanas',        descripcion: 'Mantén una racha de 14 días.' },
            { id: 'racha_30',               icono: '💥', nombre: 'Imparable',            descripcion: 'Mantén una racha de 30 días.' },
            { id: 'racha_100',              icono: '💎', nombre: 'Centurión',            descripcion: 'Mantén una racha de 100 días.' },
        ];

        let booksData = [];
        let viewingFriendLibrary = false;
        let currentFriendData = null;
        let currentFriendName = '';
        let myFriendIds = new Set();
        let pieChartInst = null;
        let barChartInst = null;
        let genreChartInst = null;
        let ratingChartInst = null;
        let authorsChartInst = null;
        let prevRacha = null;
        let lastUserData = null;

        // --- SELECTORES DOM ---
        const mainContent = document.getElementById('main-content');
        const toggleViewBtn = document.getElementById('toggle-view');
        const toggleThemeBtn = document.getElementById('toggle-theme');
        const searchBar = document.getElementById('search-bar');
        const addBookModal = document.getElementById('add-book-modal');
        const addBookForm = document.getElementById('add-book-form');
        const addBookBtn = document.getElementById('add-book-btn');
        const cancelAddBookBtn = document.getElementById('cancel-add-book');
        const bookSearchInput = document.getElementById('book-search');
        const bookSearchResultsDiv = document.getElementById('book-search-results');
        const scanIsbnBtn = document.getElementById('scan-isbn-btn');
        const isbnScannerDialog = document.getElementById('isbn-scanner-dialog');
        const closeScannerBtn = document.getElementById('close-scanner-btn');
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
        const detailCoverContainer = document.getElementById('detail-cover-container');
        
        
        // ===============================================
        // === 1. INTEGRACIÓN API GOOGLE BOOKS ===========
        // ===============================================

        async function buscarLibroPorTitulo(titulo) {
            // Verificamos si la clave existe en config-dev.js
            if (typeof googleBooksApiKey === 'undefined' || !googleBooksApiKey) {
                console.error("Falta la variable googleBooksApiKey en config.js");
                return [];
            }

            const cleanedIsbn = titulo.replace(/[-\s]/g, '');
            const queryStr = /^97[89]\d{10}$/.test(cleanedIsbn) ? `isbn:${cleanedIsbn}` : titulo;
            const query = encodeURIComponent(queryStr);
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
                            link: info.infoLink || info.previewLink || '',
                            genre: info.categories ? info.categories[0] : 'Sin género'
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
                    <img src="${libro.cover || 'https://placehold.co/40x60?text=No+Img'}" alt="Portada de ${libro.title}" style="width:40px; height:60px; object-fit:cover; border-radius:3px;">
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
                    document.getElementById('book-genre').value = libro.genre || '';
                    const genreVisible = document.getElementById('book-genre-manual');
                    if (genreVisible && libro.genre && libro.genre !== 'Sin género') genreVisible.value = libro.genre;
                    
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
        // === 1b. ESCÁNER ISBN (html5-qrcode) ===========
        // ===============================================
        let html5QrCodeInstance = null;

        const stopScanner = async () => {
            if (html5QrCodeInstance) {
                try { await html5QrCodeInstance.stop(); } catch (e) {}
                html5QrCodeInstance = null;
            }
            if (isbnScannerDialog?.open) isbnScannerDialog.close();
        };

        if (scanIsbnBtn) {
            scanIsbnBtn.addEventListener('click', async () => {
                if (!window.Html5Qrcode) {
                    alert('El escáner no está disponible. Verifica tu conexión a internet.');
                    return;
                }
                isbnScannerDialog.showModal();
                html5QrCodeInstance = new Html5Qrcode('isbn-reader');
                const config = { fps: 10, qrbox: { width: 260, height: 100 } };
                if (window.Html5QrcodeSupportedFormats) {
                    config.formatsToSupport = [
                        Html5QrcodeSupportedFormats.EAN_13,
                        Html5QrcodeSupportedFormats.EAN_8
                    ];
                }
                try {
                    await html5QrCodeInstance.start(
                        { facingMode: 'environment' },
                        config,
                        async (decodedText) => {
                            if (!/^97[89]\d{10}$/.test(decodedText)) return;
                            await stopScanner();
                            bookSearchInput.value = decodedText;
                            bookSearchResultsDiv.innerHTML = '<div style="padding:0.5rem;">Buscando...</div>';
                            buscarLibroPorTitulo(decodedText).then(mostrarResultadosBusqueda);
                        },
                        () => {}
                    );
                } catch (err) {
                    await stopScanner();
                    if (err?.name === 'NotAllowedError') {
                        alert('Permiso de cámara denegado. Actívalo en los ajustes del navegador.');
                    } else {
                        alert('No se pudo acceder a la cámara.');
                    }
                }
            });
        }

        if (closeScannerBtn) closeScannerBtn.addEventListener('click', stopScanner);
        if (isbnScannerDialog) {
            isbnScannerDialog.addEventListener('click', e => {
                if (e.target === isbnScannerDialog) stopScanner();
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
                const rating = book.rating || 0;
                const stars = Array.from({ length: 5 }, (_, i) => {
                    let cls = 'star';
                    if (rating >= i + 1) cls += ' filled';
                    else if (rating > i) cls += ' half';
                    return `<button class="${cls}" data-value="${i + 1}" aria-label="Valorar con ${i + 1} estrellas">★</button>`;
                }).join('');
                return `<div class="book-extra-info"><div class="rating-stars" role="group">${stars}</div></div>`;
            }
            return '';
        };

        // Placeholder SVG para portadas que fallan al cargar
        const COVER_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 180"><rect width="120" height="180" fill="%23f4ede7" rx="4"/><text x="60" y="105" text-anchor="middle" font-size="48" font-family="sans-serif">&#x1F4D6;</text></svg>')}`;

        const createBookElement = (book) => {
            const bookArticle = document.createElement('article');
            bookArticle.className = 'book';
            bookArticle.dataset.id = book.id;

            // Crear img via DOM para poder asignar onerror y evitar portadas rotas
            const imgEl = document.createElement('img');
            imgEl.className = 'book-cover';
            imgEl.loading  = 'lazy';
            imgEl.alt      = `Portada de ${book.title}`;
            imgEl.src      = book.cover || COVER_PLACEHOLDER;
            imgEl.onerror  = () => { imgEl.onerror = null; imgEl.src = COVER_PLACEHOLDER; };

            const infoDiv = document.createElement('div');
            infoDiv.className = 'book-info';
            infoDiv.innerHTML = `
                <h3>${book.title}</h3>
                <p class="author">${book.author}</p>
                ${createExtraInfoHTML(book)}
            `;

            bookArticle.appendChild(imgEl);
            bookArticle.appendChild(infoDiv);
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

        const mostrarAnimacionRacha = (racha) => {
            const overlay  = document.getElementById('racha-celebration');
            const numEl    = document.getElementById('racha-numero-display');
            const msgEl    = document.getElementById('racha-mensaje');
            const confetti = document.getElementById('racha-confetti');
            const mascota  = document.getElementById('mascota-emoji');
            if (!overlay) return;

            // Mensajes y emoji de Págino según hito
            let emoji = '📖';
            let msg   = '¡Págino está orgulloso de ti!';
            if (racha >= 100) { emoji = '🌟'; msg = '¡CENTURIÓN! ¡Págino no puede creer tu dedicación!'; }
            else if (racha >= 30) { emoji = '💎'; msg = '¡Un mes leyendo! ¡Págino llora de emoción!'; }
            else if (racha >= 14) { emoji = '🔥'; msg = '¡Dos semanas seguidas! ¡Págino está en llamas!'; }
            else if (racha >= 7)  { emoji = '⭐'; msg = '¡Una semana completa! ¡Págino te aplaude!'; }
            else if (racha >= 3)  { emoji = '📖'; msg = '¡Vas muy bien! ¡Págino salta de alegría!'; }
            else                  { emoji = '📖'; msg = '¡Buen comienzo! ¡Págino te anima!'; }

            if (mascota) mascota.textContent = emoji;
            if (numEl)   numEl.textContent   = `🔥 ${racha}`;
            if (msgEl)   msgEl.textContent   = msg;

            // Confetti
            if (confetti) {
                confetti.innerHTML = '';
                const colors = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#ff922b','#cc5de8','#f76707','#12b886'];
                for (let i = 0; i < 50; i++) {
                    const p = document.createElement('div');
                    p.className = 'confetti-piece';
                    const size = 6 + Math.random() * 10;
                    p.style.cssText = `
                        left:${Math.random() * 100}%;
                        background:${colors[Math.floor(Math.random() * colors.length)]};
                        width:${size}px; height:${size}px;
                        border-radius:${Math.random() > 0.4 ? '50%' : '2px'};
                        animation-delay:${(Math.random() * 0.6).toFixed(2)}s;
                        animation-duration:${(1 + Math.random()).toFixed(2)}s;
                    `;
                    confetti.appendChild(p);
                }
            }

            // Mostrar
            overlay.style.display = 'flex';
            overlay.classList.remove('hiding');

            const cerrar = () => {
                overlay.classList.add('hiding');
                setTimeout(() => { overlay.style.display = 'none'; overlay.classList.remove('hiding'); }, 520);
            };

            overlay.onclick = cerrar;
            clearTimeout(overlay._timer);
            overlay._timer = setTimeout(cerrar, 3500);
        };

        const renderDetailRatingStars = (container, rating) => {
            if (!container) return;
            container.innerHTML = Array.from({ length: 5 }, (_, i) => {
                let cls = 'star';
                if (rating >= i + 1) cls += ' filled';
                else if (rating > i) cls += ' half';
                return `<button type="button" class="${cls}" data-value="${i + 1}" aria-label="Valorar con ${i + 1} estrellas">★</button>`;
            }).join('');
        };

        document.getElementById('detail-rating-stars').addEventListener('click', (e) => {
            if (!e.target.matches('.star')) return;
            const bookId = bookDetailModal.dataset.bookId;
            const btn = e.target;
            const value = parseInt(btn.dataset.value, 10);
            const rect = btn.getBoundingClientRect();
            const isLeftHalf = (e.clientX - rect.left) < rect.width / 2;
            const rating = isLeftHalf ? value - 0.5 : value;
            handleRateBook(bookId, rating);
            renderDetailRatingStars(btn.parentElement, rating);
        });

        const openDetailModal = (bookId) => {
            const book = booksData.find(b => b.id === bookId);
            if (!book) return;
            
            bookDetailModal.dataset.bookId = book.id;
            detailCover.src = book.cover || '';
            detailCover.alt = `Portada de ${book.title}`;
            detailTitle.textContent = book.title;
            detailAuthor.textContent = book.author;
            const detailGenreInput = document.getElementById('detail-genre');
            if (detailGenreInput) detailGenreInput.value = (book.genre && book.genre !== 'Sin género') ? book.genre : '';
            detailNotes.value = book.notes || '';
            
            // Mostrar/Ocultar enlace de Google (Igual que antes)
            const googleLinkBtn = document.getElementById('detail-google-link');
            if (googleLinkBtn) { // Pequeña comprobación de seguridad
                if (book.googleLink) {
                    googleLinkBtn.href = book.googleLink;
                    googleLinkBtn.style.display = 'inline-block';
                } else {
                    googleLinkBtn.style.display = 'none';
                }
            }

            // Valoración en modal (solo libros terminados)
            const detailRatingSection = document.getElementById('detail-rating-section');
            const detailRatingStars = document.getElementById('detail-rating-stars');
            if (book.section === 'libros-terminados') {
                detailRatingSection.style.display = 'block';
                renderDetailRatingStars(detailRatingStars, book.rating || 0);
            } else {
                detailRatingSection.style.display = 'none';
            }

            // Configurar barra de progreso (Igual que antes)
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
            
            // Rellenar select: todas las secciones, la actual preseleccionada
            moveBookSelect.innerHTML = '';
            Object.entries(SECTIONS).forEach(([key, name]) => {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = key === book.section ? `📍 ${name} (actual)` : name;
                if (key === book.section) option.selected = true;
                moveBookSelect.appendChild(option);
            });

            // =================================================
            // === LÓGICA DE PERMISOS (VISITANTE VS DUEÑO) ===
            // =================================================
            
            if (viewingFriendLibrary) {
                // MODO SOLO LECTURA (AMIGO)
                
                // 1. Ocultar botones de acción destructiva
                deleteBookModalBtn.style.display = 'none';
                saveDetailsBtn.style.display = 'none';
                
                // 2. Desactivar inputs para que no parezca que se pueden editar
                detailNotes.disabled = true;
                currentPageInput.disabled = true;
                moveBookSelect.disabled = true;
                
                // Opcional: Cambiar el estilo visual para que se note
                detailNotes.style.opacity = '0.7';
                
            } else {
                // MODO EDICIÓN (DUEÑO)
                
                // 1. Mostrar botones
                deleteBookModalBtn.style.display = 'block';
                saveDetailsBtn.style.display = 'block';
                
                // 2. Reactivar inputs
                detailNotes.disabled = false;
                currentPageInput.disabled = false;
                moveBookSelect.disabled = false;
                
                detailNotes.style.opacity = '1';
            }

            bookDetailModal.showModal();
        };


        // ===============================================
        // === 4. GESTIÓN DEL SIDEBAR DE AMIGOS ==========
        // ===============================================

        const friendsSidebar = document.getElementById('friends-sidebar');
        const sidebarOverlay = document.getElementById('sidebar-overlay');
        const toggleFriendsBtn = document.getElementById('toggle-friends-btn');
        const closeSidebarBtn = document.getElementById('close-sidebar-btn');
        const currentUserDisplay = document.getElementById('current-user-display');

        // 1. Función para abrir/cerrar
        const toggleSidebar = (show) => {
            if (show) {
                friendsSidebar.classList.add('open');
                sidebarOverlay.classList.add('active');
                renderRanking(); // Actualizar ranking cada vez que se abre
            } else {
                friendsSidebar.classList.remove('open');
                sidebarOverlay.classList.remove('active');
            }
        };

        // Eventos de apertura y cierre
        if(toggleFriendsBtn) toggleFriendsBtn.addEventListener('click', () => toggleSidebar(true));
        if(closeSidebarBtn) closeSidebarBtn.addEventListener('click', () => toggleSidebar(false));
        if(sidebarOverlay) sidebarOverlay.addEventListener('click', () => toggleSidebar(false));

        // 2. Cargar MI nombre de usuario
        const loadMyProfile = async () => {
            try {
                const userDocRef = doc(db, 'users', user.uid); // Nueva forma
                const userDocSnap = await getDoc(userDocRef);  // Nueva forma
                
                if (userDocSnap.exists()) {
                    const userData = userDocSnap.data();
                    currentUserDisplay.textContent = `@${userData.username}`;
                } else {
                    currentUserDisplay.textContent = user.email.split('@')[0];
                }
            } catch (error) {
                console.error("Error cargando perfil:", error);
            }
        };

        // Cargamos el perfil al iniciar
        loadMyProfile();

        // === RACHA DIARIA: Listener en tiempo real sobre el perfil del usuario ===
        const streakCounter = document.getElementById('streak-counter');
        onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
            if (!docSnap.exists()) return;
            const userData = docSnap.data();
            lastUserData = userData;
            if (viewingFriendLibrary) return; // Don't overwrite friend's UI
            if (streakCounter) {
                const racha = userData.rachaActual || 0;
                const prev = streakCounter.textContent;
                streakCounter.textContent = `🔥 ${racha}`;
                if (prev !== streakCounter.textContent) {
                    streakCounter.classList.remove('streak-updated');
                    void streakCounter.offsetWidth;
                    streakCounter.classList.add('streak-updated');
                }
                if (prevRacha !== null && racha > prevRacha) mostrarAnimacionRacha(racha);
                prevRacha = racha;
            }
            if (typeof actualizarDisplayObjetivos === 'function') actualizarDisplayObjetivos(userData);
            renderLogros(userData.logrosDesbloqueados || []);
        });


        // 3. LÓGICA DE BÚSQUEDA DE AMIGOS
        const friendSearchInput = document.getElementById('friend-search-input');
        const friendSearchBtn = document.getElementById('friend-search-btn');
        const friendSearchResults = document.getElementById('friend-search-results');

        const searchUsers = async () => {
            const queryText = friendSearchInput.value.trim().toLowerCase();

            if (queryText.length < 3) {
                alert("Escribe al menos 3 letras para buscar.");
                return;
            }

            friendSearchResults.innerHTML = '<p style="text-align:center; padding:10px; color:var(--accent-color);">Buscando...</p>';

            try {
                const usersRef = collection(db, 'users');
                const q = query(
                    usersRef,
                    where('searchKey', '>=', queryText),
                    where('searchKey', '<=', queryText + '\uf8ff'),
                    limit(5)
                );

                const snapshot = await getDocs(q);
                friendSearchResults.innerHTML = ''; 

                if (snapshot.empty) {
                    friendSearchResults.innerHTML = `
                        <div style="text-align:center; padding: 1rem; color: var(--text-color); opacity: 0.7;">
                            <p style="font-size: 1.5rem; margin-bottom: 0.5rem;">😕</p>
                            <p>No se encontraron usuarios con ese nombre.</p>
                        </div>
                    `;
                    return;
                }

                snapshot.forEach(docSnap => {
                    const userData = docSnap.data();
                    
                    // Si el usuario soy yo mismo, no lo muestro
                    if (userData.uid === user.uid) return;

                    const userItem = document.createElement('div');
                    userItem.className = 'user-card';
                    userItem.style.cssText = `
                        display: flex; justify-content: space-between; align-items: center; 
                        padding: 10px; background: var(--bg-color); border-radius: 8px; 
                        margin-bottom: 8px; border: 1px solid var(--border-color);
                    `;

                    userItem.innerHTML = `
                        <div style="display:flex; align-items:center; gap:10px;">
                            <div class="user-avatar-placeholder" style="width:30px; height:30px; font-size:0.8rem;">👤</div>
                            <span style="font-weight:bold;">@${userData.username}</span>
                        </div>
                        <button class="btn-add-friend" data-uid="${userData.uid}" style="padding:5px 10px; font-size:0.8rem; cursor:pointer;">Añadir</button>
                    `;
                    
                    const addBtn = userItem.querySelector('.btn-add-friend');
                    addBtn.addEventListener('click', () => {
                        enviarSolicitudAmistad(userData);
                    });

                    friendSearchResults.appendChild(userItem);
                });

            } catch (error) {
                console.error("Error buscando usuarios:", error);
                friendSearchResults.innerHTML = '<p class="empty-msg">Error al buscar.</p>';
            }
        };

        // 4. ESCUCHAR SOLICITUDES PENDIENTES (El Buzón)
        const friendRequestsList = document.getElementById('friend-requests-list');
        const requestsCountBadge = document.getElementById('requests-count');

        // --- EVENTOS DEL BUSCADOR DE AMIGOS ---
        if (friendSearchBtn) {
            friendSearchBtn.addEventListener('click', searchUsers);
        }
        
        if (friendSearchInput) {
            friendSearchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') searchUsers();
            });
        }

        // Esta función se activa sola cada vez que hay cambios en la base de datos
        const qRequests = query(
            collection(db, 'users', user.uid, 'friend_requests'), 
            where('status', '==', 'pending')
        );

            onSnapshot(qRequests, (snapshot) => {                
                // 1. Actualizar el contador rojo
                const count = snapshot.size;
                if(requestsCountBadge) {
                    requestsCountBadge.textContent = count;
                    requestsCountBadge.style.display = count > 0 ? 'inline-block' : 'none';
                }

                // 2. Renderizar la lista
                if (snapshot.empty) {
                    friendRequestsList.innerHTML = '<p class="empty-msg">No tienes solicitudes nuevas.</p>';
                } else {
                    friendRequestsList.innerHTML = ''; // Limpiar lista
                    
                    snapshot.forEach(doc => {
                        const req = doc.data();
                        const reqId = doc.id; // ID del usuario que envía

                        const div = document.createElement('div');
                        div.className = 'user-card';
                        div.style.cssText = `
                            display: flex; justify-content: space-between; align-items: center;
                            padding: 10px; background: var(--bg-color); 
                            border-radius: 8px; border: 1px solid var(--border-color); margin-bottom: 5px;
                        `;
                        
                        div.innerHTML = `
                            <div style="font-size:0.9rem;">
                                <span>@${req.fromUsername}</span>
                                <div style="font-size:0.7rem; color:grey;">quiere ser tu amigo</div>
                            </div>
                            <div style="display:flex; gap:5px;">
                                <button class="btn-accept" style="background:#4CAF50; color:white; border:none; padding:5px; border-radius:4px; cursor:pointer;">✔</button>
                                <button class="btn-reject" style="background:#F44336; color:white; border:none; padding:5px; border-radius:4px; cursor:pointer;">✕</button>
                            </div>
                        `;

                        // Botón Aceptar
                        div.querySelector('.btn-accept').addEventListener('click', () => aceptarSolicitud(reqId, req));
                        // Botón Rechazar
                        div.querySelector('.btn-reject').addEventListener('click', () => rechazarSolicitud(reqId));

                        friendRequestsList.appendChild(div);
                    });
                }
            });

// --- Lógica para Aceptar/Rechazar ---
        const aceptarSolicitud = async (friendId, requestData) => {
            try {
                const batch = writeBatch(db);

                // 1. Añadirlo a MIS amigos
                const myFriendRef = doc(db, 'users', user.uid, 'friends', friendId);
                batch.set(myFriendRef, {
                    friendUid: friendId,
                    friendUsername: requestData.fromUsername,
                    since: serverTimestamp()
                });

                // 2. Añadirme a SUS amigos (recíproco)
                const myProfileSnap = await getDoc(doc(db, 'users', user.uid));
                
                // --- SOLUCIÓN AQUÍ ---
                const myUsername = myProfileSnap.exists() && myProfileSnap.data().username 
                    ? myProfileSnap.data().username 
                    : user.email.split('@')[0];

                const theirFriendRef = doc(db, 'users', friendId, 'friends', user.uid);
                batch.set(theirFriendRef, {
                    friendUid: user.uid,
                    friendUsername: myUsername,
                    since: serverTimestamp()
                });

                // 3. Borrar la solicitud
                const reqRef = doc(db, 'users', user.uid, 'friend_requests', friendId);
                batch.delete(reqRef);

                await batch.commit();
                alert(`¡Ahora eres amigo de @${requestData.fromUsername}!`);

            } catch (error) {
                console.error("Error al aceptar:", error);
                alert("Hubo un error al aceptar la solicitud.");
            }
        };

        const rechazarSolicitud = async (friendId) => {
            if(!confirm("¿Rechazar solicitud?")) return;
            try {
                await deleteDoc(doc(db, 'users', user.uid, 'friend_requests', friendId));
            } catch (error) {
                console.error("Error al rechazar:", error);
            }
        };

        // Función REAL para enviar solicitud
        const enviarSolicitudAmistad = async (targetUser) => {
            if (myFriendIds.has(targetUser.uid)) {
                alert(`¡Ya eres amigo de @${targetUser.username}! No es necesario enviar solicitud.`);
                const btn = document.querySelector(`button[data-uid="${targetUser.uid}"]`); 
                if (btn) {
                    btn.textContent = "Amigo ✔";
                    btn.disabled = true;
                    btn.style.opacity = "0.7";
                }
                return;
            }

            const btn = document.querySelector(`button[data-uid="${targetUser.uid}"]`); 
            if(btn) btn.textContent = "Enviando...";

            try {
                const myProfileSnap = await getDoc(doc(db, 'users', user.uid));
                
                // --- SOLUCIÓN AQUÍ ---
                const myUsername = myProfileSnap.exists() && myProfileSnap.data().username 
                    ? myProfileSnap.data().username 
                    : user.email.split('@')[0];

                const requestRef = doc(db, 'users', targetUser.uid, 'friend_requests', user.uid);

                await setDoc(requestRef, {
                    fromUid: user.uid,
                    fromUsername: myUsername,
                    status: 'pending',
                    timestamp: serverTimestamp()
                });

                alert(`¡Solicitud enviada a @${targetUser.username}!`);
                if(btn) {
                    btn.textContent = "Enviada";
                    btn.disabled = true; 
                }

            } catch (error) {
                console.error("Error al enviar solicitud:", error);
                if (error.code === 'permission-denied') {
                     alert("No se pudo enviar la solicitud. Es posible que ya seáis amigos o que tengas una solicitud pendiente.");
                } else {
                     alert("Error al enviar la solicitud. Inténtalo de nuevo.");
                }
                if(btn) btn.textContent = "Reintentar";
            }
        };

        // --- FUNCIÓN PARA ELIMINAR AMIGO ---
        const eliminarAmigo = async (friendUid, friendName) => {
            if (!confirm(`¿Estás seguro de que quieres eliminar a @${friendName} de tus amigos?\nDejaréis de ver vuestras bibliotecas mutuamente.`)) {
                return;
            }

            try {
                const batch = writeBatch(db);

                // 1. Borrar de MI lista
                const myRef = doc(db, 'users', user.uid, 'friends', friendUid);
                batch.delete(myRef);

                // 2. Borrar de SU lista (Recíproco)
                const theirRef = doc(db, 'users', friendUid, 'friends', user.uid);
                batch.delete(theirRef);

                await batch.commit();
                
                alert(`Has eliminado a @${friendName}.`);

                const currentTitle = document.getElementById('site-title').textContent;
                if (currentTitle.includes(friendName)) {
                    window.location.reload();
                }

            } catch (error) {
                console.error("Error al eliminar amigo:", error);
                alert("Hubo un error al intentar eliminar al amigo.");
            }
        };

        // ===============================================
        // === 5. LISTA DE AMIGOS ========================
        // ===============================================
        const friendsList = document.getElementById('friends-list');

        const friendsRef = collection(db, 'users', user.uid, 'friends');
        const qFriends = query(friendsRef, orderBy('since', 'desc'));

        onSnapshot(qFriends, (snapshot) => {
            myFriendIds.clear();
            snapshot.forEach(docSnap => myFriendIds.add(docSnap.id));

            if (snapshot.empty) {
                friendsList.innerHTML = '<p class="empty-msg">Aún no tienes amigos agregados.</p>';
            } else {
                friendsList.innerHTML = '';
                
                snapshot.forEach(docSnap => {
                    const friendData = docSnap.data();
                    
                    const div = document.createElement('div');
                    div.className = 'user-card';
                    div.style.cssText = `
                        display: flex; justify-content: space-between; align-items: center;
                        padding: 10px; background: var(--bg-color); 
                        border-radius: 8px; border: 1px solid var(--border-color); margin-bottom: 5px;
                    `;
                    
                    div.innerHTML = `
                        <div style="font-size:0.9rem; display:flex; align-items:center; gap:8px; overflow:hidden;">
                            <span style="font-size:1.2rem;">👤</span>
                            <b style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width: 120px;">@${friendData.friendUsername}</b>
                        </div>
                        <div style="display:flex; gap:5px;">
                            <button class="btn-view" style="background:var(--accent-color); color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:0.8rem;">Ver</button>
                            <button class="btn-delete-friend" style="background:transparent; border:1px solid #E53E3E; color:#E53E3E; padding:5px 8px; border-radius:4px; cursor:pointer; font-size:0.8rem;" title="Eliminar amigo">🗑️</button>
                        </div>
                    `;

                    div.querySelector('.btn-view').addEventListener('click', () => {
                        cargarBibliotecaAmigo(friendData.friendUid, friendData.friendUsername);
                    });

                    div.querySelector('.btn-delete-friend').addEventListener('click', () => {
                        eliminarAmigo(friendData.friendUid, friendData.friendUsername);
                    });

                    friendsList.appendChild(div);
                });
            }
        });



        // --- FUNCIÓN PARA CARGAR LIBROS DE UN AMIGO (MODO SOLO LECTURA) ---
        const cargarBibliotecaAmigo = async (friendUid, friendName) => {

            viewingFriendLibrary = true;
            currentFriendName = friendName;

            document.getElementById('site-title').textContent = `Biblioteca de @${friendName}`;
            document.getElementById('site-title').style.color = 'var(--accent-color-interactive)';
            toggleSidebar(false);
            document.getElementById('add-book-btn').style.display = 'none';

            // Cargar datos del perfil del amigo (racha, logros, objetivos)
            try {
                const friendSnap = await getDoc(doc(db, 'users', friendUid));
                currentFriendData = friendSnap.exists() ? friendSnap.data() : {};
            } catch {
                currentFriendData = {};
            }
            mostrarDatosAmigo(currentFriendData, friendName);

            // Cargar sus libros
            const q = query(collection(db, 'books'), where("userId", "==", friendUid));
            onSnapshot(q, (snapshot) => {
                booksData = [];
                snapshot.forEach(doc => { booksData.push({ id: doc.id, ...doc.data() }); });
                booksData.sort((a, b) => a.title.localeCompare(b.title));
                renderBooks();
                mostrarBotonVolver();
            });
        };

        const mostrarDatosAmigo = (fd, name) => {
            // Racha
            const racha = fd.rachaActual || 0;
            if (streakCounter) streakCounter.textContent = `🔥 ${racha}`;
            // Logros
            renderLogros(fd.logrosDesbloqueados || []);
            // Objetivos (solo lectura)
            if (typeof actualizarDisplayObjetivos === 'function') actualizarDisplayObjetivos(fd);
        };

        const mostrarBotonVolver = () => {
            // Si ya existe el botón de volver, no lo creamos otra vez
            if(document.getElementById('btn-volver-casa')) return;

            const btnVolver = document.createElement('button');
            btnVolver.id = 'btn-volver-casa';
            btnVolver.textContent = "🏠 Volver a mi biblioteca";
            btnVolver.style.cssText = "margin-left: 10px; background: var(--text-color); color: var(--bg-color); border:none; padding: 0.5rem 1rem; border-radius: 5px; cursor: pointer; font-weight: bold;";
            
            btnVolver.addEventListener('click', () => {
                window.location.reload(); // La forma más fácil de limpiar y volver a tu estado inicial
            });

            document.querySelector('.header-main').appendChild(btnVolver);
        };

        // --- CRUD FIREBASE ---

        const handleAddBook = (e) => {
            e.preventDefault();
            const formData = new FormData(addBookForm);
            const newBook = {
                userId: user.uid,
                title: formData.get('title'),
                author: formData.get('author'),
                cover: formData.get('cover'),
                section: formData.get('section'),
                totalPages: parseInt(formData.get('totalPages'), 10) || 0,
                currentPage: 0,
                notes: '',
                rating: 0,
                googleLink: formData.get('googleLink') || '',
                genre: (document.getElementById('book-genre-manual')?.value.trim()) || document.getElementById('book-genre')?.value || 'Sin género'
            };
        
            addDoc(collection(db, 'books'), newBook).then(() => {
                console.log("Libro añadido a Firebase");
                stopScanner();
                addBookForm.reset();
                if(bookSearchResultsDiv) bookSearchResultsDiv.innerHTML = '';
                addBookModal.close();
            }).catch(error => console.error("Error al añadir libro:", error));
        };
        
        // === LOGROS: Toast y renderizado ===
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

        const evaluarLogros = async () => {
            const userRef = doc(db, 'users', user.uid);
            try {
                const snap = await getDoc(userRef);
                if (!snap.exists()) return;
                const ud = snap.data();
                const desbloqueados = new Set(ud.logrosDesbloqueados || []);
                const racha = ud.rachaActual || 0;
                const totalPaginasLeidas = ud.totalPaginasLeidas || 0;
                const nuevos = [];

                // — Biblioteca —
                if (!desbloqueados.has('primer_libro')           && booksData.length >= 1)  nuevos.push('primer_libro');
                if (!desbloqueados.has('cinco_libros')           && booksData.length >= 5)  nuevos.push('cinco_libros');
                if (!desbloqueados.has('diez_libros')            && booksData.length >= 10) nuevos.push('diez_libros');
                if (!desbloqueados.has('veinticinco_libros')     && booksData.length >= 25) nuevos.push('veinticinco_libros');
                if (!desbloqueados.has('cincuenta_libros')       && booksData.length >= 50) nuevos.push('cincuenta_libros');

                // — Libros terminados —
                const terminados = booksData.filter(b => b.section === 'libros-terminados');
                if (!desbloqueados.has('primer_terminado')       && terminados.length >= 1)  nuevos.push('primer_terminado');
                if (!desbloqueados.has('cinco_terminados')       && terminados.length >= 5)  nuevos.push('cinco_terminados');
                if (!desbloqueados.has('diez_terminados')        && terminados.length >= 10) nuevos.push('diez_terminados');
                if (!desbloqueados.has('veinticinco_terminados') && terminados.length >= 25) nuevos.push('veinticinco_terminados');

                // — Páginas —
                const totalPags = booksData.reduce((s, b) => s + (b.currentPage || 0), 0);
                if (!desbloqueados.has('maraton')                && totalPags >= 1000)                nuevos.push('maraton');
                if (!desbloqueados.has('paginas_2000')           && totalPaginasLeidas >= 2000)       nuevos.push('paginas_2000');
                if (!desbloqueados.has('paginas_5000')           && totalPaginasLeidas >= 5000)       nuevos.push('paginas_5000');
                if (!desbloqueados.has('paginas_10000')          && totalPaginasLeidas >= 10000)      nuevos.push('paginas_10000');
                const hoyStrL = getTodayStr();
                const paginasHoyL = ud.fechaDia === hoyStrL ? (ud.paginasLeidasHoy || 0) : 0;
                if (!desbloqueados.has('lector_voraz')           && paginasHoyL >= 100)               nuevos.push('lector_voraz');

                // — Objetivo diario —
                const objD = ud.objetivoPaginasDiarias || 0;
                if (!desbloqueados.has('objetivo_diario')        && objD > 0 && paginasHoyL >= objD) nuevos.push('objetivo_diario');

                // — Valoraciones —
                const valorados = booksData.filter(b => b.section === 'libros-terminados' && b.rating > 0);
                if (!desbloqueados.has('critico')                && valorados.length >= 3)  nuevos.push('critico');
                if (!desbloqueados.has('critico_pro')            && valorados.length >= 10) nuevos.push('critico_pro');
                const cincoEstrellas = booksData.filter(b => b.rating === 5);
                if (!desbloqueados.has('perfeccionista')         && cincoEstrellas.length >= 3) nuevos.push('perfeccionista');

                // — Notas y lista de deseos —
                const conNotas = booksData.filter(b => b.notes && b.notes.trim().length > 30);
                if (!desbloqueados.has('anotador')               && conNotas.length >= 5) nuevos.push('anotador');
                const enDeseos = booksData.filter(b => b.section === 'lista-deseos');
                if (!desbloqueados.has('deseos_10')              && enDeseos.length >= 10) nuevos.push('deseos_10');

                // — Racha —
                if (!desbloqueados.has('racha_7')                && racha >= 7)   nuevos.push('racha_7');
                if (!desbloqueados.has('racha_14')               && racha >= 14)  nuevos.push('racha_14');
                if (!desbloqueados.has('racha_30')               && racha >= 30)  nuevos.push('racha_30');
                if (!desbloqueados.has('racha_100')              && racha >= 100) nuevos.push('racha_100');
                if (nuevos.length > 0) {
                    await updateDoc(userRef, { logrosDesbloqueados: [...desbloqueados, ...nuevos] });
                    nuevos.forEach(id => { const l = LOGROS.find(x => x.id === id); if (l) mostrarToastLogro(l); });
                }
            } catch (e) { console.error('Error evaluando logros:', e); }
        };

        // === ESTADÍSTICAS ===
        const populateGenreFilter = () => {
            const sel = document.getElementById('stats-genre-filter');
            if (!sel) return;
            const current = sel.value;
            const genres = [...new Set(booksData.map(b => b.genre).filter(g => g && g !== 'Sin género'))].sort();
            sel.innerHTML = '<option value="">Todos los géneros</option>';
            genres.forEach(g => {
                const opt = document.createElement('option');
                opt.value = g;
                opt.textContent = g;
                sel.appendChild(opt);
            });
            if (current && genres.includes(current)) sel.value = current;
        };

        const renderStats = () => {
            [pieChartInst, barChartInst, genreChartInst, ratingChartInst, authorsChartInst].forEach(c => { if (c) c.destroy(); });
            pieChartInst = barChartInst = genreChartInst = ratingChartInst = authorsChartInst = null;

            const genreFilter = document.getElementById('stats-genre-filter')?.value || '';
            const data = genreFilter ? booksData.filter(b => b.genre === genreFilter) : booksData;
            const isDark = document.body.classList.contains('dark-mode');
            const tc = isDark ? '#E2E8F0' : '#4E443A';
            const gc = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
            const PALETTE = ['#9A3B3B','#C0786A','#5B9B6B','#60A5FA','#F59E0B','#8B5CF6','#EC4899','#14B8A6','#F97316','#718096'];

            // — Sección counts —
            const counts = {};
            Object.keys(SECTIONS).forEach(k => counts[k] = 0);
            data.forEach(b => { if (counts[b.section] !== undefined) counts[b.section]++; });

            // — Páginas —
            const pags = {
                'Leyendo':     data.filter(b => b.section === 'leyendo-ahora').reduce((s,b) => s+(b.currentPage||0), 0),
                'Terminados':  data.filter(b => b.section === 'libros-terminados').reduce((s,b) => s+(b.totalPages||0), 0),
                'Abandonados': data.filter(b => b.section === 'libros-abandonados').reduce((s,b) => s+(b.currentPage||0), 0),
            };
            const totalPags = Object.values(pags).reduce((s,v) => s+v, 0);

            // — Géneros —
            const genreCounts = {};
            data.forEach(b => { const g = (b.genre && b.genre !== 'Sin género') ? b.genre : null; if (g) genreCounts[g] = (genreCounts[g]||0) + 1; });
            const sortedGenres = Object.entries(genreCounts).sort((a,b) => b[1]-a[1]).slice(0, 10);

            // — Valoraciones —
            const ratedBooks = data.filter(b => b.section === 'libros-terminados' && b.rating > 0);
            const ratingBuckets = {1:0, 2:0, 3:0, 4:0, 5:0};
            ratedBooks.forEach(b => { const r = Math.round(b.rating); if (ratingBuckets[r] !== undefined) ratingBuckets[r]++; });
            const avgRating = ratedBooks.length ? (ratedBooks.reduce((s,b) => s+b.rating, 0) / ratedBooks.length).toFixed(1) : '—';

            // — Autores —
            const authorCounts = {};
            data.forEach(b => { if (b.author) authorCounts[b.author] = (authorCounts[b.author]||0) + 1; });
            const sortedAuthors = Object.entries(authorCounts).sort((a,b) => b[1]-a[1]).slice(0, 10);

            // — Extras —
            const finished = data.filter(b => b.section === 'libros-terminados');
            const completionRate = data.length ? Math.round((counts['libros-terminados'] / data.length) * 100) : 0;
            const longestBook = finished.reduce((mx, b) => (b.totalPages||0) > (mx?.totalPages||0) ? b : mx, null);
            const favGenre = sortedGenres.length ? sortedGenres[0][0] : null;
            const favAuthor = sortedAuthors.length ? sortedAuthors[0][0] : null;
            const pagesRemaining = data.filter(b => b.section === 'leyendo-ahora').reduce((s,b) => s + Math.max(0,(b.totalPages||0)-(b.currentPage||0)), 0);
            const avgPages = finished.length ? Math.round(finished.reduce((s,b) => s+(b.totalPages||0), 0) / finished.length) : 0;

            const chartOpts = (indexAxis = 'x') => ({
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: tc }, grid: { color: indexAxis === 'y' ? 'transparent' : gc }, beginAtZero: true },
                    y: { ticks: { color: tc }, grid: { color: indexAxis === 'x' ? 'transparent' : gc }, beginAtZero: true }
                }
            });

            // === PIE: libros por sección ===
            const pieCtx = document.getElementById('pieChart');
            if (pieCtx) pieChartInst = new Chart(pieCtx, {
                type: 'doughnut',
                data: { labels: Object.values(SECTIONS), datasets: [{ data: Object.keys(SECTIONS).map(k => counts[k]), backgroundColor: ['#9A3B3B','#A1887F','#5B9B6B','#60A5FA','#718096'], borderWidth: 0, hoverOffset: 6 }] },
                options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: tc, font: { size: 11 }, padding: 8 } } } }
            });

            // === BAR: páginas ===
            const barCtx = document.getElementById('barChart');
            if (barCtx) barChartInst = new Chart(barCtx, {
                type: 'bar',
                data: { labels: Object.keys(pags), datasets: [{ data: Object.values(pags), backgroundColor: ['#9A3B3B','#5B9B6B','#718096'], borderRadius: 8, borderWidth: 0 }] },
                options: { ...chartOpts(), plugins: { legend: { display: false } } }
            });

            // === HORIZONTAL BAR: géneros ===
            const genreCtx = document.getElementById('genreChart');
            const genreEmpty = document.getElementById('genre-chart-empty');
            if (sortedGenres.length && genreCtx) {
                if (genreEmpty) genreEmpty.style.display = 'none';
                genreChartInst = new Chart(genreCtx, {
                    type: 'bar',
                    data: { labels: sortedGenres.map(([g]) => g), datasets: [{ data: sortedGenres.map(([,c]) => c), backgroundColor: sortedGenres.map((_,i) => PALETTE[i % PALETTE.length]), borderRadius: 6, borderWidth: 0 }] },
                    options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: tc, stepSize: 1 }, grid: { color: gc }, beginAtZero: true }, y: { ticks: { color: tc, font: { size: 11 } }, grid: { display: false } } } }
                });
            } else {
                if (genreCtx) genreCtx.style.display = 'none';
                if (genreEmpty) genreEmpty.style.display = 'block';
            }

            // === BAR: valoraciones ===
            const ratingCtx = document.getElementById('ratingChart');
            const ratingEmpty = document.getElementById('rating-chart-empty');
            if (ratedBooks.length && ratingCtx) {
                if (ratingEmpty) ratingEmpty.style.display = 'none';
                ratingChartInst = new Chart(ratingCtx, {
                    type: 'bar',
                    data: { labels: ['1★','2★','3★','4★','5★'], datasets: [{ data: [1,2,3,4,5].map(r => ratingBuckets[r]), backgroundColor: ['#718096','#A1887F','#F59E0B','#5B9B6B','#9A3B3B'], borderRadius: 6, borderWidth: 0 }] },
                    options: { ...chartOpts(), plugins: { legend: { display: false } }, scales: { ...chartOpts().scales, y: { ticks: { color: tc, stepSize: 1 }, grid: { color: gc }, beginAtZero: true } } }
                });
            } else {
                if (ratingCtx) ratingCtx.style.display = 'none';
                if (ratingEmpty) ratingEmpty.style.display = 'block';
            }

            // === HORIZONTAL BAR: autores ===
            const authCtx = document.getElementById('authorsChart');
            const authEmpty = document.getElementById('authors-chart-empty');
            if (sortedAuthors.length && authCtx) {
                if (authEmpty) authEmpty.style.display = 'none';
                authorsChartInst = new Chart(authCtx, {
                    type: 'bar',
                    data: { labels: sortedAuthors.map(([a]) => a.length > 25 ? a.slice(0,24)+'…' : a), datasets: [{ data: sortedAuthors.map(([,c]) => c), backgroundColor: '#9A3B3B', borderRadius: 6, borderWidth: 0 }] },
                    options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: tc, stepSize: 1 }, grid: { color: gc }, beginAtZero: true }, y: { ticks: { color: tc, font: { size: 11 } }, grid: { display: false } } } }
                });
            } else {
                if (authCtx) authCtx.style.display = 'none';
                if (authEmpty) authEmpty.style.display = 'block';
            }

            // === Resumen principal (6 cards) ===
            const summary = document.getElementById('stats-summary');
            if (summary) summary.innerHTML = [
                ['📚', data.length, 'Libros totales'],
                ['✅', counts['libros-terminados']||0, 'Terminados'],
                ['📖', totalPags.toLocaleString('es'), 'Páginas leídas'],
                ['⭐', avgRating, 'Valoración media'],
                ['🎯', completionRate + '%', 'Finalización'],
                ['💔', counts['libros-abandonados']||0, 'Abandonados'],
            ].map(([ico,val,lbl]) => `<div class="stat-card"><div class="stat-ico">${ico}</div><div class="stat-num">${val}</div><div class="stat-lbl">${lbl}</div></div>`).join('');

            // === Cards extra (datos curiosos) ===
            const extra = document.getElementById('stats-extra');
            if (extra) {
                const cards = [
                    favGenre ? ['🏆', 'Género favorito', favGenre] : null,
                    favAuthor ? ['✍️', 'Autor favorito', favAuthor] : null,
                    longestBook ? ['📄', 'Libro más largo', `${longestBook.title?.slice(0,28)||'—'} (${(longestBook.totalPages||0).toLocaleString('es')} págs.)`] : null,
                    avgPages > 0 ? ['📏', 'Páginas por libro', avgPages.toLocaleString('es') + ' de media'] : null,
                    pagesRemaining > 0 ? ['🏃', 'Páginas pendientes', pagesRemaining.toLocaleString('es') + ' en lectura'] : null,
                    counts['proximas-lecturas'] > 0 ? ['📋', 'En tu lista', counts['proximas-lecturas'] + ' próximas lecturas'] : null,
                ].filter(Boolean);
                extra.innerHTML = cards.map(([ico,lbl,val]) => `<div class="stat-card-wide"><span class="stat-card-wide-ico">${ico}</span><div><span class="stat-card-wide-lbl">${lbl}</span><span class="stat-card-wide-val">${val}</span></div></div>`).join('');
            }
        };

        // === RACHA DIARIA DE LECTURA ===
        const updateStreak = async () => {
            const userRef = doc(db, 'users', user.uid);
            try {
                const userSnap = await getDoc(userRef);
                if (!userSnap.exists()) return;

                const userData = userSnap.data();
                const hoy = new Date();
                hoy.setHours(0, 0, 0, 0);
                let rachaActual = userData.rachaActual || 0;
                const ultimaFechaTimestamp = userData.ultimaFechaLectura;

                if (ultimaFechaTimestamp) {
                    const ultima = ultimaFechaTimestamp.toDate();
                    ultima.setHours(0, 0, 0, 0);
                    const diffDias = Math.round((hoy - ultima) / (1000 * 60 * 60 * 24));

                    if (diffDias === 0) return;          // Mismo día: ya contabilizado
                    else if (diffDias === 1) rachaActual += 1;  // Día consecutivo
                    else rachaActual = 1;                // Racha rota
                } else {
                    rachaActual = 1; // Primera vez leyendo
                }

                await updateDoc(userRef, {
                    rachaActual,
                    ultimaFechaLectura: serverTimestamp()
                });
            } catch (error) {
                console.error('Error actualizando racha:', error);
            }
        };

        const getTodayStr = () => new Date().toISOString().split('T')[0];
        const getWeekStartStr = () => {
            const d = new Date();
            const day = d.getDay();
            const monday = new Date(d);
            monday.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
            return monday.toISOString().split('T')[0];
        };

        const updatePaginasObjetivo = async (paginasAvanzadas) => {
            const userRef = doc(db, 'users', user.uid);
            try {
                const snap = await getDoc(userRef);
                const ud = snap.data() || {};
                const hoyStr = getTodayStr();
                const semanaStr = getWeekStartStr();
                let paginasHoy = ud.fechaDia === hoyStr ? (ud.paginasLeidasHoy || 0) : 0;
                let paginasSemana = ud.fechaSemana === semanaStr ? (ud.paginasLeidasSemana || 0) : 0;
                paginasHoy += paginasAvanzadas;
                paginasSemana += paginasAvanzadas;
                await updateDoc(userRef, {
                    paginasLeidasHoy: paginasHoy,
                    paginasLeidasSemana: paginasSemana,
                    fechaDia: hoyStr,
                    fechaSemana: semanaStr
                });
            } catch (e) {
                console.error('Error actualizando páginas objetivo:', e);
            }
        };

        const handleSaveDetails = async () => {
            const bookId = bookDetailModal.dataset.bookId;
            const book = booksData.find(b => b.id === bookId);
            if (!book) return;

            const genreVal = document.getElementById('detail-genre')?.value?.trim();
            const updatedData = {
                notes: detailNotes.value,
                cover: detailCover.src,
                genre: genreVal || book.genre || 'Sin género'
            };
        
            let paginaProgresada = false;

            // Cambio de sección solo si el usuario eligió una diferente
            const newSection = moveBookSelect.value;
            if (newSection !== book.section) {
                updatedData.section    = newSection;
                updatedData.currentPage = 0;          // resetear progreso al cambiar sección
                updatedData.rating      = deleteField(); // limpiar valoración
            } else if (book.section === 'leyendo-ahora') {
                const oldPage = book.currentPage || 0;
                let newPage = parseInt(currentPageInput.value, 10);
                if (isNaN(newPage)) newPage = oldPage;
                updatedData.currentPage = newPage > book.totalPages ? book.totalPages : newPage;
                if (updatedData.currentPage > oldPage) paginaProgresada = true;
            }

            try {
                await updateDoc(doc(db, 'books', bookId), updatedData);
                if (paginaProgresada) {
                    await updateStreak();
                    const paginasAvanzadas = (updatedData.currentPage) - (book.currentPage || 0);
                    await updatePaginasObjetivo(paginasAvanzadas);
                }

                // Recalcular totalPaginasLeidas con el estado que tendrá el libro tras el update
                const totalPaginasLeidas = booksData.reduce((total, b) => {
                    if (b.id === bookId) {
                        const s = updatedData.section || b.section;
                        if (s === 'libros-terminados') return total + (b.totalPages || 0);
                        return total + (updatedData.currentPage !== undefined ? updatedData.currentPage : (b.currentPage || 0));
                    }
                    if (b.section === 'libros-terminados') return total + (b.totalPages || 0);
                    return total + (b.currentPage || 0);
                }, 0);
                await updateDoc(doc(db, 'users', user.uid), { totalPaginasLeidas });

                await evaluarLogros();
                console.log('Detalles actualizados');
                bookDetailModal.close();
            } catch (error) {
                console.error('Error al guardar:', error);
            }
        };

        // === RANKING DE PÁGINAS ===
        const renderRanking = async () => {
            const rankingList = document.getElementById('ranking-list');
            if (!rankingList) return;
            rankingList.innerHTML = '<li class="ranking-loading">⏳ Cargando…</li>';
            try {
                const mySnap = await getDoc(doc(db, 'users', user.uid));
                const myData = mySnap.data() || {};
                const entries = [{
                    username: myData.username || user.email?.split('@')[0] || 'Yo',
                    paginas: myData.totalPaginasLeidas || 0,
                    isMe: true
                }];

                const friendsSnap = await getDocs(collection(db, 'users', user.uid, 'friends'));
                const friendPromises = friendsSnap.docs.map(async (fDoc) => {
                    try {
                        const fSnap = await getDoc(doc(db, 'users', fDoc.data().friendUid));
                        if (fSnap.exists()) {
                            const fd = fSnap.data();
                            return { username: fd.username || '?', paginas: fd.totalPaginasLeidas || 0, isMe: false };
                        }
                    } catch {}
                    return null;
                });
                entries.push(...(await Promise.all(friendPromises)).filter(Boolean));
                entries.sort((a, b) => b.paginas - a.paginas);

                rankingList.innerHTML = '';
                if (entries.length === 0) {
                    rankingList.innerHTML = '<li class="ranking-loading">Sin datos aún.</li>';
                    return;
                }
                entries.forEach((entry, i) => {
                    const li = document.createElement('li');
                    li.className = `ranking-item${entry.isMe ? ' ranking-me' : ''}`;
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`;
                    li.innerHTML = `<span class="ranking-pos">${medal}</span>
                        <span class="ranking-user">@${entry.username}${entry.isMe ? ' ★' : ''}</span>
                        <span class="ranking-pages">${entry.paginas.toLocaleString('es')} págs</span>`;
                    rankingList.appendChild(li);
                });
            } catch (e) {
                console.error('Error cargando ranking:', e);
                rankingList.innerHTML = '<li class="ranking-loading">Error al cargar.</li>';
            }
        };

        // === EXPORTAR RESEÑA COMO IMAGEN ===
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
            try { return await toDataUrl(url); } catch {}                                    // 1. Directo (funciona si el servidor permite CORS)
            try { return await toDataUrl(`https://corsproxy.io/?${encodeURIComponent(url)}`); } catch {} // 2. Proxy CORS
            return null;                                                                     // 3. Sin portada
        };

        const shareAsImage = async () => {
            mostrarToastShare();
            const bookId = bookDetailModal.dataset.bookId;
            const book = booksData.find(b => b.id === bookId);
            if (!book) return;
            const card = document.getElementById('export-card');
            const coverEl = document.getElementById('export-cover');

            // Convertir portada a data URL para evitar bloqueos CORS en html2canvas
            const coverDataUrl = await fetchImageAsDataUrl(book.cover);
            if (coverDataUrl) {
                await new Promise((res) => { coverEl.onload = coverEl.onerror = res; coverEl.src = coverDataUrl; });
                coverEl.style.display = '';
            } else {
                coverEl.style.display = 'none'; // Ocultar portada si no se puede cargar
            }

            document.getElementById('export-title').textContent = book.title || '';
            document.getElementById('export-author').textContent = book.author || '';
            document.getElementById('export-notes').textContent = book.notes || '';
            const r = book.rating || 0;
            const fullS = Math.floor(r);
            const halfS = (r % 1) >= 0.5;
            document.getElementById('export-stars').textContent = '★'.repeat(fullS) + (halfS ? '½' : '') + '☆'.repeat(5 - fullS - (halfS ? 1 : 0));
            card.style.display = 'flex';
            try {
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
                coverEl.style.display = ''; // restaurar visibilidad
            }
        };


        const handleSaveObjetivos = async () => {
            const diarias = parseInt(document.getElementById('objetivo-diario-input').value, 10) || 0;
            const semanales = parseInt(document.getElementById('objetivo-semanal-input').value, 10) || 0;
            try {
                await setDoc(doc(db, 'users', user.uid), {
                    objetivoPaginasDiarias: diarias,
                    objetivoPaginasSemanales: semanales
                }, { merge: true });
                const snap = await getDoc(doc(db, 'users', user.uid));
                if (snap.exists()) actualizarDisplayObjetivos(snap.data());
                document.getElementById('objetivos-modal').close();
            } catch (e) {
                console.error('Error guardando objetivos:', e);
            }
        };

        const handleDeleteBook = (bookId) => {
            deleteDoc(doc(db, 'books', String(bookId))).catch(error => console.error("Error al eliminar:", error));
        };

        const handleMoveBook = (bookId, targetSection) => {
            const bookRef = doc(db, 'books', bookId); 
            updateDoc(bookRef, {
                section: targetSection,
                currentPage: 0,
                rating: deleteField()
            }).catch(error => console.error("Error al mover:", error));
        };
        
        const handleRateBook = (bookId, rating) => {
            updateDoc(doc(db, 'books', String(bookId)), { rating: rating }).catch(error => console.error("Error al valorar:", error));
        };
        
        const handleMainContentClick = (e) => {
            const bookElement = e.target.closest('.book');
            if (!bookElement) return;

            if (e.target.matches('.star')) {
                const btn = e.target;
                const value = parseInt(btn.dataset.value, 10);
                const rect = btn.getBoundingClientRect();
                const isLeftHalf = (e.clientX - rect.left) < rect.width / 2;
                handleRateBook(bookElement.dataset.id, isLeftHalf ? value - 0.5 : value);
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
        // 1. Definimos la referencia a la colección 'books'
        const booksRef = collection(db, 'books');

        // 2. Creamos la consulta (query)
        const qMyBooks = query(booksRef, where("userId", "==", user.uid));

        // 3. Escuchamos los cambios con onSnapshot
        onSnapshot(qMyBooks, (snapshot) => {
            viewingFriendLibrary = false;
            booksData = [];
            
            snapshot.forEach(docSnap => {
                const book = { id: docSnap.id, ...docSnap.data() }; 
                booksData.push(book);
            });

            // Orden alfabético por título
            booksData.sort((a, b) => a.title.localeCompare(b.title));
            renderBooks();
            evaluarLogros();

            // ── Migración automática ──────────────────────────────────────────
            // Recalcula totalPaginasLeidas cada vez que cambian los libros.
            // Usa setDoc+merge para que funcione aunque el campo no exista aún
            // (usuarios registrados antes de que se añadiera esta feature).
            const totalPaginasLeidas = booksData.reduce((sum, b) => {
                if (b.section === 'libros-terminados') return sum + (b.totalPages || 0);
                return sum + (b.currentPage || 0);
            }, 0);
            setDoc(doc(db, 'users', user.uid), { totalPaginasLeidas }, { merge: true })
                .catch(e => console.warn('No se pudo sincronizar totalPaginasLeidas:', e));
            // ─────────────────────────────────────────────────────────────────

        }, (error) => {
            console.error("Error al recibir datos de Firebase: ", error);
        });

        // === IMPORTAR DE GOODREADS ===
        const importGoodreadsCSV = async (file) => {
            const raw = await file.text();
            const csvText = raw.replace(/^\uFEFF/, ''); // Eliminar BOM

            // ── Parser CSV robusto (respeta comillas y comas dentro de campos) ─
            const parseCSV = (txt) => {
                const rows = [];
                let row = [], field = '', inQ = false;
                for (let i = 0; i < txt.length; i++) {
                    const c = txt[i];
                    if (c === '"') {
                        if (inQ && txt[i + 1] === '"') { field += '"'; i++; }
                        else inQ = !inQ;
                    } else if (c === ',' && !inQ) {
                        row.push(field); field = '';
                    } else if ((c === '\n' || c === '\r') && !inQ) {
                        if (c === '\r' && txt[i + 1] === '\n') i++;
                        row.push(field);
                        if (row.some(f => f.trim())) rows.push(row);
                        row = []; field = '';
                    } else { field += c; }
                }
                if (field || row.length) { row.push(field); if (row.some(f => f.trim())) rows.push(row); }
                return rows;
            };

            const rows = parseCSV(csvText);
            if (rows.length < 2) { alert('El CSV está vacío o no tiene el formato de Goodreads.'); return; }
            const headers = rows[0].map(h => h.trim());

            // ── Mapeo de estanterías Goodreads → nuestras secciones ────────────
            const SHELF_MAP = {
                'read':              'libros-terminados',
                'currently-reading': 'leyendo-ahora',
                'to-read':          'lista-deseos',
            };

            // ── Limpieza de ISBN: Goodreads exporta como ="9781234567890" ─────
            const cleanISBN = (s) => (s || '').replace(/[^0-9X]/gi, '');

            // ── Limpieza de reseñas: etiquetas nativas de Goodreads ─────────────
            // Formato: [b:Título del libro|ID|...|URL|ID] → <i>Título</i>
            //          [a:Autor|ID|...]                  → Autor
            //          otros [x:...]                    → eliminados
            // Conserva <br/> existentes.
            const cleanReview = (text) => {
                if (!text) return '';
                return text
                    .replace(/\[b:([^|\]]+)\|[^\]]*\]/g, '<i>$1</i>')  // refs libro → cursiva
                    .replace(/\[a:([^|\]]+)\|[^\]]*\]/g, '$1')          // refs autor → nombre plano
                    .replace(/\[[a-z]+:[^\]]*\]/gi, '')                   // otros tags → borrar
                    .trim();
            };

            // ── Sistema de portadas con fallback ─────────────────────────────
            // 1. OpenLibrary (ISBN → URL instantánea, sin llamada de red)
            // 2. Google Books API (sin ISBN, o si queremos mejor calidad)
            // 3. '' → la UI muestra COVER_PLACEHOLDER via onerror
            const fetchTimeout = (url, ms = 6000) => {
                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), ms);
                return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
            };

            const getGoodreadsCover = async (isbn13, title, author) => {
                if (isbn13) {
                    // OpenLibrary: URL directa construida desde ISBN (sin API call)
                    return `https://covers.openlibrary.org/b/isbn/${isbn13}-M.jpg`;
                }
                // Sin ISBN: consultar Google Books por título + autor
                try {
                    const apiKey = (typeof googleBooksApiKey !== 'undefined' && googleBooksApiKey)
                        ? `&key=${googleBooksApiKey}` : '';
                    const q = encodeURIComponent(`${title} ${author}`.trim());
                    const resp = await fetchTimeout(
                        `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1${apiKey}`
                    );
                    if (!resp.ok) throw new Error();
                    const data = await resp.json();
                    const thumb = data.items?.[0]?.volumeInfo?.imageLinks?.thumbnail;
                    if (thumb) return thumb.replace('http://', 'https://').replace('zoom=1', 'zoom=0');
                } catch { /* ignorar, usar fallback vacío */ }
                return ''; // La UI usará COVER_PLACEHOLDER via onerror
            };

            // ── Paso 1: parsear filas (síncrono) ────────────────────────────
            const parsed = rows.slice(1).map(row => {
                const g = {};
                headers.forEach((h, i) => g[h] = (row[i] || '').trim());
                const shelf      = g['Exclusive Shelf'] || g['Bookshelves']?.split(',')[0]?.trim() || '';
                const section    = SHELF_MAP[shelf] || 'proximas-lecturas';
                const isbn13     = cleanISBN(g['ISBN13'] || g['ISBN'] || '');
                const totalPages = parseInt(g['Number of Pages'], 10) || 0;
                const rating     = section === 'libros-terminados' ? (parseInt(g['My Rating'], 10) || 0) : 0;
                return {
                    _isbn13:      isbn13,       // campo temporal para getGoodreadsCover
                    userId:       user.uid,
                    title:        g['Title'] || '',
                    author:       g['Author'] || '',
                    section,
                    totalPages,
                    currentPage:  0,
                    rating,
                    notes:        cleanReview(g['My Review'] || '').substring(0, 2000),
                    googleLink:   '',
                    importedFrom: 'goodreads',
                };
            }).filter(b => b.title);

            if (parsed.length === 0) { alert('No se encontraron libros válidos en el CSV.'); return; }

            // ── Paso 2: obtener portadas en paralelo ─────────────────────────
            // ISBN → OpenLibrary URL instantánea | sin ISBN → llamada Google Books
            const books = await Promise.all(parsed.map(async (b) => {
                const { _isbn13, ...rest } = b;
                const cover = await getGoodreadsCover(_isbn13, b.title, b.author);
                return { ...rest, cover };
            }));

            // ── Paso 3: writeBatch en lotes de 400 ──────────────────────────
            const BATCH_SIZE = 400;
            let imported = 0;
            for (let i = 0; i < books.length; i += BATCH_SIZE) {
                const batch = writeBatch(db);
                books.slice(i, i + BATCH_SIZE).forEach(book => {
                    batch.set(doc(collection(db, 'books')), book);
                });
                await batch.commit();
                imported += Math.min(BATCH_SIZE, books.length - i);
            }

            const sinIsbn = parsed.filter(b => !b._isbn13).length;
            alert(
                `✅ Importación completada.\n` +
                `${imported} libro${imported !== 1 ? 's' : ''} importados desde Goodreads.\n\n` +
                `Portadas: Open Library (ISBN) · Google Books (${sinIsbn} sin ISBN).\n` +
                `Las portadas que no carguen mostrarán un icono genérico.`
            );
        };

        // --- ASIGNACIÓN DE EVENTOS ---
        addBookBtn.addEventListener('click', () => addBookModal.showModal());
        
        cancelAddBookBtn.addEventListener('click', () => {
            stopScanner();
            addBookForm.reset();
            if(bookSearchResultsDiv) bookSearchResultsDiv.innerHTML = '';
            document.getElementById('manual-data-details').open = false;
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

        detailCoverContainer.addEventListener('click', async () => {
            const bookId = bookDetailModal.dataset.bookId;
            const book = booksData.find(b => b.id === bookId);
            if (!book) return;
            const newCoverUrl = prompt('Introduce la nueva URL para la portada:', book.cover || '');
            if (newCoverUrl !== null) {
                try {
                    detailCover.src = newCoverUrl || 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
                    const bookRef = doc(db, 'books', bookId);
                    await updateDoc(bookRef, { cover: newCoverUrl });
                } catch (error) {
                    console.error("Error al actualizar la portada:", error);
                }
            }
        });        
                moveBookSelect.addEventListener('change', () => {
            // Ya no se aplica al instante: solo actualiza el visual del select.
            // El cambio real se aplica al pulsar "Guardar Cambios" en handleSaveDetails.
        });


        if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        signOut(auth).then(() => {
            localStorage.removeItem('rincon_user_email');
            localStorage.removeItem('rincon_user_pass');
            // Esto obliga a ir a index y evita que el usuario pueda volver atrás
            window.location.replace('index.html');
        }).catch((error) => {
            console.error("Error al salir:", error);
        });
    });
}


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

        // === OBJETIVOS DE LECTURA ===
        const objetivosBtn = document.getElementById('objetivos-btn');
        const objetivosModal = document.getElementById('objetivos-modal');
        const objetivosForm = document.getElementById('objetivos-form');
        const cancelObjetivosBtn = document.getElementById('cancel-objetivos-btn');
        const actualizarDisplayObjetivos = (ud) => {
            const hoy = getTodayStr();
            const sem = getWeekStartStr();
            const objD = ud.objetivoPaginasDiarias || 0;
            const objS = ud.objetivoPaginasSemanales || 0;
            const pagHoy = ud.fechaDia === hoy ? (ud.paginasLeidasHoy || 0) : 0;
            const pagSem = ud.fechaSemana === sem ? (ud.paginasLeidasSemana || 0) : 0;
            const txtD = document.getElementById('objetivo-diario-txt');
            const txtS = document.getElementById('objetivo-semanal-txt');
            const fD   = document.getElementById('objetivo-diario-fill');
            const fS   = document.getElementById('objetivo-semanal-fill');
            if (txtD) txtD.textContent = `${pagHoy} / ${objD || '—'} páginas`;
            if (txtS) txtS.textContent = `${pagSem} / ${objS || '—'} páginas`;
            if (fD) fD.style.width = objD > 0 ? `${Math.min(100, Math.round(pagHoy / objD * 100))}%` : '0%';
            if (fS) fS.style.width = objS > 0 ? `${Math.min(100, Math.round(pagSem / objS * 100))}%` : '0%';
        };

        if (objetivosBtn && objetivosModal) {
            objetivosBtn.addEventListener('click', async () => {
                const inputD = document.getElementById('objetivo-diario-input');
                const inputS = document.getElementById('objetivo-semanal-input');
                const saveBtn = document.getElementById('save-objetivos-btn');
                const formTitle = objetivosModal.querySelector('h2');

                if (viewingFriendLibrary) {
                    const fd = currentFriendData || {};
                    if (inputD) { inputD.value = fd.objetivoPaginasDiarias || ''; inputD.disabled = true; }
                    if (inputS) { inputS.value = fd.objetivoPaginasSemanales || ''; inputS.disabled = true; }
                    if (saveBtn) saveBtn.style.display = 'none';
                    if (formTitle) formTitle.textContent = `🎯 Objetivos de @${currentFriendName}`;
                    actualizarDisplayObjetivos(fd);
                } else {
                    if (inputD) inputD.disabled = false;
                    if (inputS) inputS.disabled = false;
                    if (saveBtn) saveBtn.style.display = '';
                    if (formTitle) formTitle.textContent = '🎯 Objetivos de Lectura';
                    const snap = await getDoc(doc(db, 'users', user.uid));
                    const ud = snap.data() || {};
                    if (inputD) inputD.value = ud.objetivoPaginasDiarias || '';
                    if (inputS) inputS.value = ud.objetivoPaginasSemanales || '';
                    actualizarDisplayObjetivos(ud);
                }
                objetivosModal.showModal();
            });
        }
        const saveObjetivosBtn = document.getElementById('save-objetivos-btn');
        if (saveObjetivosBtn) saveObjetivosBtn.addEventListener('click', handleSaveObjetivos);
        if (cancelObjetivosBtn) cancelObjetivosBtn.addEventListener('click', () => objetivosModal?.close());
        if (objetivosModal) closeOnBackdropClick(objetivosModal);

        // === LOGROS: Botón abrir/cerrar modal ===
        const logrosBtn = document.getElementById('logros-btn');
        const logrosModal = document.getElementById('logros-modal');
        const closeLogrosBtn = document.getElementById('close-logros-btn');
        if (logrosBtn && logrosModal) {
            logrosBtn.addEventListener('click', () => {
                if (viewingFriendLibrary && currentFriendData) {
                    renderLogros(currentFriendData.logrosDesbloqueados || []);
                    const h2 = logrosModal.querySelector('h2');
                    if (h2) h2.textContent = `🏅 Logros de @${currentFriendName}`;
                } else {
                    if (lastUserData) renderLogros(lastUserData.logrosDesbloqueados || []);
                    const h2 = logrosModal.querySelector('h2');
                    if (h2) h2.textContent = '🏅 Mis Logros';
                }
                logrosModal.showModal();
            });
        }
        if (closeLogrosBtn && logrosModal) {
            closeLogrosBtn.addEventListener('click', () => logrosModal.close());
        }

        // === MODAL RACHA / PÁGINO ===
        const rachaModal = document.getElementById('racha-modal');
        const closeRachaModalBtn = document.getElementById('close-racha-modal');

        const MENSAJES_RACHA_HOY = [
            '¡Págino está bailando de alegría! Cada página te hace más grande.',
            '¡Lo lograste! Hoy has alimentado tu mente y tu racha sigue viva.',
            '¡Racha en marcha! Los grandes lectores se forjan día a día.',
            '¡Págino te saluda con orgullo! Sigue así, campeón.',
            'Cada día que lees eres un poco más sabio. ¡Hoy lo has conseguido!',
            '¡Imparable! Págino no puede estar más feliz contigo.',
            'La constancia es el superpoder del lector. ¡Hoy lo has demostrado!',
        ];
        const MENSAJES_RACHA_NO_HOY = [
            'Págino te echa de menos... ¿tienes 10 minutos para leer hoy?',
            '¡La racha espera! Abre ese libro y devolverle la sonrisa a Págino.',
            'Aún estás a tiempo de mantener la racha. ¡Venga, tú puedes!',
            'Págino confía en ti. Solo unas páginas y la racha sigue viva.',
            'No dejes que la racha muera hoy. ¡Un capítulo y listo!',
            'Hasta los mejores lectores tienen días flojos. ¡Hoy no seas uno de ellos!',
            'Págino tiene el libro abierto esperándote. ¿Qué dices?',
        ];

        const openRachaModal = () => {
            if (!rachaModal) return;
            const ud = (viewingFriendLibrary ? currentFriendData : lastUserData) || {};
            const racha = ud.rachaActual || 0;
            const ultimaTs = ud.ultimaFechaLectura;
            const hoyStr = getTodayStr();
            let leidoHoy = false;
            if (ultimaTs && ultimaTs.toDate) {
                const ultima = ultimaTs.toDate();
                const ultStr = ultima.getFullYear() + '-' +
                    String(ultima.getMonth() + 1).padStart(2, '0') + '-' +
                    String(ultima.getDate()).padStart(2, '0');
                leidoHoy = ultStr === hoyStr;
            }

            const mascotaEl = document.getElementById('racha-modal-mascota');
            const numeroEl = document.getElementById('racha-modal-numero');
            const statusEl = document.getElementById('racha-modal-status');
            const mensajeEl = document.getElementById('racha-modal-mensaje');

            const nombreEl = document.getElementById('racha-modal-nombre');
            if (viewingFriendLibrary) {
                if (mascotaEl) { mascotaEl.textContent = leidoHoy ? '📖' : '😔'; mascotaEl.className = 'racha-modal-mascota ' + (leidoHoy ? 'happy' : 'sad'); }
                if (numeroEl) numeroEl.textContent = `🔥 ${racha}`;
                if (statusEl) { statusEl.textContent = leidoHoy ? `@${currentFriendName} ha leído hoy` : `@${currentFriendName} no ha leído hoy`; statusEl.className = 'racha-modal-status ' + (leidoHoy ? 'leido' : 'no-leido'); }
                if (mensajeEl) mensajeEl.textContent = '';
                if (nombreEl) nombreEl.textContent = `— Racha de @${currentFriendName} —`;
            } else {
                if (mascotaEl) { mascotaEl.textContent = leidoHoy ? '📖' : '😔'; mascotaEl.className = 'racha-modal-mascota ' + (leidoHoy ? 'happy' : 'sad'); }
                if (numeroEl) numeroEl.textContent = `🔥 ${racha}`;
                if (statusEl) { statusEl.textContent = leidoHoy ? '¡Has leído hoy!' : 'Aún no has leído hoy'; statusEl.className = 'racha-modal-status ' + (leidoHoy ? 'leido' : 'no-leido'); }
                if (mensajeEl) { const pool = leidoHoy ? MENSAJES_RACHA_HOY : MENSAJES_RACHA_NO_HOY; mensajeEl.textContent = pool[Math.floor(Math.random() * pool.length)]; }
                if (nombreEl) nombreEl.textContent = '— Págino, tu mascota lectora —';
            }

            rachaModal.showModal();
        };

        if (streakCounter) streakCounter.addEventListener('click', openRachaModal);
        if (closeRachaModalBtn) closeRachaModalBtn.addEventListener('click', () => rachaModal.close());
        if (rachaModal) closeOnBackdropClick(rachaModal);

        // === ESTADÍSTICAS: Botón abrir/cerrar modal ===
        const statsBtn = document.getElementById('stats-btn');
        const statsModal = document.getElementById('stats-modal');
        const closeStatsBtn = document.getElementById('close-stats-btn');
        const statsGenreFilter = document.getElementById('stats-genre-filter');
        if (statsGenreFilter) statsGenreFilter.addEventListener('change', renderStats);
        if (statsBtn && statsModal) {
            statsBtn.addEventListener('click', () => {
                const statsTitle = statsModal.querySelector('h2');
                if (statsTitle) statsTitle.textContent = viewingFriendLibrary ? `📊 Estadísticas de @${currentFriendName}` : '📊 Mis Estadísticas';
                const shareStatsBtn2 = document.getElementById('share-stats-btn');
                if (shareStatsBtn2) shareStatsBtn2.style.display = viewingFriendLibrary ? 'none' : '';
                populateGenreFilter();
                renderStats();
                statsModal.showModal();
            });
        }
        if (closeStatsBtn && statsModal) {
            closeStatsBtn.addEventListener('click', () => statsModal.close());
        }

        // === COMPARTIR EN IG/TIKTOK ===
        const shareIgBtn = document.getElementById('share-ig-btn');
        if (shareIgBtn) shareIgBtn.addEventListener('click', shareAsImage);

        // === COMPARTIR ESTADÍSTICAS ===
        const shareStatsAsImage = async () => {
            mostrarToastShare();
            const genreFilter = document.getElementById('stats-genre-filter')?.value || '';
            const data = genreFilter ? booksData.filter(b => b.genre === genreFilter) : booksData;

            const finished = data.filter(b => b.section === 'libros-terminados');
            const totalPags = data.reduce((s,b) => {
                if (b.section === 'libros-terminados') return s + (b.totalPages||0);
                return s + (b.currentPage||0);
            }, 0);
            const ratedBooks = finished.filter(b => b.rating > 0);
            const avgRating = ratedBooks.length ? (ratedBooks.reduce((s,b) => s+b.rating,0)/ratedBooks.length).toFixed(1) : '—';
            const completionRate = data.length ? Math.round((finished.length/data.length)*100) : 0;

            const authorCounts = {};
            data.forEach(b => { if (b.author) authorCounts[b.author] = (authorCounts[b.author]||0)+1; });
            const favAuthor = Object.entries(authorCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || null;

            const genreCounts = {};
            data.forEach(b => { const g = b.genre && b.genre !== 'Sin género' ? b.genre : null; if (g) genreCounts[g] = (genreCounts[g]||0)+1; });
            const favGenre = Object.entries(genreCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || null;

            const racha = lastUserData?.rachaActual || 0;

            document.getElementById('esc-total').textContent = data.length;
            document.getElementById('esc-terminados').textContent = finished.length;
            document.getElementById('esc-paginas').textContent = totalPags >= 1000 ? (totalPags/1000).toFixed(1)+'k' : totalPags;
            document.getElementById('esc-rating').textContent = avgRating !== '—' ? `${avgRating}★` : '—';
            document.getElementById('esc-racha').textContent = `🔥 ${racha} días de racha`;
            document.getElementById('esc-genre').textContent = favGenre ? `🏆 Género favorito: ${favGenre}` : '';
            document.getElementById('esc-author').textContent = favAuthor ? `✍️ Autor favorito: ${favAuthor}` : '';
            document.getElementById('esc-rate').textContent = `🎯 ${completionRate}% de libros terminados`;

            const card = document.getElementById('export-stats-card');
            card.style.display = 'flex';
            try {
                const canvas = await html2canvas(card, { scale: 2, useCORS: false, allowTaint: false, logging: false });
                const link = document.createElement('a');
                link.download = 'mis_estadisticas_lectura.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
            } catch (err) {
                console.error('Error generando imagen stats:', err);
                alert('No se pudo generar la imagen.');
            } finally {
                card.style.display = 'none';
            }
        };
        const shareStatsBtn = document.getElementById('share-stats-btn');
        if (shareStatsBtn) shareStatsBtn.addEventListener('click', shareStatsAsImage);

        // === IMPORTAR DE GOODREADS ===
        const importGoodreadsBtn = document.getElementById('import-goodreads-btn');
        const importCsvInput     = document.getElementById('import-csv');
        if (importGoodreadsBtn && importCsvInput) {
            importGoodreadsBtn.addEventListener('click', () => importCsvInput.click());
            importCsvInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                importGoodreadsBtn.disabled = true;
                importGoodreadsBtn.textContent = '⏳ Importando…';
                try {
                    await importGoodreadsCSV(file);
                } catch (err) {
                    console.error('Error importando Goodreads:', err);
                    alert('Error durante la importación:\n' + err.message);
                } finally {
                    importGoodreadsBtn.disabled = false;
                    importGoodreadsBtn.innerHTML = '&#128229; Goodreads';
                    importCsvInput.value = '';
                }
            });
        }

        setupTheme(); // (Esta línea ya la tenías al final)
    }
});