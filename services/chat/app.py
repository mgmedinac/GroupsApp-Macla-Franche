import os
from datetime import datetime
from functools import wraps

import psycopg2
import requests
from flask import Flask, g, jsonify, request
from flask_cors import CORS
from psycopg2.extras import RealDictCursor


app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": os.getenv('CORS_ORIGINS', '*').split(',')}})

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_DSN = os.getenv(
	'DB_DSN',
	'postgresql://chat_user:chat_pass@localhost:5432/chat_db?sslmode=disable',
)
AUTH_SERVICE_URL = os.getenv('AUTH_SERVICE_URL', 'http://localhost:8001')


def env_bool(name, default=False):
	value = os.getenv(name)
	if value is None:
		return default
	return value.strip().lower() in {'1', 'true', 'yes', 'on'}


def get_db_connection():
	return psycopg2.connect(DB_DSN)


def init_db():
	connection = get_db_connection()
	cursor = connection.cursor()

	cursor.execute(
		'''
		CREATE TABLE IF NOT EXISTS groups (
			id BIGSERIAL PRIMARY KEY,
			name TEXT NOT NULL,
			admin_id INTEGER NOT NULL,
			created_at TIMESTAMPTZ NOT NULL
		)
		'''
	)
	cursor.execute(
		'''
		CREATE TABLE IF NOT EXISTS group_members (
			group_id INTEGER NOT NULL,
			user_id INTEGER NOT NULL,
			joined_at TIMESTAMPTZ NOT NULL,
			PRIMARY KEY (group_id, user_id),
			FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE
		)
		'''
	)
	cursor.execute(
		'''
		CREATE TABLE IF NOT EXISTS messages (
			id BIGSERIAL PRIMARY KEY,
			group_id INTEGER NOT NULL,
			user_id INTEGER NOT NULL,
			content TEXT,
			file_url TEXT,
			created_at TIMESTAMPTZ NOT NULL,
			is_read BOOLEAN NOT NULL DEFAULT FALSE,
			status TEXT NOT NULL DEFAULT 'sent',
			delivered_at TIMESTAMPTZ,
			read_at TIMESTAMPTZ,
			FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE
		)
		'''
	)
	cursor.execute(
		'''
		CREATE TABLE IF NOT EXISTS contacts (
			user_id INTEGER NOT NULL,
			contact_user_id INTEGER NOT NULL,
			created_at TIMESTAMPTZ NOT NULL,
			PRIMARY KEY (user_id, contact_user_id)
		)
		'''
	)
	cursor.execute(
		'''
		CREATE TABLE IF NOT EXISTS direct_messages (
			id BIGSERIAL PRIMARY KEY,
			sender_id INTEGER NOT NULL,
			receiver_id INTEGER NOT NULL,
			content TEXT,
			file_url TEXT,
			created_at TIMESTAMPTZ NOT NULL,
			is_read BOOLEAN NOT NULL DEFAULT FALSE,
			status TEXT NOT NULL DEFAULT 'sent',
			delivered_at TIMESTAMPTZ,
			read_at TIMESTAMPTZ
		)
		'''
	)

	connection.commit()
	connection.close()


def serialize_datetime(value):
	if isinstance(value, datetime):
		return value.isoformat()
	return value


def validate_token_with_auth_service(auth_header):
	try:
		response = requests.get(
			f'{AUTH_SERVICE_URL}/api/validate-token',
			headers={'Authorization': auth_header},
			timeout=3,
		)
	except requests.RequestException:
		return None

	if response.status_code != 200:
		return None

	payload = response.json()
	user = payload.get('user')
	if not isinstance(user, dict):
		return None

	if 'id' not in user:
		return None

	return user


def get_user_by_id_from_auth_service(user_id):
	try:
		response = requests.get(
			f'{AUTH_SERVICE_URL}/api/users/{user_id}',
			timeout=3,
		)
	except requests.RequestException:
		return None

	if response.status_code != 200:
		return None

	payload = response.json()
	return payload.get('user')


def get_user_by_username_from_auth_service(username):
	try:
		response = requests.get(
			f'{AUTH_SERVICE_URL}/api/users/by-username',
			params={'username': username},
			timeout=3,
		)
	except requests.RequestException:
		return None

	if response.status_code != 200:
		return None

	payload = response.json()
	return payload.get('user')


def get_users_map_from_auth_service(user_ids):
	if not user_ids:
		return {}

	try:
		response = requests.get(
			f'{AUTH_SERVICE_URL}/api/users',
			params={'ids': ','.join(str(item) for item in sorted(set(user_ids)))},
			timeout=3,
		)
	except requests.RequestException:
		return {}

	if response.status_code != 200:
		return {}

	users = response.json().get('users', [])
	return {user['id']: user for user in users if isinstance(user, dict) and 'id' in user}


def require_auth(handler):
	@wraps(handler)
	def wrapper(*args, **kwargs):
		auth_header = request.headers.get('Authorization', '').strip()
		if not auth_header.startswith('Bearer '):
			return jsonify({'error': 'Token requerido en Authorization Bearer.'}), 401

		user = validate_token_with_auth_service(auth_header)
		if user is None:
			return jsonify({'error': 'Token inválido o auth-service no disponible.'}), 401

		g.current_user = user
		return handler(*args, **kwargs)

	return wrapper


def is_group_member(group_id, user_id):
	connection = get_db_connection()
	cursor = connection.cursor(cursor_factory=RealDictCursor)
	cursor.execute(
		'SELECT 1 FROM group_members WHERE group_id = %s AND user_id = %s',
		(group_id, user_id),
	)
	found = cursor.fetchone() is not None
	connection.close()
	return found


def is_group_admin(group_id, user_id):
	connection = get_db_connection()
	cursor = connection.cursor(cursor_factory=RealDictCursor)
	cursor.execute('SELECT admin_id FROM groups WHERE id = %s', (group_id,))
	row = cursor.fetchone()
	connection.close()
	return row is not None and row['admin_id'] == user_id


def is_contact(user_id, contact_user_id):
	connection = get_db_connection()
	cursor = connection.cursor(cursor_factory=RealDictCursor)
	cursor.execute(
		'SELECT 1 FROM contacts WHERE user_id = %s AND contact_user_id = %s',
		(user_id, contact_user_id),
	)
	found = cursor.fetchone() is not None
	connection.close()
	return found


@app.route('/health', methods=['GET'])
def health():
	return jsonify({'status': 'ok', 'service': 'chat-service'})


@app.route('/', methods=['GET'])
def root():
	return jsonify({'service': 'chat-service', 'status': 'ok'})


@app.route('/favicon.ico', methods=['GET'])
@app.route('/apple-touch-icon.png', methods=['GET'])
@app.route('/apple-touch-icon-precomposed.png', methods=['GET'])
def no_icon():
	return ('', 204)


@app.route('/api/groups', methods=['POST'])
@require_auth
def create_group():
	data = request.get_json(silent=True) or {}
	name = data.get('name', '').strip()
	user = g.current_user

	if not name:
		return jsonify({'error': 'El nombre del grupo es obligatorio.'}), 400

	connection = get_db_connection()
	cursor = connection.cursor(cursor_factory=RealDictCursor)
	now = datetime.utcnow()
	cursor.execute(
		'INSERT INTO groups (name, admin_id, created_at) VALUES (%s, %s, %s) RETURNING id',
		(name, user['id'], now),
	)
	group_id = cursor.fetchone()['id']
	cursor.execute(
		'INSERT INTO group_members (group_id, user_id, joined_at) VALUES (%s, %s, %s)',
		(group_id, user['id'], now),
	)
	connection.commit()
	connection.close()

	return jsonify({'mensaje': 'Grupo creado.', 'group_id': group_id}), 201


@app.route('/api/groups', methods=['GET'])
@require_auth
def list_groups():
	user = g.current_user
	connection = get_db_connection()
	cursor = connection.cursor(cursor_factory=RealDictCursor)
	cursor.execute(
		'''
		SELECT g.id, g.name, g.admin_id, g.created_at
		FROM groups g
		JOIN group_members gm ON gm.group_id = g.id
		WHERE gm.user_id = %s
		ORDER BY g.created_at DESC
		''',
		(user['id'],),
	)
	rows = cursor.fetchall()
	connection.close()
	admins_map = get_users_map_from_auth_service([row['admin_id'] for row in rows])

	groups = [
		{
			'id': row['id'],
			'name': row['name'],
			'admin_id': row['admin_id'],
			'admin_username': admins_map.get(row['admin_id'], {}).get('username', f'user-{row["admin_id"]}'),
			'created_at': serialize_datetime(row['created_at']),
		}
		for row in rows
	]
	return jsonify({'groups': groups})


@app.route('/api/groups/<int:group_id>', methods=['PUT'])
@require_auth
def update_group(group_id):
	data = request.get_json(silent=True) or {}
	name = data.get('name', '').strip()
	user = g.current_user

	if not name:
		return jsonify({'error': 'El nombre del grupo es obligatorio.'}), 400

	if not is_group_admin(group_id, user['id']):
		return jsonify({'error': 'Solo el administrador puede editar el grupo.'}), 403

	connection = get_db_connection()
	cursor = connection.cursor(cursor_factory=RealDictCursor)
	cursor.execute('UPDATE groups SET name = %s WHERE id = %s', (name, group_id))
	updated = cursor.rowcount
	connection.commit()
	connection.close()

	if updated == 0:
		return jsonify({'error': 'Grupo no encontrado.'}), 404
	return jsonify({'mensaje': 'Nombre de grupo actualizado.'})


@app.route('/api/groups/<int:group_id>', methods=['DELETE'])
@require_auth
def delete_group(group_id):
	user = g.current_user
	if not is_group_admin(group_id, user['id']):
		return jsonify({'error': 'Solo el administrador puede eliminar el grupo.'}), 403

	connection = get_db_connection()
	cursor = connection.cursor(cursor_factory=RealDictCursor)
	cursor.execute('DELETE FROM groups WHERE id = %s', (group_id,))
	deleted = cursor.rowcount
	connection.commit()
	connection.close()

	if deleted == 0:
		return jsonify({'error': 'Grupo no encontrado.'}), 404
	return jsonify({'mensaje': 'Grupo eliminado.'})


@app.route('/api/groups/<int:group_id>/members', methods=['POST'])
@require_auth
def add_group_member(group_id):
	data = request.get_json(silent=True) or {}
	member_user_id = data.get('user_id')
	member_username = data.get('username', '').strip()
	user = g.current_user

	if member_user_id is None and not member_username:
		return jsonify({'error': 'user_id o username es obligatorio.'}), 400

	if member_user_id is not None and not isinstance(member_user_id, int):
		return jsonify({'error': 'user_id debe ser int.'}), 400

	if member_user_id is None:
		member_user = get_user_by_username_from_auth_service(member_username)
		if member_user is None:
			return jsonify({'error': 'Usuario no encontrado.'}), 404
		member_user_id = member_user['id']

	if not is_group_admin(group_id, user['id']):
		return jsonify({'error': 'Solo el administrador puede agregar miembros.'}), 403

	connection = get_db_connection()
	cursor = connection.cursor(cursor_factory=RealDictCursor)
	cursor.execute('SELECT id FROM groups WHERE id = %s', (group_id,))
	group_row = cursor.fetchone()
	if group_row is None:
		connection.close()
		return jsonify({'error': 'Grupo no encontrado.'}), 404

	cursor.execute(
		'INSERT INTO group_members (group_id, user_id, joined_at) VALUES (%s, %s, %s) ON CONFLICT (group_id, user_id) DO NOTHING',
		(group_id, member_user_id, datetime.utcnow()),
	)
	connection.commit()
	connection.close()

	return jsonify({'mensaje': 'Miembro agregado.'}), 201


@app.route('/api/groups/<int:group_id>/members', methods=['GET'])
@require_auth
def list_group_members(group_id):
	user = g.current_user

	if not is_group_member(group_id, user['id']):
		return jsonify({'error': 'No autorizado para ver miembros.'}), 403

	connection = get_db_connection()
	cursor = connection.cursor(cursor_factory=RealDictCursor)
	cursor.execute(
		'''
		SELECT user_id, joined_at
		FROM group_members
		WHERE group_id = %s
		ORDER BY joined_at ASC
		''',
		(group_id,),
	)
	rows = cursor.fetchall()
	connection.close()
	users_map = get_users_map_from_auth_service([row['user_id'] for row in rows])

	members = [
		{
			'id': row['user_id'],
			'user_id': row['user_id'],
			'username': users_map.get(row['user_id'], {}).get('username', f'user-{row["user_id"]}'),
			'online': users_map.get(row['user_id'], {}).get('online', False),
			'last_seen': users_map.get(row['user_id'], {}).get('last_seen'),
			'joined_at': serialize_datetime(row['joined_at']),
		}
		for row in rows
	]
	return jsonify({'members': members})


@app.route('/api/groups/<int:group_id>/members/<int:member_id>', methods=['DELETE'])
@require_auth
def remove_group_member(group_id, member_id):
	user = g.current_user

	# Verify user is group admin
	if not is_group_admin(group_id, user['id']):
		return jsonify({'error': 'Solo el administrador puede eliminar miembros.'}), 403

	# Prevent admin from removing themselves
	if member_id == user['id']:
		return jsonify({'error': 'El administrador no puede eliminarse a sí mismo.'}), 400

	connection = get_db_connection()
	cursor = connection.cursor(cursor_factory=RealDictCursor)

	# Verify group exists
	cursor.execute('SELECT id FROM groups WHERE id = %s', (group_id,))
	group_row = cursor.fetchone()
	if group_row is None:
		connection.close()
		return jsonify({'error': 'Grupo no encontrado.'}), 404

	# Verify member exists in group
	cursor.execute('SELECT user_id FROM group_members WHERE group_id = %s AND user_id = %s', (group_id, member_id))
	member_row = cursor.fetchone()
	if member_row is None:
		connection.close()
		return jsonify({'error': 'Miembro no encontrado en el grupo.'}), 404

	# Remove member from group
	cursor.execute('DELETE FROM group_members WHERE group_id = %s AND user_id = %s', (group_id, member_id))
	connection.commit()
	connection.close()

	return jsonify({'mensaje': 'Miembro eliminado del grupo.'}), 200


@app.route('/api/messages', methods=['POST'])
@require_auth
def send_message():
	data = request.get_json(silent=True) or {}
	group_id = data.get('group_id')
	content = data.get('content', '').strip()
	file_url = (data.get('file_url') or '').strip() or None
	user = g.current_user

	if not isinstance(group_id, int):
		return jsonify({'error': 'group_id (int) es obligatorio.'}), 400

	if not content and not file_url:
		return jsonify({'error': 'El mensaje debe tener contenido o archivo.'}), 400

	if not is_group_member(group_id, user['id']):
		return jsonify({'error': 'No autorizado para enviar mensajes a este grupo.'}), 403

	connection = get_db_connection()
	cursor = connection.cursor(cursor_factory=RealDictCursor)
	cursor.execute(
		'''
		INSERT INTO messages (group_id, user_id, content, file_url, created_at, is_read, status)
		VALUES (%s, %s, %s, %s, %s, %s, %s)
		RETURNING id
		''',
		(group_id, user['id'], content, file_url, datetime.utcnow(), False, 'sent'),
	)
	message_id = cursor.fetchone()['id']
	connection.commit()
	connection.close()

	return jsonify({'mensaje': 'Mensaje enviado.', 'message_id': message_id, 'status': 'sent'}), 201


@app.route('/api/groups/<int:group_id>/messages', methods=['GET'])
@require_auth
def get_group_messages(group_id):
	user = g.current_user
	if not is_group_member(group_id, user['id']):
		return jsonify({'error': 'No autorizado para ver mensajes.'}), 403

	connection = get_db_connection()
	cursor = connection.cursor(cursor_factory=RealDictCursor)
	cursor.execute(
		'''
		SELECT id, group_id, user_id, content, file_url, created_at, is_read, status, delivered_at, read_at
		FROM messages
		WHERE group_id = %s
		ORDER BY created_at ASC
		''',
		(group_id,),
	)
	rows = cursor.fetchall()
	connection.close()
	users_map = get_users_map_from_auth_service([row['user_id'] for row in rows])

	messages = [
		{
			'id': row['id'],
			'group_id': row['group_id'],
			'user_id': row['user_id'],
			'content': row['content'],
			'file_url': row['file_url'],
			'created_at': serialize_datetime(row['created_at']),
			'is_read': bool(row['is_read']),
			'status': row['status'],
			'username': users_map.get(row['user_id'], {}).get('username', f'user-{row["user_id"]}'),
			'delivered_at': serialize_datetime(row['delivered_at']),
			'read_at': serialize_datetime(row['read_at']),
		}
		for row in rows
	]
	return jsonify({'messages': messages})


@app.route('/api/messages/<int:message_id>/delivered', methods=['PUT'])
@require_auth
def mark_message_delivered(message_id):
	connection = get_db_connection()
	cursor = connection.cursor(cursor_factory=RealDictCursor)
	cursor.execute(
		"""
		UPDATE messages
		SET status = 'delivered', delivered_at = %s
		WHERE id = %s AND status = 'sent'
		""",
		(datetime.utcnow(), message_id),
	)
	updated = cursor.rowcount
	connection.commit()
	connection.close()

	if updated == 0:
		return jsonify({'error': 'Mensaje no encontrado o no actualizable.'}), 404
	return jsonify({'status': 'delivered'})


@app.route('/api/messages/<int:message_id>/read', methods=['PUT'])
@require_auth
def mark_message_read(message_id):
	user = g.current_user
	connection = get_db_connection()
	cursor = connection.cursor(cursor_factory=RealDictCursor)
	cursor.execute('SELECT group_id, user_id FROM messages WHERE id = %s', (message_id,))
	row = cursor.fetchone()

	if row is None:
		connection.close()
		return jsonify({'error': 'Mensaje no encontrado.'}), 404

	if not is_group_member(row['group_id'], user['id']):
		connection.close()
		return jsonify({'error': 'No autorizado para marcar este mensaje.'}), 403

	if row['user_id'] == user['id']:
		connection.close()
		return jsonify({'error': 'No puedes marcar tus propios mensajes como leídos.'}), 400

	cursor.execute(
		"""
		UPDATE messages
		SET status = 'read', is_read = TRUE, read_at = %s
		WHERE id = %s
		""",
		(datetime.utcnow(), message_id),
	)
	connection.commit()
	connection.close()
	return jsonify({'mensaje': 'Mensaje marcado como leído.'})


@app.route('/api/messages/read', methods=['PUT'])
@require_auth
def mark_group_messages_read():
	data = request.get_json(silent=True) or {}
	group_id = data.get('group_id')
	user = g.current_user

	if not isinstance(group_id, int):
		return jsonify({'error': 'group_id (int) es obligatorio.'}), 400

	if not is_group_member(group_id, user['id']):
		return jsonify({'error': 'No autorizado para marcar mensajes de este grupo.'}), 403

	connection = get_db_connection()
	cursor = connection.cursor(cursor_factory=RealDictCursor)
	cursor.execute(
		'''
		UPDATE messages
		SET status = 'read', is_read = TRUE, read_at = %s
		WHERE group_id = %s AND user_id != %s AND status != 'read'
		''',
		(datetime.utcnow(), group_id, user['id']),
	)
	updated = cursor.rowcount
	connection.commit()
	connection.close()

	return jsonify({'mensaje': f'{updated} mensajes marcados como leídos'})


@app.route('/api/contacts', methods=['GET', 'POST'])
@require_auth
def manage_contacts():
	user = g.current_user

	if request.method == 'GET':
		connection = get_db_connection()
		cursor = connection.cursor(cursor_factory=RealDictCursor)
		cursor.execute(
			'''
			SELECT contact_user_id, created_at
			FROM contacts
			WHERE user_id = %s
			ORDER BY created_at DESC
			''',
			(user['id'],),
		)
		rows = cursor.fetchall()
		connection.close()

		users_map = get_users_map_from_auth_service([row['contact_user_id'] for row in rows])
		contacts = [
			{
				'id': row['contact_user_id'],
				'username': users_map.get(row['contact_user_id'], {}).get('username', f'user-{row["contact_user_id"]}'),
				'online': users_map.get(row['contact_user_id'], {}).get('online', False),
				'last_seen': users_map.get(row['contact_user_id'], {}).get('last_seen'),
				'created_at': serialize_datetime(row['created_at']),
			}
			for row in rows
		]
		return jsonify({'contacts': contacts})

	data = request.get_json(silent=True) or {}
	username = data.get('username', '').strip()
	if not username:
		return jsonify({'error': 'El nombre del contacto es obligatorio.'}), 400

	contact_user = get_user_by_username_from_auth_service(username)
	if contact_user is None:
		return jsonify({'error': 'Usuario no encontrado.'}), 404

	if contact_user['id'] == user['id']:
		return jsonify({'error': 'No puedes agregarte como contacto.'}), 400

	connection = get_db_connection()
	cursor = connection.cursor(cursor_factory=RealDictCursor)
	now = datetime.utcnow()
	cursor.execute(
		'INSERT INTO contacts (user_id, contact_user_id, created_at) VALUES (%s, %s, %s) ON CONFLICT (user_id, contact_user_id) DO NOTHING',
		(user['id'], contact_user['id'], now),
	)
	cursor.execute(
		'INSERT INTO contacts (user_id, contact_user_id, created_at) VALUES (%s, %s, %s) ON CONFLICT (user_id, contact_user_id) DO NOTHING',
		(contact_user['id'], user['id'], now),
	)
	connection.commit()
	connection.close()

	return jsonify({'mensaje': 'Contacto agregado.'}), 201


@app.route('/api/contacts/<int:contact_id>', methods=['DELETE'])
@require_auth
def delete_contact(contact_id):
	user = g.current_user
	connection = get_db_connection()
	cursor = connection.cursor(cursor_factory=RealDictCursor)
	cursor.execute(
		'''
		DELETE FROM contacts
		WHERE (user_id = %s AND contact_user_id = %s)
		   OR (user_id = %s AND contact_user_id = %s)
		''',
		(user['id'], contact_id, contact_id, user['id']),
	)
	connection.commit()
	connection.close()
	return jsonify({'mensaje': 'Contacto eliminado.'})


@app.route('/api/direct-messages', methods=['POST'])
@require_auth
def send_direct_message():
	data = request.get_json(silent=True) or {}
	receiver_id = data.get('receiver_id')
	content = data.get('content', '').strip()
	file_url = (data.get('file_url') or '').strip() or None
	user = g.current_user

	if not isinstance(receiver_id, int):
		return jsonify({'error': 'receiver_id (int) es obligatorio.'}), 400

	if not content and not file_url:
		return jsonify({'error': 'El mensaje privado debe tener contenido o archivo.'}), 400

	if not is_contact(user['id'], receiver_id):
		return jsonify({'error': 'Solo puedes escribir a contactos agregados.'}), 403

	connection = get_db_connection()
	cursor = connection.cursor(cursor_factory=RealDictCursor)
	cursor.execute(
		'''
		INSERT INTO direct_messages (sender_id, receiver_id, content, file_url, created_at, is_read, status)
		VALUES (%s, %s, %s, %s, %s, %s, %s)
		RETURNING id
		''',
		(user['id'], receiver_id, content, file_url, datetime.utcnow(), False, 'sent'),
	)
	message_id = cursor.fetchone()['id']
	connection.commit()
	connection.close()

	return jsonify({'message_id': message_id, 'status': 'sent'}), 201


@app.route('/api/direct-messages/<int:contact_id>', methods=['GET'])
@require_auth
def get_direct_messages(contact_id):
	user = g.current_user

	if not is_contact(user['id'], contact_id):
		return jsonify({'error': 'Solo puedes ver mensajes de tus contactos.'}), 403

	connection = get_db_connection()
	cursor = connection.cursor(cursor_factory=RealDictCursor)
	cursor.execute(
		'''
		SELECT id, sender_id, receiver_id, content, file_url, created_at, is_read, status, delivered_at, read_at
		FROM direct_messages
		WHERE (sender_id = %s AND receiver_id = %s)
		   OR (sender_id = %s AND receiver_id = %s)
		ORDER BY created_at ASC
		''',
		(user['id'], contact_id, contact_id, user['id']),
	)
	rows = cursor.fetchall()
	connection.close()

	users_map = get_users_map_from_auth_service([row['sender_id'] for row in rows])
	messages = [
		{
			'id': row['id'],
			'sender_id': row['sender_id'],
			'receiver_id': row['receiver_id'],
			'content': row['content'],
			'file_url': row['file_url'],
			'created_at': serialize_datetime(row['created_at']),
			'is_read': bool(row['is_read']),
			'status': row['status'],
			'username': users_map.get(row['sender_id'], {}).get('username', f'user-{row["sender_id"]}'),
			'delivered_at': serialize_datetime(row['delivered_at']),
			'read_at': serialize_datetime(row['read_at']),
		}
		for row in rows
	]

	return jsonify({'messages': messages})


@app.route('/api/direct-messages/<int:message_id>/delivered', methods=['PUT'])
@require_auth
def mark_direct_message_delivered(message_id):
	connection = get_db_connection()
	cursor = connection.cursor(cursor_factory=RealDictCursor)
	cursor.execute(
		'''
		UPDATE direct_messages
		SET status = 'delivered', delivered_at = %s
		WHERE id = %s AND status = 'sent'
		''',
		(datetime.utcnow(), message_id),
	)
	updated = cursor.rowcount
	connection.commit()
	connection.close()

	if updated == 0:
		return jsonify({'error': 'Mensaje no encontrado o no actualizable.'}), 404
	return jsonify({'status': 'delivered'})


@app.route('/api/direct-messages/read', methods=['PUT'])
@require_auth
def mark_direct_messages_read():
	data = request.get_json(silent=True) or {}
	contact_id = data.get('contact_id')
	user = g.current_user

	if not isinstance(contact_id, int):
		return jsonify({'error': 'contact_id (int) es obligatorio.'}), 400

	if not is_contact(user['id'], contact_id):
		return jsonify({'error': 'Solo puedes marcar como leídos los mensajes de tus contactos.'}), 403

	connection = get_db_connection()
	cursor = connection.cursor(cursor_factory=RealDictCursor)
	cursor.execute(
		'''
		UPDATE direct_messages
		SET status = 'read', is_read = TRUE, read_at = %s
		WHERE sender_id = %s AND receiver_id = %s AND status != 'read'
		''',
		(datetime.utcnow(), contact_id, user['id']),
	)
	updated = cursor.rowcount
	connection.commit()
	connection.close()

	return jsonify({'mensaje': f'{updated} mensajes privados marcados como leídos'})


@app.route('/api/presence/heartbeat', methods=['POST'])
@require_auth
def proxy_presence_heartbeat():
	auth_header = request.headers.get('Authorization', '').strip()
	try:
		response = requests.post(
			f'{AUTH_SERVICE_URL}/api/presence/heartbeat',
			headers={'Authorization': auth_header},
			timeout=3,
		)
	except requests.RequestException:
		return jsonify({'error': 'No se pudo actualizar presencia en auth-service.'}), 503

	if response.status_code != 200:
		return jsonify({'error': 'No se pudo actualizar presencia.'}), 503

	return jsonify({'mensaje': 'Presencia actualizada.'})


@app.route('/api/presence/offline', methods=['POST'])
@require_auth
def proxy_presence_offline():
	auth_header = request.headers.get('Authorization', '').strip()
	try:
		response = requests.post(
			f'{AUTH_SERVICE_URL}/api/presence/offline',
			headers={'Authorization': auth_header},
			timeout=3,
		)
	except requests.RequestException:
		return jsonify({'error': 'No se pudo marcar presencia offline en auth-service.'}), 503

	if response.status_code != 200:
		return jsonify({'error': 'No se pudo marcar presencia offline.'}), 503

	return jsonify({'mensaje': 'Usuario marcado offline.'})


if __name__ == '__main__':
	init_db()
	app.run(host='0.0.0.0', port=8002, debug=env_bool('FLASK_DEBUG', False), use_reloader=False)
