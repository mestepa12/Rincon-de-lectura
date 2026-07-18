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
    gancho: 'Cinco preguntas, dos minutos, una verdad incómoda sobre tu forma de leer.',
    emoji: '🎭',
    perfiles: {
        enemies: {
            nombre: 'Enemies to Lovers',
            emoji: '⚔️',
            tagline: 'El odio es solo el primer capítulo.',
            descripcion: 'Vives para la tensión: miradas que cortan, treguas forzosas y ese momento exacto en que el desprecio se vuelve otra cosa. Si no discuten, no te lo crees.',
            libro: 'Orgullo y Prejuicio, de Jane Austen',
            hue: 350
        },
        familia: {
            nombre: 'Found Family',
            emoji: '🏕️',
            tagline: 'La sangre no elige; tú sí.',
            descripcion: 'Tu debilidad son los grupos imposibles que acaban cenando juntos. Te importa menos salvar el mundo que quién cuida de quién mientras tanto.',
            libro: 'Seis de Cuervos, de Leigh Bardugo',
            hue: 145
        },
        elegido: {
            nombre: 'El Elegido',
            emoji: '✨',
            tagline: 'La profecía no se va a cumplir sola.',
            descripcion: 'Destinos que pesan, mentores que desaparecen y un protagonista que no pidió nada de esto. Lo tuyo es ver a alguien corriente aceptar algo enorme.',
            libro: 'El Nombre del Viento, de Patrick Rothfuss',
            hue: 40
        },
        giro: {
            nombre: 'El Giro Final',
            emoji: '🌀',
            tagline: 'Confías en el narrador. Error.',
            descripcion: 'Lees como quien interroga: subrayas frases sospechosas, desconfías del personaje amable y celebras que un epílogo te obligue a releer el libro entero.',
            libro: 'La verdad sobre el caso Harry Quebert, de Joël Dicker',
            hue: 215
        }
    },
    preguntas: [
        {
            texto: 'Abres un libro nuevo. ¿Qué te atrapa en la primera página?',
            opciones: [
                { texto: 'Dos personajes que se odian y comparten destino', pesos: { enemies: 3, giro: 1 } },
                { texto: 'Un grupo de desconocidos obligados a colaborar', pesos: { familia: 3, elegido: 1 } },
                { texto: 'Una profecía que alguien intenta esquivar', pesos: { elegido: 3, giro: 1 } },
                { texto: 'Un narrador que claramente esconde algo', pesos: { giro: 3, enemies: 1 } }
            ]
        },
        {
            texto: 'Tu escena favorita de cualquier historia:',
            opciones: [
                { texto: 'La discusión que termina demasiado cerca', pesos: { enemies: 3, familia: 1 } },
                { texto: 'El «¿y ahora qué hacemos?» alrededor de una hoguera', pesos: { familia: 3, enemies: 1 } },
                { texto: 'El momento en que por fin acepta quién es', pesos: { elegido: 3, familia: 1 } },
                { texto: 'La página que te obliga a releer el capítulo uno', pesos: { giro: 3, elegido: 1 } }
            ]
        },
        {
            texto: 'En tu grupo de amigos, tú eres...',
            opciones: [
                { texto: 'Quien discute por deporte (con cariño)', pesos: { enemies: 3 } },
                { texto: 'Quien organiza las quedadas y cocina para todos', pesos: { familia: 3 } },
                { texto: 'Quien tiene un plan de vida ligeramente épico', pesos: { elegido: 3 } },
                { texto: 'Quien guarda secretos mejor que nadie', pesos: { giro: 3 } }
            ]
        },
        {
            texto: 'Elige escenario para perderte un fin de semana:',
            opciones: [
                { texto: 'Una academia con rivalidades y pasillos oscuros', pesos: { enemies: 2, giro: 2 } },
                { texto: 'Una taberna ruidosa con canciones y mesa larga', pesos: { familia: 3, enemies: 1 } },
                { texto: 'Un reino al borde del colapso que alguien debe salvar', pesos: { elegido: 3, familia: 1 } },
                { texto: 'Una mansión con puertas cerradas y un testamento', pesos: { giro: 3, elegido: 1 } }
            ]
        },
        {
            texto: 'El final perfecto:',
            opciones: [
                { texto: 'Se odiaban en la página uno y míralos ahora', pesos: { enemies: 3, familia: 1 } },
                { texto: 'Todos sentados a la misma mesa, contra todo pronóstico', pesos: { familia: 3, elegido: 1 } },
                { texto: 'El sacrificio que solo esa persona podía hacer', pesos: { elegido: 3, enemies: 1 } },
                { texto: 'El epílogo que reescribe el libro entero', pesos: { giro: 3, familia: 1 } }
            ]
        }
    ]
};
