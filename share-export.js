// Compartir o descargar los PNG generados con html2canvas.
//
// iOS Safari rompe en silencio los dos patrones que Android tolera:
//  1) Un <a download> con un data URL grande no descarga nada: aquí toda
//     descarga va por blob + URL.createObjectURL, con el revoke diferido
//     porque revocar justo tras el click también corta la descarga en Safari.
//  2) navigator.share() exige una activación de usuario vigente. Para cuando
//     html2canvas termina de renderizar (portadas, chunk de la librería…),
//     el toque original ya ha caducado y Safari lanza NotAllowedError: en ese
//     caso se muestra un aviso con botón para relanzar la hoja de compartir
//     con un toque nuevo, que sí trae activación fresca.

export const descargarBlob = (blob, nombre) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nombre;
    document.body.appendChild(link); // iOS ignora clicks de <a> fuera del DOM
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
};

const compartir = (file, titulo, texto) =>
    navigator.share(texto ? { files: [file], title: titulo, text: texto } : { files: [file], title: titulo });

// Aviso con botón: el click del usuario renueva la activación que share() necesita.
const pedirToqueParaCompartir = (file, titulo, texto, nombre) => {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:80px;right:1rem;background:#2D3748;color:white;' +
        'padding:0.9rem 1.2rem;border-radius:10px;font-size:0.85rem;max-width:290px;' +
        'z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.35);line-height:1.4;' +
        'border-left:4px solid #60A5FA;display:flex;flex-direction:column;gap:0.6rem;';
    const txt = document.createElement('span');
    txt.textContent = '📸 Tu imagen está lista.';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '📤 Compartir imagen';
    btn.style.cssText = 'background:#60A5FA;color:#0d1522;border:none;border-radius:8px;' +
        'padding:0.55rem 0.9rem;font-weight:700;cursor:pointer;font-size:0.85rem;';
    btn.addEventListener('click', async () => {
        t.remove();
        try {
            await compartir(file, titulo, texto);
        } catch (err) {
            if (err.name !== 'AbortError') descargarBlob(file, nombre); // File hereda de Blob
        }
    });
    t.append(txt, btn);
    // Dentro del <dialog> abierto, si lo hay, para superar su top-layer
    (document.querySelector('dialog[open]') || document.body).appendChild(t);
    setTimeout(() => t.remove(), 30000);
};

// Devuelve 'compartido', 'descargado' o 'pendiente' (esperando el toque del aviso).
export const exportarBlob = async (blob, nombre, titulo, texto) => {
    const file = new File([blob], nombre, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await compartir(file, titulo, texto);
            return 'compartido';
        } catch (err) {
            if (err.name === 'AbortError') return 'compartido'; // el usuario cerró la hoja
            pedirToqueParaCompartir(file, titulo, texto, nombre);
            return 'pendiente';
        }
    }
    descargarBlob(blob, nombre);
    return 'descargado';
};

export const exportarCanvas = async (canvas, nombre, titulo, texto) => {
    const blob = await new Promise((res, rej) =>
        canvas.toBlob(b => (b ? res(b) : rej(new Error('canvas.toBlob devolvió null'))), 'image/png'));
    return exportarBlob(blob, nombre, titulo, texto);
};
