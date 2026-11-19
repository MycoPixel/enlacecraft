# NMRGraph

AI-assisted NMR spectrum prediction from molecular structures - a small
graph neural network that predicts ¹³C and ¹H (carbon-attached) chemical
shifts from a SMILES string.

Pipeline:

```
SMILES → RDKit molecular graph → graph neural network → predicted NMR shifts
```

This is the prediction backend for **EnlaceCraft** (a separate repo) - it
runs as a small local FastAPI server that EnlaceCraft's "Predict NMR"
button calls. It also works standalone from the command line.

## Setup

Uses [micromamba](https://mamba.readthedocs.io/en/latest/user_guide/micromamba.html)
to manage the environment (a lightweight, fast conda/mamba alternative).

**One-time, per machine:**

```fish
# Arch: sudo pacman -S micromamba
# Otherwise: curl -L micro.mamba.pm/install.sh | bash

# fish shell needs its own init line:
micromamba shell init --shell fish --root-prefix ~/.local/share/mamba
# then restart your terminal
```

**Then, in this repo:**

```fish
micromamba create -f environment.yml
micromamba activate nmr
python -c "from rdkit import Chem; print('RDKit OK')"
```

If that prints `RDKit OK`, the environment is good.

## Model checkpoints

`data/models/*.pt` holds the three trained checkpoints (about 1.7 MB each).
They are checked into the EnlaceCraft repository so a clone can run the
backend without extra steps; the folder is otherwise gitignored so a
retraining run does not add new weights by accident:

```
data/models/gnn_v1.pt          # 13C
data/models/gnn_h1_ch_v1.pt    # 1H (carbon-attached protons)
data/models/gnn_h1_v1.pt       # 1H (all protons, incl. exchangeable - higher error, rarely used)
```

Their sizes, SHA-256 hashes, training data and license notes are in
[MODEL_PROVENANCE.md](MODEL_PROVENANCE.md). Without these files,
`uvicorn src.api.main:app` will fail at startup trying to load a
checkpoint that doesn't exist.

## Running the prediction server

```fish
micromamba activate nmr
uvicorn src.api.main:app --reload --port 8000
```

Then, from another terminal:

```fish
curl http://127.0.0.1:8000/health
# -> {"status":"ok","model_loaded":true}

curl -X POST http://127.0.0.1:8000/predict \
  -H "Content-Type: application/json" \
  -d '{"smiles":"CCO"}'
```

This is the server EnlaceCraft's dev mode expects running at
`localhost:8000` - EnlaceCraft does NOT auto-start it in `electron:dev`
/ `electron:preview` (only a truly packaged build does that, via its
own frozen copy - see "Packaging" below). Keep this running in a
terminal alongside EnlaceCraft while developing.

## Running predictions from the command line

No server needed for quick one-off checks:

```fish
micromamba activate nmr
python -m src.models.predict "CCO" "c1ccccc1"
python -m src.models.predict "CCO" --nucleus both
```

## Project structure

```
src/
  api/main.py         FastAPI server (/health, /predict) - what EnlaceCraft calls
  data/               Dataset building: parses NMRShiftDB, builds molecular graphs
  models/
    gnn.py            The R-GCN model architecture
    predict.py        Inference (predict_spectrum, predict_h1_spectrum)
    train_*.py         Training scripts (GNN, random forest, xgboost baselines)
    evaluate_*.py       Evaluation scripts
  paths.py            Resolves checkpoint paths, works both from source and frozen
server_entrypoint.py  Entry point PyInstaller freezes for the desktop build
packaging/            PyInstaller spec + build instructions (see packaging/README.md)
data/
  raw/                Source NMRShiftDB file (gitignored, not needed unless retraining)
  processed/          Intermediate build artifacts (gitignored)
  models/             Trained checkpoints (tracked in EnlaceCraft - see above)
```

## Training / retraining

Only needed if you're changing the model itself, not for day-to-day
prediction use. Requires `data/raw/nmrshiftdb2withsignals.sd` (the
NMRShiftDB source file, also gitignored - not needed unless you're
rebuilding the dataset from scratch):

```fish
micromamba activate nmr
python -m src.models.train_gnn        # 13C
python -m src.models.train_gnn_h1_ch  # 1H, carbon-attached
```

See individual scripts under `src/models/` for options.

## Packaging for EnlaceCraft's desktop build

EnlaceCraft's Windows/Linux desktop builds bundle this server as a
frozen executable (via PyInstaller) so end users don't need Python
installed. See `packaging/README.md` for the full build/smoke-test
steps, and EnlaceCraft's own `ELECTRON.md` ("Bundling the NMR
prediction server") for how the frozen output gets copied over and
wired in on that side.

## Working from a second machine

The checkpoints are tracked in EnlaceCraft, so a fresh `git clone`
already includes them. The raw nmrshiftdb2 file is not (it is large and
not redistributed); you only need it for retraining. After cloning:

1. Set up micromamba + the `nmr` environment (see Setup above).
2. Only if retraining: copy `data/raw/nmrshiftdb2withsignals.sd` over.

That's the full list - everything else (the venv, build outputs,
`data/processed/`) is either recreated by the environment setup or
regenerated by scripts, so nothing else needs to be copied by hand.
