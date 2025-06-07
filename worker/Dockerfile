# build:
#   docker build -t paolini/oliscan:0.2.0 .
# push:
#   docker login
#   docker push paolini/oliscan:0.2.0

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

# Clona il repository archiomr
RUN git clone https://github.com/fph/archiomr.git /app/archiomr

# Copy only template.json and omr_marker.jpg files for each template
COPY /app/archiomr/templates/archimede/template.json /app/templates/archimede/template.json
COPY /app/archiomr/templates/archimede/omr_marker.jpg /app/templates/archimede/omr_marker.jpg
COPY /app/archiomr/templates/ammissione_senior/template.json /app/templates/ammissione_senior/template.json
COPY /app/archiomr/templates/ammissione_senior/omr_marker.jpg /app/templates/ammissione_senior/omr_marker.jpg

# remove archiomr repository
RUN rm -rf /app/archiomr

# copy worker script
COPY ./worker.py /app/worker.py

# Imposta la directory di lavoro
WORKDIR /app

# aggiungi il path di OMRChecker al PYTHONPATH
ENV PYTHONPATH=/app/OMRChecker

# Comando di default per eseguire worker.py
CMD ["python", "/app/worker.py"]
