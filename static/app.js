const seccionAutenticacion = document.getElementById('seccion-autenticacion');
const seccionGrupos = document.getElementById('seccion-grupos');
const seccionChat = document.getElementById('seccion-chat');
const vistaLogin = document.getElementById('vista-login');
const vistaRegistro = document.getElementById('vista-registro');
const alerta = document.getElementById('alerta');
const listaGrupos = document.getElementById('lista-grupos');
const tituloGrupo = document.getElementById('titulo-grupo');
const administradorGrupo = document.getElementById('administrador-grupo');
const infoMiembros = document.getElementById('info-miembros');
const mensajesContenedor = document.getElementById('mensajes-contenedor');
const formLogin = document.getElementById('form-login');
const loginError = document.getElementById('login-error');
const loginUsernameInput = document.getElementById('login-username');
const loginPasswordInput = document.getElementById('login-password');
const formRegistro = document.getElementById('form-registro');
const botonMostrarRegistro = document.getElementById('boton-mostrar-registro');
const botonMostrarLogin = document.getElementById('boton-mostrar-login');
const botonLogout = document.getElementById('boton-logout');
const botonCrearGrupo = document.getElementById('boton-crear-grupo');
const inputNuevoGrupo = document.getElementById('nuevo-grupo-nombre');
const botonRegresar = document.getElementById('boton-regresar');
const formMensaje = document.getElementById('form-mensaje');
const inputMensajeTexto = document.getElementById('mensaje-texto');
const inputMensajeArchivo = document.getElementById('mensaje-archivo');
const botonAgregarMiembro = document.getElementById('boton-agregar-miembro');
const inputNuevoMiembro = document.getElementById('nuevo-miembro-username');
const botonMensajesNuevos = document.getElementById('boton-mensajes-nuevos');
const botonAgregarContacto = document.getElementById('boton-agregar-contacto');
const inputNuevoContacto = document.getElementById('nuevo-contacto-username');
const listaContactos = document.getElementById('lista-contactos');
const seccionChatPrivado = document.getElementById('seccion-chat-privado');
const botonPrivadoRegresar = document.getElementById('boton-privado-regresar');
const botonPrivadosMensajesNuevos = document.getElementById('boton-privados-mensajes-nuevos');
const tituloContacto = document.getElementById('titulo-contacto');
const estadoContacto = document.getElementById('estado-contacto');
const mensajesPrivadosContenedor = document.getElementById('mensajes-privados-contenedor');
const formMensajePrivado = document.getElementById('form-mensaje-privado');
const inputMensajePrivadoTexto = document.getElementById('mensaje-privado-texto');
const inputMensajePrivadoArchivo = document.getElementById('mensaje-privado-archivo');
const usuarioSesion = document.getElementById('usuario-sesion');
const imagenModal = document.getElementById('imagen-modal');
const imagenModalOverlay = document.getElementById('imagen-modal-overlay');
const imagenModalCerrar = document.getElementById('imagen-modal-cerrar');
const imagenModalImg = document.getElementById('imagen-modal-img');

let grupoActivo = null;
let contactoActivo = null;
let tipoConversacion = null;
let usuarioActual = null;
let usuarioActualId = null;
let intervaloMensajes = null;
let intervaloPresencia = null;
let intervaloGrupos = null;
let ultimoMensajeId = null;
let ultimoMensajePrivadoId = null;
let ultimaFirmaMensajesGrupo = '';
let ultimaFirmaMensajesPrivados = '';
let accessToken = localStorage.getItem('access_token');
let usuarioSesionOnline = false;
let presenciaOfflineNotificada = false;
const HEARTBEAT_INTERVAL_MS = 15000;
const PRESENCE_UI_REFRESH_MS = 7000;

// Bases relativas: sin fallback a localhost cuando no hay configuración global.
const GATEWAY_BASE = (window.API_GATEWAY_BASE || '').replace(/\/$/, '');
const AUTH_API_BASE = `${GATEWAY_BASE}/auth`;
const CHAT_API_BASE = `${GATEWAY_BASE}/chat`;
const FILE_API_BASE = `${GATEWAY_BASE}/file`;

function construirUrl(base, ruta) {
    return `${base}${ruta}`;
}

function esMismoId(idA, idB) {
    return Number(idA) === Number(idB);
}

function obtenerFirmaMensajes(mensajes) {
    if (!Array.isArray(mensajes)) return '';
    return mensajes
        .map((msg) => [
            msg.id,
            msg.status || '',
            msg.content || '',
            msg.file_url || '',
            msg.user_id ?? msg.sender_id ?? '',
            msg.username || ''
        ].join(':'))
        .join('|');
}

function estadoPresenciaTexto(online) {
    return online ? 'En línea' : 'Desconectado';
}

function formatearPresencia(online) {
    const clase = online ? 'online' : 'offline';
    return `<span class="estado-presencia ${clase}" data-presence-state><span class="punto-presencia ${clase}"></span><span class="estado-presencia-texto">${estadoPresenciaTexto(online)}</span></span>`;
}

function actualizarNodoPresencia(nodo, online) {
    if (!nodo) return;
    const clase = online ? 'online' : 'offline';
    nodo.classList.remove('online', 'offline');
    nodo.classList.add(clase);
    const punto = nodo.querySelector('.punto-presencia');
    if (punto) {
        punto.classList.remove('online', 'offline');
        punto.classList.add(clase);
    }
    const texto = nodo.querySelector('.estado-presencia-texto');
    if (texto) {
        texto.textContent = estadoPresenciaTexto(online);
    }
}

function actualizarListaContactosPresencia(contactos) {
    if (!listaContactos || !Array.isArray(contactos)) return false;
    let actualizado = false;

    contactos.forEach((contacto) => {
        const item = listaContactos.querySelector(`[data-contact-id="${contacto.id}"]`);
        if (!item) return;
        actualizarNodoPresencia(item.querySelector('[data-presence-state]'), !!contacto.online);
        actualizado = true;
    });

    return actualizado;
}

function actualizarListaMiembrosPresencia(miembros) {
    if (!infoMiembros || !Array.isArray(miembros)) return false;
    let actualizado = false;

    miembros.forEach((miembro) => {
        const item = infoMiembros.querySelector(`[data-member-id="${miembro.id}"]`);
        if (!item) return;
        actualizarNodoPresencia(item.querySelector('[data-presence-state]'), !!miembro.online);
        actualizado = true;
    });

    return actualizado;
}

function construirHeaders(extraHeaders = {}) {
    const headers = { ...extraHeaders };
    if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
    }
    return headers;
}

function resolverUrlArchivo(rutaArchivo) {
    if (!rutaArchivo) return '';
    if (/^https?:\/\//i.test(rutaArchivo)) return rutaArchivo;
    return construirUrl(FILE_API_BASE, rutaArchivo);
}

function mostrarAlerta(texto) {
    if (!alerta) return;
    alerta.textContent = texto;
    alerta.classList.remove('oculto');
    setTimeout(() => alerta.classList.add('oculto'), 3000);
}

function mostrarErrorLogin(texto) {
    if (!loginError) return;
    loginError.textContent = texto;
    loginError.classList.remove('oculto');
    if (loginUsernameInput) loginUsernameInput.classList.add('input-error');
    if (loginPasswordInput) loginPasswordInput.classList.add('input-error');
}

function ocultarErrorLogin() {
    if (!loginError) return;
    loginError.textContent = '';
    loginError.classList.add('oculto');
    if (loginUsernameInput) loginUsernameInput.classList.remove('input-error');
    if (loginPasswordInput) loginPasswordInput.classList.remove('input-error');
}

// Navegación de vistas
function mostrarVistaLogin() {
    vistaLogin.classList.remove('oculto');
    vistaRegistro.classList.add('oculto');
}

function mostrarVistaRegistro() {
    vistaLogin.classList.add('oculto');
    vistaRegistro.classList.remove('oculto');
}

function mostrarSeccionGrupos() {
    seccionAutenticacion.classList.add('oculto');
    seccionChat.classList.add('oculto');
    seccionChatPrivado.classList.add('oculto');
    seccionGrupos.classList.remove('oculto');
}

function mostrarSeccionChat() {
    seccionAutenticacion.classList.add('oculto');
    seccionGrupos.classList.add('oculto');
    seccionChatPrivado.classList.add('oculto');
    seccionChat.classList.remove('oculto');
}

function mostrarSeccionChatPrivado() {
    seccionAutenticacion.classList.add('oculto');
    seccionGrupos.classList.add('oculto');
    seccionChat.classList.add('oculto');
    seccionChatPrivado.classList.remove('oculto');
}

function mostrarLoginRegistro() {
    seccionAutenticacion.classList.remove('oculto');
    seccionGrupos.classList.add('oculto');
    seccionChat.classList.add('oculto');
    seccionChatPrivado.classList.add('oculto');
}

function mostrarUsuarioSesion() {
    if (usuarioActual) {
        const estadoSesion = usuarioSesionOnline ? 'Conectado' : 'Desconectado';
        usuarioSesion.innerHTML = `
            <span class="usuario-sesion-etiqueta">Cuenta activa</span>
            <span class="usuario-sesion-nombre">@${usuarioActual}</span>
            <span class="usuario-sesion-estado ${usuarioSesionOnline ? 'online' : 'offline'}">${estadoSesion}</span>
        `;
        usuarioSesion.classList.remove('oculto');
    } else {
        usuarioSesion.innerHTML = '';
        usuarioSesion.classList.add('oculto');
    }
}

// Utilidades de Scroll y UI
function estaEnElFondo(contenedor = mensajesContenedor) {
    if (!contenedor) return true;
    const distanciaHastaElFondo = contenedor.scrollHeight - contenedor.clientHeight - contenedor.scrollTop;
    return distanciaHastaElFondo < 50;
}

function scrollHaciaAbajo(suave = true, contenedor = mensajesContenedor) {
    if (!contenedor) return;
    if (suave) {
        contenedor.scrollTo({ top: contenedor.scrollHeight, behavior: 'smooth' });
    } else {
        contenedor.scrollTop = contenedor.scrollHeight;
    }
}

function obtenerTextoSeparadorFecha(fechaString) {
    const fecha = new Date(fechaString);
    const hoy = new Date();
    const ayer = new Date();
    ayer.setDate(hoy.getDate() - 1);
    if (fecha.toDateString() === hoy.toDateString()) return 'Hoy';
    if (fecha.toDateString() === ayer.toDateString()) return 'Ayer';
    return fecha.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
}

function construirSeparadorFecha(texto) {
    const separador = document.createElement('div');
    separador.className = 'separador-fecha';
    separador.innerHTML = `<span>${texto}</span>`;
    return separador;
}

function ocultarBotonMensajesNuevos() { botonMensajesNuevos?.classList.add('oculto'); }
function mostrarBotonMensajesNuevos() { botonMensajesNuevos?.classList.remove('oculto'); }
function ocultarBotonPrivadosMensajesNuevos() { botonPrivadosMensajesNuevos?.classList.add('oculto'); }
function mostrarBotonPrivadosMensajesNuevos() { botonPrivadosMensajesNuevos?.classList.remove('oculto'); }

function construirPrevisualizacionArchivo(rutaArchivo) {
    if (!rutaArchivo) return '';
    const urlArchivo = resolverUrlArchivo(rutaArchivo);
    if (/\.(png|jpg|jpeg|gif|webp)$/i.test(rutaArchivo)) {
        return `<p class="mensaje-archivo"><a class="mensaje-imagen-preview" data-image-url="${urlArchivo}" href="${urlArchivo}" target="_blank"><img src="${urlArchivo}" alt="Adjunto"></a></p>`;
    }
    return `<p class="mensaje-archivo"><a href="${urlArchivo}" target="_blank">Ver archivo</a></p>`;
}

function estadoMensajeTexto(msg) {
    if (msg.status === 'read') return 'Leido';
    if (msg.status === 'delivered') return 'Entregado';
    return 'Enviado';
}

function construirEstadoMensaje(msg) {
    if (!msg || !msg.status) return '';
    const claseEstado = msg.status === 'read'
        ? 'read'
        : msg.status === 'delivered'
            ? 'delivered'
            : 'sent';
    const checks = msg.status === 'sent' ? '✓' : '✓✓';
    const descripcion = estadoMensajeTexto(msg);
    return `<p class="mensaje-estado" title="${descripcion}"><span class="mensaje-check ${claseEstado}">${checks}</span></p>`;
}

async function peticionJSON(base, ruta, opciones = {}) {
    const suppressError = opciones.suppressError === true;
    const requestUrl = construirUrl(base, ruta);
    
    try {
        const includeAuth = opciones.includeAuth !== false;
        const headers = includeAuth
            ? construirHeaders(opciones.headers || {})
            : { ...(opciones.headers || {}) };
            
        const { includeAuth: _unused, suppressError: _unusedSuppress, ...fetchOptions } = opciones;
        
        const respuesta = await fetch(requestUrl, { ...fetchOptions, headers });
        const responseText = await respuesta.text();
        let datos = {};

        if (responseText) {
            try {
                datos = JSON.parse(responseText);
            } catch {
                datos = {};
            }
        }
        
        if (!respuesta.ok) {
            const statusLabel = `HTTP ${respuesta.status} ${respuesta.statusText}`;
            const errorMessage = (typeof datos.error === 'string' && datos.error) ? datos.error : statusLabel;
            const requestError = new Error(errorMessage);
            requestError.status = respuesta.status;
            requestError.responseSnippet = responseText.slice(0, 160);
            throw requestError;
        }

        if (!responseText) {
            return {};
        }

        if (Object.keys(datos).length === 0) {
            throw new Error('Respuesta no JSON del servidor');
        }

        return datos;
    } catch (error) {
        const errorType = error?.name || typeof error;
        console.error(`Error en peticionJSON [${errorType}] URL: ${requestUrl}`, {
            method: opciones.method || 'GET',
            status: error?.status,
            message: error?.message,
            responseSnippet: error?.responseSnippet,
            error
        });
        if (!suppressError) {
            mostrarAlerta(error.message);
        }
        throw error;
    }
}
async function subirArchivo(archivo) {
    const formData = new FormData();
    formData.append('file', archivo);
    const respuesta = await fetch(construirUrl(FILE_API_BASE, '/api/upload'), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` },
        body: formData
    });
    if (!respuesta.ok) throw new Error('Error al subir archivo');
    const datos = await respuesta.json();
    return datos.file_url;
}

// Lógica de Grupos
async function cargarGrupos() {
    const datos = await peticionJSON(CHAT_API_BASE, '/api/groups');
    listaGrupos.innerHTML = '';
    if (datos.groups.length === 0) {
        listaGrupos.innerHTML = '<p>No estás en ningún grupo aún.</p>';
    } else {
        datos.groups.forEach(grupo => {
            const item = document.createElement('div');
            item.className = 'lista-grupos-item';
            item.innerHTML = `
                <h3>${grupo.name}</h3>
                <p class="texto-pequeno">Admin: ${grupo.admin_username || 'N/A'}</p>
                <div class="grupo-acciones">
                    <button class="boton-secundario accion-abrir-chat" data-id="${grupo.id}">Abrir chat</button>
                    ${esMismoId(grupo.admin_id, usuarioActualId) ? `<button class="boton-secundario accion-editar-grupo" data-edit-id="${grupo.id}">Editar</button>` : ''}
                    ${esMismoId(grupo.admin_id, usuarioActualId) ? `<button class="boton-secundario accion-eliminar-grupo" data-delete-id="${grupo.id}">Eliminar</button>` : ''}
                </div>`;
            item.querySelector('[data-id]')?.addEventListener('click', () => abrirGrupo(grupo));
            item.querySelector('[data-edit-id]')?.addEventListener('click', () => editarGrupo(grupo));
            item.querySelector('[data-delete-id]')?.addEventListener('click', () => eliminarGrupo(grupo));
            listaGrupos.appendChild(item);
        });
    }
}

async function crearGrupo() {
    const name = inputNuevoGrupo?.value.trim();
    if (!name) {
        mostrarAlerta('Ingresa un nombre de grupo.');
        return;
    }

    await peticionJSON(CHAT_API_BASE, '/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });

    inputNuevoGrupo.value = '';
    await cargarGrupos();
    mostrarAlerta('Grupo creado.');
}

async function editarGrupo(grupo) {
    const nuevoNombre = prompt('Nuevo nombre del grupo:', grupo.name);
    if (!nuevoNombre) return;

    await peticionJSON(CHAT_API_BASE, `/api/groups/${grupo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nuevoNombre.trim() })
    });

    if (grupoActivo && grupoActivo.id === grupo.id) {
        grupoActivo.name = nuevoNombre.trim();
        tituloGrupo.textContent = `Chat: ${grupoActivo.name}`;
    }
    await cargarGrupos();
    mostrarAlerta('Grupo actualizado.');
}

async function eliminarGrupo(grupo) {
    if (!confirm(`¿Eliminar el grupo ${grupo.name}?`)) return;

    await peticionJSON(CHAT_API_BASE, `/api/groups/${grupo.id}`, {
        method: 'DELETE'
    });

    if (grupoActivo && grupoActivo.id === grupo.id) {
        grupoActivo = null;
        if (intervaloMensajes) {
            clearInterval(intervaloMensajes);
            intervaloMensajes = null;
        }
        mostrarSeccionGrupos();
    }

    await cargarGrupos();
    mostrarAlerta('Grupo eliminado.');
}

async function eliminarMiembroGrupo(memberId) {
    if (!grupoActivo) return;
    const memberIdNumber = Number(memberId);
    if (!Number.isFinite(memberIdNumber)) {
        mostrarAlerta('Id de miembro inválido.');
        return;
    }
    
    try {
        await peticionJSON(CHAT_API_BASE, `/api/groups/${grupoActivo.id}/members/${memberIdNumber}`, {
            method: 'DELETE'
        });
        await cargarMiembrosGrupo();
        mostrarAlerta('Miembro eliminado del grupo.');
    } catch (e) {
        mostrarAlerta('Error al eliminar miembro.');
    }
}

async function cargarMiembrosGrupo() {
    if (!grupoActivo) return;

    const datos = await peticionJSON(CHAT_API_BASE, `/api/groups/${grupoActivo.id}/members`);
    if (!Array.isArray(datos.members) || datos.members.length === 0) {
        infoMiembros.innerHTML = '<p>Sin miembros.</p>';
        return;
    }

    const esAdmin = esMismoId(grupoActivo.admin_id, usuarioActualId);
    if (inputNuevoMiembro) inputNuevoMiembro.disabled = !esAdmin;
    if (botonAgregarMiembro) botonAgregarMiembro.disabled = !esAdmin;
    if (inputNuevoMiembro) {
        inputNuevoMiembro.placeholder = esAdmin
            ? 'Agregar miembro por usuario'
            : 'Solo el administrador puede gestionar miembros';
    }

    infoMiembros.innerHTML = '<div class="miembros-lista">' + datos.members
        .map((member) => {
            const botonEliminar = esAdmin && !esMismoId(member.id, usuarioActualId)
                ? `<button class="boton-eliminar-miembro" data-member-id="${member.id}" data-member-username="${member.username}">Eliminar</button>` 
                : '';
            return `<div class="miembro-item" data-member-id="${member.id}"><span class="miembro-nombre">${member.username}</span>${formatearPresencia(member.online)}${botonEliminar}</div>`;
        })
        .join('') + '</div>';
    
    // Agregar listeners para botones de eliminar
    infoMiembros.querySelectorAll('.boton-eliminar-miembro').forEach(btn => {
        btn.addEventListener('click', () => {
            const memberId = btn.dataset.memberId;
            const memberUsername = btn.dataset.memberUsername;
            if (confirm(`¿Eliminar a ${memberUsername} del grupo?`)) {
                eliminarMiembroGrupo(memberId).catch(() => {});
            }
        });
    });
}

async function cargarContactos() {
    const datos = await peticionJSON(CHAT_API_BASE, '/api/contacts');
    listaContactos.innerHTML = '';

    if (!Array.isArray(datos.contacts) || datos.contacts.length === 0) {
        listaContactos.innerHTML = '<p>No tienes contactos aún.</p>';
        return;
    }

    datos.contacts.forEach(contacto => {
        const item = document.createElement('div');
        item.className = 'lista-grupos-item';
        item.dataset.contactId = String(contacto.id);
        item.innerHTML = `
            <h3>${contacto.username}</h3>
            <p class="texto-pequeno contacto-presencia">${formatearPresencia(contacto.online)}</p>
            <div class="grupo-acciones">
                <button class="boton-secundario accion-chat-privado" data-contact-id="${contacto.id}">Chat privado</button>
            </div>
        `;
        item.querySelector('[data-contact-id]')?.addEventListener('click', () => abrirChatPrivado(contacto));
        listaContactos.appendChild(item);
    });
}

async function agregarContacto() {
    const username = inputNuevoContacto?.value.trim();
    if (!username) {
        mostrarAlerta('Ingresa un usuario para agregar contacto.');
        return;
    }

    await peticionJSON(CHAT_API_BASE, '/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
    });

    inputNuevoContacto.value = '';
    await cargarContactos();
    mostrarAlerta('Contacto agregado.');
}

async function abrirGrupo(grupo) {
    grupoActivo = grupo;
    tipoConversacion = 'group';
    ultimoMensajeId = null;
    ultimaFirmaMensajesGrupo = '';
    mostrarSeccionChat();
    tituloGrupo.textContent = `Chat: ${grupo.name}`;
    administradorGrupo.textContent = `Administrador: ${grupo.admin_username || 'N/A'}`;
    if (intervaloMensajes) clearInterval(intervaloMensajes);
    await cargarMiembrosGrupo();
    await cargarMensajes();
    intervaloMensajes = setInterval(cargarMensajes, 2000);
}

async function cargarMensajes() {
    if (!grupoActivo) return;
    const datos = await peticionJSON(CHAT_API_BASE, `/api/groups/${grupoActivo.id}/messages`);
    const firmaMensajes = obtenerFirmaMensajes(datos.messages);
    if (firmaMensajes === ultimaFirmaMensajesGrupo) return;
    ultimaFirmaMensajesGrupo = firmaMensajes;
    const scrollAlFinal = estaEnElFondo(mensajesContenedor);
    mensajesContenedor.innerHTML = '';

    const pendientesEntrega = [];
    const pendientesLectura = [];
    
    datos.messages.forEach(msg => {
        if (msg.user_id !== usuarioActualId) {
            if (msg.status === 'sent') pendientesEntrega.push(msg.id);
            if (msg.status !== 'read') pendientesLectura.push(msg.id);
        }

        const item = document.createElement('div');
        item.className = `mensaje-item ${esMismoId(msg.user_id, usuarioActualId) ? 'mensaje-enviado' : 'mensaje-recibido'}`;
        item.innerHTML = `<strong>${msg.username}</strong><p>${msg.content || ''}</p>${construirPrevisualizacionArchivo(msg.file_url)}${esMismoId(msg.user_id, usuarioActualId) ? construirEstadoMensaje(msg) : ''}`;
        mensajesContenedor.appendChild(item);
    });

    for (const messageId of pendientesEntrega) {
        peticionJSON(CHAT_API_BASE, `/api/messages/${messageId}/delivered`, { method: 'PUT', suppressError: true })
            .catch(() => {});
    }

    if (pendientesLectura.length > 0) {
        peticionJSON(CHAT_API_BASE, '/api/messages/read', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group_id: grupoActivo.id }),
            suppressError: true
        }).catch(() => {});
    }

    if (scrollAlFinal) scrollHaciaAbajo(true, mensajesContenedor);
}

async function enviarMensaje(event) {
    event.preventDefault();
    if (!grupoActivo) return;
    const content = inputMensajeTexto.value.trim();
    const file = inputMensajeArchivo.files[0];
    let file_url = file ? await subirArchivo(file) : '';

    await peticionJSON(CHAT_API_BASE, '/api/messages', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ group_id: grupoActivo.id, content, file_url })
    });
    
    inputMensajeTexto.value = '';
    inputMensajeArchivo.value = null;
    await cargarMensajes();
}

async function agregarMiembroGrupo() {
    if (!grupoActivo) {
        mostrarAlerta('Abre un grupo primero.');
        return;
    }

    const username = inputNuevoMiembro?.value.trim();
    if (!username) {
        mostrarAlerta('Ingresa un usuario para agregar.');
        return;
    }

    await peticionJSON(CHAT_API_BASE, `/api/groups/${grupoActivo.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
    });

    inputNuevoMiembro.value = '';
    await cargarMiembrosGrupo();
    mostrarAlerta('Miembro agregado.');
}

async function abrirChatPrivado(contacto) {
    contactoActivo = contacto;
    tipoConversacion = 'private';
    ultimoMensajePrivadoId = null;
    ultimaFirmaMensajesPrivados = '';
    tituloContacto.textContent = `Chat con ${contacto.username}`;
    estadoContacto.textContent = estadoPresenciaTexto(contacto.online);
    mostrarSeccionChatPrivado();

    if (intervaloMensajes) {
        clearInterval(intervaloMensajes);
    }

    await cargarMensajesPrivados();
    intervaloMensajes = setInterval(cargarMensajesPrivados, 2000);
}

async function cargarMensajesPrivados() {
    if (!contactoActivo) return;

    const datos = await peticionJSON(CHAT_API_BASE, `/api/direct-messages/${contactoActivo.id}`);
    const firmaMensajes = obtenerFirmaMensajes(datos.messages);
    if (firmaMensajes === ultimaFirmaMensajesPrivados) return;
    ultimaFirmaMensajesPrivados = firmaMensajes;
    const scrollAlFinal = estaEnElFondo(mensajesPrivadosContenedor);
    mensajesPrivadosContenedor.innerHTML = '';

    const pendientesEntrega = [];
    let hayPendientesLectura = false;

    datos.messages.forEach(msg => {
        if (msg.sender_id !== usuarioActualId) {
            if (msg.status === 'sent') pendientesEntrega.push(msg.id);
            if (msg.status !== 'read') hayPendientesLectura = true;
        }

        const item = document.createElement('div');
        item.className = `mensaje-item ${esMismoId(msg.sender_id, usuarioActualId) ? 'mensaje-enviado' : 'mensaje-recibido'}`;
        item.innerHTML = `<strong>${msg.username}</strong><p>${msg.content || ''}</p>${construirPrevisualizacionArchivo(msg.file_url)}${esMismoId(msg.sender_id, usuarioActualId) ? construirEstadoMensaje(msg) : ''}`;
        mensajesPrivadosContenedor.appendChild(item);
    });

    for (const messageId of pendientesEntrega) {
        peticionJSON(CHAT_API_BASE, `/api/direct-messages/${messageId}/delivered`, { method: 'PUT', suppressError: true })
            .catch(() => {});
    }

    if (hayPendientesLectura) {
        peticionJSON(CHAT_API_BASE, '/api/direct-messages/read', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contact_id: contactoActivo.id }),
            suppressError: true
        }).catch(() => {});
    }

    if (scrollAlFinal) scrollHaciaAbajo(true, mensajesPrivadosContenedor);
}

async function enviarMensajePrivado(event) {
    event.preventDefault();
    if (!contactoActivo) return;

    const content = inputMensajePrivadoTexto.value.trim();
    const file = inputMensajePrivadoArchivo.files[0];
    const file_url = file ? await subirArchivo(file) : '';

    await peticionJSON(CHAT_API_BASE, '/api/direct-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiver_id: contactoActivo.id, content, file_url })
    });

    inputMensajePrivadoTexto.value = '';
    inputMensajePrivadoArchivo.value = null;
    await cargarMensajesPrivados();
}

function volverDesdeChatPrivado() {
    contactoActivo = null;
    tipoConversacion = null;
    ultimaFirmaMensajesPrivados = '';
    if (intervaloMensajes) {
        clearInterval(intervaloMensajes);
        intervaloMensajes = null;
    }
    mostrarSeccionGrupos();
    Promise.all([cargarGrupos(), cargarContactos()]).catch(() => {});
}

async function enviarHeartbeat(suppressError = true) {
    if (!accessToken) return;
    await peticionJSON(CHAT_API_BASE, '/api/presence/heartbeat', {
        method: 'POST',
        suppressError,
    });
    usuarioSesionOnline = true;
    mostrarUsuarioSesion();
}

async function marcarPresenciaOffline() {
    if (!accessToken || presenciaOfflineNotificada) return;
    presenciaOfflineNotificada = true;
    try {
        await fetch(construirUrl(CHAT_API_BASE, '/api/presence/offline'), {
            method: 'POST',
            headers: construirHeaders(),
            keepalive: true,
        });
    } catch {
        // No-op
    }
        usuarioSesionOnline = false;
        mostrarUsuarioSesion();
}

async function sincronizarEstadoPresenciaUI() {
    if (!accessToken) return;

    if (tipoConversacion === 'group' && grupoActivo) {
        const datos = await peticionJSON(CHAT_API_BASE, `/api/groups/${grupoActivo.id}/members`, { suppressError: true });
        if (!Array.isArray(datos.members)) return;
        if (!actualizarListaMiembrosPresencia(datos.members)) {
            await cargarMiembrosGrupo();
        }
        return;
    }

    if (tipoConversacion === 'private' && contactoActivo) {
        const datos = await peticionJSON(CHAT_API_BASE, '/api/contacts', { suppressError: true });
        if (!Array.isArray(datos.contacts)) return;
        const actualizado = datos.contacts.find(c => esMismoId(c.id, contactoActivo.id));
        if (actualizado) {
            contactoActivo = actualizado;
            estadoContacto.textContent = estadoPresenciaTexto(actualizado.online);
        }
        actualizarListaContactosPresencia(datos.contacts);
        return;
    }

    await Promise.all([cargarGrupos(), cargarContactos()]);
}

function detenerSincronizacionEstado() {
    if (intervaloPresencia) {
        clearInterval(intervaloPresencia);
        intervaloPresencia = null;
    }
    if (intervaloGrupos) {
        clearInterval(intervaloGrupos);
        intervaloGrupos = null;
    }
}

function iniciarSincronizacionEstado() {
    detenerSincronizacionEstado();
    presenciaOfflineNotificada = false;

    if (!accessToken) return;

    enviarHeartbeat(true).catch(() => {});
    sincronizarEstadoPresenciaUI().catch(() => {});

    intervaloPresencia = setInterval(() => {
        enviarHeartbeat(true).catch(() => {});
    }, HEARTBEAT_INTERVAL_MS);

    intervaloGrupos = setInterval(() => {
        sincronizarEstadoPresenciaUI().catch(() => {});
    }, PRESENCE_UI_REFRESH_MS);
}

// Autenticación
async function iniciarSesion(event) {
    event.preventDefault();
    const username = loginUsernameInput.value.trim();
    const password = loginPasswordInput.value;
    try {
        const datos = await peticionJSON(AUTH_API_BASE, '/api/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            includeAuth: false,
            body: JSON.stringify({username, password})
        });
        accessToken = datos.access_token;
        localStorage.setItem('access_token', accessToken);
        usuarioActual = datos.user.username;
        usuarioActualId = datos.user.id;
        usuarioSesionOnline = true;
        ultimaFirmaMensajesGrupo = '';
        ultimaFirmaMensajesPrivados = '';
        mostrarUsuarioSesion();
        mostrarSeccionGrupos();
        await Promise.all([cargarGrupos(), cargarContactos()]);
        iniciarSincronizacionEstado();
    } catch (e) {
        mostrarErrorLogin('Credenciales inválidas');
    }
}

async function registrarUsuario(event) {
    event.preventDefault();
    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value;
    await peticionJSON(AUTH_API_BASE, '/api/register', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        includeAuth: false,
        body: JSON.stringify({username, password})
    });
    mostrarAlerta('Registro exitoso');
    mostrarVistaLogin();
}

// Listeners finales
formLogin?.addEventListener('submit', iniciarSesion);
formRegistro?.addEventListener('submit', registrarUsuario);
formMensaje?.addEventListener('submit', enviarMensaje);
formMensajePrivado?.addEventListener('submit', enviarMensajePrivado);
botonCrearGrupo?.addEventListener('click', () => { crearGrupo().catch(() => {}); });
botonAgregarContacto?.addEventListener('click', () => { agregarContacto().catch(() => {}); });
botonAgregarMiembro?.addEventListener('click', () => { agregarMiembroGrupo().catch(() => {}); });
botonPrivadoRegresar?.addEventListener('click', volverDesdeChatPrivado);
inputNuevoGrupo?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        crearGrupo().catch(() => {});
    }
});
inputNuevoContacto?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        agregarContacto().catch(() => {});
    }
});
inputNuevoMiembro?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        agregarMiembroGrupo().catch(() => {});
    }
});
botonMostrarRegistro?.addEventListener('click', mostrarVistaRegistro);
botonMostrarLogin?.addEventListener('click', mostrarVistaLogin);
botonRegresar?.addEventListener('click', mostrarSeccionGrupos);
botonLogout?.addEventListener('click', async () => {
    detenerSincronizacionEstado();
    await marcarPresenciaOffline();
    localStorage.clear();
    location.reload();
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && accessToken) {
        enviarHeartbeat(true).catch(() => {});
        sincronizarEstadoPresenciaUI().catch(() => {});
    }
});

window.addEventListener('beforeunload', () => {
    marcarPresenciaOffline().catch(() => {});
});

// Inicialización
if (accessToken) {
    peticionJSON(AUTH_API_BASE, '/api/validate-token', { suppressError: true })
        .then(datos => {
            usuarioActual = datos.user.username;
            usuarioActualId = datos.user.id;
            usuarioSesionOnline = !!datos.user.online;
            ultimaFirmaMensajesGrupo = '';
            ultimaFirmaMensajesPrivados = '';
            mostrarUsuarioSesion();
            mostrarSeccionGrupos();
            Promise.all([cargarGrupos(), cargarContactos()]);
            iniciarSincronizacionEstado();
        })
        .catch(() => mostrarLoginRegistro());
} else {
    mostrarLoginRegistro();
}