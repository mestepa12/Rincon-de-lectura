// Adornos de estantería dibujados a mano en SVG plano, con la paleta de la
// web (maderas, cremas, terracota, verdes y azules apagados). Sustituyen a
// los emojis del sistema, que cambiaban de estilo según la plataforma y
// rompían la estética del diorama.
//
// Se sirven como data URI en <img>: html2canvas los rasteriza como cualquier
// imagen, idéntico en todas las plataformas. El <svg> raíz lleva width y
// height explícitos porque Safari no dibuja en canvas los que solo tienen
// viewBox (saldría vacío en la captura de iOS).
//
// Cada pieza: w/h = viewBox, alto = altura recomendada en px sobre la balda.

const PIEZAS = {
    // — Base (para todos) —
    planta: { w: 64, h: 80, alto: 52, svg:
        '<path d="M32 40 C17 32 11 17 16 5 C29 10 34 25 32 40" fill="#556B2F"/>' +
        '<path d="M32 40 C47 32 53 17 48 5 C35 10 30 25 32 40" fill="#6B8E5A"/>' +
        '<path d="M32 42 C29 28 29 14 32 3 C35 14 35 28 32 42" fill="#7FA066"/>' +
        '<path d="M15 44 h34 l-4 28 a5 5 0 0 1 -5 5 H24 a5 5 0 0 1 -5 -5 z" fill="#A0522D"/>' +
        '<path d="M32 44 h17 l-4 28 a5 5 0 0 1 -5 5 h-8 z" fill="rgba(0,0,0,0.14)"/>' +
        '<rect x="12" y="40" width="40" height="8" rx="2.5" fill="#8A4526"/>' },

    // — Biblioteca —
    brote: { w: 40, h: 56, alto: 32, svg:
        '<path d="M20 34 C20 27 20 21 20 14" stroke="#556B2F" stroke-width="2.2" fill="none"/>' +
        '<path d="M20 22 C13 20 9 13 11 6 C18 9 20 15 20 22" fill="#6B8E5A"/>' +
        '<path d="M20 26 C26 24 30 19 29 12 C23 14 20 20 20 26" fill="#7FA066"/>' +
        '<path d="M10 40 h20 l-3 12 a3 3 0 0 1 -3 3 h-8 a3 3 0 0 1 -3 -3 z" fill="#A0522D"/>' +
        '<path d="M20 40 h10 l-3 12 a3 3 0 0 1 -3 3 h-4 z" fill="rgba(0,0,0,0.14)"/>' +
        '<rect x="8" y="36" width="24" height="6" rx="2" fill="#8A4526"/>' },
    cactus: { w: 48, h: 72, alto: 46, svg:
        '<rect x="19" y="10" width="10" height="44" rx="5" fill="#6B8E5A"/>' +
        '<rect x="9" y="20" width="5" height="12" rx="2.5" fill="#6B8E5A"/>' +
        '<rect x="9" y="28" width="12" height="5" rx="2.5" fill="#6B8E5A"/>' +
        '<rect x="34" y="27" width="5" height="12" rx="2.5" fill="#7FA066"/>' +
        '<rect x="28" y="35" width="11" height="5" rx="2.5" fill="#7FA066"/>' +
        '<path d="M22 14 v38 M26 14 v38" stroke="rgba(0,0,0,0.12)" stroke-width="1.4"/>' +
        '<circle cx="24" cy="9" r="2.5" fill="#B5651D"/>' +
        '<path d="M13 58 h22 l-2.5 11 a3 3 0 0 1 -3 3 h-11 a3 3 0 0 1 -3 -3 z" fill="#A0522D"/>' +
        '<path d="M24 58 h11 l-2.5 11 a3 3 0 0 1 -3 3 h-5.5 z" fill="rgba(0,0,0,0.14)"/>' +
        '<rect x="11" y="54" width="26" height="6" rx="2" fill="#8A4526"/>' },
    taza: { w: 56, h: 56, alto: 28, svg:
        '<path d="M20 12 C18 8 23 6 21 2 M30 12 C28 8 33 6 31 2" stroke="rgba(253,246,234,0.55)" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<path d="M38 24 C46 24 46 34 38 34" stroke="#F2E4C8" stroke-width="3.5" fill="none"/>' +
        '<rect x="13" y="16" width="26" height="26" rx="7" fill="#F2E4C8"/>' +
        '<rect x="26" y="16" width="13" height="26" rx="7" fill="rgba(0,0,0,0.09)"/>' +
        '<circle cx="22" cy="29" r="3" fill="#9A3B3B"/>' +
        '<ellipse cx="26" cy="47" rx="21" ry="4.5" fill="#D9C4A3"/>' +
        '<ellipse cx="26" cy="45.8" rx="21" ry="4" fill="#E3D2B4"/>' },
    jarron: { w: 48, h: 72, alto: 46, svg:
        '<rect x="16" y="3" width="16" height="6" rx="2" fill="#8A4526"/>' +
        '<path d="M19 9 h10 l2 8 h-14 z" fill="#A0522D"/>' +
        '<path d="M14 17 C7 27 7 43 15 53 C19 59 29 59 33 53 C41 43 41 27 34 17 z" fill="#B5651D"/>' +
        '<path d="M24 17 h10 C41 27 41 43 33 53 C31 56 27 58 24 58 z" fill="rgba(0,0,0,0.13)"/>' +
        '<path d="M14 32 l5 -4 l5 4 l5 -4 l5 4 l5 -4" stroke="#7A4A2E" stroke-width="2.2" fill="none"/>' +
        '<path d="M17 60 h14 l-2 6 h-10 z" fill="#8A4526"/>' },
    globo: { w: 56, h: 76, alto: 46, svg:
        '<circle cx="28" cy="32" r="21" fill="#4A5A7A"/>' +
        '<path d="M14 22 C20 18 26 20 28 26 C24 30 16 30 14 22 M30 36 C38 32 44 34 44 40 C40 48 32 46 30 36 M22 44 C26 42 30 44 28 50 C24 50 22 48 22 44" fill="#6B8E5A"/>' +
        '<ellipse cx="28" cy="32" rx="8" ry="21" stroke="rgba(253,246,234,0.18)" stroke-width="1.6" fill="none"/>' +
        '<path d="M9 28 C4 52 52 52 47 28" stroke="#6B4630" stroke-width="4" fill="none"/>' +
        '<rect x="26" y="54" width="4" height="10" fill="#8A613F"/>' +
        '<ellipse cx="28" cy="67" rx="14" ry="4.5" fill="#6B4630"/>' },

    // — Terminados —
    medalla: { w: 44, h: 56, alto: 30, svg:
        '<path d="M15 3 h14 l-2 13 h-10 z" fill="#9A3B3B"/>' +
        '<path d="M22 3 h7 l-2 13 h-5 z" fill="#7C3A3A"/>' +
        '<circle cx="22" cy="32" r="14" fill="#D9A75F"/>' +
        '<circle cx="22" cy="32" r="9.5" fill="#E8C57A"/>' +
        '<path d="M22 25 L24 30 L29 30 L25 33.5 L26.6 38.6 L22 35.5 L17.4 38.6 L19 33.5 L15 30 L20 30 Z" fill="#8A6D3B"/>' +
        '<path d="M22 46 C30 46 36 40 36 32 L34 32 C34 39 29 44 22 44 z" fill="rgba(0,0,0,0.12)"/>' },
    trofeo: { w: 52, h: 62, alto: 36, svg:
        '<path d="M13 11 C3 11 3 26 15 25" stroke="#D9A75F" stroke-width="3.5" fill="none"/>' +
        '<path d="M39 11 C49 11 49 26 37 25" stroke="#D9A75F" stroke-width="3.5" fill="none"/>' +
        '<path d="M14 8 h24 v11 C38 29 33 34 26 34 C19 34 14 29 14 19 z" fill="#D9A75F"/>' +
        '<path d="M26 8 h12 v11 C38 29 33 34 26 34 z" fill="rgba(0,0,0,0.12)"/>' +
        '<rect x="12" y="5" width="28" height="5" rx="2" fill="#E8C57A"/>' +
        '<path d="M18 14 C18 20 20 24 23 27" stroke="rgba(255,255,255,0.35)" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
        '<rect x="23" y="34" width="6" height="8" fill="#C79552"/>' +
        '<rect x="16" y="42" width="20" height="6" rx="2" fill="#8A6D3B"/>' +
        '<rect x="13" y="48" width="26" height="6" rx="2" fill="#6B4630"/>' },

    // — Páginas —
    reloj_arena: { w: 48, h: 80, alto: 44, svg:
        '<rect x="7" y="4" width="34" height="7" rx="2.5" fill="#6B4630"/>' +
        '<rect x="7" y="69" width="34" height="7" rx="2.5" fill="#6B4630"/>' +
        '<rect x="9" y="6" width="30" height="2.5" rx="1" fill="#8A613F"/>' +
        '<path d="M11 11 C11 26 20 31 22 40 C20 49 11 54 11 69 h26 C37 54 28 49 26 40 C28 31 37 26 37 11 z" fill="rgba(253,246,234,0.13)"/>' +
        '<path d="M15 12 C15 22 21 27 23 33 h2 C27 27 33 22 33 12 z" fill="#D9A75F" opacity="0.9"/>' +
        '<path d="M23.2 36 h1.6 v30 h-1.6 z" fill="#D9A75F" opacity="0.8"/>' +
        '<path d="M13 68 C15 59 22 57 24 52 C26 57 33 59 35 68 z" fill="#D9A75F"/>' },
    telescopio: { w: 60, h: 76, alto: 48, svg:
        '<path d="M30 46 L18 70 M30 46 L42 70 M30 46 L30 68" stroke="#6B4630" stroke-width="3.5" stroke-linecap="round" fill="none"/>' +
        '<path d="M12 40 L42 10 L50 18 L20 48 Z" fill="#A98A50"/>' +
        '<path d="M38 14 L42 10 L50 18 L46 22 Z" fill="#8A6D3B"/>' +
        '<path d="M12 40 L17 35 L25 43 L20 48 Z" fill="#8A6D3B"/>' +
        '<path d="M15 38 L40 13" stroke="rgba(255,255,255,0.25)" stroke-width="2" fill="none"/>' +
        '<circle cx="30" cy="46" r="4.5" fill="#4A3020"/>' },

    // — Metas y valoraciones —
    estrella: { w: 48, h: 60, alto: 30, svg:
        '<path d="M24 8 L27.3 17.5 L37.3 17.7 L29.3 23.7 L32.2 33.3 L24 27.6 L15.8 33.3 L18.7 23.7 L10.7 17.7 L20.7 17.5 Z" fill="#E8C57A"/>' +
        '<path d="M24 8 L27.3 17.5 L37.3 17.7 L29.3 23.7 L32.2 33.3 L24 27.6 Z" fill="#D9A75F"/>' +
        '<rect x="20" y="36" width="8" height="9" fill="#8A613F"/>' +
        '<rect x="14" y="45" width="20" height="6" rx="2" fill="#6B4630"/>' },
    pluma_tintero: { w: 52, h: 64, alto: 32, svg:
        '<path d="M30 54 C34 40 40 22 48 10 C46 26 42 42 34 56 z" fill="#F2E4C8"/>' +
        '<path d="M47 12 C42 28 38 42 33 54" stroke="#C9B491" stroke-width="1.5" fill="none"/>' +
        '<rect x="15" y="26" width="8" height="7" rx="2" fill="#A98A50"/>' +
        '<rect x="13" y="32" width="12" height="7" fill="#4A3020"/>' +
        '<rect x="8" y="38" width="22" height="20" rx="4" fill="#4A3020"/>' +
        '<rect x="11" y="42" width="5" height="9" rx="2" fill="rgba(255,255,255,0.10)"/>' },
    mascaras: { w: 56, h: 58, alto: 30, svg:
        '<path d="M8 12 C7 32 14 44 24 41 C27 31 27 18 25 9 C18 7 11 8 8 12 z" fill="#F2E4C8"/>' +
        '<ellipse cx="14.5" cy="20" rx="2.6" ry="1.8" fill="#4A2F1C"/>' +
        '<ellipse cx="21.5" cy="19" rx="2.6" ry="1.8" fill="#4A2F1C"/>' +
        '<path d="M12 29 C15 34 20 34 22 29" stroke="#4A2F1C" stroke-width="2" fill="none"/>' +
        '<path d="M31 16 C29 36 36 48 46 45 C49 35 49 22 47 13 C40 11 34 12 31 16 z" fill="#B5651D"/>' +
        '<path d="M35 24 l4.5 -2 M46 22 l-4.5 -2" stroke="#4A2F1C" stroke-width="2" fill="none"/>' +
        '<path d="M36 37 C39 33 43 33 45 37" stroke="#4A2F1C" stroke-width="2" fill="none"/>' },
    bola_cristal: { w: 48, h: 58, alto: 30, svg:
        '<circle cx="24" cy="24" r="17" fill="#93A8C6"/>' +
        '<circle cx="24" cy="24" r="17" fill="rgba(122,143,176,0.4)"/>' +
        '<ellipse cx="18" cy="17" rx="7" ry="5" fill="rgba(201,214,232,0.75)" transform="rotate(-24 18 17)"/>' +
        '<path d="M33 31 l1.4 3 l3 1.4 l-3 1.4 l-1.4 3 l-1.4 -3 l-3 -1.4 l3 -1.4 z" fill="rgba(253,246,234,0.9)"/>' +
        '<rect x="10" y="42" width="28" height="4" rx="2" fill="#8A613F"/>' +
        '<path d="M12 46 h24 l-4 8 h-16 z" fill="#6B4630"/>' },

    // — Racha —
    vela: { w: 48, h: 80, alto: 44, halo: true, svg:
        '<ellipse cx="24" cy="24" rx="15" ry="17" fill="rgba(255,202,100,0.18)"/>' +
        '<path d="M24 12 C29 18 30 23 24 30 C18 23 19 18 24 12" fill="#FFB84D"/>' +
        '<path d="M24 18 C26.5 21 26.5 24 24 27.5 C21.5 24 21.5 21 24 18" fill="#FFF3D0"/>' +
        '<rect x="23" y="28" width="2" height="4" fill="#6b4630"/>' +
        '<rect x="14" y="32" width="20" height="41" rx="3" fill="#F2E4C8"/>' +
        '<rect x="25" y="32" width="9" height="41" rx="3" fill="rgba(0,0,0,0.10)"/>' +
        '<path d="M14 34 c0 5 4 4 4 9 v-11 z" fill="#FBF3DF"/>' +
        '<ellipse cx="24" cy="74" rx="17" ry="4.5" fill="#8A6D3B"/>' +
        '<ellipse cx="24" cy="72.6" rx="17" ry="4" fill="#A98A50"/>' },
    farolillo: { w: 48, h: 88, alto: 50, halo: true, svg:
        '<path d="M16 10 C16 2 32 2 32 10" stroke="#4A3020" stroke-width="3" fill="none"/>' +
        '<path d="M12 16 h24 l-3 -7 h-18 z" fill="#4A3020"/>' +
        '<rect x="10" y="15" width="28" height="4" rx="1.5" fill="#5C3D26"/>' +
        '<rect x="13" y="19" width="22" height="44" rx="3" fill="#FFC468"/>' +
        '<ellipse cx="24" cy="44" rx="9" ry="14" fill="#FFE9B8"/>' +
        '<path d="M24 33 C28.5 39 29 44 24 50 C19 44 19.5 39 24 33" fill="#FFF7E2"/>' +
        '<rect x="13" y="19" width="2.4" height="44" fill="#4A3020"/>' +
        '<rect x="32.6" y="19" width="2.4" height="44" fill="#4A3020"/>' +
        '<rect x="10" y="62" width="28" height="5" rx="2" fill="#4A3020"/>' +
        '<rect x="15" y="67" width="18" height="4" rx="2" fill="#5C3D26"/>' },
    gema: { w: 48, h: 54, alto: 26, svg:
        '<path d="M10 20 L18 10 L30 10 L38 20 L24 40 Z" fill="#7A4A6E"/>' +
        '<path d="M18 10 L24 20 L30 10 Z" fill="#9A6B8E"/>' +
        '<path d="M10 20 L24 20 L24 40 Z" fill="#8A5A7E"/>' +
        '<path d="M38 20 L24 20 L24 40 Z" fill="#5C3552"/>' +
        '<path d="M14 13 l1.2 2.6 l2.6 1.2 l-2.6 1.2 l-1.2 2.6 l-1.2 -2.6 l-2.6 -1.2 l2.6 -1.2 z" fill="rgba(253,246,234,0.9)"/>' +
        '<ellipse cx="24" cy="44" rx="16" ry="5" fill="#9A3B3B"/>' +
        '<ellipse cx="24" cy="42.6" rx="16" ry="4.4" fill="#B04848"/>' },

    // — Club de lectura —
    tetera: { w: 60, h: 58, alto: 30, svg:
        '<path d="M46 24 C56 26 56 38 45 40" stroke="#C9B491" stroke-width="3.5" fill="none"/>' +
        '<path d="M13 28 C4 26 4 34 11 37 C11 33 12 30 13 28 z" fill="#F2E4C8"/>' +
        '<ellipse cx="29" cy="34" rx="18" ry="15" fill="#F2E4C8"/>' +
        '<path d="M29 19 C39 19 47 26 47 34 C47 42 39 49 29 49 z" fill="rgba(0,0,0,0.08)"/>' +
        '<circle cx="22" cy="33" r="1.8" fill="#B5651D"/><circle cx="29" cy="35" r="1.8" fill="#B5651D"/><circle cx="36" cy="33" r="1.8" fill="#B5651D"/>' +
        '<ellipse cx="29" cy="19" rx="10" ry="4" fill="#B5651D"/>' +
        '<circle cx="29" cy="14" r="3" fill="#8A4526"/>' },

    // — Amigos —
    osito: { w: 52, h: 64, alto: 34, svg:
        '<circle cx="14" cy="13" r="6.5" fill="#8A6D4B"/><circle cx="38" cy="13" r="6.5" fill="#8A6D4B"/>' +
        '<circle cx="14" cy="13" r="3" fill="#A98A6B"/><circle cx="38" cy="13" r="3" fill="#A98A6B"/>' +
        '<circle cx="26" cy="22" r="14" fill="#8A6D4B"/>' +
        '<ellipse cx="26" cy="27" rx="7.5" ry="5.5" fill="#D9C4A3"/>' +
        '<path d="M26 24 l-2.6 2 h5.2 z" fill="#4A2F1C"/>' +
        '<circle cx="20" cy="19" r="2" fill="#4A2F1C"/><circle cx="32" cy="19" r="2" fill="#4A2F1C"/>' +
        '<ellipse cx="26" cy="46" rx="15" ry="15" fill="#8A6D4B"/>' +
        '<ellipse cx="26" cy="48" rx="8.5" ry="9.5" fill="#D9C4A3"/>' +
        '<ellipse cx="10" cy="42" rx="4.5" ry="7" fill="#7A5F40" transform="rotate(18 10 42)"/>' +
        '<ellipse cx="42" cy="42" rx="4.5" ry="7" fill="#7A5F40" transform="rotate(-18 42 42)"/>' },
    marco_foto: { w: 48, h: 60, alto: 32, svg:
        '<path d="M38 50 l7 8 h-9 z" fill="#5C3D26"/>' +
        '<rect x="8" y="4" width="32" height="46" rx="3" fill="#8A613F"/>' +
        '<rect x="8" y="4" width="32" height="46" rx="3" fill="none" stroke="rgba(0,0,0,0.15)" stroke-width="1.5"/>' +
        '<rect x="13" y="9" width="22" height="36" fill="#F2E4C8"/>' +
        '<circle cx="24" cy="23" r="5.5" fill="#6B4630"/>' +
        '<path d="M15 41 C15 32 33 32 33 41 z" fill="#6B4630"/>' },

    // — Exploración —
    brujula: { w: 48, h: 54, alto: 26, svg:
        '<rect x="20" y="2" width="8" height="6" rx="2" fill="#8A6D3B"/>' +
        '<circle cx="24" cy="28" r="17" fill="#A98A50"/>' +
        '<circle cx="24" cy="28" r="12.5" fill="#F2E4C8"/>' +
        '<path d="M24 17 v3 M24 36 v3 M13 28 h3 M32 28 h3" stroke="#8A6D3B" stroke-width="1.8"/>' +
        '<path d="M24 18.5 L27 28 L24 37.5 L21 28 Z" fill="#4A5A7A"/>' +
        '<path d="M24 18.5 L27 28 L21 28 Z" fill="#9A3B3B"/>' +
        '<circle cx="24" cy="28" r="1.8" fill="#4A2F1C"/>' },

    // — Hazañas —
    sujetalibros: { w: 60, h: 60, alto: 32, svg:
        '<rect x="5" y="26" width="27" height="28" rx="2" fill="#9A3B3B"/>' +
        '<path d="M5 40 h27 M18 26 v14 M12 40 v14 M25 40 v14" stroke="rgba(0,0,0,0.18)" stroke-width="1.8"/>' +
        '<path d="M32 26 h5 v28 h-5 z" fill="rgba(0,0,0,0.14)"/>' +
        '<path d="M35 54 L52 48 L45 15 L29 21 Z" fill="#3E6257"/>' +
        '<path d="M29 21 L45 15 l1.4 4.5 L30.5 25.5 Z" fill="#F2E4C8"/>' +
        '<path d="M33 30 L46 25" stroke="rgba(255,224,160,0.5)" stroke-width="1.6" fill="none"/>' },
    buho: { w: 56, h: 80, alto: 44, svg:
        '<path d="M10 52 C10 24 17 12 20 8 L25 15 h6 L36 8 C39 12 46 24 46 52 C46 66 38 74 28 74 C18 74 10 66 10 52" fill="#E3D2B4"/>' +
        '<path d="M28 74 C38 74 46 66 46 52 C46 24 39 12 36 8 L31 15 h-3 v59" fill="rgba(0,0,0,0.09)"/>' +
        '<circle cx="20.5" cy="30" r="9.5" fill="#F6ECD9"/>' +
        '<circle cx="35.5" cy="30" r="9.5" fill="#F6ECD9"/>' +
        '<circle cx="20.5" cy="30" r="4" fill="#4A2F1C"/>' +
        '<circle cx="35.5" cy="30" r="4" fill="#4A2F1C"/>' +
        '<circle cx="22" cy="28.5" r="1.3" fill="#F6ECD9"/>' +
        '<circle cx="37" cy="28.5" r="1.3" fill="#F6ECD9"/>' +
        '<path d="M28 34 l-4 5 h8 z" fill="#B5651D"/>' +
        '<path d="M20 48 q4 4 8 0 q4 4 8 0 M20 56 q4 4 8 0 q4 4 8 0" stroke="#C9B491" stroke-width="1.6" fill="none"/>' },
};

const cache = {};

// Data URI de una pieza (cacheado). '' si el id no existe.
export const decoUrl = (id) => {
    const p = PIEZAS[id];
    if (!p) return '';
    if (!cache[id]) {
        cache[id] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${p.w}" height="${p.h}" viewBox="0 0 ${p.w} ${p.h}">${p.svg}</svg>`
        );
    }
    return cache[id];
};

// Altura recomendada de la pieza sobre la balda, en px.
export const decoAlto = (id) => PIEZAS[id]?.alto || 44;

// Piezas con luz propia: reciben el halo cálido en CSS.
export const decoConHalo = (id) => !!PIEZAS[id]?.halo;
