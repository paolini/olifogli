import os
import time
from pymongo import MongoClient
from bson import ObjectId
import main as omrchecker
from dotenv import load_dotenv
from pdf2image import convert_from_path
from pathlib import Path
import datetime
import shutil
import csv
import sys

# Carica le variabili d'ambiente
load_dotenv()

DATA_DIR = os.getenv("DATA_DIR", os.path.abspath("./data"))
SPOOL_DIR = os.getenv("SPOOL_DIR", os.path.abspath("./spool"))
PROCESSING_DIR = os.getenv("PROCESSING_DIR", os.path.join(SPOOL_DIR, "processing"))
ABORTED_DIR = os.getenv("ABORTED_DIR", os.path.join(SPOOL_DIR, "aborted"))
COMPLETED_DIR = os.getenv("COMPLETED_DIR", os.path.join(SPOOL_DIR, "completed"))
TMP_DIR = os.getenv("TMP_DIR", os.path.join(SPOOL_DIR, "tmp"))
MONGO_URI = os.getenv("MONGO_URI", "mongodb://mongo:27017/") # disable DB if blank.
DB_NAME = os.getenv("DB_NAME", "olifogli")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "scan_jobs")
RESULTS_COLLECTION_NAME = os.getenv("RESULTS_COLLECTION_NAME", "scan_results")
CHECK_INTERVAL = int(os.getenv("CHECK_INTERVAL", 10))  # Controlla nuovi file ogni N secondi
DEFAULT_TEMPLATE_NAME = None

os.makedirs(SPOOL_DIR, exist_ok=True)
os.makedirs(PROCESSING_DIR, exist_ok=True)
os.makedirs(ABORTED_DIR, exist_ok=True)
os.makedirs(COMPLETED_DIR, exist_ok=True)
os.makedirs(TMP_DIR, exist_ok=True)

class Job:
    def __init__(self, template_name, job_id, pdf_path):
        self.job_id = job_id
        self.template_name = template_name
        self.pdf_path = pdf_path
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
        filepath = self.pdf_path
        self.update_status("error", f"Acquisizione annullata")
        os.rename(filepath, os.path.join(ABORTED_DIR, os.path.basename(filepath)))

    def completed(self):
        filepath = self.pdf_path
        self.update_status("completed", f"Acquisizione completata")
        os.rename(filepath, os.path.join(COMPLETED_DIR, os.path.basename(filepath)))

    def convert_pdf_to_png(self, pdf_path, output_path):
        self.update_status("splitting", f"Suddivisione del file")
        if True:
            images = convert_from_path(pdf_path, dpi=300)  # 300 dpi per una buona qualità
            print(f"Done {len(images)} pages", flush=True)
            self.update_status("splitting", f"Trovate {len(images)} pagine")
            png_files = []
            for i, image in enumerate(images):
                png_path = os.path.join(output_path, f"{self.job_id}_{i+1:03d}.png")
                image.save(png_path, "PNG")
                print(f"Saved {png_path}", flush=True)
                png_files.append(png_path)
        else:
            base_filename = os.path.join(output_path, f"{self.job_id}-page")
            command = f"pdftoppm -png -r 300 {pdf_path} {base_filename}"
            print(f"Running command: {command}", flush=True)
            os.system(command)
            png_files = [os.path.join(output_path, f) for f in os.listdir(output_path) if f.endswith(".png")]

        return png_files

    def collect_results(self, output_dir):
        self.update_status("collecting", f"Raccolta risultati")
        results_dir = os.path.join(output_dir, "Results")
        [results_filename] = os.listdir(results_dir)
        results_path = os.path.join(results_dir, results_filename)

        print(f"Reading results file: {results_path}", flush=True)
        headers=None
        results = []
        with open(results_path, newline='') as f:
            reader = csv.reader(f)
            for row in reader:
                if headers is None:
                    headers = row
                    continue
                item = dict(zip(headers, row))
                print(item)
                results.append(item)
        return results
    
    def preserve_image_files(self, results):
        data_directory = os.path.join(DATA_DIR, self.job_id)
        os.makedirs(data_directory, exist_ok=True)
        output_results = []
        for result in results:
            src_file_path = result["output_path"]
            basename = os.path.basename(src_file_path)
            dest_file_path = os.path.join(data_directory, basename)
            shutil.copy(src_file_path, dest_file_path)
            del result["file_id"]
            del result["input_path"]
            del result["output_path"]
            output_results.append({
                "jobId": ObjectId(self.job_id) if self.job_id else None,
                "image": basename,
                "raw_data": result,
            })
        return output_results
    
    def save_results(self, out_results):
        # Salva i risultati nel database
        if MONGO_URI and self.job_id:
            client = MongoClient(MONGO_URI)
            db = client[DB_NAME]
            collection = db[RESULTS_COLLECTION_NAME]
            for result in out_results:
                collection.insert_one(result)
            client.close()

    # Funzione per elaborare i file
    def process(self):
        filepath = self.pdf_path
        print(f"Processing {filepath}...", flush=True)
        # Aggiorna lo stato del file come "In elaborazione"
        self.update_status("starting","Acquisizione iniziata")
        
        input_dir = os.path.join(TMP_DIR, self.job_id, "input")
        output_dir = os.path.join(TMP_DIR, self.job_id, "output")
        os.makedirs(input_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)

        if self.template_name is None:
            print(f"Template name is not set, and no default template is provided.", flush=True, file=sys.stderr)
            self.update_status("error", "Template name is not set")
            return self.abort()

        template_dir = os.path.join(".","templates",self.template_name)
        if not os.path.exists(template_dir):
            print(f"Template directory {template_dir} does not exist.", flush=True, file=sys.stderr)
            self.update_status("error", f"Template directory {template_dir} does not exist")
            return self.abort()
        for filename in os.listdir(template_dir):
            shutil.copy(os.path.join(template_dir, filename),
                os.path.join(input_dir, filename))

        # Converti il PDF in PNG
        try:
            self.convert_pdf_to_png(filepath, input_dir)
        except Exception as e:
            self.update_status("error", f"Converting to PNG: {str(e)}")
            return self.abort()

        # esegui l'elaborazione con OMRCHECKER
        try:
            self.update_status("processing", "Elaborazione in corso")
            omrchecker.entry_point(
                Path(input_dir),
                {
                    "output_dir": output_dir,
                    "setLayout": False,
                },
            )
        except Exception as e:
            self.update_status("error", f"Processing {filepath}: {str(e)}")
            return self.abort()

        results = self.collect_results(output_dir)
        out_results = self.preserve_image_files(results)

        self.save_results(out_results)

        # remove temporary directory
        shutil.rmtree(os.path.join(TMP_DIR, self.job_id))

        self.update_status("completed", f"Completata acquisizione")  
        return self.completed()

# Worker principale
def worker():
    print(f"OMR Worker started, monitoring spool directory {SPOOL_DIR}", flush=True)

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
            if filename.endswith(".pdf"):
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

