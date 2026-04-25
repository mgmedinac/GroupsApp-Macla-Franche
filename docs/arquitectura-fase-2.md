# GroupsApp - Fase 2 de Arquitectura

## Objetivo

Evolucionar la versión actual, que funciona como una SPA educativa con Flask y SQLite, hacia una arquitectura distribuida que cubra los requisitos no funcionales del proyecto final.

## Estado actual

La implementación actual resuelve la funcionalidad base:

- Registro y autenticación de usuarios.
- Grupos, miembros y contactos.
- Mensajería grupal.
- Mensajería privada entre contactos.
- Archivos e imágenes.
- Estados de entrega y lectura.
- Presencia online/offline básica.

Lo que aún no cumple completamente es la arquitectura distribuida exigida en la consigna.

## Propuesta de microservicios

### 1. Servicio de Identidad y Presencia
Responsable de:
- Registro y login.
- Sesiones y tokenización.
- Presencia online/offline.
- Heartbeats de actividad.
- Perfil básico de usuario.

### 2. Servicio de Chat y Grupos
Responsable de:
- Creación y gestión de grupos.
- Miembros y contactos.
- Chats grupales y privados.
- Estados sent/delivered/read.
- Historial de mensajes.

### 3. Servicio de Archivos y Medios
Responsable de:
- Subida y descarga de archivos.
- Imágenes previsualizables.
- Audio o video no interactivo.
- Metadatos del archivo.

## Comunicación entre servicios

### Externa
- REST API para clientes web y móviles.

### Interna
- gRPC para consultas rápidas entre servicios.
- MOM con RabbitMQ o Kafka para eventos de dominio.

Ejemplos de eventos:
- `user.online`
- `message.sent`
- `message.delivered`
- `message.read`
- `file.uploaded`
- `group.created`

## Datos y almacenamiento

### Bases de datos
- Base de datos separada por servicio.
- PostgreSQL por servicio con credenciales y DSN aislados.
- Replicación física para `auth-db` y `chat-db` con primario y réplica.
- En Kubernetes, cada base usa su propio PVC y su propio Service interno.
- La evolución natural para chat sería sumar particionamiento por conversaciones o historial si el volumen crece.

### Archivos
- Almacenamiento distribuido o bucket S3.
- Metadatos en la base de datos y contenido binario fuera del servicio de chat.

## Coordinación

Implementación actual en Kubernetes:
- Consul (server único) desplegado en namespace `groupsapp`.
- Servicio interno `consul:8500` para descubrimiento y checks de estado.
- Persistencia con PVC dedicado para estado de coordinación.

Alternativa futura:
- etcd como sustituto equivalente.

Propósito:
- Descubrimiento de servicios.
- Health checks.
- Configuración centralizada.

## Despliegue en AWS

### Opción recomendada
- EKS para orquestación de contenedores.
- Ingress Controller con Application Load Balancer.
- Autoscaling horizontal por pods.
- Cluster autoscaler.
- Secrets Manager para credenciales.
- CloudWatch para logs y métricas.

### Alta disponibilidad
- Múltiples réplicas por servicio.
- Probes de salud.
- Balanceo de carga por ingress.
- Base de datos con réplica o servicio administrado.

## Modelo de datos de la fase distribuida

### Entidades principales
- User
- Group
- GroupMember
- Contact
- Message
- DirectMessage
- MediaFile
- PresenceEvent

### Relaciones clave
- Un usuario pertenece a varios grupos.
- Un grupo tiene un administrador y varios miembros.
- Los contactos son simétricos o consentidos según la regla elegida.
- Un mensaje puede ser grupal o privado.
- Un mensaje puede tener archivo adjunto.

## Estrategia de evolución

### Paso 1
Separar identidad/presencia del monolito actual.

### Paso 2
Mover grupos y mensajes a un servicio propio.

### Paso 3
Extraer archivos a un servicio independiente.

### Paso 4
Introducir eventos asíncronos con RabbitMQ o Kafka.

### Paso 5
Desplegar en EKS con observabilidad básica.

## Conclusión

La versión actual es una base funcional y entendible. La fase 2 convierte esa base en una arquitectura distribuida alineada con la consigna académica y con posibilidad real de despliegue en AWS.
