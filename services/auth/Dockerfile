FROM python:3.11-alpine

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

EXPOSE 8001

ENV JWT_ALGORITHM=HS256
ENV JWT_EXP_MINUTES=120

CMD ["python", "app.py"]
