# ── Metaller – Dockerfile para Back4app Containers ──────────────────────────
# Base image: Python 3.11 slim (ligera y segura para producción)
FROM python:3.11-slim

# Metadatos
LABEL maintainer="Metaller" \
      description="Metaller Vault – Flask app served with Waitress"

# Variables de entorno
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

# Directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiar primero el requirements para aprovechar la caché de capas de Docker
COPY requirements.txt .

# Instalar dependencias de Python
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el resto del código fuente
COPY . .

# Crear el directorio de datos (donde se guardan albums.json y gigs.json)
RUN mkdir -p /app/data

# Exponer el puerto que usa Waitress
EXPOSE 8080

# Comando de arranque
CMD ["python", "app.py"]
