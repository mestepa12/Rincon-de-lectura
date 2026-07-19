// Test semilla y CONTRATO DE ESQUEMA de la colección `quizzes` en Firestore.
//
// Cada documento de /quizzes/{quizId} sigue exactamente esta forma. quiz.js
// intenta cargar el documento de Firestore y, si no existe (o no hay red),
// usa este objeto. Para publicar un test nuevo basta con crear el doc en la
// consola de Firebase con esta estructura; no hace falta desplegar código.
//
// Puntuación: cada opción lleva `pesos`, un mapa perfilId -> puntos. El
// perfil con más puntos al final gana. Los pesos no se muestran nunca en la
// interfaz (se puntúa en cliente: para un test viral no hay incentivo de
// trampa que justifique una Cloud Function).

export const QUIZ_TROPOS = {
    id: 'tropo-literario',
    titulo: '¿Cuál es tu tropo literario dominante?',
    gancho: 'Ocho preguntas, tres minutos, una verdad incómoda sobre tu forma de leer.',
    emoji: '🎭',
    perfiles: {
        enemies: {
            nombre: 'Enemies to Lovers',
            emoji: '⚔️',
            tagline: 'El odio es solo el primer capítulo.',
            descripcion: 'Vives para la tensión: miradas que cortan, treguas forzosas y ese momento exacto en que el desprecio se vuelve otra cosa. Si no discuten, no te lo crees.',
            libros: [
                'Orgullo y Prejuicio, de Jane Austen',
                'Una corte de rosas y espinas, de Sarah J. Maas',
                'El príncipe cruel, de Holly Black',
                'Alas de sangre, de Rebecca Yarros',
                'Trono de cristal, de Sarah J. Maas',
                'De sangre y cenizas, de Jennifer L. Armentrout',
                'Rojo, blanco y sangre azul, de Casey McQuiston',
                'La hipótesis del amor, de Ali Hazelwood'
            ],
            hue: 350
        },
        familia: {
            nombre: 'Found Family',
            emoji: '🏕️',
            tagline: 'La sangre no elige; tú sí.',
            descripcion: 'Tu debilidad son los grupos imposibles que acaban cenando juntos. Te importa menos salvar el mundo que quién cuida de quién mientras tanto.',
            libros: [
                'Seis de Cuervos, de Leigh Bardugo',
                'La casa en el mar más azul, de TJ Klune',
                'El camino de los reyes, de Brandon Sanderson',
                'Nacidos de la bruma: El imperio final, de Brandon Sanderson',
                'Los seis de Atlas, de Olivie Blake',
                'Leyendas & Lattes, de Travis Baldree',
                'El priorato del naranjo, de Samantha Shannon',
                'La comunidad del anillo, de J. R. R. Tolkien'
            ],
            hue: 145
        },
        elegido: {
            nombre: 'El Elegido',
            emoji: '✨',
            tagline: 'La profecía no se va a cumplir sola.',
            descripcion: 'Destinos que pesan, mentores que desaparecen y un protagonista que no pidió nada de esto. Lo tuyo es ver a alguien corriente aceptar algo enorme.',
            libros: [
                'El Nombre del Viento, de Patrick Rothfuss',
                'Percy Jackson y el ladrón del rayo, de Rick Riordan',
                'El ojo del mundo, de Robert Jordan',
                'Harry Potter y la piedra filosofal, de J. K. Rowling',
                'Eragon, de Christopher Paolini',
                'Sombra y hueso, de Leigh Bardugo',
                'El juego de Ender, de Orson Scott Card',
                'La quinta estación, de N. K. Jemisin'
            ],
            hue: 40
        },
        giro: {
            nombre: 'El Giro Final',
            emoji: '🌀',
            tagline: 'Confías en el narrador. Error.',
            descripcion: 'Lees como quien interroga: subrayas frases sospechosas, desconfías del personaje amable y celebras que un epílogo te obligue a releer el libro entero.',
            libros: [
                'La verdad sobre el caso Harry Quebert, de Joël Dicker',
                'La paciente silenciosa, de Alex Michaelides',
                'Y no quedó ninguno, de Agatha Christie',
                'Reina roja, de Juan Gómez-Jurado',
                'La sombra del viento, de Carlos Ruiz Zafón',
                'Los siete maridos de Evelyn Hugo, de Taylor Jenkins Reid',
                'Perdida, de Gillian Flynn',
                'La chica del tren, de Paula Hawkins'
            ],
            hue: 215
        },
        grunon: {
            nombre: 'Grumpy x Sunshine',
            emoji: '🌻',
            tagline: 'Uno gruñe, el otro brilla. Matemática perfecta.',
            descripcion: 'Te puede el contraste: el cascarrabias con corazón de mantequilla y la persona-sol que lo desarma sin esfuerzo. Sabes exactamente cómo acaba y justo por eso lo lees.',
            libros: [
                'The Spanish Love Deception, de Elena Armas',
                'Gente que conocemos en vacaciones, de Emily Henry',
                'Todo lo que nunca fuimos, de Alice Kellen',
                'Icebreaker, de Hannah Grace',
                'Book Lovers, de Emily Henry'
            ],
            hue: 25
        },
        academia: {
            nombre: 'Academia Oscura',
            emoji: '🕯️',
            tagline: 'Las mejores historias huelen a biblioteca vieja.',
            descripcion: 'Universidades con secretos, sociedades con contraseña y conocimiento que se paga caro. Si hay tweed, latín y un crimen elegante, ya estás dentro.',
            libros: [
                'El secreto, de Donna Tartt',
                'Babel, de R. F. Kuang',
                'La novena casa, de Leigh Bardugo',
                'Una educación mortal, de Naomi Novik',
                'El retrato de Dorian Gray, de Oscar Wilde'
            ],
            hue: 265
        },
        grismoral: {
            nombre: 'El Villano Moralmente Gris',
            emoji: '🥀',
            tagline: 'Técnicamente el malo. Emocionalmente, tuyo.',
            descripcion: 'No lees para ver ganar al héroe: lees para entender al que rompe las reglas. Los personajes impecables te aburren; los rotos, con motivos, te pueden.',
            libros: [
                'La balada de los pájaros cantores y las serpientes, de Suzanne Collins',
                'Vicious, de V. E. Schwab',
                'El imperio del vampiro, de Jay Kristoff',
                'La serpiente y las alas de la noche, de Carissa Broadbent',
                'Asistente de villano, de Hannah Nicole Maehrer'
            ],
            hue: 330
        },
        cozy: {
            nombre: 'Lectura de Confort',
            emoji: '☕',
            tagline: 'Té caliente, manta y cero traiciones esta noche.',
            descripcion: 'Lees para estar bien: pueblos pequeños, librerías, segundas oportunidades y finales que abrazan. La angustia, mejor en los libros de otros.',
            libros: [
                'La biblioteca de la medianoche, de Matt Haig',
                'Un cuento perfecto, de Elísabet Benavent',
                'La sociedad literaria y del pastel de piel de patata de Guernsey, de Mary Ann Shaffer y Annie Barrows',
                'Heartstopper, de Alice Oseman',
                '84, Charing Cross Road, de Helene Hanff'
            ],
            hue: 175
        }
    },
    preguntas: [
        {
            texto: 'Abres un libro nuevo. ¿Qué te atrapa en la primera página?',
            opciones: [
                { texto: 'Dos personajes que se odian y comparten destino', pesos: { enemies: 3, grunon: 1 } },
                { texto: 'Un narrador que claramente esconde algo', pesos: { giro: 3, grismoral: 1 } },
                { texto: 'Un campus con niebla, normas raras y un secreto', pesos: { academia: 3, giro: 1 } },
                { texto: 'Una librería de pueblo con dueño cascarrabias', pesos: { cozy: 3, grunon: 1 } }
            ]
        },
        {
            texto: 'Tu escena favorita de cualquier historia:',
            opciones: [
                { texto: 'La discusión que termina demasiado cerca', pesos: { enemies: 3, grunon: 1 } },
                { texto: 'El «¿y ahora qué hacemos?» alrededor de una hoguera', pesos: { familia: 3, cozy: 1 } },
                { texto: 'El momento en que por fin acepta quién es', pesos: { elegido: 3, familia: 1 } },
                { texto: 'El monólogo donde el villano explica sus razones (y tienen sentido)', pesos: { grismoral: 3, giro: 1 } }
            ]
        },
        {
            texto: 'En tu grupo de amigos, tú eres...',
            opciones: [
                { texto: 'Quien organiza las quedadas y cocina para todos', pesos: { familia: 3, cozy: 1 } },
                { texto: 'Quien tiene un plan de vida ligeramente épico', pesos: { elegido: 3, academia: 1 } },
                { texto: 'Quien parece borde hasta que te ganas su cariño', pesos: { grunon: 3, enemies: 1 } },
                { texto: 'Quien defiende al malo de la peli en cada debate', pesos: { grismoral: 3, giro: 1 } }
            ]
        },
        {
            texto: 'Elige escenario para perderte un fin de semana:',
            opciones: [
                { texto: 'Una academia con rivalidades y pasillos oscuros', pesos: { academia: 3, enemies: 1 } },
                { texto: 'Una taberna ruidosa con canciones y mesa larga', pesos: { familia: 3, elegido: 1 } },
                { texto: 'Una mansión con puertas cerradas y un testamento', pesos: { giro: 3, grismoral: 1 } },
                { texto: 'Un pueblo costero con librería y panadería', pesos: { cozy: 3, grunon: 1 } }
            ]
        },
        {
            texto: 'Un personaje nuevo entra en escena. Sospechas de él si...',
            opciones: [
                { texto: 'Su mal humor es claramente una coraza', pesos: { grunon: 3, enemies: 1 } },
                { texto: 'Rechaza el trono que todos le ofrecen', pesos: { elegido: 3, familia: 1 } },
                { texto: 'Es encantador y a todo el mundo le adora', pesos: { giro: 3, grismoral: 1 } },
                { texto: 'Sabe demasiado latín y sonríe demasiado poco', pesos: { academia: 3, giro: 1 } }
            ]
        },
        {
            texto: '¿Qué te hace abandonar un libro?',
            opciones: [
                { texto: 'Que los protagonistas se lleven bien desde el principio', pesos: { enemies: 3, grunon: 1 } },
                { texto: 'Que el grupo se separe y cada uno vaya por su lado', pesos: { familia: 3, cozy: 1 } },
                { texto: 'Un villano plano que es malo «porque sí»', pesos: { grismoral: 3, academia: 1 } },
                { texto: 'Sufrimiento gratuito: la vida ya duele bastante', pesos: { cozy: 3, familia: 1 } }
            ]
        },
        {
            texto: 'Cierra los ojos: la escena que quieres leer esta noche tiene...',
            opciones: [
                { texto: 'Un mapa, un juramento y un camino que empieza', pesos: { elegido: 3, familia: 1 } },
                { texto: 'Una carta que nadie debía leer', pesos: { giro: 3, academia: 1 } },
                { texto: 'Un gruñido que en realidad significa «me importas»', pesos: { grunon: 3, enemies: 1 } },
                { texto: 'Una biblioteca prohibida a medianoche', pesos: { academia: 3, grismoral: 1 } }
            ]
        },
        {
            texto: 'El final perfecto:',
            opciones: [
                { texto: 'Se odiaban en la página uno y míralos ahora', pesos: { enemies: 3, grunon: 1 } },
                { texto: 'El gruñón por fin sonríe, y solo para una persona', pesos: { grunon: 3, cozy: 1 } },
                { texto: 'El malo gana. Y una parte de ti se alegra', pesos: { grismoral: 3, giro: 1 } },
                { texto: 'Todo el mundo acaba bien, feliz y merendando', pesos: { cozy: 3, familia: 1 } }
            ]
        }
    ]
};
