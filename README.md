GROUPSAPP | Sistema de Mensajería Distribuida
GroupsApp es una plataforma de mensajería instantánea diseñada bajo una arquitectura de microservicios, enfocada en la alta disponibilidad, escalabilidad y tolerancia a fallos. Este proyecto fue desarrollado para la asignatura de Sistemas Distribuidos (2026-1).
+3

I. ARQUITECTURA DEL SISTEMA
El sistema se descompone en servicios especializados para garantizar el desacoplamiento y la escalabilidad independiente:

services/auth: Gestión de identidad, JWT y estado de presencia (Online/Offline).
+1

services/chat: Lógica de grupos, membresías, contactos y persistencia de mensajes.
+1

services/file: Servicio de almacenamiento y gestión de archivos multimedia.

services/web: Frontend SPA desarrollado para una experiencia de usuario fluida, servido por Nginx.

k8s/consul: Implementado como servicio de coordinación para el descubrimiento de servicios y monitoreo de salud (Health Checks).

II. PROTOCOLOS DE COMUNICACIÓN
Se implementó un modelo de comunicación híbrido para optimizar el rendimiento y la consistencia en el entorno distribuido:
+1

API REST: Interfaz principal para la comunicación entre el cliente (Frontend) y los servicios de backend.
+2

gRPC: Comunicación interna de alta eficiencia entre servicios (chat-grpc -> user-grpc) para validación de tokens y streaming.
+2

RabbitMQ (MOM): Sistema de mensajería asíncrona para el procesamiento de eventos de dominio (ej. file.uploaded), permitiendo un sistema altamente desacoplado.
+1

III. DATOS Y ALTA DISPONIBILIDAD (HA)
Para cumplir con los requerimientos de Sistemas de Datos Distribuidos:
+1

Persistencia: Uso de bases de datos relacionales con esquemas de replicación Master-Replica.

Consistencia: Gestión de transacciones distribuidas y logs de eventos para integridad de mensajes.

Infraestructura: Despliegue en Amazon EKS con Ingress Controller configurado para soporte nativo de WebSockets (Tiempo real).

IV. DESPLIEGUE
Entorno Local (Desarrollo)

Para levantar el entorno completo con Docker Compose:

Bash
docker compose up --build
Producción (AWS EKS)

Pipeline de release versionado para despliegues inmutables y multi-arquitectura:

Bash
TAG=v2026.04.24-1 AWS_REGION=us-east-1 AWS_ACCOUNT_ID=849194575776 NAMESPACE=groupsapp \
bash scripts/release_rest_stack_eks.sh
V. ENDPOINTS PRINCIPALES
Servicio	Endpoint / URL
Frontend Cloud	http://a8f5ba3903b33425eb72463a0cbc695b-8fb32456addb458e.elb.us-east-1.amazonaws.com/
Auth API	http://localhost:8001
Chat API	http://localhost:8002
RabbitMQ UI	http://localhost:15672 (guest / guest)
Consul UI	http://localhost:8500
Notas de Diseño Arquitectónico

Citas Directas: Se vincula cada componente con los requerimientos específicos del proyecto (ej. gRPC o MOM).

Contexto Técnico: Se justifica el uso de tecnologías como Consul para coordinación y gRPC para eficiencia interna.
+1

Jerarquía: Estructura organizada para facilitar la revisión de la lógica de negocio antes que la infraestructura física.