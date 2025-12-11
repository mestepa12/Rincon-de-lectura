document.addEventListener('DOMContentLoaded', () => {

// --- AUTENTICACIÓN: El portero de nuestra aplicación ---
    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            // 1. Comprobamos si ha verificado su correo
            if (user.emailVerified) {
                console.log("Usuario autenticado y verificado:", user.email);
                
                // --- CAMBIO AQUÍ: Migramos antes de iniciar ---
                migrarLibrosAntiguos(user).then(() => {
                    runApp(user); 
                });
                // ----------------------------------------------

            } else {
                // 2. Si NO está verificado, le avisamos y cerramos su sesión
                console.log("Usuario no verificado.");
                alert("Por favor, verifica tu correo electrónico para poder entrar.");
                
                firebase.auth().signOut().then(() => {
                    window.location.href = 'login.html';
                });
            }
        } else {
            // Si no hay usuario, lo redirigimos a la página de login.
            console.log("Usuario no autenticado. Redirigiendo a login...");
            if (window.location.pathname.indexOf('login.html') === -1) {
                window.location.href = 'login.html';
            }
        }
    });
        // --- FUNCIÓN DE MIGRACIÓN (SOLO PARA TRASPASAR DATOS) ---
    async function migrarLibrosAntiguos(user) {
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
    }                       
    
    // --- FUNCIÓN PRINCIPAL DE LA APP ---
    function runApp(user) {
        const db = firebase.firestore();
        const userBooksCollection = db.collection('books');
        const SECTIONS = {
            'leyendo-ahora': 'Leyendo Ahora',
            'proximas-lecturas': 'Próximas Lecturas',
            'libros-terminados': 'Libros Terminados',
            'lista-deseos': 'Lista de Deseos'
        };
        
        let booksData = []; 
        let viewingFriendLibrary = false;
        let myFriendIds = new Set(); // Usamos un Set para búsquedas rápidas

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
            
            // Rellenar select (Igual que antes)
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
                const userDoc = await db.collection('users').doc(user.uid).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    // Mostramos el nombre en la cabecera del sidebar
                    currentUserDisplay.textContent = `@${userData.username}`;
                } else {
                    // Si no tiene documento (usuarios antiguos), mostramos el email recortado
                    currentUserDisplay.textContent = user.email.split('@')[0];
                }
            } catch (error) {
                console.error("Error cargando perfil:", error);
            }
        };

        // Cargamos el perfil al iniciar
        loadMyProfile();


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
                const usersRef = db.collection('users');
                const snapshot = await usersRef
                    .where('searchKey', '>=', queryText)
                    .where('searchKey', '<=', queryText + '\uf8ff')
                    .limit(5)
                    .get();

                friendSearchResults.innerHTML = ''; // Limpiar

                // --- AQUÍ ESTÁ EL MENSAJE DE NO ENCONTRADO ---
                if (snapshot.empty) {
                    friendSearchResults.innerHTML = `
                        <div style="text-align:center; padding: 1rem; color: var(--text-color); opacity: 0.7;">
                            <p style="font-size: 1.5rem; margin-bottom: 0.5rem;">😕</p>
                            <p>No se encontraron usuarios con ese nombre.</p>
                        </div>
                    `;
                    return;
                }
                // ---------------------------------------------

                snapshot.forEach(doc => {
                    const userData = doc.data();
                    if (userData.uid === user.uid) return;

                    const userItem = document.createElement('div');
                    userItem.className = 'user-card';
                    // Estilos en línea para asegurar que se vea bien
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
                        <button class="btn-add-friend" style="padding:5px 10px; font-size:0.8rem; cursor:pointer;">Añadir</button>
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

        // Esta función se activa sola cada vez que hay cambios en la base de datos
        db.collection('users').doc(user.uid).collection('friend_requests')
            .where('status', '==', 'pending') // Solo las pendientes
            .onSnapshot((snapshot) => {
                
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
                const batch = db.batch();

                // 1. Añadirlo a MIS amigos
                const myFriendRef = db.collection('users').doc(user.uid).collection('friends').doc(friendId);
                batch.set(myFriendRef, {
                    friendUid: friendId,
                    friendUsername: requestData.fromUsername,
                    since: firebase.firestore.FieldValue.serverTimestamp()
                });

                // 2. Añadirme a SUS amigos (recíproco)
                // Primero necesito mi propio username
                const myProfile = await db.collection('users').doc(user.uid).get();
                const myUsername = myProfile.data().username;

                const theirFriendRef = db.collection('users').doc(friendId).collection('friends').doc(user.uid);
                batch.set(theirFriendRef, {
                    friendUid: user.uid,
                    friendUsername: myUsername,
                    since: firebase.firestore.FieldValue.serverTimestamp()
                });

                // 3. Borrar la solicitud
                const reqRef = db.collection('users').doc(user.uid).collection('friend_requests').doc(friendId);
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
                await db.collection('users').doc(user.uid).collection('friend_requests').doc(friendId).delete();
            } catch (error) {
                console.error("Error al rechazar:", error);
            }
        };

        // Función REAL para enviar solicitud
        const enviarSolicitudAmistad = async (targetUser) => {
            
            // --- 1. CHEQUEO DE SEGURIDAD PREVIO ---
            // Antes de molestar a la base de datos, miramos si ya lo tenemos en la lista local
            if (myFriendIds.has(targetUser.uid)) {
                alert(`¡Ya eres amigo de @${targetUser.username}! No es necesario enviar solicitud.`);
                
                // Actualizamos el botón visualmente para que se bloquee
                const btn = document.querySelector(`button[data-uid="${targetUser.uid}"]`); 
                if (btn) {
                    btn.textContent = "Amigo ✔";
                    btn.disabled = true;
                    btn.style.opacity = "0.7";
                }
                return; // ¡DETENEMOS LA FUNCIÓN AQUÍ!
            }
            // --------------------------------------

            const btn = document.querySelector(`button[data-uid="${targetUser.uid}"]`); 
            if(btn) btn.textContent = "Enviando...";

            try {
                const myProfileSnap = await db.collection('users').doc(user.uid).get();
                const myUsername = myProfileSnap.data().username;

                const requestRef = db.collection('users').doc(targetUser.uid)
                                     .collection('friend_requests').doc(user.uid);

                await requestRef.set({
                    fromUid: user.uid,
                    fromUsername: myUsername,
                    status: 'pending',
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });

                alert(`¡Solicitud enviada a @${targetUser.username}!`);
                if(btn) {
                    btn.textContent = "Enviada";
                    btn.disabled = true; 
                }

            } catch (error) {
                console.error("Error al enviar solicitud:", error);
                
                // Si por alguna razón la regla de seguridad falla, mostramos un mensaje más amigable
                if (error.code === 'permission-denied') {
                     alert("No se pudo enviar la solicitud. Es posible que ya seáis amigos o que tengas una solicitud pendiente.");
                } else {
                     alert("Error al enviar la solicitud. Inténtalo de nuevo.");
                }
                
                if(btn) btn.textContent = "Reintentar";
            }
        };
        
        
        // Eventos del buscador
        if (friendSearchBtn) {
            friendSearchBtn.addEventListener('click', searchUsers);
        }
        // Permitir buscar pulsando Enter
        if (friendSearchInput) {
            friendSearchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') searchUsers();
            });
        }


        // 5. LISTA DE AMIGOS Y VER BIBLIOTECAS
        const friendsList = document.getElementById('friends-list');

        // Escuchamos cambios en la colección de amigos confirmados
        db.collection('users').doc(user.uid).collection('friends')
            .orderBy('since', 'desc')
            .onSnapshot((snapshot) => {
                
                // --- ACTUALIZAMOS EL SET PARA EL BUSCADOR ---
                myFriendIds.clear();
                snapshot.forEach(doc => myFriendIds.add(doc.id));
                // -------------------------------------------

                if (snapshot.empty) {
                    friendsList.innerHTML = '<p class="empty-msg">Aún no tienes amigos agregados.</p>';
                } else {
                    friendsList.innerHTML = '';
                    
                    snapshot.forEach(doc => {
                        const friendData = doc.data();
                        
                        const div = document.createElement('div');
                        div.className = 'user-card';
                        div.style.cssText = `
                            display: flex; justify-content: space-between; align-items: center;
                            padding: 10px; background: var(--bg-color); 
                            border-radius: 8px; border: 1px solid var(--border-color); margin-bottom: 5px;
                        `;
                        
                        // AÑADIMOS EL BOTÓN DE PAPELERA 🗑️
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

                        // Al hacer clic en "Ver"
                        div.querySelector('.btn-view').addEventListener('click', () => {
                            cargarBibliotecaAmigo(friendData.friendUid, friendData.friendUsername);
                        });

                        // Al hacer clic en "Eliminar" (NUEVO)
                        div.querySelector('.btn-delete-friend').addEventListener('click', () => {
                            eliminarAmigo(friendData.friendUid, friendData.friendUsername);
                        });

                        friendsList.appendChild(div);
                    });
                }
            });


            // --- FUNCIÓN PARA ELIMINAR AMIGO ---
        const eliminarAmigo = async (friendUid, friendName) => {
            if (!confirm(`¿Estás seguro de que quieres eliminar a @${friendName} de tus amigos?\nDejaréis de ver vuestras bibliotecas mutuamente.`)) {
                return;
            }

            try {
                const batch = db.batch();

                // 1. Borrar de MI lista
                const myRef = db.collection('users').doc(user.uid).collection('friends').doc(friendUid);
                batch.delete(myRef);

                // 2. Borrar de SU lista (Recíproco)
                const theirRef = db.collection('users').doc(friendUid).collection('friends').doc(user.uid);
                batch.delete(theirRef);

                await batch.commit();
                
                alert(`Has eliminado a @${friendName}.`);

                // EXTRA: Si estabas viendo su biblioteca justo ahora, te mandamos a casa para evitar errores
                const currentTitle = document.getElementById('site-title').textContent;
                if (currentTitle.includes(friendName)) {
                    window.location.reload();
                }

            } catch (error) {
                console.error("Error al eliminar amigo:", error);
                alert("Hubo un error al intentar eliminar al amigo.");
            }
        };



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
            db.collection('books')
                .where("userId", "==", friendUid)
                .onSnapshot(snapshot => {
                    booksData = [];
                    snapshot.forEach(doc => {
                        booksData.push({ id: doc.id, ...doc.data() });
                    });
                    booksData.sort((a, b) => a.title.localeCompare(b.title));
                    renderBooks(); // Usamos tu función de renderizado existente
                    
                    // Añadimos un botón para "Volver a mi biblioteca"
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
        userBooksCollection
        .where("userId", "==", user.uid) 
        .onSnapshot(snapshot => {
            viewingFriendLibrary = false;
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