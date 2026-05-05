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
            { id: 'primer_libro',     icono: '📖', nombre: 'Rompehielos',     descripcion: 'Añade tu primer libro.' },
            { id: 'primer_terminado', icono: '✅', nombre: 'Primera Victoria', descripcion: 'Termina tu primer libro.' },
            { id: 'cinco_libros',     icono: '📚', nombre: 'Coleccionista',    descripcion: 'Acumula 5 libros.' },
            { id: 'maraton',          icono: '🏃', nombre: 'Maratón Lector',   descripcion: 'Lee más de 1.000 páginas en total.' },
            { id: 'critico',          icono: '⭐', nombre: 'Crítico Literario', descripcion: 'Valóra 3 libros terminados.' },
            { id: 'racha_7',          icono: '🔥', nombre: 'Una Semana',       descripcion: 'Mantén una racha de 7 días.' },
            { id: 'racha_30',         icono: '💥', nombre: 'Imparable',        descripcion: 'Mantén una racha de 30 días.' },
        ];

        let booksData = []; 
        let viewingFriendLibrary = false;
        let myFriendIds = new Set();
        let pieChartInst = null;
        let barChartInst = null;

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
            detailCover.alt = `Portada de ${book.title}`;
            detailTitle.textContent = book.title;
            detailAuthor.textContent = book.author;
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
            if (streakCounter) {
                const racha = userData.rachaActual || 0;
                const prev = streakCounter.textContent;
                streakCounter.textContent = `🔥 ${racha}`;
                if (prev !== streakCounter.textContent) {
                    streakCounter.classList.remove('streak-updated');
                    void streakCounter.offsetWidth;
                    streakCounter.classList.add('streak-updated');
                }
            }
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
        const cargarBibliotecaAmigo = (friendUid, friendName) => {

            // 0. Cargamos la vista de librería de amigo
            viewingFriendLibrary = true;

            // 1. Cambiamos el título de la web para saber dónde estamos
            document.getElementById('site-title').textContent = `Biblioteca de @${friendName}`;
            document.getElementById('site-title').style.color = 'var(--accent-color-interactive)';
            
            // 2. Cerramos el sidebar
            toggleSidebar(false);

            // 3. Ocultamos controles de edición (no podemos editar libros de amigos)
            document.getElementById('add-book-btn').style.display = 'none';
            
            // 4. Cargamos SUS libros
            // Nota: Esto funciona gracias a las reglas de seguridad que cambiamos antes
            const q = query(collection(db, 'books'), where("userId", "==", friendUid));

onSnapshot(q, (snapshot) => {
    booksData = [];
    snapshot.forEach(doc => {
        booksData.push({ id: doc.id, ...doc.data() });
    });
    booksData.sort((a, b) => a.title.localeCompare(b.title));
    renderBooks();
    mostrarBotonVolver();
});

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
                googleLink: formData.get('googleLink') || ''
            };
        
            addDoc(collection(db, 'books'), newBook).then(() => {
                console.log("Libro añadido a Firebase");
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
                    await updateDoc(userRef, { logrosDesbloqueados: [...desbloqueados, ...nuevos] });
                    nuevos.forEach(id => { const l = LOGROS.find(x => x.id === id); if (l) mostrarToastLogro(l); });
                }
            } catch (e) { console.error('Error evaluando logros:', e); }
        };

        // === ESTADÍSTICAS ===
        const renderStats = () => {
            if (pieChartInst) { pieChartInst.destroy(); pieChartInst = null; }
            if (barChartInst) { barChartInst.destroy(); barChartInst = null; }
            const isDark = document.body.classList.contains('dark-mode');
            const tc = isDark ? '#E2E8F0' : '#4E443A';
            const gc = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
            const COLORS = ['#9A3B3B','#A1887F','#5B9B6B','#60A5FA','#718096'];
            // Pie: libros por sección
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
            // Bar: páginas leídas
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
            // Resumen
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

        const handleSaveDetails = async () => {
            const bookId = bookDetailModal.dataset.bookId; 
            const book = booksData.find(b => b.id === bookId);
            if (!book) return;

            const updatedData = {
                notes: detailNotes.value,
                cover: detailCover.src
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
                if (paginaProgresada) await updateStreak();
                await evaluarLogros();
                console.log('Detalles actualizados');
                bookDetailModal.close();
            } catch (error) {
                console.error('Error al guardar:', error);
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
            document.getElementById('export-stars').textContent = '★'.repeat(r) + '☆'.repeat(5 - r);
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
        }, (error) => {
            console.error("Error al recibir datos de Firebase: ", error);
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

        // === LOGROS: Botón abrir/cerrar modal ===
        const logrosBtn = document.getElementById('logros-btn');
        const logrosModal = document.getElementById('logros-modal');
        const closeLogrosBtn = document.getElementById('close-logros-btn');
        if (logrosBtn && logrosModal) {
            logrosBtn.addEventListener('click', () => logrosModal.showModal());
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

        // === COMPARTIR EN IG/TIKTOK ===
        const shareIgBtn = document.getElementById('share-ig-btn');
        if (shareIgBtn) shareIgBtn.addEventListener('click', shareAsImage);

        setupTheme(); // (Esta línea ya la tenías al final)
    }
});