from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv


import csv
import datetime
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time


# Carica le variabili d'ambiente
load_dotenv()

TEMPLATES_DIR = os.getenv("TEMPLATES_DIR", os.path.abspath("./templates"))
DATA_DIR = os.getenv("SHEETGENDATA_DIR", os.path.abspath("./sheetgendata"))
SPOOL_DIR = os.getenv("SHEETGENSPOOL_DIR", os.path.abspath("./sheetgenspool"))
PROCESSING_DIR = os.getenv("PROCESSING_DIR", os.path.join(SPOOL_DIR, "processing"))
ABORTED_DIR = os.getenv("ABORTED_DIR", os.path.join(SPOOL_DIR, "aborted"))
COMPLETED_DIR = os.getenv("COMPLETED_DIR", os.path.join(SPOOL_DIR, "completed"))
TMP_DIR = os.getenv("TMP_DIR", os.path.join(SPOOL_DIR, "tmp"))
MONGO_URI = os.getenv("MONGO_URI", os.getenv("MONGODB_URI", "")) # esempio: "mongodb://mongo:27017/", disable DB if blank.
DB_NAME = os.getenv("DB_NAME", "olifogli")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "scan_sheet_jobs")
RESULTS_COLLECTION_NAME = os.getenv("RESULTS_COLLECTION_NAME", "sheetgen_results")
CHECK_INTERVAL = int(os.getenv("CHECK_INTERVAL", 10))  # Controlla nuovi file ogni N secondi
KEEP_TMP_FOLDERS = os.getenv("KEEP_TMP_FOLDERS", "") # if the variable is nonempty, keep tmp folders after generation (useful for debugging)
DEFAULT_TEMPLATE_NAME = None

os.makedirs(SPOOL_DIR, exist_ok=True)
os.makedirs(PROCESSING_DIR, exist_ok=True)
os.makedirs(ABORTED_DIR, exist_ok=True)
os.makedirs(COMPLETED_DIR, exist_ok=True)
os.makedirs(TMP_DIR, exist_ok=True)

invalid_latex_chars = re.compile(r"[#$%&_{}\~\^\\]")

class LaTeXFormatError(Exception):
    """Custom exception for invalid LaTeX lines."""
    pass

class Job:
    def __init__(self, template_name, job_id, input_path):
        self.job_id = job_id
        self.template_name = template_name
        self.input_path = input_path
        self.filename = None
        try:
            self.process()
        except Exception as e:
            print(f"Unexpected exception processing job {job_id}: {e}", flush=True, file=sys.stderr)
            self.update_status("error", f"Processing error: {str(e)}")
            self.abort()

    # Funzione per aggiornare lo stato nel database
    def update_status(self, status, message=""):
        print(f"schema: {self.template_name}, filename: {self.filename}, status: {status}, message: {message}", flush=True)
        if not MONGO_URI:
            return
        if not self.job_id:
            return 
        client = MongoClient(MONGO_URI)
        db = client[DB_NAME]
        collection = db[COLLECTION_NAME]
        now = datetime.datetime.now(datetime.timezone.utc)
        collection.update_one(
            {"filename": self.filename},
            {"$set": {
                "status": status,
                "message": message,
                "timestamp": now
            }},
        )
        client.close()

    def abort(self):
        filepath = self.input_path
        self.update_status("error", f"Generazione foglio annullata")
        os.rename(filepath, os.path.join(ABORTED_DIR, os.path.basename(filepath)))

    def completed(self):
        filepath = self.input_path
        self.update_status("completed", f"Generazione foglio completata")
        os.rename(filepath, os.path.join(COMPLETED_DIR, os.path.basename(filepath)))

    def validate_id(self, record):
        """
        get an id from the given record.
        """
        if 'id' in record:
            id = record['id']
            if not(isinstance(id, str)):
                raise TypeError(f'non-string id in line {{lineno}}')
            if len(id) != 3:
                raise ValueError(f'id without length 3 in line {{lineno}}')
            if 'id1' in record or 'id2' in record or 'id3' in record:
                raise ValueError(f'line {{lineno}} contains both "id" and separate id characters')
            id1 = id[0]
            id2 = id[1]
            id3 = id[2]
        else:
            id1 = record.get('id1', '')
            id2 = record.get('id2', '')
            id3 = record.get('id3', '')
        if (id1 and not(id1.isdigit())) or (id2 and not(id2.isdigit())) or (id3 and not(id3.isdigit())):
            raise ValueError(f'non-digit id in line {{lineno}}')

        return id1, id2, id3


    def call_latexmk(self, filepath, template_dir, dest_file_path):
        """
        call latexmk to generate a pdf file from filepath, 
        using the template in template_dir,
        and then copies it to dest_file_path
        """
        tmp_dir = os.path.join(TMP_DIR, self.job_id)
        os.makedirs(tmp_dir, exist_ok=True)
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                records = [json.loads(line) for line in f]
            mainfile = os.path.join(tmp_dir, 'main.tex')
            with open(mainfile, "w", encoding="utf-8") as f:
                f.write('\\input{header.tex}\\begin{document}\n')
                for lineno, record in enumerate(records, start=1):
                    name = record.get('name', '')                    
                    surname = record.get('surname', '')
                    if invalid_latex_chars.search(name) or invalid_latex_chars.search(surname):
                        raise ValueError(f'invalid Latex chars in name/surname in line {{lineno}}')
                    id1, id2, id3 = self.validate_id(record)
                    f.write(f'\\fogliorisp{{{name}}}{{{surname}}}{{{id1}}}{{{id2}}}{{{id3}}}\n')
                f.write('\\end{document}\n')
            cmd = ['latexmk', '-pdf', '-interaction=nonstopmode', '-quiet', 'main']
            env = os.environ.copy()
            env['TEXINPUTS'] = f"{template_dir}:{env.get('TEXINPUTS', '')}"
            try:
                subprocess.run(cmd, check=True, env=env, cwd=tmp_dir)
            except subprocess.CalledProcessError as e:
                raise RuntimeError(f"latexmk failed on file {filepath} in {tmp_dir} with exit code {e.returncode}") from e
            shutil.copy(os.path.join(tmp_dir, 'main.pdf'), dest_file_path)
        finally:
            if not(KEEP_TMP_FOLDERS):
                shutil.rmtree(tmp_dir)

    # Funzione per elaborare i file
    def process(self):
        filepath = self.input_path
        print(f"Processing {filepath}...", flush=True)
        # Aggiorna lo stato del file come "In elaborazione"
        self.update_status("processing","Acquisizione iniziata")
        

        if self.template_name is None:
            print(f"Template name is not set, and no default template is provided.", flush=True, file=sys.stderr)
            self.update_status("error", "Template name is not set")
            return self.abort()

        template_dir = os.path.join(TEMPLATES_DIR,self.template_name)
        if not os.path.exists(template_dir):
            print(f"Template directory {template_dir} does not exist.", flush=True, file=sys.stderr)
            self.update_status("error", f"Template directory {template_dir} does not exist")
            return self.abort()
        
        try:
            self.update_status("processing", "Elaborazione in corso")

            data_directory = os.path.join(DATA_DIR, self.job_id)
            os.makedirs(data_directory, exist_ok=True)
            filename_no_ext = os.path.splitext(os.path.basename(filepath))[0]
            dest_file_path = os.path.join(data_directory, filename_no_ext + '.pdf')
            self.call_latexmk(filepath, template_dir, dest_file_path)
            return self.completed()
        except Exception as e:
            print(f"Error processing {filepath}: {str(e)}", flush=True, file=sys.stderr)
            self.update_status("error", f"Processing {filepath}: {str(e)}")
            return self.abort()

# Worker principale
def worker():
    print(f"Sheet generator Worker started, monitoring spool directory {SPOOL_DIR}", flush=True)
    print(f"Using templates directory: {TEMPLATES_DIR}", flush=True)
    print(f"Using data directory: {DATA_DIR}", flush=True)
    print(f"Using processing directory: {PROCESSING_DIR}", flush=True)
    print(f"Using aborted directory: {ABORTED_DIR}", flush=True)
    print(f"Using completed directory: {COMPLETED_DIR}", flush=True)
    print(f"Using tmp directory: {TMP_DIR}", flush=True)
    print(f"MongoDB: {MONGO_URI if MONGO_URI else 'disabled'}", flush=True)

    if MONGO_URI:
        # Verifica la connessione al database MongoDB
        print(f"Checking mongodb connection: {MONGO_URI}", flush=True)
        client = MongoClient(MONGO_URI)
        db = client[DB_NAME]
        collection = db[COLLECTION_NAME]
        # Test MongoDB connection with a simple query
        collection.find_one()
        client.close()
        print(f"MongoDB connection successful", flush=True)

    while True:
        for filename in os.listdir(SPOOL_DIR):
            if filename.endswith(".jsonl"):
                filename_no_ext = os.path.splitext(os.path.basename(filename))[0]
                spool_filepath = os.path.join(SPOOL_DIR, filename)
                work_filepath = os.path.join(PROCESSING_DIR, filename) 
                try:
                    os.rename(spool_filepath, work_filepath)
                except Exception as e:
                    print(f"Failed to move {spool_filepath} to {work_filepath}: {e}", flush=True, file=sys.stderr)
                    continue
                [schema, job_id] = filename_no_ext.split('-')
                try:
                    Job(schema, job_id, work_filepath)
                except Exception as e:
                    print(f"Error processing {work_filepath}: {e}", flush=True, file=sys.stderr)
                    os.rename(work_filepath, os.path.join(ABORTED_DIR, filename))
                break
        else:
            print(f"No new files found, wait {CHECK_INTERVAL} seconds", flush=True)
            time.sleep(CHECK_INTERVAL)

if __name__ == "__main__":
    worker()
