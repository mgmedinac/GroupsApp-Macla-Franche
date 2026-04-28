# GROUPSAPP | Sistema de Mensajería Distribuida

GroupsApp es una plataforma de mensajería instantánea diseñada bajo una arquitectura de microservicios, enfocada en la alta disponibilidad, escalabilidad y tolerancia a fallos. Este proyecto fue desarrollado para la asignatura de Sistemas Distribuidos (2026-1).

---

## * ARQUITECTURA DEL SISTEMA

El sistema se descompone en servicios especializados para garantizar el desacoplamiento y la escalabilidad independiente:

- **services/auth:** Gestión de identidad, JWT y estado de presencia (Online/Offline).
- **services/chat:** Lógica de grupos, membresías, contactos y persistencia de mensajes.
- **services/file:** Servicio de almacenamiento y gestión de archivos multimedia.
- **services/web:** Frontend SPA desarrollado para una experiencia de usuario fluida, servido por Nginx.
- **k8s/consul:** Implementado como servicio de coordinación para el descubrimiento de servicios y monitoreo de salud (Health Checks).

---

## * PROTOCOLOS DE COMUNICACIÓN

Se implementó un modelo de comunicación híbrido para optimizar el rendimiento y la consistencia en el entorno distribuido:

- **API REST:** Interfaz principal para la comunicación entre el cliente (Frontend) y los servicios de backend.
- **gRPC:** Comunicación interna de alta eficiencia entre servicios (chat-grpc -> user-grpc) para validación de tokens y streaming.
- **RabbitMQ (MOM):** Sistema de mensajería asíncrona para el procesamiento de eventos de dominio (ej. file.uploaded), permitiendo un sistema altamente desacoplado.

---

## * DATOS Y ALTA DISPONIBILIDAD (HA)

Para cumplir con los requerimientos de Sistemas de Datos Distribuidos:

- **Persistencia:** Uso de bases de datos relacionales con esquemas de replicación Master-Replica.
- **Consistencia:** Gestión de transacciones distribuidas y logs de eventos para integridad de mensajes.
- **Infraestructura:** Despliegue en Amazon EKS con Ingress Controller configurado para soporte nativo de WebSockets (Tiempo real).

---

## * DESPLIEGUE

### Entorno Local (Desarrollo)

Para levantar el entorno completo con Docker Compose:

```bash
docker compose up --build
```

### Producción (AWS EKS)

Pipeline de release versionado para despliegues inmutables y multi-arquitectura:

```bash
TAG=v2026.04.24-1 AWS_REGION=us-east-1 AWS_ACCOUNT_ID=849194575776 NAMESPACE=groupsapp \
bash scripts/release_rest_stack_eks.sh
```

---

## * ENDPOINTS PRINCIPALES

| Servicio | Endpoint / URL |
|----------|---|
| Frontend Cloud | http://a8f5ba3903b33425eb72463a0cbc695b-8fb32456addb458e.elb.us-east-1.amazonaws.com/ |
| Auth API | http://localhost:8001 |
| Chat API | http://localhost:8002 |
| RabbitMQ UI | http://localhost:15672 (guest / guest) |
| Consul UI | http://localhost:8500 |

---
