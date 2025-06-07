# setup:
#   Devi ottenere i templates dal progetto archiomr
#   https://github.com/fph/archiomr.git
#   copia i seguenti files nella cartella worker:
#      templates/archimede/template.json
#      templates/archimede/omr_marker.jpg
#      templates/ammissione_senior/template.json
#      templates/ammissione_senior/omr_marker.jpg
#
#   export VERSION=0.2.0
# build:
#   docker build -t paolini/oliscan:latest .
#   docker tag paolini/oliscan:latest paolini/oliscan:${VERSION}
#
# push:
#   docker login
#   docker push paolini/oliscan:latest
#   docker push paolini/oliscan:${VERSION}
#
# run:
#   docker compose up

FROM python:3.12-slim

# Imposta working directory
WORKDIR /app

# Installa dipendenze di sistema necessarie in un solo layer
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    tesseract-ocr \
    poppler-utils \
    libgl1 \
    patch \
    && rm -rf /var/lib/apt/lists/*

# Installa le dipendenze Python necessarie
RUN pip install --no-cache-dir numpy opencv-python pytesseract scipy pillow matplotlib pymongo python-dotenv 
RUN pip install rich pandas dotmap jsonschema deepmerge screeninfo
RUN pip install --no-cache-dir pdf2image

# Clona il repository di OMRChecker
RUN git clone https://github.com/Udayraj123/OMRChecker.git /app/OMRChecker

# patch OMRChecker
COPY ./disconnect-OMRChecker-from-display.patch /app/patch
RUN patch -p1 -d /app/OMRChecker < /app/patch

# copy worker script
COPY ./worker.py /app/worker.py

# copy templates
COPY ./templates /app/templates

# Imposta la directory di lavoro
WORKDIR /app

# aggiungi il path di OMRChecker al PYTHONPATH
ENV PYTHONPATH=/app/OMRChecker

# Comando di default per eseguire worker.py
CMD ["python", "/app/worker.py"]
