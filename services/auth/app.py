import os
from datetime import datetime, timedelta, timezone

import jwt
import psycopg2
from psycopg2.extras import RealDictCursor
from flask import Flask, jsonify, request, session
from flask_cors import CORS
from werkzeug.security import check_password_hash, generate_password_hash


app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": os.getenv('CORS_ORIGINS', '*').split(',')}})
app.secret_key = os.getenv('SECRET_KEY', 'auth_service_dev_secret')
JWT_SECRET = os.getenv('JWT_SECRET', app.secret_key)
JWT_ALGORITHM = os.getenv('JWT_ALGORITHM', 'HS256')
JWT_EXP_MINUTES = int(os.getenv('JWT_EXP_MINUTES', '120'))
PRESENCE_TIMEOUT_SECONDS = int(os.getenv('PRESENCE_TIMEOUT_SECONDS', '45'))

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_DSN = os.getenv(
	'DB_DSN',
	'postgresql://auth_user:auth_pass@localhost:5432/auth_db?sslmode=disable',
)


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
		CREATE TABLE IF NOT EXISTS users (
			id BIGSERIAL PRIMARY KEY,
			username TEXT NOT NULL UNIQUE,
			password TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL,
			online BOOLEAN NOT NULL DEFAULT FALSE,
			last_seen TIMESTAMPTZ
		)
		'''
	)

	connection.commit()
	
	cursor.execute('UPDATE users SET online = FALSE WHERE online = TRUE')
	connection.commit()
	connection.close()


def utc_now_iso():
	return datetime.now(timezone.utc).isoformat()


def parse_iso_datetime(value):
	if not value:
		return None
	if isinstance(value, datetime):
		parsed = value
		if parsed.tzinfo is None:
			parsed = parsed.replace(tzinfo=timezone.utc)
		return parsed.astimezone(timezone.utc)
	try:
		parsed = datetime.fromisoformat(value)
		if parsed.tzinfo is None:
			parsed = parsed.replace(tzinfo=timezone.utc)
		return parsed.astimezone(timezone.utc)
	except (TypeError, ValueError):
		return None


def compute_online_status(online_flag, last_seen):
	if not bool(online_flag):
		return False
	last_seen_dt = parse_iso_datetime(last_seen)
	if last_seen_dt is None:
		return False
	age = datetime.now(timezone.utc) - last_seen_dt
	return age.total_seconds() <= PRESENCE_TIMEOUT_SECONDS


def serialize_datetime(value):
	parsed = parse_iso_datetime(value)
	return parsed.isoformat() if parsed is not None else None


def expire_stale_presence():
	connection = get_db_connection()
	cursor = connection.cursor()
	cursor.execute(
		"""
		UPDATE users
		SET online = FALSE
		WHERE online = TRUE
		  AND (last_seen IS NULL OR last_seen < (NOW() - (%s * INTERVAL '1 second')))
		""",
		(PRESENCE_TIMEOUT_SECONDS,),
	)
	connection.commit()
	connection.close()


def build_access_token(user_id, username):
	now = datetime.now(timezone.utc)
	payload = {
		'sub': str(user_id),
		'user_id': user_id,
		'username': username,
		'iat': int(now.timestamp()),
		'exp': int((now + timedelta(minutes=JWT_EXP_MINUTES)).timestamp()),
	}
	return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def extract_bearer_token(auth_header):
	if not auth_header:
		return None
	auth_header = auth_header.strip()
	if not auth_header.startswith('Bearer '):
		return None
	return auth_header.split(' ', 1)[1].strip()


def user_from_token(auth_header):
	token = extract_bearer_token(auth_header)
	if not token:
		return None
	try:
		payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
		return {
			'id': payload.get('user_id'),
			'username': payload.get('username'),
		}
	except jwt.InvalidTokenError:
		return None


def update_presence(user_id, online):
	connection = get_db_connection()
	cursor = connection.cursor()
	cursor.execute(
		'UPDATE users SET online = %s, last_seen = NOW() WHERE id = %s',
		(bool(online), user_id),
	)
	connection.commit()
	connection.close()


def password_matches(stored_password, provided_password):
	try:
		if check_password_hash(stored_password, provided_password):
			return True
	except ValueError:
		pass

	return stored_password == provided_password


def get_user_by_id(user_id):
	expire_stale_presence()
	connection = get_db_connection()
	cursor = connection.cursor(cursor_factory=RealDictCursor)
	cursor.execute('SELECT id, username, online, last_seen FROM users WHERE id = %s', (user_id,))
	row = cursor.fetchone()
	connection.close()
	if row is None:
		return None
	online = compute_online_status(row['online'], row['last_seen'])
	return {
		'id': row['id'],
		'username': row['username'],
		'online': online,
		'last_seen': serialize_datetime(row['last_seen']),
	}


@app.route('/api/register', methods=['POST'])
@app.route('/register', methods=['POST'])
def register():
	connection = None
	try:
		data = request.get_json(silent=True) or {}
		username = data.get('username', '').strip()
		password = data.get('password', '')

		if not username or not isinstance(password, str) or not password:
			return jsonify({'error': 'Usuario y contraseña son obligatorios.'}), 400

		connection = get_db_connection()
		cursor = connection.cursor()
		hashed_password = generate_password_hash(password)
		cursor.execute(
			'INSERT INTO users (username, password, created_at) VALUES (%s, %s, NOW())',
			(username, hashed_password)
		)
		connection.commit()

		if request.path == '/register':
			return jsonify({'message': 'ok'}), 200

		return jsonify({'mensaje': 'Registro exitoso.'}), 201
	except psycopg2.errors.UniqueViolation:
		if connection is not None:
			connection.rollback()
		return jsonify({'error': 'El nombre de usuario ya existe.'}), 400
	except Exception:
		return jsonify({'error': 'Error interno en registro.'}), 500
	finally:
		if connection is not None:
			connection.close()


@app.route('/api/login', methods=['POST'])
@app.route('/login', methods=['POST'])
def login():
	connection = None
	try:
		data = request.get_json(silent=True) or {}
		username = data.get('username', '').strip()
		password = data.get('password', '')

		if not username or not isinstance(password, str) or not password:
			return jsonify({'error': 'Usuario y contraseña son obligatorios.'}), 400

		connection = get_db_connection()
		cursor = connection.cursor(cursor_factory=RealDictCursor)
		cursor.execute(
			'SELECT id, username, password FROM users WHERE username = %s',
			(username,)
		)
		user = cursor.fetchone()
		connection.close()
		connection = None

		if user is None or not password_matches(user['password'], password):
			if request.path == '/login':
				return jsonify({'error': 'Usuario no encontrado o contraseña incorrecta.'}), 401
			return jsonify({'error': 'Usuario no encontrado o contraseña incorrecta.'}), 401

		
		try:
			check_password_hash(user['password'], password)
		except ValueError:
			migration_connection = get_db_connection()
			migration_cursor = migration_connection.cursor()
			migration_cursor.execute(
				'UPDATE users SET password = %s WHERE id = %s',
				(generate_password_hash(password), user['id']),
			)
			migration_connection.commit()
			migration_connection.close()

		session['user_id'] = user['id']
		session['username'] = user['username']
		update_presence(user['id'], True)
		access_token = build_access_token(user['id'], user['username'])

		if request.path == '/login':
			return jsonify({'message': 'ok'}), 200

		return jsonify(
			{
				'message': 'Login exitoso',
				'mensaje': 'Inicio de sesión exitoso.',
				'user': {'id': user['id'], 'username': user['username']},
				'access_token': access_token,
				'token_type': 'Bearer',
				'expires_in': JWT_EXP_MINUTES * 60,
			}
		)
	except Exception:
		return jsonify({'error': 'Error interno en login.'}), 500
	finally:
		if connection is not None:
			connection.close()


@app.route('/api/logout', methods=['POST'])
def logout():
	current_user_id = session.get('user_id')
	if current_user_id is None:
		token_user = user_from_token(request.headers.get('Authorization', ''))
		if token_user is not None:
			current_user_id = token_user.get('id')
	if current_user_id:
		update_presence(current_user_id, False)
	session.clear()
	return jsonify({'mensaje': 'Sesión cerrada.'})


@app.route('/api/presence/offline', methods=['POST'])
def presence_offline():
	user = user_from_token(request.headers.get('Authorization', ''))
	if user is None or user.get('id') is None:
		return jsonify({'error': 'Token inválido.'}), 401

	update_presence(user['id'], False)
	return jsonify({'mensaje': 'Usuario marcado offline.'})


@app.route('/api/validate-token', methods=['GET'])
def validate_token():
	expire_stale_presence()
	token = extract_bearer_token(request.headers.get('Authorization', ''))
	if not token:
		return jsonify({'error': 'Token requerido en Authorization Bearer.'}), 401

	try:
		payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
		user_id = payload.get('user_id')
		username = payload.get('username')
		if user_id is None or not username:
			return jsonify({'error': 'Token inválido.'}), 401

		user = get_user_by_id(user_id)
		if user is None:
			return jsonify({'error': 'Usuario no encontrado.'}), 401

		return jsonify({'user': user}), 200
	except jwt.ExpiredSignatureError:
		return jsonify({'error': 'Token expirado.'}), 401
	except jwt.InvalidTokenError:
		return jsonify({'error': 'Token inválido.'}), 401


@app.route('/api/presence/heartbeat', methods=['POST'])
def presence_heartbeat():
	user = user_from_token(request.headers.get('Authorization', ''))
	if user is None or user.get('id') is None:
		return jsonify({'error': 'Token inválido.'}), 401

	update_presence(user['id'], True)
	return jsonify({'mensaje': 'Presencia actualizada.'})


@app.route('/api/users/<int:user_id>', methods=['GET'])
def get_user(user_id):
	user = get_user_by_id(user_id)
	if user is None:
		return jsonify({'error': 'Usuario no encontrado.'}), 404
	return jsonify({'user': user})


@app.route('/api/users/by-username', methods=['GET'])
def get_user_by_username():
	expire_stale_presence()
	username = request.args.get('username', '').strip()
	if not username:
		return jsonify({'error': 'username es obligatorio.'}), 400

	connection = get_db_connection()
	cursor = connection.cursor(cursor_factory=RealDictCursor)
	cursor.execute(
		'SELECT id, username, online, last_seen FROM users WHERE username = %s',
		(username,),
	)
	row = cursor.fetchone()
	connection.close()

	if row is None:
		return jsonify({'error': 'Usuario no encontrado.'}), 404

	return jsonify(
		{
			'user': {
				'id': row['id'],
				'username': row['username'],
				'online': compute_online_status(row['online'], row['last_seen']),
				'last_seen': serialize_datetime(row['last_seen']),
			}
		}
	)


@app.route('/api/users', methods=['GET'])
def get_users_batch():
	expire_stale_presence()
	ids_param = request.args.get('ids', '').strip()
	if not ids_param:
		return jsonify({'users': []})

	try:
		ids = [int(item) for item in ids_param.split(',') if item.strip()]
	except ValueError:
		return jsonify({'error': 'ids inválido.'}), 400

	if not ids:
		return jsonify({'users': []})

	connection = get_db_connection()
	cursor = connection.cursor(cursor_factory=RealDictCursor)
	cursor.execute(
		'SELECT id, username, online, last_seen FROM users WHERE id = ANY(%s)',
		(ids,),
	)
	rows = cursor.fetchall()
	connection.close()

	users = [
		{
			'id': row['id'],
			'username': row['username'],
			'online': compute_online_status(row['online'], row['last_seen']),
			'last_seen': serialize_datetime(row['last_seen']),
		}
		for row in rows
	]

	return jsonify({'users': users})


@app.route('/health', methods=['GET'])
def health():
	return jsonify({'status': 'ok', 'service': 'auth-service'})


@app.route('/', methods=['GET'])
def root():
	return jsonify({'service': 'auth-service', 'status': 'ok'})


@app.route('/favicon.ico', methods=['GET'])
@app.route('/apple-touch-icon.png', methods=['GET'])
@app.route('/apple-touch-icon-precomposed.png', methods=['GET'])
def no_icon():
	return ('', 204)


if __name__ == '__main__':
	init_db()
	app.run(host='0.0.0.0', port=8001, debug=env_bool('FLASK_DEBUG', False), use_reloader=False)
