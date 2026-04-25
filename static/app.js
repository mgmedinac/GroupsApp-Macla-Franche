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
let accessToken = localStorage.getItem('access_token');
let presenciaOfflineNotificada = false;

// Bases relativas: sin fallback a localhost cuando no hay configuración global.
const GATEWAY_BASE = (window.API_GATEWAY_BASE || '').replace(/\/$/, '');
const AUTH_API_BASE = `${GATEWAY_BASE}/auth`;
const CHAT_API_BASE = `${GATEWAY_BASE}/chat`;
const FILE_API_BASE = `${GATEWAY_BASE}/file`;

function construirUrl(base, ruta) {
    return `${base}${ruta}`;
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
        usuarioSesion.textContent = `Conectado como ${usuarioActual}`;
        usuarioSesion.classList.remove('oculto');
    } else {
        usuarioSesion.textContent = '';
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

function formatearPresencia(contacto) {
    const estado = contacto.online ? 'En línea' : 'Desconectado';
    const clase = contacto.online ? 'online' : 'offline';
    return `<span class="estado-presencia ${clase}"><span class="punto-presencia ${clase}"></span>${estado}</span>`;
}

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
                    <button class="boton-secundario" data-id="${grupo.id}">Abrir chat</button>
                    ${grupo.admin_id === usuarioActualId ? `<button class="boton-secundario" data-edit-id="${grupo.id}">Editar</button>` : ''}
                    ${grupo.admin_id === usuarioActualId ? `<button class="boton-secundario" data-delete-id="${grupo.id}">Eliminar</button>` : ''}
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
    
    try {
        await peticionJSON(CHAT_API_BASE, `/api/groups/${grupoActivo.id}/members/${memberId}`, {
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

    const esAdmin = grupoActivo.admin_id === usuarioActualId;
    infoMiembros.innerHTML = '<div class="miembros-lista">' + datos.members
        .map((member) => {
            const indicador = member.online ? '<span class="status-online">●</span>' : '<span class="status-offline">●</span>';
            const botonEliminar = esAdmin && member.id !== usuarioActualId 
                ? `<button class="boton-eliminar-miembro" data-member-id="${member.id}" data-member-username="${member.username}">Eliminar</button>` 
                : '';
            return `<div class="miembro-item">${indicador} ${member.username} ${member.online ? '(en linea)' : '(desconectado)'} ${botonEliminar}</div>`;
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
        item.innerHTML = `
            <h3>${contacto.username}</h3>
            <p class="texto-pequeno">${contacto.online ? 'En linea' : 'Desconectado'}</p>
            <div class="grupo-acciones">
                <button class="boton-secundario" data-contact-id="${contacto.id}">Chat privado</button>
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
        item.className = `mensaje-item ${msg.user_id === usuarioActualId ? 'mensaje-enviado' : 'mensaje-recibido'}`;
        item.innerHTML = `<strong>${msg.username}</strong><p>${msg.content || ''}</p>${construirPrevisualizacionArchivo(msg.file_url)}${msg.user_id === usuarioActualId ? construirEstadoMensaje(msg) : ''}`;
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
    tituloContacto.textContent = `Chat con ${contacto.username}`;
    estadoContacto.textContent = contacto.online ? 'En linea' : 'Desconectado';
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
        item.className = `mensaje-item ${msg.sender_id === usuarioActualId ? 'mensaje-enviado' : 'mensaje-recibido'}`;
        item.innerHTML = `<strong>${msg.username}</strong><p>${msg.content || ''}</p>${construirPrevisualizacionArchivo(msg.file_url)}${msg.sender_id === usuarioActualId ? construirEstadoMensaje(msg) : ''}`;
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
    if (intervaloMensajes) {
        clearInterval(intervaloMensajes);
        intervaloMensajes = null;
    }
    mostrarSeccionGrupos();
    Promise.all([cargarGrupos(), cargarContactos()]).catch(() => {});
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
        mostrarUsuarioSesion();
        mostrarSeccionGrupos();
        await Promise.all([cargarGrupos(), cargarContactos()]);
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
botonLogout?.addEventListener('click', () => {
    localStorage.clear();
    location.reload();
});

// Inicialización
if (accessToken) {
    peticionJSON(AUTH_API_BASE, '/api/validate-token', { suppressError: true })
        .then(datos => {
            usuarioActual = datos.user.username;
            usuarioActualId = datos.user.id;
            mostrarSeccionGrupos();
            Promise.all([cargarGrupos(), cargarContactos()]);
        })
        .catch(() => mostrarLoginRegistro());
} else {
    mostrarLoginRegistro();
}