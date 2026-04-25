import json
import os
import time
import uuid
from datetime import datetime

import pika
import requests
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename


app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": os.getenv('CORS_ORIGINS', '*').split(',')}})

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
AUTH_SERVICE_URL = os.getenv('AUTH_SERVICE_URL', 'http://auth-service:8001')

RABBITMQ_HOST = os.getenv('RABBITMQ_HOST', 'rabbitmq')
RABBITMQ_PORT = int(os.getenv('RABBITMQ_PORT', '5672'))
RABBITMQ_USER = os.getenv('RABBITMQ_USER', 'guest')
RABBITMQ_PASSWORD = os.getenv('RABBITMQ_PASSWORD', 'guest')
RABBITMQ_QUEUE = os.getenv('RABBITMQ_QUEUE', 'domain_events')
RABBITMQ_MAX_RETRIES = int(os.getenv('RABBITMQ_MAX_RETRIES', '8'))
RABBITMQ_INITIAL_BACKOFF_SECONDS = float(os.getenv('RABBITMQ_INITIAL_BACKOFF_SECONDS', '0.5'))
RABBITMQ_MAX_BACKOFF_SECONDS = float(os.getenv('RABBITMQ_MAX_BACKOFF_SECONDS', '5'))

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf', 'txt', 'docx'}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)


def env_bool(name, default=False):
	value = os.getenv(name)
	if value is None:
		return default
	return value.strip().lower() in {'1', 'true', 'yes', 'on'}


def extension_permitida(filename):
	return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


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
	if not isinstance(user, dict) or 'id' not in user:
		return None
	return user


def publish_file_uploaded_event(file_url, filename, user_id):
	event = {
		'event_type': 'file.uploaded',
		'occurred_at': datetime.utcnow().isoformat(),
		'data': {
			'file_url': file_url,
			'filename': filename,
			'user_id': user_id,
		},
	}

	credentials = pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASSWORD)
	parameters = pika.ConnectionParameters(
		host=RABBITMQ_HOST,
		port=RABBITMQ_PORT,
		credentials=credentials,
	)

	backoff = RABBITMQ_INITIAL_BACKOFF_SECONDS
	last_error = None

	for attempt in range(1, RABBITMQ_MAX_RETRIES + 1):
		connection = None
		try:
			connection = pika.BlockingConnection(parameters)
			app.logger.info(
				'Connected to RabbitMQ at %s:%s (attempt %s/%s)',
				RABBITMQ_HOST,
				RABBITMQ_PORT,
				attempt,
				RABBITMQ_MAX_RETRIES,
			)
			channel = connection.channel()
			channel.queue_declare(queue=RABBITMQ_QUEUE, durable=True)
			channel.basic_publish(
				exchange='',
				routing_key=RABBITMQ_QUEUE,
				body=json.dumps(event),
				properties=pika.BasicProperties(delivery_mode=2),
			)
			app.logger.info('Published event file.uploaded to queue %s', RABBITMQ_QUEUE)
			return
		except Exception as error:
			last_error = error
			if attempt < RABBITMQ_MAX_RETRIES:
				app.logger.warning(
					'RabbitMQ connection failed (attempt %s/%s): %s. Retrying in %.2fs',
					attempt,
					RABBITMQ_MAX_RETRIES,
					error,
					backoff,
				)
				time.sleep(backoff)
				backoff = min(backoff * 2, RABBITMQ_MAX_BACKOFF_SECONDS)
			else:
				app.logger.error(
					'RabbitMQ connection failed after %s attempts: %s',
					RABBITMQ_MAX_RETRIES,
					error,
				)
		finally:
			if connection is not None and connection.is_open:
				connection.close()

	raise RuntimeError(f'No se pudo conectar/publicar en RabbitMQ: {last_error}')


@app.route('/health', methods=['GET'])
def health():
	return jsonify({'status': 'ok', 'service': 'file-service'})


@app.route('/', methods=['GET'])
def root():
	return jsonify({'service': 'file-service', 'status': 'ok'})


@app.route('/favicon.ico', methods=['GET'])
@app.route('/apple-touch-icon.png', methods=['GET'])
@app.route('/apple-touch-icon-precomposed.png', methods=['GET'])
def no_icon():
	return ('', 204)


@app.route('/uploads/<path:filename>', methods=['GET'])
def uploaded_file(filename):
	return send_from_directory(UPLOAD_FOLDER, filename)


@app.route('/api/upload', methods=['POST'])
def upload_file():
	auth_header = request.headers.get('Authorization', '').strip()
	if not auth_header.startswith('Bearer '):
		return jsonify({'error': 'Token requerido en Authorization Bearer.'}), 401

	user = validate_token_with_auth_service(auth_header)
	if user is None:
		return jsonify({'error': 'Token inválido o auth-service no disponible.'}), 401

	if 'file' not in request.files:
		return jsonify({'error': 'No se envio ningun archivo.'}), 400

	file = request.files['file']
	if not file or file.filename == '':
		return jsonify({'error': 'Nombre de archivo invalido.'}), 400

	if not extension_permitida(file.filename):
		return jsonify({'error': 'Tipo de archivo no permitido.'}), 400

	safe_name = secure_filename(file.filename)
	unique_name = f'{uuid.uuid4().hex}_{safe_name}'
	saved_path = os.path.join(UPLOAD_FOLDER, unique_name)

	try:
		file.save(saved_path)
		file_url = f'/uploads/{unique_name}'
		publish_file_uploaded_event(file_url, unique_name, user['id'])
		return jsonify({'file_url': file_url}), 201
	except Exception:
		if os.path.exists(saved_path):
			os.remove(saved_path)
		return jsonify({'error': 'No se pudo subir el archivo o publicar el evento.'}), 500


if __name__ == '__main__':
	app.run(host='0.0.0.0', port=8003, debug=env_bool('FLASK_DEBUG', False), use_reloader=False)
