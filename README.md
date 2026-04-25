GroupsApp: Sistema de Mensajería Distribuida
GroupsApp es una plataforma de mensajería instantánea diseñada bajo una arquitectura de microservicios, enfocada en la alta disponibilidad, escalabilidad y tolerancia a fallos. Este proyecto fue desarrollado para la materia de Sistemas Distribuidos (2026-1).


Arquitectura del Sistema
El sistema se descompone en servicios especializados para garantizar el desacoplamiento y la escalabilidad independiente:

services/auth: Gestión de identidad, JWT y estado de presencia (Online/Offline).


services/chat: Lógica de grupos, membresías, contactos y persistencia de mensajes.


services/file: Servicio de almacenamiento y gestión de archivos multimedia.

services/web: Frontend SPA desarrollado para una experiencia de usuario fluida, servido por Nginx.

k8s/consul: Implementado como servicio de coordinación para el descubrimiento de servicios y monitoreo de salud (Health Checks).


Protocolos de Comunicación
Se implementó un modelo de comunicación híbrido para optimizar el rendimiento y la consistencia:


API REST: Interfaz principal para la comunicación entre el cliente (Frontend) y los servicios de backend.

gRPC: Comunicación interna de alta eficiencia entre servicios (chat-grpc -> user-grpc) para validación de tokens y streaming.


RabbitMQ (MOM): Sistema de mensajería asíncrona para el procesamiento de eventos de dominio (ej. file.uploaded), permitiendo un sistema altamente desacoplado.

Datos y Alta Disponibilidad
Para cumplir con los requerimientos de Sistemas de Datos Distribuidos:

Persistencia: Uso de bases de datos relacionales con esquemas de replicación Master-Replica.

Consistencia: Gestión de transacciones distribuidas y logs de eventos para integridad de mensajes.

Infraestructura: Despliegue en Amazon EKS con Ingress Controller configurado para soporte nativo de WebSockets (Tiempo real).

Despliegue
Local (Desarrollo)

Para levantar el entorno completo con Docker Compose:

Bash
docker compose up --build
Producción (AWS EKS)

Utilizamos un pipeline de release versionado para garantizar despliegues inmutables y multi-arquitectura:

Bash
TAG=v2026.04.24-1 AWS_REGION=us-east-1 AWS_ACCOUNT_ID=849194575776 NAMESPACE=groupsapp \
bash scripts/release_rest_stack_eks.sh
📍 Endpoints Principales
Frontend: http://localhost:8080

Auth API: http://localhost:8001

Chat API: http://localhost:8002

RabbitMQ Management: http://localhost:15672 (User/Pass: guest/guest)

Consul UI: http://localhost:8500

¿Qué mejoramos aquí?

Citas Directas: Vinculamos cada parte del código con los requerimientos del proyecto (ej. citar gRPC o MOM).

Contexto: Explicamos por qué usamos cada tecnología (Consul para coordinación, gRPC para eficiencia interna).


Jerarquía: Separamos la parte funcional de la infraestructura para que el profesor vea primero el diseño arquitectónico.