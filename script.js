import { notify, confirmDialog, promptDialog } from './notify.js';
import { googleBooksApiKey, fcmVapidKey } from './config.js';
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, onSnapshot, orderBy, serverTimestamp, deleteField, writeBatch, limit, arrayUnion } from "firebase/firestore";
import { getMessaging, getToken, onMessage, isSupported as isMessagingSupported } from "firebase/messaging";

// 1. Inicialización compartida (app, auth y Firestore con caché persistente)
import { app, auth, db } from './firebase-init.js';

// Carga diferida de Chart.js y html2canvas (solo al abrir stats / exportar)
import { loadChart, loadHtml2canvas } from './lazy-libs.js';


document.addEventListener('DOMContentLoaded', () => {

    // --- EL PORTERO: Vigilando la entrada ---
    onAuthStateChanged(auth, (user) => {
        if (user && user.emailVerified) {
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
            notify("Hemos actualizado tu biblioteca al nuevo sistema. Tus libros ya deberían aparecer.", 'info');
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

        // isSecret: true  → si está bloqueado, el requisito se oculta ("???")
        // isSecret: false → el requisito es visible aunque esté bloqueado,
        //                   para que el usuario sepa qué meta perseguir.
        const LOGROS = [
            // — Biblioteca —
            { id: 'primer_libro',           icono: '📖', nombre: 'Rompehielos',        descripcion: 'Añade tu primer libro.', isSecret: false },
            { id: 'cinco_libros',           icono: '📚', nombre: 'Coleccionista',       descripcion: 'Acumula 5 libros.', isSecret: false },
            { id: 'diez_libros',            icono: '🗂️',  nombre: 'Bibliófilo',          descripcion: 'Acumula 10 libros.', isSecret: false },
            { id: 'veinticinco_libros',     icono: '🏛️',  nombre: 'Gran Biblioteca',    descripcion: 'Acumula 25 libros.', isSecret: false },
            { id: 'cincuenta_libros',       icono: '🌐',  nombre: 'Archivo Personal',   descripcion: 'Acumula 50 libros.', isSecret: false },
            // — Libros terminados —
            { id: 'primer_terminado',       icono: '✅', nombre: 'Primera Victoria',   descripcion: 'Termina tu primer libro.', isSecret: false },
            { id: 'cinco_terminados',       icono: '🎖️',  nombre: 'Lector Constante',  descripcion: 'Termina 5 libros.', isSecret: false },
            { id: 'diez_terminados',        icono: '🏆', nombre: 'Devorador de Libros',descripcion: 'Termina 10 libros.', isSecret: false },
            { id: 'veinticinco_terminados', icono: '👑', nombre: 'Gran Lector',         descripcion: 'Termina 25 libros.', isSecret: false },
            // — Páginas —
            { id: 'maraton',                icono: '🏃', nombre: 'Maratón Lector',      descripcion: 'Lee más de 1.000 páginas en total.', isSecret: false },
            { id: 'paginas_2000',           icono: '📜', nombre: 'Expedición Literaria',descripcion: 'Lee más de 2.000 páginas en total.', isSecret: false },
            { id: 'paginas_5000',           icono: '🗺️',  nombre: 'Lector Épico',       descripcion: 'Lee más de 5.000 páginas en total.', isSecret: false },
            { id: 'paginas_10000',          icono: '🌟', nombre: 'Leyenda Lectora',     descripcion: 'Lee más de 10.000 páginas en total.', isSecret: false },
            { id: 'lector_voraz',           icono: '⚡', nombre: 'Lector Voraz',        descripcion: 'Lee más de 100 páginas en un solo día.', isSecret: true },
            // — Objetivos —
            { id: 'objetivo_diario',        icono: '🎯', nombre: 'Meta Cumplida',       descripcion: 'Alcanza tu objetivo diario de páginas.', isSecret: false },
            // — Valoraciones —
            { id: 'critico',                icono: '⭐', nombre: 'Crítico Literario',   descripcion: 'Valora 3 libros terminados.', isSecret: false },
            { id: 'critico_pro',            icono: '🎭', nombre: 'Crítico Pro',          descripcion: 'Valora 10 libros terminados.', isSecret: false },
            { id: 'perfeccionista',         icono: '✨', nombre: 'Perfeccionista',       descripcion: 'Valora 3 libros con 5 estrellas.', isSecret: false },
            // — Notas y lista de deseos —
            { id: 'anotador',               icono: '✍️',  nombre: 'El Anotador',        descripcion: 'Añade notas a 5 libros distintos.', isSecret: false },
            { id: 'deseos_10',              icono: '💭', nombre: 'Soñador de Libros',   descripcion: 'Añade 10 libros a tu lista de deseos.', isSecret: false },
            // — Racha —
            { id: 'racha_7',                icono: '🔥', nombre: 'Una Semana',           descripcion: 'Mantén una racha de 7 días.', isSecret: false },
            { id: 'racha_14',               icono: '🗓️',  nombre: 'Dos Semanas',        descripcion: 'Mantén una racha de 14 días.', isSecret: false },
            { id: 'racha_30',               icono: '💥', nombre: 'Imparable',            descripcion: 'Mantén una racha de 30 días.', isSecret: false },
            { id: 'racha_100',              icono: '💎', nombre: 'Centurión',            descripcion: 'Mantén una racha de 100 días.', isSecret: false },
            { id: 'racha_365',              icono: '🏆', nombre: 'Año Legendario',       descripcion: 'Mantén una racha de 365 días. Un año entero leyendo.', isSecret: false },
            // — Club de Lectura —
            { id: 'primer_comentario',      icono: '💬', nombre: 'Tertulia Iniciada',    descripcion: 'Deja tu primer comentario en el Club de Lectura.', isSecret: false },
            { id: 'comentarista_10',        icono: '📣', nombre: 'Alma del Club',        descripcion: 'Deja 10 comentarios en el Club de Lectura.', isSecret: false },
            // — Amigos —
            { id: 'primer_amigo',           icono: '🤝', nombre: 'Mejor Acompañado',     descripcion: 'Añade a tu primer amigo.', isSecret: false },
            { id: 'circulo_lector',         icono: '👥', nombre: 'Círculo Lector',       descripcion: 'Forma un círculo de 5 amigos.', isSecret: false },
            // — Exploración —
            { id: 'explorador_generos',     icono: '🧭', nombre: 'Explorador de Géneros',descripcion: 'Ten libros de 5 géneros distintos en tu biblioteca.', isSecret: false },
            { id: 'autor_fiel',             icono: '🖋️',  nombre: 'Fan Incondicional',  descripcion: 'Acumula 3 libros del mismo autor.', isSecret: false },
            { id: 'biblioteca_completa',    icono: '🗃️',  nombre: 'Orden Total',        descripcion: 'Ten al menos un libro en cada una de las 5 secciones.', isSecret: false },
            // — Hazañas (secretas: la sorpresa es parte del premio) —
            { id: 'mata_tochos',            icono: '🧱', nombre: 'Mata-Tochos',          descripcion: 'Termina un libro de más de 800 páginas.', isSecret: true },
            { id: 'semana_500',             icono: '📆', nombre: 'Semana de Vicio',      descripcion: 'Lee 500 páginas en una misma semana.', isSecret: true },
            { id: 'buho_nocturno',          icono: '🦉', nombre: 'Búho Nocturno',        descripcion: 'Registra lectura entre medianoche y las 6 de la mañana.', isSecret: true },
            { id: 'paginas_25000',          icono: '🌌', nombre: 'Universo de Páginas',  descripcion: 'Lee más de 25.000 páginas en total.', isSecret: true },
            // — Crítica fina (secretas) —
            { id: 'media_estrella',         icono: '✂️',  nombre: 'Precisión Quirúrgica',descripcion: 'Valora un libro usando media estrella.', isSecret: true },
            { id: 'sin_piedad',             icono: '🧐', nombre: 'Sin Piedad',           descripcion: 'Valora un libro con 1 estrella o menos.', isSecret: true },
            { id: 'cazador_vibes',          icono: '🎭', nombre: 'Cazador de Vibes',     descripcion: 'Asigna ritmo narrativo o estados de ánimo a 5 libros.', isSecret: true },
        ];

        let booksData = [];

        // Libros guardados cuando Google Books aún servía zoom=0 llevan esa
        // URL en Firestore; ese zoom ya solo devuelve un placeholder, así que
        // se normaliza a zoom=1 al cargar.
        const normalizarCover = (book) => {
            if (typeof book.cover === 'string' && book.cover.includes('books.google') && book.cover.includes('zoom=0')) {
                book.cover = book.cover.replace('zoom=0', 'zoom=1');
            }
            return book;
        };

        let viewingFriendLibrary = false;
        let currentFriendData = null;
        let currentFriendName = '';
        let myFriendIds = new Set();
        let myFriendsInfo = [];   // [{uid, username}] para el recomendador

        // Deep link de notificación push: /biblioteca.html?chat=<uid>
        // Se consume cuando llega la lista de amigos (se necesita el username).
        let pendingChatUid = new URLSearchParams(window.location.search).get('chat');
        if (pendingChatUid) {
            history.replaceState(null, '', window.location.pathname); // limpiar URL
        }
        let pieChartInst = null;
        let barChartInst = null;
        let genreChartInst = null;
        let ratingChartInst = null;
        let authorsChartInst = null;
        let ritmoChartInst = null;
        let moodChartInst = null;
        let prevRacha = null;
        let lastUserData = null;

        // — Saneamiento anti-XSS —
        // Todo dato de usuario o de API externa que se interpole en innerHTML
        // debe pasar por escapeHtml (texto y atributos) o safeUrl (URLs).
        const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, ch => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
        ));
        const safeUrl = (u) => {
            const s = String(u ?? '').trim();
            return /^(https?:\/\/|data:image\/)/i.test(s) ? escapeHtml(s) : '';
        };

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
        const editBookModal = document.getElementById('edit-book-modal');
        const editBookForm = document.getElementById('edit-book-form');
        const editBookBtn = document.getElementById('edit-book-btn');
        const cancelEditBookBtn = document.getElementById('cancel-edit-book');
        
        
        // ===============================================
        // === 1. INTEGRACIÓN API GOOGLE BOOKS ===========
        // ===============================================

        // Señal combinada: se aborta si el usuario sigue tecleando o si la API
        // tarda más de la cuenta (OpenLibrary a veces se queda colgada).
        const searchSignal = (signal, timeoutMs = 8000) =>
            (typeof AbortSignal.any === 'function' && typeof AbortSignal.timeout === 'function')
                ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
                : signal;

        async function buscarEnOpenLibrary(query, signal) {
            try {
                // Búsqueda por título (title=), no genérica (q=): la genérica es
                // difusa y con sesgo inglés ("rey de la codicia" devolvía
                // "King Leopold's Ghost"). lang=es prioriza ediciones en español.
                const resp = await fetch(
                    `https://openlibrary.org/search.json?title=${encodeURIComponent(query)}&lang=es&limit=5&fields=title,author_name,cover_i,number_of_pages_median,subject,key`,
                    { signal: searchSignal(signal) }
                );
                if (!resp.ok) return [];
                const data = await resp.json();
                if (!data.docs?.length) return [];
                return data.docs.map(doc => ({
                    title: doc.title || 'Sin título',
                    author: doc.author_name?.join(', ') || 'Autor desconocido',
                    cover: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : '',
                    totalPages: doc.number_of_pages_median || 0,
                    link: doc.key ? `https://openlibrary.org${doc.key}` : '',
                    genre: doc.subject?.[0] || 'Sin género'
                }));
            } catch (e) {
                return [];
            }
        }

        // Devuelve un array de resultados, o null si el servicio no responde
        // (para distinguir "no hay resultados" de "Google está caído").
        async function buscarEnGoogleBooks(titulo, signal) {
            const query = encodeURIComponent(titulo);
            const base = `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=5`;
            const conKey = (typeof googleBooksApiKey !== 'undefined' && googleBooksApiKey)
                ? `&key=${googleBooksApiKey}` : '';
            // Sin langRestrict: filtraba ediciones con el idioma mal etiquetado
            // y provocaba "sin resultados" falsos. country=ES ya prioriza es.
            // Escalera ante 503/429 sostenidos: Google limita por IP y las
            // redes móviles (CGNAT) la comparten entre miles de usuarios, así
            // que el 2º intento va por nuestra Cloud Function (IP de Google
            // Cloud + caché CDN). URL absoluta: en la app Android (Capacitor)
            // el origen no es el hosting y una ruta relativa no llegaría.
            const proxy = `https://mi-rincon-de-lectura.web.app/api/buscar-libros?q=${query}`;
            const urls = [
                `${base}&country=ES&printType=books${conKey}`,
                proxy,
                base
            ];
            const backoffMs = [0, 500, 1200];
            try {
                let response = null;
                for (let i = 0; i < urls.length; i++) {
                    if (backoffMs[i]) await new Promise(r => setTimeout(r, backoffMs[i]));
                    if (signal?.aborted) return null;
                    response = await fetch(urls[i], { signal: searchSignal(signal) });
                    if (response.ok || ![429, 500, 502, 503, 504].includes(response.status)) break;
                }
                if (!response.ok) return null;
                const data = await response.json();
                if (!data.items?.length) return [];
                return data.items.map(item => {
                    const info = item.volumeInfo;
                    let coverUrl = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || '';
                    if (coverUrl) {
                        // Ojo: no tocar el zoom — Google Books retiró zoom=0
                        // y devuelve un placeholder "image not available"
                        coverUrl = coverUrl
                            .replace(/^http:\/\//i, 'https://')
                            .replace('&edge=curl', '');
                    }
                    if (!coverUrl) {
                        const isbn = info.industryIdentifiers
                            ?.find(id => id.type === 'ISBN_13' || id.type === 'ISBN_10')
                            ?.identifier;
                        if (isbn) coverUrl = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
                    }
                    return {
                        title: info.title || 'Sin título',
                        author: info.authors?.join(', ') || 'Autor desconocido',
                        cover: coverUrl,
                        totalPages: info.pageCount || 0,
                        link: info.infoLink || info.previewLink || '',
                        genre: info.categories?.[0] || 'Sin género'
                    };
                });
            } catch (e) {
                if (e.name !== 'AbortError') console.error("Error buscando en Google Books:", e);
                return null;
            }
        }

        // Caché en memoria de búsquedas ya resueltas: repetir una consulta
        // (borrar y reescribir, volver atrás...) no debe gastar cuota de API.
        const busquedasCache = new Map();

        async function buscarLibroPorTitulo(titulo, signal) {
            const cacheKey = titulo.toLowerCase();
            if (busquedasCache.has(cacheKey)) return busquedasCache.get(cacheKey);

            // Ambas fuentes en paralelo: si Google falla o viene vacío, el
            // fallback de OpenLibrary ya está en vuelo (antes iba en serie y
            // sumaba las dos esperas).
            const openLibraryPromise = buscarEnOpenLibrary(titulo, signal);
            const google = await buscarEnGoogleBooks(titulo, signal);
            let resultado;
            if (google?.length) {
                resultado = { items: google, googleCaido: false };
            } else {
                const openLibrary = await openLibraryPromise;
                resultado = { items: openLibrary, googleCaido: google === null };
            }
            // Solo cachear búsquedas con resultados: los fallos deben poder
            // reintentarse cuando el servicio se recupere.
            if (resultado.items.length) {
                if (busquedasCache.size > 80) busquedasCache.clear();
                busquedasCache.set(cacheKey, resultado);
            }
            return resultado;
        }

        function mostrarResultadosBusqueda({ items: resultados, googleCaido }) {
            bookSearchResultsDiv.innerHTML = '';
            if (resultados.length === 0) {
                // Distinguir "el libro no existe" de "Google no responde":
                // con el servicio caído, reintentar sí tiene sentido.
                const msg = googleCaido
                    ? 'El buscador de Google está saturado ahora mismo. Espera unos segundos y busca de nuevo.'
                    : 'No se encontraron resultados.';
                bookSearchResultsDiv.innerHTML = `<div style="padding: 0.5rem; font-size: 0.9rem; color: var(--text-color);">${msg}</div>`;
                return;
            }

            resultados.forEach(libro => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'result-item';
                // Estilo inline temporal o usar clase CSS .result-item
                itemDiv.innerHTML = `
                    <img src="${safeUrl(libro.cover) || 'https://placehold.co/40x60?text=No+Img'}" alt="Portada de ${escapeHtml(libro.title)}" style="width:40px; height:60px; object-fit:cover; border-radius:3px;">
                    <div style="margin-left: 10px;">
                        <h4 style="margin:0; font-size:0.9rem;">${escapeHtml(libro.title)}</h4>
                        <p style="margin:0; font-size:0.8rem; color:var(--accent-color);">${escapeHtml(libro.author)}</p>
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
        let searchAbort = null;
        let searchSeq = 0;
        if(bookSearchInput) {
            bookSearchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchAbort?.abort();
                const query = e.target.value.trim();

                if (query.length > 2) {
                    bookSearchResultsDiv.innerHTML = '<div style="padding:0.5rem;">Buscando...</div>';
                    searchTimeout = setTimeout(() => {
                        const ctrl = new AbortController();
                        searchAbort = ctrl;
                        const seq = ++searchSeq;
                        buscarLibroPorTitulo(query, ctrl.signal).then((resultados) => {
                            // Descarta respuestas de búsquedas ya obsoletas:
                            // una petición lenta no debe pisar la más reciente.
                            if (seq !== searchSeq) return;
                            mostrarResultadosBusqueda(resultados);
                        });
                    }, 600);
                } else {
                    searchSeq++; // invalida respuestas en vuelo
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
                <h3>${escapeHtml(book.title)}</h3>
                <p class="author">${escapeHtml(book.author)}</p>
                ${createExtraInfoHTML(book)}
            `;

            bookArticle.appendChild(imgEl);
            bookArticle.appendChild(infoDiv);
            return bookArticle;
        };

        // ── Vista estantería: libros como lomos en baldas de madera ──────────
        // Los lomos reales no existen en ninguna API: se generan con el color
        // dominante de la portada (muestreado en canvas) y el título vertical.

        const PALETA_LOMOS = ['#7C3A3A', '#9A3B3B', '#B5651D', '#6B8E5A', '#3E6257', '#4A5A7A', '#7A4A6E', '#8A6D3B', '#5C4A72', '#2F6690', '#A0522D', '#556B2F'];

        const hashLibro = (s) => {
            let h = 0;
            for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
            return Math.abs(h);
        };

        // Caché persistente de colores muestreados: evita recargar miniaturas
        // y repetir el muestreo en cada visita.
        let coloresLomoCache = {};
        try { coloresLomoCache = JSON.parse(localStorage.getItem('rincon_colores_lomo') || '{}') || {}; } catch { /* caché corrupta: se regenera */ }
        let guardarColoresTimer;
        const guardarColoresLomo = () => {
            clearTimeout(guardarColoresTimer);
            guardarColoresTimer = setTimeout(() => {
                try { localStorage.setItem('rincon_colores_lomo', JSON.stringify(coloresLomoCache)); } catch { /* almacenamiento lleno: no pasa nada */ }
            }, 800);
        };

        const muestrearColorLomo = (coverUrl, aplicar) => {
            if (coloresLomoCache[coverUrl]) { aplicar(coloresLomoCache[coverUrl]); return; }
            const img = new Image();
            img.crossOrigin = 'anonymous'; // wsrv.nl sirve CORS abierto; el canvas no queda contaminado
            img.onload = () => {
                try {
                    const cv = document.createElement('canvas');
                    cv.width = 8; cv.height = 12;
                    const ctx = cv.getContext('2d', { willReadFrequently: true });
                    ctx.drawImage(img, 0, 0, 8, 12);
                    const px = ctx.getImageData(0, 0, 8, 12).data;
                    let r = 0, g = 0, b = 0;
                    const n = px.length / 4;
                    for (let i = 0; i < px.length; i += 4) { r += px[i]; g += px[i + 1]; b += px[i + 2]; }
                    r /= (n * 255); g /= (n * 255); b /= (n * 255);
                    // RGB → HSL para poder acotar luz y saturación
                    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
                    const l = (max + min) / 2;
                    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
                    let hue = 0;
                    if (d > 0) {
                        if (max === r) hue = 60 * (((g - b) / d) % 6);
                        else if (max === g) hue = 60 * ((b - r) / d + 2);
                        else hue = 60 * ((r - g) / d + 4);
                    }
                    if (hue < 0) hue += 360;
                    // Luz acotada para que el título en blanco siempre se lea
                    const luz = Math.min(0.50, Math.max(0.24, l));
                    const sat = Math.max(0.22, Math.min(0.75, s));
                    const color = `hsl(${Math.round(hue)}, ${Math.round(sat * 100)}%, ${Math.round(luz * 100)}%)`;
                    coloresLomoCache[coverUrl] = color;
                    guardarColoresLomo();
                    aplicar(color);
                } catch { /* fallo de canvas: se queda el color de paleta */ }
            };
            img.src = `https://wsrv.nl/?url=${encodeURIComponent(coverUrl)}&w=48&h=72&fit=cover`;
        };

        const crearLibroEstanteria = (book) => {
            const h = hashLibro(book.id || book.title || '');
            const el = document.createElement('article');
            el.className = 'shelf-book';
            el.dataset.id = book.id;
            el.dataset.titulo = (book.title || '').toLowerCase();
            el.dataset.autor = (book.author || '').toLowerCase();
            el.setAttribute('aria-label', `${book.title} de ${book.author}`);

            // ~1 de cada 7 se coloca de frente, como en una librería real
            const caraVista = h % 7 === 3;
            if (caraVista) el.classList.add('cara');

            // Grosor según páginas y altura con variación por libro
            const paginas = book.totalPages || 250;
            const ancho = caraVista ? 92 : Math.round(Math.min(54, Math.max(30, 24 + paginas / 12)));
            const alto = 150 + (h % 26);
            el.style.setProperty('--ancho', `${ancho}px`);
            el.style.setProperty('--alto', `${alto}px`);
            el.style.setProperty('--lomo', PALETA_LOMOS[h % PALETA_LOMOS.length]);

            const inner = document.createElement('div');
            inner.className = 'shelf-book-inner';

            if (!caraVista) {
                const spine = document.createElement('div');
                spine.className = 'spine';
                const titulo = document.createElement('span');
                titulo.className = 'spine-title';
                titulo.textContent = book.title || '';
                spine.appendChild(titulo);
                inner.appendChild(spine);
            }

            const img = document.createElement('img');
            img.className = 'shelf-cover';
            img.loading = 'lazy';
            img.alt = '';
            img.src = book.cover || COVER_PLACEHOLDER;
            img.onerror = () => { img.onerror = null; img.src = COVER_PLACEHOLDER; };
            inner.appendChild(img);
            el.appendChild(inner);

            if (!caraVista && book.cover && /^https?:/i.test(book.cover)) {
                muestrearColorLomo(book.cover, (c) => el.style.setProperty('--lomo', c));
            }
            return el;
        };

        // Decoración de estantería: plantitas, velas y jarrones entre los libros
        const DECOS_ESTANTERIA = ['🪴', '🕯️', '🌵', '🏺', '🌿'];
        const crearDecoEstanteria = (h) => {
            const emoji = DECOS_ESTANTERIA[h % DECOS_ESTANTERIA.length];
            const d = document.createElement('div');
            d.className = 'shelf-deco' + (emoji === '🕯️' ? ' vela' : '');
            d.setAttribute('aria-hidden', 'true');
            const s = document.createElement('span');
            s.textContent = emoji;
            s.style.fontSize = `${(1.9 + (h % 5) * 0.12).toFixed(2)}rem`;
            d.appendChild(s);
            return d;
        };

        const renderBooks = () => {
            const enEstanteria = document.body.classList.contains('vista-estanteria');
            document.querySelectorAll('.books-container').forEach(c => {
                c.innerHTML = '';
                c.classList.toggle('estanteria', enEstanteria);
            });
            booksData.forEach(book => {
                const container = document.querySelector(`.books-container[data-section="${book.section}"]`);
                if (!container) return;
                container.appendChild(enEstanteria ? crearLibroEstanteria(book) : createBookElement(book));
                if (enEstanteria) {
                    // ~1 de cada 5 libros trae un adorno detrás, determinista
                    // por libro para que la estantería no baile entre renders
                    const hd = hashLibro((book.id || book.title || '') + 'deco');
                    if (hd % 5 === 0) container.appendChild(crearDecoEstanteria(hd));
                }
            });
            if (enEstanteria) {
                // Estantería sin libros: una plantita y una vela de compañía
                document.querySelectorAll('.books-container.estanteria').forEach(c => {
                    if (!c.childElementCount) {
                        c.appendChild(crearDecoEstanteria(0));
                        c.appendChild(crearDecoEstanteria(1));
                    }
                });
            }
        };

        // Conmutador cuadrícula ↔ estantería (persistido)
        const vistaToggleBtn = document.getElementById('vista-toggle');
        const actualizarBotonVista = () => {
            if (!vistaToggleBtn) return;
            const activa = document.body.classList.contains('vista-estanteria');
            vistaToggleBtn.textContent = activa ? '🔳' : '📚';
            vistaToggleBtn.title = activa ? 'Ver como cuadrícula' : 'Ver como estantería';
        };
        if (localStorage.getItem('vista_biblioteca') === 'estanteria') {
            document.body.classList.add('vista-estanteria');
        }
        actualizarBotonVista();
        if (vistaToggleBtn) {
            vistaToggleBtn.addEventListener('click', () => {
                const activa = document.body.classList.toggle('vista-estanteria');
                localStorage.setItem('vista_biblioteca', activa ? 'estanteria' : 'grid');
                actualizarBotonVista();
                renderBooks();
            });
        }
        
        const updateProgressVisuals = (currentPage, totalPages) => {
            if (!totalPages || totalPages <= 0) {
                progressPercentage.textContent = '-';
                progressBar.style.transform = 'scaleX(0)';
                return;
            }
            const percentage = Math.round((currentPage / totalPages) * 100);
            progressPercentage.textContent = `${percentage}%`;
            progressBar.style.transform = `scaleX(${percentage / 100})`;
        };

        // ===============================================
        // === 3. GESTIÓN DE MODALES Y EVENTOS ===========
        // ===============================================

        // Mensajes de hito: solo se muestran el día EXACTO de la racha
        const RACHA_HITOS = {
            1:    { emoji: '🌱', msg: '¡Tu primer día! Págino acaba de conocerte y ya te adora.' },
            2:    { emoji: '🐣', msg: '¡Dos días! Págino empieza a creer en ti.' },
            3:    { emoji: '🦕', msg: '¡Tres días seguidos! Págino salta de alegría.' },
            5:    { emoji: '🖐️', msg: '¡Cinco días! Págino te choca la patita.' },
            7:    { emoji: '⭐', msg: '¡Una semana completa! ¡Págino te aplaude con sus bracitos!' },
            10:   { emoji: '🔟', msg: '¡Diez días! Págino ya no puede contar con las patas.' },
            14:   { emoji: '🔥', msg: '¡DOS SEMANAS seguidas! ¡Págino está en llamas!' },
            21:   { emoji: '🎯', msg: '¡Tres semanas! Dicen que ya es un hábito. Págino lo confirma.' },
            30:   { emoji: '💎', msg: '¡UN MES ENTERO leyendo! ¡Págino llora de emoción!' },
            50:   { emoji: '🏅', msg: '¡50 días! Medio camino al centurión. Págino alucina.' },
            60:   { emoji: '🌙', msg: '¡Dos meses! Págino ya te considera de la familia.' },
            75:   { emoji: '🚀', msg: '¡75 días! Págino ha despegado de la emoción.' },
            90:   { emoji: '👑', msg: '¡TRES MESES! Págino te corona como realeza lectora.' },
            100:  { emoji: '🌟', msg: '¡CENTURIÓN! ¡100 días! ¡Págino no puede creer tu dedicación!' },
            150:  { emoji: '🌋', msg: '¡150 días! Ni el meteorito pararía a alguien como tú.' },
            200:  { emoji: '🏆', msg: '¡200 DÍAS! Págino va a ponerte una estatua.' },
            250:  { emoji: '🗿', msg: '¡250 días! Eres ya un monumento a la constancia.' },
            300:  { emoji: '🌠', msg: '¡300 días! Págino pide un deseo: que nunca pares.' },
            365:  { emoji: '🎂', msg: '¡UN AÑO ENTERO LEYENDO! Págino no tiene palabras. Solo lágrimas de dinosaurio.' },
            500:  { emoji: '🐉', msg: '¡500 días! Has evolucionado. Ya eres leyenda jurásica.' },
            730:  { emoji: '🪐', msg: '¡DOS AÑOS! Págino orbita a tu alrededor de pura admiración.' },
            1000: { emoji: '♾️', msg: '¡1000 DÍAS! Págino declara oficialmente que eres inmortal.' },
        };

        // Pools aleatorias por tramo de racha. '{d}' se sustituye por el número de días.
        const RACHA_POOLS = [
            { min: 1, max: 6, emoji: '🦕', msgs: [
                '¡Buen comienzo! ¡Págino te anima!',
                '¡Vas muy bien! Págino mueve la colita de emoción.',
                'Págino te observa leer... y le encanta lo que ve.',
                '¡{d} días! Págino ya presume de ti con otros dinosaurios.',
                'Cada página te hace más fuerte. Palabra de Págino.',
                'Págino dice: los grandes lectores empezaron igual que tú.',
                '¡Sigue así! Págino está preparando confeti extra.',
                'Hoy también has leído. Págino sonríe de oreja a oreja.',
                'Págino guarda tus páginas como tesoros.',
                '¡{d} días de racha! El hábito está naciendo.',
                'Págino susurra: "esto pinta muy pero que muy bien".',
                'Un día más, un lector mejor. Págino aprueba.',
                'Págino hace la ola en tu honor. Él solo. Con dos bracitos.',
                '¡Rugido de celebración! 🦖 Págino está contento.',
                'Págino apunta tu nombre en su lista de lectores favoritos.',
                'Leer un poco cada día... Págino sabe que es magia.',
                '¡Otra página conquistada! Págino planta una banderita.',
                'Págino dice que hoy hueles a libro nuevo. Es un cumplido.',
                'La racha crece y Págino crece de orgullo.',
                'Págino te dedica su mejor pasito de baile prehistórico.',
                '¡{d} días! Págino ya no recuerda la vida sin tus lecturas.',
                'Págino asegura que las historias te esperan cada día.',
                'Hoy leíste. Mañana, ¿quién sabe qué mundo visitarás?',
                'Págino chocaría los cinco... si tuviera cinco dedos.',
                'Pequeños pasos, grandes historias. Págino lo sabe bien.',
            ]},
            { min: 7, max: 13, emoji: '⭐', msgs: [
                '¡Más de una semana! Págino no deja de aplaudir.',
                '¡{d} días seguidos! Págino te mira con ojitos brillantes.',
                'Págino dice que ya eres oficialmente persona de libros.',
                'Una semana larga de lectura. Págino está impresionado.',
                '¡La racha va en serio! Págino saca las serpentinas.',
                'Págino cuenta tus días de racha antes de dormir.',
                '¡{d} días! Ni la lluvia de meteoritos te detiene.',
                'Págino te nombra Ayudante Oficial de Dinosaurio Lector.',
                'Cada día sumas. Págino resta preocupaciones.',
                'Págino ruge de felicidad: ¡ROOOAR de {d} días!',
                'Tu constancia deja a Págino con la boca abierta.',
                'Págino dice que las páginas te reconocen ya de lejos.',
                '¡Semana superada y sumando! Págino baila claqué.',
                'Págino guarda un hueso... digo, un marcapáginas para ti.',
                'La biblioteca entera murmura tu nombre. Págino lo oyó.',
                '¡{d} días! Págino cree que naciste para esto.',
                'Págino infla globos: la fiesta de tu racha continúa.',
                'Leer ya es parte de tu día. Págino está encantado.',
                'Págino te haría un monumento, pero solo tiene plastilina.',
                'Tu racha brilla más que la escama favorita de Págino.',
                '¡Imparable! Págino toma notas de tu ejemplo.',
                'Págino presume: "ese lector es amigo mío".',
                'Los libros hacen cola para que los leas. Págino los organiza.',
                'Págino asegura que tu racha se ve desde el espacio.',
                '¡{d} días de páginas y aventuras! Págino aplaude fuerte.',
            ]},
            { min: 14, max: 29, emoji: '🔥', msgs: [
                '¡Más de dos semanas! Págino está que arde de orgullo.',
                '¡{d} días seguidos! Págino enciende la antorcha de la victoria.',
                'Tu racha es más fuerte que un T-Rex. Palabra de Págino.',
                'Págino ya no te anima: te admira.',
                '¡{d} días! Págino escribió un poema sobre ti. Es malo, pero sincero.',
                'La constancia es tu superpoder. Págino es tu fan.',
                'Págino dice que los libros pelean por estar en tus manos.',
                '¡Racha volcánica! 🌋 Págino se derrite de orgullo.',
                'Págino ya cuenta contigo como cuenta las estrellas: siempre.',
                '¡{d} días! Ni hibernando perderías este ritmo.',
                'Tu marcapáginas debería estar en un museo. Págino insiste.',
                'Págino hace fuego con dos palitos para celebrarlo.',
                'Cada día que lees, a Págino le crece el corazón.',
                '¡La racha sigue viva y coleando! Como Págino.',
                'Págino declara esta semana: Semana Oficial de Tu Racha.',
                '¡{d} días imparables! Págino te saluda con reverencia.',
                'Los dinosaurios se extinguieron; tu racha, jamás.',
                'Págino tatuaría tu racha en su escama si pudiera.',
                'Tu constancia hace que Págino crea en los humanos.',
                '¡Modo lector legendario activado! Págino lo certifica.',
                'Págino guarda tus {d} días en su cueva de los tesoros.',
                'Ya no es suerte, es disciplina. Págino lo sabe.',
                '¡Rachaza! Págino no conocía esa palabra, la inventó por ti.',
                'Págino enciende una hoguera de celebración. Controlada, tranquilo.',
                'Las historias te buscan a ti. Págino solo hace de guía.',
            ]},
            { min: 30, max: 99, emoji: '💎', msgs: [
                '¡Más de un mes leyendo! Págino te mira como a un héroe.',
                '¡{d} días! Págino pulió un diamante para ti. Con la cola.',
                'Tu racha ya es mayor que muchas plantas de Págino.',
                'Págino cuenta leyendas sobre ti alrededor del fuego.',
                '¡{d} días seguidos! Esto ya es un estilo de vida.',
                'Págino dice que brillas más que su colección de piedras.',
                'Un mes y sumando. Págino no cabe en sí de orgullo.',
                'Tu constancia es de diamante. Dura y brillante. Como tú.',
                '¡{d} días! Págino va a necesitar una vitrina para tu trofeo.',
                'Págino medita cada mañana: "que su racha siga, que siga...".',
                'Los libros ya te consideran de la casa. Págino también.',
                '¡Imparable desde hace {d} días! Págino hace historia contigo.',
                'Págino te cede su silla favorita de lectura. Honor máximo.',
                'Tu racha tiene más brillo que mil luciérnagas jurásicas.',
                'Págino escribe tus hazañas en la pared de la cueva.',
                '¡{d} días! La palabra "constancia" debería llevar tu foto.',
                'Págino sospecha que eres mitad humano, mitad biblioteca.',
                'Cada amanecer, Págino sonríe: sabe que hoy también leerás.',
                'Tu racha es patrimonio de la humanidad. Págino lo tramita.',
                '¡Nivel diamante! Págino saca brillo a tu medalla.',
                'Págino aprendió a contar hasta {d} solo para seguirte.',
                'Ya no lees para la racha; la racha vive por ti.',
                'Págino te dedica su rugido más solemne: ROOOOAR.',
                'Las estanterías se ordenan solas cuando pasas. Págino lo vio.',
                '¡{d} días! Págino brinda con zumo de helecho a tu salud.',
            ]},
            { min: 100, max: Infinity, emoji: '🌟', msgs: [
                '¡{d} días! Págino ya solo puede mirarte con admiración infinita.',
                'Eres leyenda. Págino cuenta tu historia a las nuevas generaciones.',
                '¡{d} días de racha! Los libros escriben libros sobre ti.',
                'Págino consultó los archivos jurásicos: nadie llegó tan lejos.',
                'Tu racha brilla tanto que Págino usa gafas de sol.',
                '¡{d} días! Págino te declara Maestro Supremo de la Lectura.',
                'Ni cometas, ni eras glaciales: nada detiene tu racha.',
                'Págino ya no celebra tu racha: la venera.',
                '¡{d} días seguidos! Esto ya es materia de mitología.',
                'Los dinosaurios duraron millones de años. Tu racha va camino.',
                'Págino fundó un club de fans tuyo. Ya son 74 dinosaurios.',
                'Tu constancia debería estudiarse en las escuelas. Págino insiste.',
                '¡{d} días! Págino talló tu nombre en la montaña más alta.',
                'Cada página tuya es un ladrillo de tu leyenda. Págino las cuenta todas.',
                'Págino asegura que las estrellas forman tu racha en el cielo.',
                '¡Nivel cósmico! Págino orbita alrededor de tu constancia.',
                'Tu racha tiene más días que Págino escamas. Y tiene muchas.',
                '¡{d} días! El universo entero pasa páginas contigo.',
                'Págino guardará este día en su memoria de dinosaurio. Que es eterna.',
                'Ya no eres lector: eres biblioteca andante. Págino te sigue a todas partes.',
            ]},
        ];

        // Elige mensaje: hito exacto si toca; si no, aleatorio del tramo evitando repetir los últimos usados
        const elegirMensajeRacha = (racha) => {
            if (RACHA_HITOS[racha]) return RACHA_HITOS[racha];

            const pool = RACHA_POOLS.find(p => racha >= p.min && racha <= p.max) || RACHA_POOLS[0];
            let historial = [];
            try { historial = JSON.parse(localStorage.getItem('rachaMsgHistorial')) || []; } catch (e) {}

            let candidatos = pool.msgs.filter(m => !historial.includes(m));
            if (candidatos.length === 0) candidatos = pool.msgs;
            const elegido = candidatos[Math.floor(Math.random() * candidatos.length)];

            historial.push(elegido);
            // Recuerda los últimos 20 mensajes para que casi nunca se repitan
            if (historial.length > 20) historial = historial.slice(-20);
            try { localStorage.setItem('rachaMsgHistorial', JSON.stringify(historial)); } catch (e) {}

            return { emoji: pool.emoji, msg: elegido.replaceAll('{d}', racha) };
        };

        const mostrarAnimacionRacha = (racha) => {
            const overlay  = document.getElementById('racha-celebration');
            const numEl    = document.getElementById('racha-numero-display');
            const msgEl    = document.getElementById('racha-mensaje');
            const confetti = document.getElementById('racha-confetti');
            const mascota  = document.getElementById('mascota-emoji');
            if (!overlay) return;

            const { emoji, msg } = elegirMensajeRacha(racha);

            // mascota es ahora <img>, no se cambia textContent
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

        // ===============================================
        // === CLUB DE LECTURA (comentarios anti-spoiler) ===
        // ===============================================

        // Identificador universal de libro: mismo título+autor => mismo slug
        // entre distintos usuarios (minúsculas, sin tildes, sin espacios).
        const generateBookSlug = (title, author) => {
            const normalize = (s) => (s || '')
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')  // quitar tildes/diacríticos
                .replace(/[^a-z0-9]/g, '');       // quitar espacios y símbolos
            return `${normalize(title)}-${normalize(author)}`;
        };

        let unsubscribeComments = null;

        // Hasta qué página puede "ver" el usuario sin spoilers
        const getSpoilerSafePage = (book) => {
            if (book.section === 'libros-terminados') return Infinity;
            return book.currentPage || 0;
        };

        const renderComment = (c, isOwn) => {
            const bubble = document.createElement('div');
            bubble.className = `comment-bubble${isOwn ? ' comment-own' : ''}`;
            const meta = document.createElement('div');
            meta.className = 'comment-meta';
            const userSpan = document.createElement('span');
            userSpan.className = 'comment-user';
            userSpan.textContent = isOwn ? 'Tú' : `@${c.username || '?'}`;
            const pageSpan = document.createElement('span');
            pageSpan.className = 'comment-page';
            pageSpan.textContent = `pág. ${c.page}`;
            meta.append(userSpan, pageSpan);
            if (isOwn && c.id) {
                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'comment-delete-btn';
                delBtn.title = 'Eliminar comentario';
                delBtn.setAttribute('aria-label', 'Eliminar comentario');
                delBtn.textContent = '🗑️';
                delBtn.onclick = async () => {
                    const ok = await confirmDialog({
                        title: '¿Eliminar comentario?',
                        message: 'Tus amigos dejarán de verlo.',
                        confirmText: 'Eliminar',
                        danger: true
                    });
                    if (!ok) return;
                    try {
                        await deleteDoc(doc(db, 'book_comments', c.id));
                        // El onSnapshot en tiempo real lo quita de pantalla solo
                    } catch (error) {
                        console.error('Error eliminando comentario:', error);
                        notify('No se pudo eliminar el comentario.', 'error');
                    }
                };
                meta.appendChild(delBtn);
            }
            const text = document.createElement('p');
            text.className = 'comment-text';
            text.textContent = c.text;
            bubble.append(meta, text);
            return bubble;
        };

        const setupCommentsSection = (book) => {
            const section = document.getElementById('detail-comments-section');
            const list = document.getElementById('comments-list');
            const input = document.getElementById('comment-input');
            const sendBtn = document.getElementById('send-comment-btn');
            const pageHint = document.getElementById('comment-page-hint');
            if (!section || !list) return;

            if (unsubscribeComments) { unsubscribeComments(); unsubscribeComments = null; }

            // Solo en la biblioteca propia (en la de un amigo no hay progreso propio)
            if (viewingFriendLibrary) { section.style.display = 'none'; return; }
            section.style.display = 'block';

            const slug = generateBookSlug(book.title, book.author);
            const safePage = getSpoilerSafePage(book);
            const myPage = book.section === 'libros-terminados' ? (book.totalPages || 0) : (book.currentPage || 0);
            if (pageHint) {
                pageHint.textContent = book.section === 'libros-terminados'
                    ? 'Libro terminado: ves todos los comentarios.'
                    : `Comentarás en la página ${myPage}. Verás comentarios hasta la página ${safePage}.`;
            }

            list.innerHTML = '<p class="comments-empty">Cargando comentarios…</p>';

            // Solo igualdad en la query (sin índice compuesto); el filtro de
            // página y de amigos se aplica en el cliente.
            const qComments = query(collection(db, 'book_comments'), where('bookSlug', '==', slug));
            unsubscribeComments = onSnapshot(qComments, (snapshot) => {
                const visibles = [];
                snapshot.forEach(docSnap => {
                    const c = docSnap.data();
                    const isOwn = c.uid === user.uid;
                    if (!isOwn && !myFriendIds.has(c.uid)) return;  // solo yo y mis amigos
                    if ((c.page || 0) > safePage) return;           // anti-spoiler
                    visibles.push({ ...c, id: docSnap.id, isOwn });
                });
                visibles.sort((a, b) => (a.page - b.page) ||
                    ((a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0)));

                list.innerHTML = '';
                if (visibles.length === 0) {
                    list.innerHTML = '<p class="comments-empty">Nadie ha comentado todavía en las páginas que llevas. ¡Sé el primero!</p>';
                } else {
                    visibles.forEach(c => list.appendChild(renderComment(c, c.isOwn)));
                    list.scrollTop = list.scrollHeight;
                }
            }, (error) => {
                console.error('Error cargando comentarios:', error);
                list.innerHTML = '<p class="comments-empty">No se pudieron cargar los comentarios.</p>';
            });

            const sendComment = async () => {
                const text = input.value.trim();
                if (!text) return;
                // Página actual real: si el usuario ha tocado el input de progreso
                // sin guardar, usamos lo que ve en pantalla
                let page = myPage;
                if (book.section === 'leyendo-ahora') {
                    const liveVal = parseInt(currentPageInput.value, 10);
                    if (!isNaN(liveVal)) page = Math.min(liveVal, book.totalPages || liveVal);
                }
                sendBtn.disabled = true;
                try {
                    await addDoc(collection(db, 'book_comments'), {
                        bookSlug: slug,
                        uid: user.uid,
                        username: lastUserData?.username || user.email?.split('@')[0] || '?',
                        page,
                        text,
                        timestamp: serverTimestamp()
                    });
                    input.value = '';
                    evaluarLogros();  // p. ej. "Tertulia Iniciada" / "Alma del Club"
                } catch (error) {
                    console.error('Error enviando comentario:', error);
                    notify('No se pudo enviar el comentario.', 'error');
                } finally {
                    sendBtn.disabled = false;
                }
            };
            sendBtn.onclick = sendComment;
            input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); sendComment(); } };
        };

        // Al cerrar el modal (por cualquier vía), soltar el listener de comentarios
        bookDetailModal.addEventListener('close', () => {
            if (unsubscribeComments) { unsubscribeComments(); unsubscribeComments = null; }
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
            document.querySelectorAll('#detail-ritmo-options input[name="detail-ritmo"]').forEach(r => {
                r.checked = r.value === (book.ritmoNarrativo || '');
            });
            const bookMoods = book.estadosDeAnimo || [];
            document.querySelectorAll('#detail-mood-options input[name="detail-moods"]').forEach(cb => {
                cb.checked = bookMoods.includes(cb.value);
            });
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
                if (editBookBtn) editBookBtn.style.display = 'none';
                
                // 2. Desactivar inputs para que no parezca que se pueden editar
                detailNotes.disabled = true;
                currentPageInput.disabled = true;
                moveBookSelect.disabled = true;
                detailNotes.style.opacity = '0.7';
                document.querySelectorAll('#detail-ritmo-options input, #detail-mood-options input').forEach(i => { i.disabled = true; });
                
            } else {
                // MODO EDICIÓN (DUEÑO)
                
                // 1. Mostrar botones
                deleteBookModalBtn.style.display = 'block';
                saveDetailsBtn.style.display = 'block';
                if (editBookBtn) editBookBtn.style.display = '';
                
                // 2. Reactivar inputs
                detailNotes.disabled = false;
                currentPageInput.disabled = false;
                moveBookSelect.disabled = false;
                detailNotes.style.opacity = '1';
                document.querySelectorAll('#detail-ritmo-options input, #detail-mood-options input').forEach(i => { i.disabled = false; });
            }

            // Club de Lectura: comentarios anti-spoiler de amigos
            setupCommentsSection(book);

            // Sesiones de lectura: cronómetro y predicción de fin
            refreshSessionUI(book);

            // Leemos Juntos: progreso compartido con un amigo
            renderBuddySection(book);

            // Desplegables: abiertos solo si tienen chicha (menos ruido visual)
            const notesCol = document.getElementById('detail-notes-collapse');
            if (notesCol) notesCol.open = !!(book.notes && book.notes.trim());
            const commentsCol = document.getElementById('detail-comments-collapse');
            if (commentsCol) commentsCol.open = false;
            const vibesCol = document.getElementById('detail-vibes-collapse');
            if (vibesCol) vibesCol.open = false;
            const buddyCol = document.getElementById('buddy-section');
            if (buddyCol && 'open' in buddyCol) buddyCol.open = !!getBuddyForBook(book);

            bookDetailModal.showModal();
        };

        // ===============================================
        // === EDICIÓN DE DETALLES DEL LIBRO =============
        // (título, autor, portada y total de páginas)
        // ===============================================

        const openEditModal = () => {
            const bookId = bookDetailModal.dataset.bookId;
            const book = booksData.find(b => b.id === bookId);
            if (!book || viewingFriendLibrary) return;

            editBookModal.dataset.bookId = book.id;
            document.getElementById('edit-title').value = book.title || '';
            document.getElementById('edit-author').value = book.author || '';
            document.getElementById('edit-cover').value = book.cover || '';
            document.getElementById('edit-total-pages').value = book.totalPages || '';
            editBookModal.showModal();
        };

        if (editBookBtn) editBookBtn.addEventListener('click', openEditModal);
        if (cancelEditBookBtn) cancelEditBookBtn.addEventListener('click', () => editBookModal.close());

        const handleEditBookSubmit = async (e) => {
            e.preventDefault();
            const bookId = editBookModal.dataset.bookId;
            const book = booksData.find(b => b.id === bookId);
            if (!book) return;

            const title = document.getElementById('edit-title').value.trim();
            const author = document.getElementById('edit-author').value.trim();
            const cover = document.getElementById('edit-cover').value.trim();
            let totalPages = parseInt(document.getElementById('edit-total-pages').value, 10);
            if (isNaN(totalPages) || totalPages < 0) totalPages = 0;

            if (!title) return; // el required del form ya lo impide, doble seguro

            const updatedData = { title, author, cover, totalPages };
            // Si el total baja, el progreso no puede superar el nuevo total
            if (totalPages > 0 && (book.currentPage || 0) > totalPages) {
                updatedData.currentPage = totalPages;
            }

            const submitBtn = editBookForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            try {
                await updateDoc(doc(db, 'books', bookId), updatedData);

                // Refresco inmediato del DOM (onSnapshot lo confirmará después)
                Object.assign(book, updatedData);
                renderBooks();
                detailTitle.textContent = book.title;
                detailAuthor.textContent = book.author;
                detailCover.src = book.cover || '';
                detailCover.alt = `Portada de ${book.title}`;
                if (book.section === 'leyendo-ahora') {
                    currentPageInput.value = book.currentPage || 0;
                    currentPageInput.max = book.totalPages || 0;
                    totalPagesDisplay.textContent = `/ ${book.totalPages || 0} páginas`;
                    updateProgressVisuals(book.currentPage || 0, book.totalPages || 0);
                }

                editBookModal.close();
            } catch (error) {
                console.error('Error al editar el libro:', error);
                notify('No se pudieron guardar los cambios.', 'error');
            } finally {
                submitBtn.disabled = false;
            }
        };

        if (editBookForm) editBookForm.addEventListener('submit', handleEditBookSubmit);


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
        // El sidebar no es un <dialog>: Escape debe cerrarlo igual que al resto de modales
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && friendsSidebar && friendsSidebar.classList.contains('open')) toggleSidebar(false);
        });

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
                notify("Escribe al menos 3 letras para buscar.", 'warning');
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
                            <span style="font-weight:bold;">@${escapeHtml(userData.username)}</span>
                        </div>
                        <button class="btn-add-friend" data-uid="${escapeHtml(userData.uid)}" style="padding:5px 10px; font-size:0.8rem; cursor:pointer;">Añadir</button>
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
                                <span>@${escapeHtml(req.fromUsername)}</span>
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
                notify(`¡Ahora eres amigo de @${requestData.fromUsername}!`, 'success');

            } catch (error) {
                console.error("Error al aceptar:", error);
                notify("Hubo un error al aceptar la solicitud.", 'error');
            }
        };

        const rechazarSolicitud = async (friendId) => {
            const ok = await confirmDialog({
                title: '¿Rechazar solicitud?',
                message: 'Podrá volver a enviarte una solicitud más adelante.',
                confirmText: 'Rechazar',
                danger: true
            });
            if (!ok) return;
            try {
                await deleteDoc(doc(db, 'users', user.uid, 'friend_requests', friendId));
            } catch (error) {
                console.error("Error al rechazar:", error);
            }
        };

        // Función REAL para enviar solicitud
        const enviarSolicitudAmistad = async (targetUser) => {
            if (myFriendIds.has(targetUser.uid)) {
                notify(`¡Ya eres amigo de @${targetUser.username}! No es necesario enviar solicitud.`, 'info');
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

                notify(`¡Solicitud enviada a @${targetUser.username}!`, 'success');
                if(btn) {
                    btn.textContent = "Enviada";
                    btn.disabled = true; 
                }

            } catch (error) {
                console.error("Error al enviar solicitud:", error);
                if (error.code === 'permission-denied') {
                     notify("No se pudo enviar la solicitud. Es posible que ya seáis amigos o que tengas una solicitud pendiente.", 'warning');
                } else {
                     notify("Error al enviar la solicitud. Inténtalo de nuevo.", 'error');
                }
                if(btn) btn.textContent = "Reintentar";
            }
        };

        // --- FUNCIÓN PARA ELIMINAR AMIGO ---
        const eliminarAmigo = async (friendUid, friendName) => {
            const ok = await confirmDialog({
                title: `¿Eliminar a @${friendName}?`,
                message: 'Dejaréis de ver vuestras bibliotecas mutuamente.',
                confirmText: 'Eliminar amigo',
                danger: true
            });
            if (!ok) return;

            try {
                const batch = writeBatch(db);

                // 1. Borrar de MI lista
                const myRef = doc(db, 'users', user.uid, 'friends', friendUid);
                batch.delete(myRef);

                // 2. Borrar de SU lista (Recíproco)
                const theirRef = doc(db, 'users', friendUid, 'friends', user.uid);
                batch.delete(theirRef);

                await batch.commit();
                
                notify(`Has eliminado a @${friendName}.`, 'info');

                const currentTitle = document.getElementById('site-title').textContent;
                if (currentTitle.includes(friendName)) {
                    window.location.reload();
                }

            } catch (error) {
                console.error("Error al eliminar amigo:", error);
                notify("Hubo un error al intentar eliminar al amigo.", 'error');
            }
        };

        // ===============================================
        // === CHAT EN TIEMPO REAL ENTRE AMIGOS ==========
        // ===============================================
        const chatModal = document.getElementById('chat-modal');
        const chatMessagesEl = document.getElementById('chat-messages');
        const chatInput = document.getElementById('chat-input');
        const chatSendBtn = document.getElementById('chat-send-btn');
        const chatShareBookBtn = document.getElementById('chat-share-book-btn');
        const chatBookPicker = document.getElementById('chat-book-picker');
        const chatBookSelect = document.getElementById('chat-book-select');
        const chatBookSendBtn = document.getElementById('chat-book-send-btn');

        let unsubscribeChat = null;
        let currentChatFriend = null;

        // ID determinista: ambos participantes calculan el mismo chat
        const getChatId = (uidA, uidB) => [uidA, uidB].sort().join('_');

        const renderChatMessage = (m) => {
            const own = m.from === user.uid;
            const bubble = document.createElement('div');
            bubble.className = `chat-bubble${own ? ' chat-own' : ''}`;

            if (m.type === 'book' && m.book && typeof m.book === 'object') {
                // Mensaje especial: minitarjeta de libro
                const label = document.createElement('p');
                label.className = 'chat-book-label';
                label.textContent = own ? '📖 Has compartido un libro' : '📖 Te ha enviado un libro';
                const card = document.createElement('div');
                card.className = 'chat-book-card';
                const img = document.createElement('img');
                const coverOk = typeof m.book.cover === 'string' && /^https?:\/\//i.test(m.book.cover);
                img.src = coverOk ? m.book.cover : COVER_PLACEHOLDER;
                img.onerror = () => { img.onerror = null; img.src = COVER_PLACEHOLDER; };
                img.alt = '';
                const info = document.createElement('div');
                info.className = 'chat-book-info';
                const t = document.createElement('strong');
                t.textContent = m.book.title || 'Libro';
                const a = document.createElement('span');
                a.textContent = m.book.author || '';
                info.append(t, a);
                if (m.book.totalPages) {
                    const pg = document.createElement('small');
                    pg.textContent = `${m.book.totalPages} págs.`;
                    info.appendChild(pg);
                }
                card.append(img, info);
                bubble.append(label, card);
            } else {
                const p = document.createElement('p');
                p.className = 'chat-text';
                p.textContent = m.text || '';
                bubble.appendChild(p);
            }

            const time = document.createElement('span');
            time.className = 'chat-time';
            const d = m.timestamp?.toDate?.();
            time.textContent = d ? d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '';
            bubble.appendChild(time);
            return bubble;
        };

        const openChat = async (friendUid, friendUsername) => {
            currentChatFriend = { uid: friendUid, username: friendUsername };
            document.getElementById('chat-title').textContent = `💬 @${friendUsername}`;
            chatMessagesEl.innerHTML = '<p class="comments-empty">Cargando…</p>';
            chatBookPicker.style.display = 'none';

            const chatId = getChatId(user.uid, friendUid);
            try {
                // Doc padre con los participantes (las reglas exigen coherencia con el ID)
                await setDoc(doc(db, 'chats', chatId), {
                    participants: [user.uid, friendUid].sort()
                }, { merge: true });
            } catch (e) {
                console.error('Error inicializando chat:', e);
            }

            if (unsubscribeChat) { unsubscribeChat(); unsubscribeChat = null; }
            const qMsgs = query(
                collection(db, 'chats', chatId, 'messages'),
                orderBy('timestamp', 'asc'),
                limit(200)
            );
            unsubscribeChat = onSnapshot(qMsgs, (snap) => {
                chatMessagesEl.innerHTML = '';
                if (snap.empty) {
                    chatMessagesEl.innerHTML = '<p class="comments-empty">Aún no hay mensajes. ¡Di hola! 👋</p>';
                    return;
                }
                snap.forEach(d => chatMessagesEl.appendChild(renderChatMessage(d.data())));
                chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
            }, (error) => {
                console.error('Error cargando chat:', error);
                chatMessagesEl.innerHTML = '<p class="comments-empty">No se pudo cargar el chat.</p>';
            });

            toggleSidebar(false);
            chatModal.showModal();
            chatInput.focus();
        };

        const sendChatPayload = async (payload) => {
            if (!currentChatFriend) return;
            const chatId = getChatId(user.uid, currentChatFriend.uid);
            await addDoc(collection(db, 'chats', chatId, 'messages'), {
                from: user.uid,
                to: currentChatFriend.uid,
                timestamp: serverTimestamp(),
                ...payload
            });
        };

        const sendChatText = async () => {
            const text = chatInput.value.trim();
            if (!text) return;
            chatSendBtn.disabled = true;
            try {
                await sendChatPayload({ type: 'text', text });
                chatInput.value = '';
            } catch (error) {
                console.error('Error enviando mensaje:', error);
                notify('No se pudo enviar el mensaje.', 'error');
            } finally {
                chatSendBtn.disabled = false;
                chatInput.focus();
            }
        };

        const sendChatBook = async () => {
            const book = booksData.find(b => b.id === chatBookSelect.value);
            if (!book) return;
            chatBookSendBtn.disabled = true;
            try {
                await sendChatPayload({
                    type: 'book',
                    book: {
                        title: (book.title || '').slice(0, 300),
                        author: (book.author || '').slice(0, 200),
                        cover: (book.cover || '').slice(0, 1000),
                        totalPages: book.totalPages || 0
                    }
                });
                chatBookPicker.style.display = 'none';
            } catch (error) {
                console.error('Error compartiendo libro:', error);
                notify('No se pudo compartir el libro.', 'error');
            } finally {
                chatBookSendBtn.disabled = false;
            }
        };

        chatSendBtn.addEventListener('click', sendChatText);
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); sendChatText(); }
        });
        chatShareBookBtn.addEventListener('click', () => {
            const visible = chatBookPicker.style.display !== 'none';
            if (visible) { chatBookPicker.style.display = 'none'; return; }
            chatBookSelect.innerHTML = '';
            booksData.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b.id;
                opt.textContent = `${b.title} — ${b.author}`;
                chatBookSelect.appendChild(opt);
            });
            chatBookPicker.style.display = booksData.length ? 'flex' : 'none';
            if (!booksData.length) notify('No tienes libros en tu biblioteca para compartir.', 'warning');
        });
        chatBookSendBtn.addEventListener('click', sendChatBook);
        document.getElementById('close-chat-btn').addEventListener('click', () => chatModal.close());
        chatModal.addEventListener('close', () => {
            if (unsubscribeChat) { unsubscribeChat(); unsubscribeChat = null; }
            currentChatFriend = null;
        });

        // ===============================================
        // === 5. LISTA DE AMIGOS ========================
        // ===============================================
        const friendsList = document.getElementById('friends-list');

        const friendsRef = collection(db, 'users', user.uid, 'friends');
        const qFriends = query(friendsRef, orderBy('since', 'desc'));

        onSnapshot(qFriends, (snapshot) => {
            myFriendIds.clear();
            snapshot.forEach(docSnap => myFriendIds.add(docSnap.id));
            myFriendsInfo = snapshot.docs.map(d => ({
                uid: d.data().friendUid || d.id,
                username: d.data().friendUsername || '?'
            }));

            // Notificación de chat pulsada: abrir el chat con esa persona
            if (pendingChatUid) {
                const f = myFriendsInfo.find(x => x.uid === pendingChatUid);
                if (f) {
                    pendingChatUid = null;
                    openChat(f.uid, f.username);
                }
            }

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
                            <b style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width: 120px;">@${escapeHtml(friendData.friendUsername)}</b>
                        </div>
                        <div style="display:flex; gap:5px;">
                            <button class="btn-chat" style="background:transparent; border:1px solid var(--accent-color); padding:5px 8px; border-radius:4px; cursor:pointer; font-size:0.8rem;" title="Enviar mensaje">💬</button>
                            <button class="btn-view" style="background:var(--accent-color); color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:0.8rem;">Ver</button>
                            <button class="btn-delete-friend" style="background:transparent; border:1px solid #E53E3E; color:#E53E3E; padding:5px 8px; border-radius:4px; cursor:pointer; font-size:0.8rem;" title="Eliminar amigo">🗑️</button>
                        </div>
                    `;

                    div.querySelector('.btn-chat').addEventListener('click', () => {
                        openChat(friendData.friendUid, friendData.friendUsername);
                    });

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
            const recommendBtnEl = document.getElementById('recommend-btn');
            if (recommendBtnEl) recommendBtnEl.style.display = 'none';

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
                snapshot.forEach(doc => { booksData.push(normalizarCover({ id: doc.id, ...doc.data() })); });
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
                genre: (document.getElementById('book-genre-manual')?.value.trim()) || document.getElementById('book-genre')?.value || 'Sin género',
                ritmoNarrativo: addBookForm.querySelector('input[name="ritmo"]:checked')?.value || '',
                estadosDeAnimo: [...addBookForm.querySelectorAll('input[name="moods"]:checked')].map(cb => cb.value)
            };

            // Evita duplicados: mismo título + autor (normalizado) ya en la biblioteca
            const clave = (t, a) => `${(t || '').trim().toLowerCase()}|${(a || '').trim().toLowerCase()}`;
            const yaExiste = booksData.some(b => clave(b.title, b.author) === clave(newBook.title, newBook.author));
            if (yaExiste) {
                notify('Ese libro ya está en tu biblioteca.', 'warning');
                return;
            }

            addDoc(collection(db, 'books'), newBook).then(() => {
                addBookForm.reset();
                if(bookSearchResultsDiv) bookSearchResultsDiv.innerHTML = '';
                // Si hay un filtro activo el libro nuevo quedaría oculto sin aviso:
                // se limpia y se relanza el filtrado para que siempre sea visible.
                if (searchBar && searchBar.value) {
                    searchBar.value = '';
                    searchBar.dispatchEvent(new Event('input'));
                }
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
                // Bloqueado + secreto: requisito oculto para mantener la intriga.
                // Bloqueado + público: requisito visible, es una meta a perseguir.
                let desc = logro.descripcion;
                if (!ok && logro.isSecret) {
                    desc = '??? Logro secreto. ¡Sigue leyendo para descubrirlo!';
                }
                const div = document.createElement('div');
                div.className = `logro-card ${ok ? 'logro-desbloqueado' : 'logro-bloqueado'}`;
                div.innerHTML = `<div class="logro-icono">${logro.icono}</div><div class="logro-nombre">${logro.nombre}</div><div class="logro-desc">${desc}</div><div class="logro-estado">${ok ? '✓ Obtenido' : '🔒'}</div>`;
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
                if (!desbloqueados.has('racha_365')              && racha >= 365) nuevos.push('racha_365');

                // — Club de Lectura (solo consulta si queda alguno por desbloquear) —
                if (!desbloqueados.has('primer_comentario') || !desbloqueados.has('comentarista_10')) {
                    try {
                        const misComentarios = await getDocs(query(collection(db, 'book_comments'), where('uid', '==', user.uid)));
                        if (!desbloqueados.has('primer_comentario') && misComentarios.size >= 1)  nuevos.push('primer_comentario');
                        if (!desbloqueados.has('comentarista_10')   && misComentarios.size >= 10) nuevos.push('comentarista_10');
                    } catch { /* sin permiso o sin red: se reintenta en la próxima evaluación */ }
                }

                // — Amigos —
                if (!desbloqueados.has('primer_amigo')           && myFriendIds.size >= 1) nuevos.push('primer_amigo');
                if (!desbloqueados.has('circulo_lector')         && myFriendIds.size >= 5) nuevos.push('circulo_lector');

                // — Exploración —
                const generosUnicos = new Set(booksData.map(b => b.genre).filter(g => g && g !== 'Sin género'));
                if (!desbloqueados.has('explorador_generos')     && generosUnicos.size >= 5) nuevos.push('explorador_generos');
                const porAutor = {};
                booksData.forEach(b => { const a = (b.author || '').trim().toLowerCase(); if (a) porAutor[a] = (porAutor[a] || 0) + 1; });
                if (!desbloqueados.has('autor_fiel')             && Object.values(porAutor).some(n => n >= 3)) nuevos.push('autor_fiel');
                const seccionesUsadas = new Set(booksData.map(b => b.section));
                if (!desbloqueados.has('biblioteca_completa')    && Object.keys(SECTIONS).every(s => seccionesUsadas.has(s))) nuevos.push('biblioteca_completa');

                // — Hazañas —
                if (!desbloqueados.has('mata_tochos')            && terminados.some(b => (b.totalPages || 0) > 800)) nuevos.push('mata_tochos');
                const semanaActual = getWeekStartStr();
                const paginasSemana = ud.fechaSemana === semanaActual ? (ud.paginasLeidasSemana || 0) : 0;
                if (!desbloqueados.has('semana_500')             && paginasSemana >= 500) nuevos.push('semana_500');
                const horaActual = new Date().getHours();
                if (!desbloqueados.has('buho_nocturno')          && horaActual < 6 && paginasHoyL > 0) nuevos.push('buho_nocturno');
                if (!desbloqueados.has('paginas_25000')          && totalPaginasLeidas >= 25000) nuevos.push('paginas_25000');

                // — Crítica fina —
                if (!desbloqueados.has('media_estrella')         && booksData.some(b => b.rating > 0 && b.rating % 1 !== 0)) nuevos.push('media_estrella');
                if (!desbloqueados.has('sin_piedad')             && booksData.some(b => b.rating > 0 && b.rating <= 1)) nuevos.push('sin_piedad');
                const conVibes = booksData.filter(b => b.ritmoNarrativo || (b.estadosDeAnimo && b.estadosDeAnimo.length > 0));
                if (!desbloqueados.has('cazador_vibes')          && conVibes.length >= 5) nuevos.push('cazador_vibes');

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

        const renderStats = async () => {
            await loadChart(); // carga Chart.js bajo demanda (define window.Chart)
            [pieChartInst, barChartInst, genreChartInst, ratingChartInst, authorsChartInst, ritmoChartInst, moodChartInst].forEach(c => { if (c) c.destroy(); });
            pieChartInst = barChartInst = genreChartInst = ratingChartInst = authorsChartInst = ritmoChartInst = moodChartInst = null;

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

            // === RITMO + ESTADOS DE ÁNIMO (todos los libros) ===
            const ritmoCounts = {};
            data.forEach(b => { if (b.ritmoNarrativo) ritmoCounts[b.ritmoNarrativo] = (ritmoCounts[b.ritmoNarrativo]||0)+1; });
            const moodCounts = {};
            data.forEach(b => { (b.estadosDeAnimo||[]).forEach(m => { moodCounts[m] = (moodCounts[m]||0)+1; }); });
            const sortedMoods = Object.entries(moodCounts).sort((a,b) => b[1]-a[1]);
            const RITMO_PALETTE = ['#60A5FA','#5B9B6B','#F59E0B','#EC4899','#9A3B3B'];

            const ritmoCtx = document.getElementById('ritmoChart');
            const ritmoEmpty = document.getElementById('ritmo-chart-empty');
            if (Object.keys(ritmoCounts).length && ritmoCtx) {
                ritmoCtx.style.display = '';
                if (ritmoEmpty) ritmoEmpty.style.display = 'none';
                ritmoChartInst = new Chart(ritmoCtx, {
                    type: 'doughnut',
                    data: { labels: Object.keys(ritmoCounts), datasets: [{ data: Object.values(ritmoCounts), backgroundColor: RITMO_PALETTE, borderWidth: 0, hoverOffset: 6 }] },
                    options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: tc, font: { size: 11 }, padding: 6 } } } }
                });
            } else {
                if (ritmoCtx) ritmoCtx.style.display = 'none';
                if (ritmoEmpty) ritmoEmpty.style.display = 'block';
            }

            const moodCtx = document.getElementById('moodChart');
            const moodEmpty = document.getElementById('mood-chart-empty');
            if (sortedMoods.length && moodCtx) {
                moodCtx.style.display = '';
                if (moodEmpty) moodEmpty.style.display = 'none';
                moodChartInst = new Chart(moodCtx, {
                    type: 'bar',
                    data: { labels: sortedMoods.map(([m]) => m), datasets: [{ data: sortedMoods.map(([,c]) => c), backgroundColor: sortedMoods.map((_,i) => PALETTE[i%PALETTE.length]), borderRadius: 6, borderWidth: 0 }] },
                    options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: tc, stepSize: 1 }, grid: { color: gc }, beginAtZero: true }, y: { ticks: { color: tc, font: { size: 11 } }, grid: { display: false } } } }
                });
            } else {
                if (moodCtx) moodCtx.style.display = 'none';
                if (moodEmpty) moodEmpty.style.display = 'block';
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
                    favGenre ? ['🏆', 'Género favorito', escapeHtml(favGenre)] : null,
                    favAuthor ? ['✍️', 'Autor favorito', escapeHtml(favAuthor)] : null,
                    longestBook ? ['📄', 'Libro más largo', `${escapeHtml(longestBook.title?.slice(0,28))||'—'} (${(longestBook.totalPages||0).toLocaleString('es')} págs.)`] : null,
                    avgPages > 0 ? ['📏', 'Páginas por libro', avgPages.toLocaleString('es') + ' de media'] : null,
                    pagesRemaining > 0 ? ['🏃', 'Páginas pendientes', pagesRemaining.toLocaleString('es') + ' en lectura'] : null,
                    counts['proximas-lecturas'] > 0 ? ['📋', 'En tu lista', counts['proximas-lecturas'] + ' próximas lecturas'] : null,
                ].filter(Boolean);
                extra.innerHTML = cards.map(([ico,lbl,val]) => `<div class="stat-card-wide"><span class="stat-card-wide-ico">${ico}</span><div><span class="stat-card-wide-lbl">${lbl}</span><span class="stat-card-wide-val">${val}</span></div></div>`).join('');
            }
        };

        // === NOTIFICACIONES PUSH (FCM) ===
        // iOS (16.4+, PWA instalada) exige que requestPermission() se llame
        // dentro de un gesto del usuario; la petición automática al cargar se
        // ignora en silencio. Por eso: con permiso ya concedido renovamos el
        // token en silencio; con permiso pendiente mostramos un banner y
        // pedimos el permiso en el click.
        const obtainPushToken = async () => {
            try {
                const swRegistration = await navigator.serviceWorker.register(
                    `${import.meta.env.BASE_URL}firebase-messaging-sw.js`
                );

                const messaging = getMessaging(app);
                const token = await getToken(messaging, {
                    vapidKey: fcmVapidKey,
                    serviceWorkerRegistration: swRegistration
                });
                if (!token) return false;

                // Guardar token (array: soporta varios dispositivos por usuario)
                await updateDoc(doc(db, 'users', user.uid), {
                    fcmTokens: arrayUnion(token)
                });

                // Notificaciones recibidas con la app abierta (primer plano).
                // showNotification del SW, no `new Notification()`: en Android
                // Chrome el constructor lanza "Illegal constructor".
                onMessage(messaging, (payload) => {
                    const title = payload.data?.title || payload.notification?.title || 'Rincón de Lectura';
                    const body = payload.data?.body || payload.notification?.body || '';
                    swRegistration.showNotification(title, {
                        body,
                        icon: '/favicon.png',
                        data: { url: payload.data?.url || '/biblioteca.html' }
                    });
                });
                return true;
            } catch (error) {
                console.error('Error obteniendo token FCM:', error);
                return false;
            }
        };

        const showPushBanner = () => {
            if (document.getElementById('push-banner')) return;
            const banner = document.createElement('div');
            banner.id = 'push-banner';
            banner.className = 'push-banner';
            banner.innerHTML = `
                <span class="push-banner-text">🔔 Activa las notificaciones y no pierdas tu racha</span>
                <div class="push-banner-actions">
                    <button type="button" id="push-banner-enable">Activar</button>
                    <button type="button" id="push-banner-dismiss" aria-label="Ahora no">✕</button>
                </div>`;
            document.body.appendChild(banner);

            document.getElementById('push-banner-enable').onclick = async () => {
                banner.remove();
                // DEBE ejecutarse dentro del gesto del usuario (requisito iOS)
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    const ok = await obtainPushToken();
                    if (!ok) notify('No se pudieron activar las notificaciones. Inténtalo más tarde.', 'error');
                }
            };
            document.getElementById('push-banner-dismiss').onclick = () => {
                localStorage.setItem('push_banner_dismissed', Date.now().toString());
                banner.remove();
            };
        };

        const setupPushNotifications = async () => {
            try {
                if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
                if (!(await isMessagingSupported())) return;
                if (!fcmVapidKey || fcmVapidKey.startsWith('PEGA_AQUI')) {
                    console.warn('FCM: falta VITE_FIREBASE_VAPID_KEY en .env');
                    return;
                }

                if (Notification.permission === 'granted') {
                    obtainPushToken();  // ya autorizado: registrar/renovar en silencio
                } else if (Notification.permission === 'default') {
                    // No insistir si el usuario cerró el banner hace < 7 días
                    const dismissed = parseInt(localStorage.getItem('push_banner_dismissed') || '0', 10);
                    if (Date.now() - dismissed > 7 * 24 * 60 * 60 * 1000) showPushBanner();
                }
                // 'denied': no molestar
            } catch (error) {
                console.error('Error configurando notificaciones push:', error);
            }
        };
        setupPushNotifications();

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

                    // Racha con congelación: tolera hasta 2 días sin leer.
                    // Lees lunes → martes y miércoles la racha se congela →
                    // solo si tampoco lees miércoles, el jueves se reinicia.
                    if (diffDias === 0) return;          // Mismo día: ya contabilizado
                    else if (diffDias <= 2) rachaActual += 1;  // Sigue (1 día saltado como mucho)
                    else rachaActual = 1;                // 3+ días sin leer: racha rota
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

        const checkStreakBreakOnLogin = async () => {
            const userRef = doc(db, 'users', user.uid);
            try {
                const userSnap = await getDoc(userRef);
                if (!userSnap.exists()) return;
                const userData = userSnap.data();
                const ultimaFechaTimestamp = userData.ultimaFechaLectura;
                if (!ultimaFechaTimestamp) return;
                const hoy = new Date();
                hoy.setHours(0, 0, 0, 0);
                const ultima = ultimaFechaTimestamp.toDate();
                ultima.setHours(0, 0, 0, 0);
                const diffDias = Math.round((hoy - ultima) / (1000 * 60 * 60 * 24));
                // La racha se congela hasta 2 días: solo muere al 3º día sin leer
                if (diffDias >= 3) {
                    await updateDoc(userRef, { rachaActual: 0 });
                }
            } catch (error) {
                console.error('Error chequeando racha al inicio:', error);
            }
        };
        checkStreakBreakOnLogin();

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

        // Modal bonito de "¡última página!": resuelve true/false según el botón.
        // ESC o cerrar el diálogo cuentan como "todavía no".
        const askFinishBook = (book) => new Promise((resolve) => {
            const modal = document.getElementById('finish-book-modal');
            if (!modal) {
                confirmDialog({
                    title: '¡Última página!',
                    message: `¿Mover "${book.title}" a Libros Terminados?`,
                    confirmText: '🏆 Mover a Terminados',
                    cancelText: 'Todavía no'
                }).then(resolve);
                return;
            }
            document.getElementById('finish-book-text').textContent =
                `Has llegado a la última página de "${book.title}". ¿Lo colocamos en tu estantería de Libros Terminados?`;
            let settled = false;
            const done = (val) => {
                if (settled) return;
                settled = true;
                resolve(val);
                if (modal.open) modal.close();
            };
            document.getElementById('finish-confirm-btn').onclick = () => done(true);
            document.getElementById('finish-cancel-btn').onclick = () => done(false);
            modal.addEventListener('close', () => done(false), { once: true });
            modal.showModal();
        });

        // Última página alcanzada: ofrecer mover el libro a Terminados.
        // Devuelve true si el libro se movió.
        const promptFinishBook = async (book) => {
            const ok = await askFinishBook(book);
            if (!ok) return false;
            try {
                await updateDoc(doc(db, 'books', book.id), {
                    section: 'libros-terminados',
                    currentPage: book.totalPages || 0
                });
                book.section = 'libros-terminados';
                book.currentPage = book.totalPages || 0;
                renderBooks();
                syncBuddyProgress(book);   // Leemos Juntos: marcar terminado
                evaluarLogros();
                return true;
            } catch (error) {
                console.error('Error moviendo el libro a Terminados:', error);
                return false;
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
                genre: genreVal || book.genre || 'Sin género',
                ritmoNarrativo: bookDetailModal.querySelector('input[name="detail-ritmo"]:checked')?.value || '',
                estadosDeAnimo: [...bookDetailModal.querySelectorAll('input[name="detail-moods"]:checked')].map(cb => cb.value)
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
                const userUpdates = { totalPaginasLeidas };
                if (paginaProgresada) userUpdates.lastReadTimestamp = serverTimestamp();
                await updateDoc(doc(db, 'users', user.uid), userUpdates);

                // Leemos Juntos: reflejar mi nuevo progreso/estado en el doc compartido
                syncBuddyProgress({
                    ...book,
                    section: updatedData.section || book.section,
                    currentPage: updatedData.currentPage !== undefined ? updatedData.currentPage : (book.currentPage || 0)
                });

                await evaluarLogros();

                // ¿Llegó a la última página? Ofrecer pasarlo a Terminados
                const finalSection = updatedData.section || book.section;
                const finalPage = updatedData.currentPage !== undefined ? updatedData.currentPage : (book.currentPage || 0);
                if (finalSection === 'leyendo-ahora' && book.totalPages > 0 && finalPage >= book.totalPages) {
                    book.currentPage = finalPage;
                    await promptFinishBook(book);
                }

                bookDetailModal.close();
            } catch (error) {
                console.error('Error al guardar:', error);
            }
        };

        // ===============================================
        // === SESIONES DE LECTURA (cronómetro) ==========
        // La sesión activa vive en localStorage: sobrevive a cerrar la
        // PWA y solo escribe en Firestore al terminar (1 doc por sesión).
        // ===============================================

        // ===============================================
        // === LEEMOS JUNTOS (lecturas compartidas) ======
        // Doc en /buddy_reads/{uidA_uidB_slug} con el progreso de ambos.
        // El listener mantiene la lista en tiempo real: las barras del
        // modal se mueven solas cuando tu compañero avanza.
        // ===============================================

        let myBuddyReads = [];

        onSnapshot(
            query(collection(db, 'buddy_reads'), where('participants', 'array-contains', user.uid)),
            (snap) => {
                myBuddyReads = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                const book = booksData.find(b => b.id === bookDetailModal.dataset.bookId);
                if (bookDetailModal.open && book) renderBuddySection(book);
            },
            (error) => console.error('Error cargando lecturas compartidas:', error)
        );

        const getBuddyForBook = (book) =>
            myBuddyReads.find(br => br.bookSlug === generateBookSlug(book.title, book.author));

        // Sube mi página/estado al doc compartido (si existe para este libro)
        const syncBuddyProgress = async (book) => {
            try {
                const br = getBuddyForBook(book);
                if (!br) return;
                const total = book.totalPages || br.totalPages || 0;
                const fin = book.section === 'libros-terminados' ||
                    (total > 0 && (book.currentPage || 0) >= total);
                const page = fin ? total : (book.currentPage || 0);
                await updateDoc(doc(db, 'buddy_reads', br.id), {
                    [`progress.${user.uid}`]: page,
                    [`finished.${user.uid}`]: fin,
                    updatedAt: serverTimestamp()
                });
            } catch (error) {
                console.error('Error sincronizando lectura compartida:', error);
            }
        };

        const buddyBarHTML = (nombre, page, total, fin, esYo) => {
            const pct = total > 0 ? Math.min(100, Math.round((page / total) * 100)) : 0;
            const estado = fin ? '🏁 ¡Terminado!' : `pág. ${page}${total ? ` de ${total}` : ''}`;
            return `
                <div class="buddy-row${esYo ? ' buddy-me' : ''}">
                    <div class="buddy-row-top">
                        <span class="buddy-name">${esYo ? 'Tú' : '@' + escapeHtml(nombre)}</span>
                        <span class="buddy-state">${estado}</span>
                    </div>
                    <div class="buddy-bar"><div class="buddy-bar-fill${fin ? ' buddy-bar-done' : ''}" style="transform:scaleX(${pct / 100})"></div></div>
                </div>`;
        };

        const renderBuddySection = (book) => {
            const section = document.getElementById('buddy-section');
            const content = document.getElementById('buddy-content');
            if (!section || !content) return;

            if (viewingFriendLibrary) { section.style.display = 'none'; return; }
            section.style.display = '';
            content.innerHTML = '';

            const br = getBuddyForBook(book);

            if (br) {
                const otherUid = (br.participants || []).find(p => p !== user.uid) || '';
                const otherName = (br.usernames || {})[otherUid] || 'amigo';
                const total = br.totalPages || book.totalPages || 0;
                const myPage = (br.progress || {})[user.uid] || 0;
                const otherPage = (br.progress || {})[otherUid] || 0;
                const myFin = !!(br.finished || {})[user.uid];
                const otherFin = !!(br.finished || {})[otherUid];

                let pique;
                if (myFin && otherFin) pique = '🎉 ¡Los dos lo habéis terminado! Hora de comentarlo en el Club.';
                else if (myFin) pique = `Esperando a @${escapeHtml(otherName)}... tú ya has cruzado la meta. 😎`;
                else if (otherFin) pique = `@${escapeHtml(otherName)} ya lo ha terminado. ¡Sprint final! 🏃`;
                else if (myPage > otherPage) pique = `Vas ${myPage - otherPage} páginas por delante. 🔥`;
                else if (otherPage > myPage) pique = `@${escapeHtml(otherName)} te saca ${otherPage - myPage} páginas. 👀`;
                else pique = 'Codo con codo. ¡Que no te adelante! 🤜🤛';

                content.innerHTML = `
                    ${buddyBarHTML('', myPage, total, myFin, true)}
                    ${buddyBarHTML(otherName, otherPage, total, otherFin, false)}
                    <p class="buddy-pique">${pique}</p>
                    <button type="button" id="buddy-leave-btn" class="buddy-leave">Abandonar lectura compartida</button>
                `;
                content.querySelector('#buddy-leave-btn').onclick = async () => {
                    const ok = await confirmDialog({
                        title: '¿Abandonar lectura compartida?',
                        message: 'El progreso conjunto se borrará para los dos.',
                        confirmText: 'Abandonar',
                        danger: true
                    });
                    if (!ok) return;
                    try { await deleteDoc(doc(db, 'buddy_reads', br.id)); } catch (error) {
                        console.error('Error abandonando lectura compartida:', error);
                    }
                };
                return;
            }

            // Sin lectura compartida: proponer a un amigo
            if (myFriendsInfo.length === 0) {
                content.innerHTML = '<p class="buddy-hint">Añade amigos para leer este libro a la vez que ellos y picaros con el progreso.</p>';
                return;
            }
            content.innerHTML = `
                <p class="buddy-hint">Reta a un amigo a leer este libro a la vez: veréis el progreso del otro aquí mismo.</p>
                <div class="buddy-invite-row">
                    <select id="buddy-friend-select">
                        ${myFriendsInfo.map(f => `<option value="${escapeHtml(f.uid)}">@${escapeHtml(f.username)}</option>`).join('')}
                    </select>
                    <button type="button" id="buddy-invite-btn" class="btn-primary">🤝 Proponer</button>
                </div>`;
            content.querySelector('#buddy-invite-btn').onclick = async () => {
                const sel = content.querySelector('#buddy-friend-select');
                const friend = myFriendsInfo.find(f => f.uid === sel.value);
                if (!friend) return;
                const btn = content.querySelector('#buddy-invite-btn');
                btn.disabled = true;
                try {
                    const slug = generateBookSlug(book.title, book.author);
                    const participants = [user.uid, friend.uid].sort();
                    const id = `${participants[0]}_${participants[1]}_${slug}`;
                    const myName = lastUserData?.username || user.email?.split('@')[0] || 'yo';
                    const fin = book.section === 'libros-terminados';
                    await setDoc(doc(db, 'buddy_reads', id), {
                        participants,
                        bookSlug: slug,
                        title: book.title,
                        totalPages: book.totalPages || 0,
                        createdBy: user.uid,
                        progress: { [user.uid]: fin ? (book.totalPages || 0) : (book.currentPage || 0), [friend.uid]: 0 },
                        finished: { [user.uid]: fin, [friend.uid]: false },
                        usernames: { [user.uid]: myName, [friend.uid]: friend.username },
                        updatedAt: serverTimestamp()
                    });
                    // El onSnapshot repinta la sección con las barras
                } catch (error) {
                    console.error('Error creando lectura compartida:', error);
                    btn.disabled = false;
                    notify('No se pudo crear la lectura compartida.', 'error');
                }
            };
        };

        // ===============================================
        // === SESIONES DE LECTURA (cronómetro) ==========
        // La sesión activa vive en localStorage: sobrevive a cerrar la
        // PWA y solo escribe en Firestore al terminar (1 doc por sesión).
        // ===============================================

        const SESSION_KEY = 'rincon_session_v1';
        const sessionToggleBtn = document.getElementById('session-toggle-btn');
        const sessionEndForm = document.getElementById('session-end-form');
        const sessionEndPage = document.getElementById('session-end-page');
        const sessionSaveBtn = document.getElementById('session-save-btn');
        const sessionDiscardBtn = document.getElementById('session-discard-btn');
        const sessionPrediction = document.getElementById('session-prediction');
        const sessionPill = document.getElementById('session-pill');
        let sessionTickId = null;

        const getActiveSession = () => {
            try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
        };

        const fmtDuracion = (ms) => {
            const total = Math.max(0, Math.floor(ms / 1000));
            const h = Math.floor(total / 3600);
            const m = Math.floor((total % 3600) / 60);
            const s = total % 60;
            const mm = String(m).padStart(2, '0');
            const ss = String(s).padStart(2, '0');
            return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
        };

        const tickSession = () => {
            const s = getActiveSession();
            if (!s) { stopSessionTicker(); return; }
            const elapsed = fmtDuracion(Date.now() - s.startAt);
            sessionPill.textContent = `📖 ${elapsed}`;
            sessionPill.style.display = '';
            // Si el modal abierto es el del libro de la sesión, refrescar botón
            if (bookDetailModal.open && bookDetailModal.dataset.bookId === s.bookId) {
                sessionToggleBtn.textContent = `⏹ Terminar sesión · ${elapsed}`;
            }
        };

        const startSessionTicker = () => {
            if (sessionTickId) return;
            tickSession();
            sessionTickId = setInterval(tickSession, 1000);
        };
        const stopSessionTicker = () => {
            if (sessionTickId) { clearInterval(sessionTickId); sessionTickId = null; }
            sessionPill.style.display = 'none';
        };

        // Estado de la sección de sesión dentro del modal de detalle
        const refreshSessionUI = (book) => {
            if (!sessionToggleBtn) return;
            const s = getActiveSession();
            sessionEndForm.style.display = 'none';
            if (viewingFriendLibrary || book.section !== 'leyendo-ahora') {
                document.getElementById('session-section').style.display = 'none';
                return;
            }
            document.getElementById('session-section').style.display = '';
            if (s && s.bookId === book.id) {
                sessionToggleBtn.textContent = `⏹ Terminar sesión · ${fmtDuracion(Date.now() - s.startAt)}`;
                sessionToggleBtn.classList.add('session-active');
            } else if (s) {
                // Hay sesión activa pero de otro libro
                sessionToggleBtn.textContent = '⏳ Tienes otra sesión en curso';
                sessionToggleBtn.classList.remove('session-active');
            } else {
                sessionToggleBtn.textContent = '▶ Empezar sesión de lectura';
                sessionToggleBtn.classList.remove('session-active');
            }
            renderPrediction(book);
        };

        const startSession = (book) => {
            localStorage.setItem(SESSION_KEY, JSON.stringify({
                bookId: book.id,
                startAt: Date.now(),
                startPage: book.currentPage || 0
            }));
            startSessionTicker();
            refreshSessionUI(book);
        };

        const endSessionPrompt = (book) => {
            const s = getActiveSession();
            if (!s) return;
            sessionEndForm.style.display = '';
            sessionEndPage.value = parseInt(currentPageInput.value, 10) || s.startPage || 0;
            sessionEndPage.max = book.totalPages || 100000;
            sessionEndPage.focus();
        };

        const discardSession = () => {
            localStorage.removeItem(SESSION_KEY);
            stopSessionTicker();
            const book = booksData.find(b => b.id === bookDetailModal.dataset.bookId);
            if (book) refreshSessionUI(book);
        };

        const saveSession = async () => {
            const s = getActiveSession();
            const book = booksData.find(b => b.id === bookDetailModal.dataset.bookId);
            if (!s || !book || s.bookId !== book.id) return;

            let endPage = parseInt(sessionEndPage.value, 10);
            if (isNaN(endPage) || endPage < 0) endPage = s.startPage;
            if (book.totalPages > 0 && endPage > book.totalPages) endPage = book.totalPages;

            const durationMin = Math.max(1, Math.round((Date.now() - s.startAt) / 60000));
            const pagesRead = Math.max(0, endPage - (s.startPage || 0));

            sessionSaveBtn.disabled = true;
            try {
                await addDoc(collection(db, 'users', user.uid, 'sessions'), {
                    bookId: book.id,
                    startAtMs: s.startAt,
                    durationMin,
                    pageStart: s.startPage || 0,
                    pageEnd: endPage,
                    pagesRead,
                    endAt: serverTimestamp()
                });

                if (endPage > (book.currentPage || 0)) {
                    await updateDoc(doc(db, 'books', book.id), { currentPage: endPage });
                    await updateStreak();
                    await updatePaginasObjetivo(pagesRead);
                    await updateDoc(doc(db, 'users', user.uid), { lastReadTimestamp: serverTimestamp() });
                    book.currentPage = endPage;
                    currentPageInput.value = endPage;
                    updateProgressVisuals(endPage, book.totalPages || 0);
                    syncBuddyProgress(book);
                    evaluarLogros();
                }

                localStorage.removeItem(SESSION_KEY);
                stopSessionTicker();
                refreshSessionUI(book);

                // ¿Terminó el libro en esta sesión? Ofrecer pasarlo a Terminados
                if (book.totalPages > 0 && endPage >= book.totalPages) {
                    const moved = await promptFinishBook(book);
                    if (moved) openDetailModal(book.id);  // repintar ficha como Terminado (valoración, etc.)
                }
            } catch (error) {
                console.error('Error guardando la sesión:', error);
                notify('No se pudo guardar la sesión.', 'error');
            } finally {
                sessionSaveBtn.disabled = false;
            }
        };

        // Predicción de fin: velocidad media de tus últimas sesiones del libro
        const renderPrediction = async (book) => {
            if (!sessionPrediction) return;
            sessionPrediction.textContent = '';
            if (book.section !== 'leyendo-ahora' || !book.totalPages) return;
            try {
                const snap = await getDocs(query(
                    collection(db, 'users', user.uid, 'sessions'),
                    where('bookId', '==', book.id)
                ));
                const sessions = [];
                snap.forEach(d => sessions.push(d.data()));
                sessions.sort((a, b) => (b.startAtMs || 0) - (a.startAtMs || 0));
                const recientes = sessions.slice(0, 8);

                const totPages = recientes.reduce((t, x) => t + (x.pagesRead || 0), 0);
                const totMin = recientes.reduce((t, x) => t + (x.durationMin || 0), 0);
                if (totPages < 5 || totMin < 5) return;  // poca señal todavía

                const speed = totPages / (totMin / 60);  // págs/hora
                const pagesLeft = Math.max(0, book.totalPages - (book.currentPage || 0));
                if (pagesLeft === 0) return;
                const hoursLeft = pagesLeft / speed;

                // Páginas por día de lectura real (días distintos con sesión)
                const dias = new Set(recientes.map(x => new Date(x.startAtMs || 0).toDateString())).size || 1;
                const pagsPorDia = totPages / dias;
                const diasRestantes = Math.max(1, Math.ceil(pagesLeft / pagsPorDia));
                const fechaFin = new Date(Date.now() + diasRestantes * 86400000);
                const fechaTxt = fechaFin.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });

                const horasTxt = hoursLeft >= 1
                    ? `~${Math.round(hoursLeft)} h de lectura`
                    : `~${Math.max(5, Math.round(hoursLeft * 60))} min de lectura`;
                sessionPrediction.textContent =
                    `⏱️ Tu ritmo: ~${Math.round(speed)} págs/hora · Te quedan ${horasTxt} · A este ritmo lo terminas el ${fechaTxt} 🦕`;
            } catch (error) {
                console.error('Error calculando predicción:', error);
            }
        };

        if (sessionToggleBtn) sessionToggleBtn.addEventListener('click', () => {
            const book = booksData.find(b => b.id === bookDetailModal.dataset.bookId);
            if (!book) return;
            const s = getActiveSession();
            if (s && s.bookId === book.id) {
                endSessionPrompt(book);
            } else if (!s) {
                startSession(book);
            }
            // Sesión activa de otro libro: no hacer nada (botón informativo)
        });
        if (sessionSaveBtn) sessionSaveBtn.addEventListener('click', saveSession);
        if (sessionDiscardBtn) sessionDiscardBtn.addEventListener('click', discardSession);
        if (sessionPill) sessionPill.addEventListener('click', () => {
            const s = getActiveSession();
            if (s && booksData.some(b => b.id === s.bookId)) openDetailModal(s.bookId);
        });

        // Si quedó una sesión activa de una visita anterior, retomar el contador
        if (getActiveSession()) startSessionTicker();

        // ===============================================
        // === RECOMENDADOR "¿QUÉ LEO AHORA?" ============
        // Cruza tu perfil de gustos (vibes, géneros, ritmo de tus libros
        // mejor valorados) con tu propia pila de pendientes y con los
        // favoritos de tus amigos. Todo client-side: cero Functions.
        // ===============================================

        const recommendModal = document.getElementById('recommend-modal');
        const recommendBtn = document.getElementById('recommend-btn');
        const recommendList = document.getElementById('recommend-list');
        const recommendIntro = document.getElementById('recommend-intro');
        const closeRecommendBtn = document.getElementById('close-recommend-btn');
        const reshuffleRecommendBtn = document.getElementById('reshuffle-recommend-btn');

        let recommendCandidates = null;     // caché de candidatos por sesión de modal
        let shownRecommendSlugs = new Set(); // ya mostrados: "otras ideas" no repite

        // Selección sin repetición: excluye lo ya mostrado y, cuando se
        // agota el pozo, vuelve a empezar.
        const pickRecommendations = () => {
            const scored = scoreCandidates(recommendCandidates, buildTasteProfile());
            let pool = scored.filter(c => !shownRecommendSlugs.has(c.slug));
            if (pool.length === 0 && scored.length > 0) {
                shownRecommendSlugs.clear();
                pool = scored;
            }
            const picks = pool.slice(0, 3);
            picks.forEach(p => shownRecommendSlugs.add(p.slug));
            return { picks, total: scored.length };
        };

        // Perfil de gustos: pondera vibes/género/ritmo de tus libros.
        // Terminados pesan según valoración; lo que lees ahora también cuenta.
        const buildTasteProfile = () => {
            const profile = { moods: {}, genres: {}, ritmos: {}, weight: 0 };
            booksData.forEach(b => {
                let w = 0;
                if (b.section === 'libros-terminados') {
                    w = (typeof b.rating === 'number' && b.rating > 0) ? Math.max(0.2, b.rating - 2.5) : 0.6;
                } else if (b.section === 'leyendo-ahora') {
                    w = 1;
                }
                if (w <= 0) return;
                (b.estadosDeAnimo || []).forEach(m => { profile.moods[m] = (profile.moods[m] || 0) + w; });
                if (b.genre && b.genre !== 'Sin género') {
                    const g = b.genre.toLowerCase();
                    profile.genres[g] = (profile.genres[g] || 0) + w;
                }
                if (b.ritmoNarrativo) {
                    profile.ritmos[b.ritmoNarrativo] = (profile.ritmos[b.ritmoNarrativo] || 0) + w;
                }
                profile.weight += w;
            });
            return profile;
        };

        // Candidatos: mi pila de pendientes + favoritos (★4+) de mis amigos
        // que yo no tenga. Deduplicado por slug título+autor.
        const collectCandidates = async () => {
            const mySlugs = new Set(booksData.map(b => generateBookSlug(b.title, b.author)));
            const seen = new Set();
            const candidates = [];

            booksData.forEach(b => {
                if (b.section !== 'proximas-lecturas' && b.section !== 'lista-deseos') return;
                const slug = generateBookSlug(b.title, b.author);
                if (seen.has(slug)) return;
                seen.add(slug);
                candidates.push({ source: 'own', book: b, slug });
            });

            // Máximo 8 amigos por consulta para acotar lecturas de Firestore
            const friends = myFriendsInfo.slice(0, 8);
            const friendResults = await Promise.all(friends.map(async (f) => {
                try {
                    const snap = await getDocs(query(collection(db, 'books'), where('userId', '==', f.uid)));
                    const favs = [];
                    snap.forEach(d => {
                        const fb = d.data();
                        if (fb.section !== 'libros-terminados') return;
                        if (typeof fb.rating !== 'number' || fb.rating < 4) return;
                        favs.push(fb);
                    });
                    return { friend: f, favs };
                } catch {
                    return { friend: f, favs: [] };
                }
            }));

            friendResults.forEach(({ friend, favs }) => {
                favs.forEach(fb => {
                    const slug = generateBookSlug(fb.title, fb.author);
                    if (mySlugs.has(slug)) return;  // ya lo tengo
                    const dup = candidates.find(c => c.slug === slug && c.source === 'friend');
                    if (dup) {
                        // Mismo libro amado por varios amigos: señal más fuerte
                        if (fb.rating > dup.friendRating) { dup.friendRating = fb.rating; dup.friendName = friend.username; }
                        dup.friendCount++;
                        return;
                    }
                    if (seen.has(slug)) return;     // ya es candidato propio: prima el propio
                    seen.add(slug);
                    candidates.push({
                        source: 'friend', book: fb, slug,
                        friendName: friend.username, friendRating: fb.rating, friendCount: 1
                    });
                });
            });

            return candidates;
        };

        const scoreCandidates = (candidates, profile) => {
            const topRitmo = Object.entries(profile.ritmos).sort((a, b) => b[1] - a[1])[0]?.[0];
            return candidates.map(c => {
                const b = c.book;
                let score = 0;
                const reasons = [];

                const moodHits = (b.estadosDeAnimo || [])
                    .filter(m => profile.moods[m])
                    .sort((x, y) => profile.moods[y] - profile.moods[x]);
                moodHits.forEach(m => { score += Math.min(profile.moods[m], 3); });
                if (moodHits.length > 0) reasons.push(`Comparte tu vibe favorito: ${moodHits[0]}`);

                const g = (b.genre || '').toLowerCase();
                if (g && profile.genres[g]) {
                    score += Math.min(profile.genres[g], 3) * 1.2;
                    reasons.push(`Género que devoras: ${b.genre}`);
                }

                if (topRitmo && b.ritmoNarrativo === topRitmo) {
                    score += 1.5;
                    reasons.push(`Ritmo ${b.ritmoNarrativo.toLowerCase()}, como a ti te gusta`);
                }

                if (c.source === 'friend') {
                    score += 2 + (c.friendRating - 4) * 2 + (c.friendCount - 1) * 1.5;
                    const stars = Number.isInteger(c.friendRating) ? c.friendRating : c.friendRating.toFixed(1);
                    reasons.push(c.friendCount > 1
                        ? `A ${c.friendCount} amigos les encantó (@${c.friendName} le dio ★${stars})`
                        : `A @${c.friendName} le encantó: ★${stars}`);
                } else {
                    score += b.section === 'proximas-lecturas' ? 1.2 : 0.7;
                    reasons.push(b.section === 'proximas-lecturas'
                        ? 'Lo tenías esperando en Próximas Lecturas'
                        : 'Estaba en tu lista de deseos');
                }

                // Pizca de azar: "Dame otras ideas" varía el podio
                score += Math.random() * 1.2;
                return { ...c, score, reasons };
            }).sort((a, b) => b.score - a.score);
        };

        const renderRecommendations = ({ picks, total }) => {
            recommendList.innerHTML = '';

            if (picks.length === 0) {
                recommendIntro.textContent = 'Págino no ha encontrado nada que recomendarte todavía.';
                recommendList.innerHTML = `<p class="recommend-empty">Añade libros a <b>Próximas Lecturas</b> o a tu
                    <b>Lista de Deseos</b>, o haz amigos para que Págino pueda cotillear sus favoritos. 🦕</p>`;
                reshuffleRecommendBtn.style.display = 'none';
                return;
            }

            recommendIntro.textContent = picks.length < 3
                ? 'Págino ha encontrado esto rebuscando en las estanterías:'
                : 'Págino ha husmeado en tu biblioteca y en las de tus amigos. Sus 3 apuestas:';
            reshuffleRecommendBtn.style.display = total > 3 ? '' : 'none';

            picks.forEach(c => {
                const b = c.book;
                const card = document.createElement('div');
                card.className = 'recommend-card';

                const img = document.createElement('img');
                img.className = 'recommend-cover';
                img.loading = 'lazy';
                img.alt = `Portada de ${b.title}`;
                img.src = b.cover || COVER_PLACEHOLDER;
                img.onerror = () => { img.onerror = null; img.src = COVER_PLACEHOLDER; };

                const info = document.createElement('div');
                info.className = 'recommend-info';
                info.innerHTML = `
                    <h3>${escapeHtml(b.title)}</h3>
                    <p class="recommend-author">${escapeHtml(b.author)}</p>
                    <ul class="recommend-reasons">
                        ${c.reasons.slice(0, 3).map(r => `<li>${escapeHtml(r)}</li>`).join('')}
                    </ul>
                `;

                const actionBtn = document.createElement('button');
                actionBtn.type = 'button';
                actionBtn.className = 'btn-primary recommend-action';
                actionBtn.textContent = c.source === 'own' ? '📖 Empezar a leerlo' : '➕ Añadir a mi biblioteca';
                actionBtn.onclick = async () => {
                    actionBtn.disabled = true;
                    try {
                        if (c.source === 'own') {
                            await updateDoc(doc(db, 'books', b.id), { section: 'leyendo-ahora', currentPage: 0 });
                            actionBtn.textContent = '✓ ¡A leer!';
                        } else {
                            // Evita duplicados: mismo título + autor ya en la biblioteca
                            const norm = s => (s || '').trim().toLowerCase();
                            if (booksData.some(x => norm(x.title) === norm(b.title) && norm(x.author) === norm(b.author))) {
                                actionBtn.textContent = '✓ Ya lo tienes';
                                return;
                            }
                            // Copia a mi biblioteca (campos dentro de la whitelist de reglas)
                            await addDoc(collection(db, 'books'), {
                                userId: user.uid,
                                title: b.title || 'Sin título',
                                author: b.author || '',
                                cover: b.cover || '',
                                section: 'proximas-lecturas',
                                totalPages: b.totalPages || 0,
                                currentPage: 0,
                                notes: '',
                                genre: b.genre || 'Sin género',
                                ritmoNarrativo: b.ritmoNarrativo || '',
                                estadosDeAnimo: b.estadosDeAnimo || [],
                                importedFrom: 'recomendacion'
                            });
                            actionBtn.textContent = '✓ Añadido';
                            evaluarLogros();
                        }
                    } catch (error) {
                        console.error('Error aplicando recomendación:', error);
                        actionBtn.disabled = false;
                        notify('No se pudo completar la acción.', 'error');
                    }
                };

                info.appendChild(actionBtn);
                card.appendChild(img);
                card.appendChild(info);
                recommendList.appendChild(card);
            });
        };

        const openRecommendModal = async () => {
            if (viewingFriendLibrary) return;  // booksData es del amigo: no recomendar
            recommendIntro.textContent = 'Págino está husmeando en tu biblioteca y en las de tus amigos...';
            recommendList.innerHTML = '<p class="recommend-empty">🦕💭 Olfateando libros…</p>';
            reshuffleRecommendBtn.style.display = 'none';
            recommendModal.showModal();
            try {
                recommendCandidates = await collectCandidates();
                shownRecommendSlugs.clear();
                renderRecommendations(pickRecommendations());
            } catch (error) {
                console.error('Error generando recomendaciones:', error);
                recommendList.innerHTML = '<p class="recommend-empty">Págino se ha mareado buscando. Inténtalo de nuevo.</p>';
            }
        };

        if (recommendBtn) recommendBtn.addEventListener('click', openRecommendModal);
        if (closeRecommendBtn) closeRecommendBtn.addEventListener('click', () => recommendModal.close());
        if (reshuffleRecommendBtn) reshuffleRecommendBtn.addEventListener('click', () => {
            if (recommendCandidates) {
                renderRecommendations(pickRecommendations());
            }
        });
        if (recommendModal) recommendModal.addEventListener('close', () => {
            recommendCandidates = null;
            shownRecommendSlugs.clear();
        });

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
                        <span class="ranking-user">@${escapeHtml(entry.username)}${entry.isMe ? ' ★' : ''}</span>
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

        // URLs antiguas guardadas con http:// (mixed content) o con el efecto
        // "página doblada" de Google Books no cargan: se normalizan antes de pedir.
        const normalizarCoverUrl = (url) => (url || '')
            .replace(/^http:\/\//i, 'https://')
            .replace('&edge=curl', '')
            .replace(/(covers\.openlibrary\.org\/b\/.+)-M\.jpg$/i, '$1-L.jpg');

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
            const limpia = normalizarCoverUrl(url);
            try { return await toDataUrl(limpia); } catch {}                                     // 1. Directo (si el servidor permite CORS)
            try { return await toDataUrl(`https://wsrv.nl/?url=${encodeURIComponent(limpia)}&w=600`); } catch {} // 2. Proxy de imágenes (CORS abierto)
            try { return await toDataUrl(`https://corsproxy.io/?${encodeURIComponent(limpia)}`); } catch {}      // 3. Proxy CORS genérico
            return null;                                                                         // 4. Sin portada
        };

        // Portada de reserva: cubierta dibujada en SVG con la inicial del título,
        // para que la tarjeta nunca salga con un hueco vacío.
        const portadaPlaceholder = (titulo) => {
            const inicial = (titulo || '').trim().charAt(0).toUpperCase() || '?';
            const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="720">' +
                '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
                '<stop offset="0" stop-color="#5d2a2e"/><stop offset="1" stop-color="#2b1214"/></linearGradient></defs>' +
                '<rect width="480" height="720" fill="url(#g)"/>' +
                '<rect x="16" y="16" width="448" height="688" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>' +
                '<text x="240" y="440" font-family="Georgia, serif" font-size="240" fill="rgba(253,251,247,0.85)" text-anchor="middle">' + inicial + '</text>' +
                '</svg>';
            return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        };

        // Tono medio de la portada (la imagen es data URL, el canvas no se contamina)
        const tonoDominante = (imgEl) => {
            try {
                const c = document.createElement('canvas');
                c.width = c.height = 24;
                const cx = c.getContext('2d');
                cx.drawImage(imgEl, 0, 0, 24, 24);
                const d = cx.getImageData(0, 0, 24, 24).data;
                let r = 0, g = 0, b = 0, n = 0;
                for (let i = 0; i < d.length; i += 4) {
                    if (d[i + 3] < 200) continue;
                    r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
                }
                if (!n) return null;
                r = r / n / 255; g = g / n / 255; b = b / n / 255;
                const max = Math.max(r, g, b), min = Math.min(r, g, b);
                if (max === min) return { h: 350, s: 30 }; // portada gris: granate de marca
                const dif = max - min;
                let h;
                if (max === r) h = ((g - b) / dif) % 6;
                else if (max === g) h = (b - r) / dif + 2;
                else h = (r - g) / dif + 4;
                h = Math.round(h * 60);
                if (h < 0) h += 360;
                const l = (max + min) / 2;
                const s = Math.round((dif / (1 - Math.abs(2 * l - 1))) * 100);
                return { h, s: Math.min(60, Math.max(28, s)) };
            } catch { return null; }
        };

        // Mismo esquema de capas que el CSS de #export-card, teñido con el tono de la portada
        const fondoTarjeta = ({ h, s }) =>
            'radial-gradient(130% 85% at 50% 0%, rgba(255, 240, 220, 0.10), transparent 55%), ' +
            'radial-gradient(140% 90% at 50% 115%, rgba(0, 0, 0, 0.5), transparent 60%), ' +
            `linear-gradient(160deg, hsl(${h}, ${s}%, 9%) 0%, hsl(${h}, ${s}%, 19%) 48%, hsl(${h}, ${s}%, 32%) 100%)`;

        const shareAsImage = async () => {
            mostrarToastShare();
            const bookId = bookDetailModal.dataset.bookId;
            const book = booksData.find(b => b.id === bookId);
            if (!book) return;
            const card = document.getElementById('export-card');
            const coverEl = document.getElementById('export-cover');

            // Convertir portada a data URL para evitar bloqueos CORS en html2canvas
            const coverDataUrl = await fetchImageAsDataUrl(book.cover);
            card.style.background = ''; // vuelve al degradado de marca del CSS
            await new Promise((res) => { coverEl.onload = coverEl.onerror = res; coverEl.src = coverDataUrl || portadaPlaceholder(book.title); });
            coverEl.style.display = '';
            if (coverDataUrl) {
                const tono = tonoDominante(coverEl);
                if (tono) card.style.background = fondoTarjeta(tono);
            }

            document.getElementById('export-title').textContent = book.title || '';
            document.getElementById('export-author').textContent = book.author || '';
            document.getElementById('export-notes').textContent = book.notes || '';
            const r = book.rating || 0;
            const fullS = Math.floor(r);
            const halfS = (r % 1) >= 0.5;
            document.getElementById('export-stars').textContent = r > 0
                ? '★'.repeat(fullS) + (halfS ? '½' : '') + '☆'.repeat(5 - fullS - (halfS ? 1 : 0))
                : ''; // sin valoración no se pintan cinco estrellas vacías
            card.style.display = 'flex';
            try {
                const html2canvas = await loadHtml2canvas(); // carga bajo demanda
                const canvas = await html2canvas(card, { scale: 2, useCORS: false, allowTaint: false, logging: false });
                const link = document.createElement('a');
                link.download = `${(book.title || 'libro').replace(/[^a-z0-9]/gi,'_')}_resena.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
            } catch (err) {
                console.error('Error generando imagen:', err);
                notify('No se pudo generar la imagen.', 'error');
            } finally {
                card.style.display = 'none';
                coverEl.style.display = ''; // restaurar visibilidad
            }
        };

        // === COMPARTIR MI ESTANTERÍA COMO IMAGEN (story 9:16) ===
        let miUsernameCache = null;
        const compartirEstanteria = async () => {
            const card = document.getElementById('share-shelf-card');
            const bandsWrap = document.getElementById('ss-bands');
            if (!card || !bandsWrap) return;
            const libros = booksData.filter(b => b.section !== 'libros-abandonados');
            if (libros.length === 0) {
                notify('Añade algún libro antes de compartir tu estantería.', 'info');
                return;
            }
            mostrarToastShare();

            if (miUsernameCache === null) {
                try {
                    const snap = await getDoc(doc(db, 'users', user.uid));
                    miUsernameCache = snap.data()?.username || '';
                } catch { miUsernameCache = ''; }
            }
            document.getElementById('ss-title').textContent =
                miUsernameCache ? `La estantería de @${miUsernameCache}` : 'Mi estantería';
            document.getElementById('ss-sub').textContent =
                `${libros.length} ${libros.length === 1 ? 'libro' : 'libros'}`;

            // Rellenar hasta 4 baldas por anchura acumulada. Los libros "de
            // cara" (~1 de cada 6) enseñan su portada real; el resto, lomo 2D
            // con el mismo color que la vista estantería.
            bandsWrap.innerHTML = '';
            const ANCHO_BALDA = 460;
            const cargasPortadas = [];
            let banda = null;
            let anchoAcum = Infinity;
            let bandas = 0;
            for (const book of libros) {
                const h = hashLibro(book.id || book.title || '');
                const cara = h % 6 === 2 && book.cover;
                const ancho = cara ? 74 : Math.round(Math.min(40, Math.max(22, 18 + (book.totalPages || 250) / 16)));
                if (anchoAcum + ancho > ANCHO_BALDA) {
                    if (bandas === 4) break;
                    banda = document.createElement('div');
                    banda.className = 'ss-band';
                    bandsWrap.appendChild(banda);
                    bandas++;
                    anchoAcum = 0;
                }
                anchoAcum += ancho + 3;
                if (cara) {
                    const img = document.createElement('img');
                    img.className = 'ss-face';
                    img.style.width = `${ancho}px`;
                    img.style.height = `${100 + (h % 14)}px`;
                    banda.appendChild(img);
                    // Portada como data URL: html2canvas no puede con CORS
                    cargasPortadas.push(fetchImageAsDataUrl(book.cover).then(dataUrl => {
                        img.src = dataUrl || portadaPlaceholder(book.title);
                        return img.decode().catch(() => {});
                    }));
                } else {
                    const spine = document.createElement('div');
                    spine.className = 'ss-spine';
                    spine.style.width = `${ancho}px`;
                    spine.style.height = `${92 + (h % 22)}px`;
                    spine.style.background =
                        'linear-gradient(90deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.05) 22%, rgba(0,0,0,0.16) 78%, rgba(0,0,0,0.42) 100%), ' +
                        (coloresLomoCache[book.cover] || PALETA_LOMOS[h % PALETA_LOMOS.length]);
                    const titulo = document.createElement('b');
                    titulo.textContent = book.title || '';
                    spine.append(document.createElement('i'), document.createElement('i'), titulo);
                    banda.appendChild(spine);
                }
                // Adorno ocasional, como en la vista estantería
                const hd = hashLibro((book.id || book.title || '') + 'deco');
                if (hd % 5 === 0 && anchoAcum + 30 <= ANCHO_BALDA) {
                    const deco = document.createElement('span');
                    deco.className = 'ss-deco';
                    deco.textContent = DECOS_ESTANTERIA[hd % DECOS_ESTANTERIA.length];
                    banda.appendChild(deco);
                    anchoAcum += 30;
                }
            }

            card.style.display = 'flex';
            try {
                await Promise.all(cargasPortadas);
                const html2canvas = await loadHtml2canvas();
                const canvas = await html2canvas(card, { scale: 2, useCORS: false, allowTaint: false, logging: false });
                const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
                const file = new File([blob], 'mi_estanteria.png', { type: 'image/png' });
                // En móvil, hoja de compartir nativa (directo a stories/TikTok).
                // Si falla (p. ej. la activación de usuario caducó mientras se
                // generaba la imagen) o no existe, descarga clásica.
                let compartido = false;
                if (navigator.canShare?.({ files: [file] })) {
                    try {
                        await navigator.share({ files: [file], title: 'Mi estantería 📚' });
                        compartido = true;
                    } catch (err) {
                        if (err.name === 'AbortError') compartido = true; // el usuario cerró la hoja
                    }
                }
                if (!compartido) {
                    const link = document.createElement('a');
                    link.download = 'mi_estanteria.png';
                    link.href = canvas.toDataURL('image/png');
                    link.click();
                }
            } catch (err) {
                console.error('Error generando la imagen de la estantería:', err);
                notify('No se pudo generar la imagen.', 'error');
            } finally {
                card.style.display = 'none';
            }
        };

        const shareShelfBtn = document.getElementById('share-shelf-btn');
        if (shareShelfBtn) shareShelfBtn.addEventListener('click', compartirEstanteria);


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
            const bookElement = e.target.closest('.book, .shelf-book');
            if (!bookElement) {
                // Toque fuera de los libros: devolver a la balda el que estuviera sacado
                document.querySelectorAll('.shelf-book.abierto').forEach(b => b.classList.remove('abierto'));
                return;
            }

            if (bookElement.classList.contains('shelf-book')) {
                // En pantallas táctiles el primer toque "saca" el libro de la
                // balda (equivalente al hover) y el segundo abre el detalle.
                if (window.matchMedia('(hover: none)').matches && !bookElement.classList.contains('abierto')) {
                    document.querySelectorAll('.shelf-book.abierto').forEach(b => b.classList.remove('abierto'));
                    bookElement.classList.add('abierto');
                    return;
                }
                openDetailModal(bookElement.dataset.id);
                return;
            }

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
            document.querySelectorAll('.shelf-book').forEach(el => {
                el.classList.toggle('hidden', !el.dataset.titulo.includes(query) && !el.dataset.autor.includes(query));
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
            if (statsModal?.open) renderStats();
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
                const book = normalizarCover({ id: docSnap.id, ...docSnap.data() });
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
            if (rows.length < 2) { notify('El CSV está vacío o no tiene el formato de Goodreads.', 'warning'); return; }
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
                        `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1&langRestrict=es&country=ES${apiKey}`
                    );
                    if (!resp.ok) throw new Error();
                    const data = await resp.json();
                    const thumb = data.items?.[0]?.volumeInfo?.imageLinks?.thumbnail;
                    if (thumb) return thumb.replace('http://', 'https://');
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

            if (parsed.length === 0) { notify('No se encontraron libros válidos en el CSV.', 'warning'); return; }

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
            notify(
                `✅ Importación completada.\n` +
                `${imported} libro${imported !== 1 ? 's' : ''} importados desde Goodreads.\n\n` +
                `Portadas: Open Library (ISBN) · Google Books (${sinIsbn} sin ISBN).\n` +
                `Las portadas que no carguen mostrarán un icono genérico.`,
                'success'
            );
        };

        // --- ASIGNACIÓN DE EVENTOS ---
        addBookBtn.addEventListener('click', () => addBookModal.showModal());
        
        cancelAddBookBtn.addEventListener('click', () => {
            addBookForm.reset();
            if(bookSearchResultsDiv) bookSearchResultsDiv.innerHTML = '';
            document.getElementById('manual-data-details').open = false;
            addBookModal.close();
        });
        
        addBookForm.addEventListener('submit', handleAddBook);
        toggleViewBtn.addEventListener('click', () => {
            mainContent.classList.toggle('list-view');
            toggleViewBtn.textContent = mainContent.classList.contains('list-view') ? '⊞' : '☰';
        });
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

        deleteBookModalBtn.addEventListener('click', async () => {
            const bookId = bookDetailModal.dataset.bookId;
            if (!bookId) return;
            const ok = await confirmDialog({
                title: '¿Eliminar este libro?',
                message: 'Se borrará de tu biblioteca junto con sus notas y progreso.',
                confirmText: 'Eliminar',
                danger: true
            });
            if (ok) {
                handleDeleteBook(bookId);
                bookDetailModal.close();
            }
        });

        detailCoverContainer.addEventListener('click', async () => {
            const bookId = bookDetailModal.dataset.bookId;
            const book = booksData.find(b => b.id === bookId);
            if (!book) return;
            const newCoverUrl = await promptDialog({
                title: 'Cambiar portada',
                message: 'Introduce la nueva URL para la portada:',
                value: book.cover || '',
                placeholder: 'https://...',
                confirmText: 'Guardar'
            });
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
            localStorage.removeItem('rincon_logged_in');
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

        // Aplicamos la lógica a los modales
        if (addBookModal) closeOnBackdropClick(addBookModal);
        if (bookDetailModal) closeOnBackdropClick(bookDetailModal);
        if (recommendModal) closeOnBackdropClick(recommendModal);
        if (editBookModal) closeOnBackdropClick(editBookModal);

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
            if (fD) fD.style.transform = objD > 0 ? `scaleX(${Math.min(1, pagHoy / objD)})` : 'scaleX(0)';
            if (fS) fS.style.transform = objS > 0 ? `scaleX(${Math.min(1, pagSem / objS)})` : 'scaleX(0)';
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
                if (mascotaEl) { mascotaEl.className = 'racha-modal-mascota ' + (leidoHoy ? 'happy' : 'sad'); }
                if (numeroEl) numeroEl.textContent = `🔥 ${racha}`;
                if (statusEl) { statusEl.textContent = leidoHoy ? `@${currentFriendName} ha leído hoy` : `@${currentFriendName} no ha leído hoy`; statusEl.className = 'racha-modal-status ' + (leidoHoy ? 'leido' : 'no-leido'); }
                if (mensajeEl) mensajeEl.textContent = '';
                if (nombreEl) nombreEl.textContent = `— Racha de @${currentFriendName} —`;
            } else {
                if (mascotaEl) { mascotaEl.className = 'racha-modal-mascota ' + (leidoHoy ? 'happy' : 'sad'); }
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
                const html2canvas = await loadHtml2canvas(); // carga bajo demanda
                const canvas = await html2canvas(card, { scale: 2, useCORS: false, allowTaint: false, logging: false });
                const link = document.createElement('a');
                link.download = 'mis_estadisticas_lectura.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
            } catch (err) {
                console.error('Error generando imagen stats:', err);
                notify('No se pudo generar la imagen.', 'error');
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
                    notify('Error durante la importación:\n' + err.message, 'error');
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