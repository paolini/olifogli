# setup:
#   Devi ottenere i templates dal progetto archiomr
#   https://github.com/fph/archiomr.git
#   copia nella cartella worker:
#      templates/archimede2/
#
#   export VERSION=0.2.0
# build:
#   docker build -t paolini/sheetgen:latest .
#   docker tag paolini/sheetgen:latest paolini/sheetgen:${VERSION}
#
# push:
#   docker login
#   docker push paolini/sheetgen:latest
#   docker push paolini/sheetgen:${VERSION}
#
# run:
#   docker compose up

FROM python:3.12-slim

# Imposta working directory
WORKDIR /app

# Installa dipendenze di sistema necessarie in un solo layer
# perl-tk, wget, xz-utils, gpg servono per tlmgr
RUN apt-get update && apt-get install -y --no-install-recommends \
    latexmk \
    perl-tk \
    wget \
    xz-utils \
    gpg \
    texlive-latex-base \
    && rm -rf /var/lib/apt/lists/*

# installa i pacchetti latex che ci servono senza usare i pacchetti nativi Debian (enormi)    
RUN tlmgr init-usertree && tlmgr install pgf xstring xcolor multirow

RUN pip install --no-cache-dir pymongo python-dotenv 

# copy worker script
COPY ./worker.py /app/worker.py

# copy templates
COPY ./templates /app/templates

# Imposta la directory di lavoro
WORKDIR /app

# Comando di default per eseguire worker.py
CMD ["python", "/app/worker.py"]
