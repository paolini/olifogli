* starting worker locally

```bash
python -m venv venv # only once
. venv/bin/activate
export PYTHONPATH=OMRChecker
python worker.py
```

* create images from scanned pdf and move them to input directory

```bash
pdftoppm -png scan.pdf scan
mv scan*.png OMRChecker/inputs/archimede
```

* run OMRChecker
    
```bash
cd OMRChecker
python3 main.py
```

* check results in output directory

```bash
cd outputs/archimede
display scan*.png
```

* to check the template

```bash
python3 main.py --setLayout
```