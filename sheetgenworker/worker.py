from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv


import csv
import datetime
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
MONGO_URI = os.getenv("MONGO_URI", "") # esempio: "mongodb://mongo:27017/", disable DB if blank.
DB_NAME = os.getenv("DB_NAME", "olifogli")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "sheetgen_jobs")
RESULTS_COLLECTION_NAME = os.getenv("RESULTS_COLLECTION_NAME", "sheetgen_results")
CHECK_INTERVAL = int(os.getenv("CHECK_INTERVAL", 10))  # Controlla nuovi file ogni N secondi
DEFAULT_TEMPLATE_NAME = None

os.makedirs(SPOOL_DIR, exist_ok=True)
os.makedirs(PROCESSING_DIR, exist_ok=True)
os.makedirs(ABORTED_DIR, exist_ok=True)
os.makedirs(COMPLETED_DIR, exist_ok=True)
os.makedirs(TMP_DIR, exist_ok=True)

file_format_pattern = re.compile(
    r'^\\fogliorisp\{([^{}\\%@]*)\}\{([^{}\\%@]*)\}\{([0-9]*)\}\{([0-9]*)\}\{([0-9]*)\}$'
)

class LaTeXFormatError(Exception):
    """Custom exception for invalid LaTeX lines."""
    pass

class Job:
    def __init__(self, template_name, job_id, input_path):
        self.job_id = job_id
        self.template_name = template_name
        self.input_path = input_path
        try:
            self.process()
        except Exception as e:
            print(f"Unexpected exception processing job {job_id}: {e}", flush=True, file=sys.stderr)
            self.update_status("error", f"Processing error: {str(e)}")
            self.abort()

    # Funzione per aggiornare lo stato nel database
    def update_status(self, status, message=""):
        print(f"schema: {self.template_name}, job_id: {self.job_id}, status: {status}, message: {message}", flush=True)
        if not MONGO_URI:
            return
        if not self.job_id:
            return 
        client = MongoClient(MONGO_URI)
        db = client[DB_NAME]
        collection = db[COLLECTION_NAME]
        now = datetime.datetime.now(datetime.timezone.utc)
        collection.update_one(
            {"_id": ObjectId(self.job_id)},
            {"$push": {
                "messages": {
                    "timestamp": now,
                    "status": status,
                    "message": message
                }
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

    def check_file_format(self):
        r"""
        Checks that the file contains only commented lines (%) or lines in the format:
        `\fogliorisp{<name>}{<surname>}{<digits>}{<digits>}{<digits>}`
        Fields 1 and 2 cannot contain { } \ % @
        Fields 3, 4, 5 must contain only digits (0-9) or be empty
        Stops at the first invalid line and returns False.
        """
        # Regex:
        # Fields 1-2: no { } \ % @
        # Fields 3-5: digits only or empty

        filepath = self.input_path
        with open(filepath, 'r', encoding='utf-8') as f:
            for lineno, line in enumerate(f, start=1):
                line = line.strip()
                if not line or line.startswith('%'):
                    continue  # ignore empty lines or comments
                if not file_format_pattern.match(line):
                    raise LaTeXFormatError(f"Invalid format in line {lineno}")
        return True

    def call_latexmk(self, filepath, template_dir, dest_file_path):
        """
        call latexmk to generate a pdf file from filepath, 
        using the template in template_dir,
        and then copies it to dest_file_path
        """
        tmp_dir = os.path.join(TMP_DIR, self.job_id)
        os.makedirs(tmp_dir, exist_ok=True)
        try:
            shutil.copy(filepath, tmp_dir)
            filename = os.path.basename(filepath)
            mainfile = os.path.join(tmp_dir, 'main.tex')
            with open(mainfile, "w", encoding="utf-8") as f:
                f.write(rf'\input{{header.tex}}\begin{{document}}\input{{{filename}}}\end{{document}}')

            cmd = ['latexmk', '-pdf', '-interaction=nonstopmode', '-quiet', 'main']
            env = os.environ.copy()
            env['TEXINPUTS'] = f"{template_dir}:{env.get('TEXINPUTS', '')}"
            try:
                subprocess.run(cmd, check=True, env=env, cwd=tmp_dir)
            except subprocess.CalledProcessError as e:
                raise RuntimeError(f"latexmk failed on file {filepath} in {tmp_dir} with exit code {e.returncode}") from e
            shutil.copy(os.path.join(tmp_dir, 'main.pdf'), dest_file_path)
        finally:            
            shutil.rmtree(tmp_dir)

    # Funzione per elaborare i file
    def process(self):
        filepath = self.input_path
        print(f"Processing {filepath}...", flush=True)
        # Aggiorna lo stato del file come "In elaborazione"
        self.update_status("starting","Acquisizione iniziata")
        

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
            self.check_file_format()

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
            if filename.endswith(".tex"):
                spool_filepath = os.path.join(SPOOL_DIR, filename)
                work_filepath = os.path.join(PROCESSING_DIR, filename) 
                try:
                    os.rename(spool_filepath, work_filepath)
                except Exception as e:
                    print(f"Failed to move {spool_filepath} to {work_filepath}: {e}", flush=True, file=sys.stderr)
                    continue
                [schema, job_id] = filename[:-4].split('-')
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
