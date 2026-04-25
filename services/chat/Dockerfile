FROM python:3.11-alpine

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

EXPOSE 8002

ENV AUTH_SERVICE_URL=http://auth-service:8001

CMD ["python", "app.py"]
