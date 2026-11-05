# Building the standalone NMRGraph server

This freezes the FastAPI backend (server_entrypoint.py) into a
standalone executable that doesn't need Python, conda, or any
dependency installed on the end user's machine. This is Linux-focused
for now - Windows needs the same process repeated ON a Windows
machine (PyInstaller does not cross-compile).

## 1. Install PyInstaller in your existing conda env

```
conda activate nmr
pip install pyinstaller
```

## 2. Build

From the project root (NOT from inside packaging/):

```
pyinstaller packaging/nmrgraph_server.spec
```

This will take a while the first time (PyTorch alone is large). Watch
the output for warnings - PyInstaller usually still "succeeds" even
when it silently missed something, and you only find out at runtime.

Expect the output folder `dist/nmrgraph_server/` to be large -
several hundred MB to a couple GB, mostly PyTorch. That's normal.

## 3. Copy the model checkpoints in

The spec deliberately does NOT bundle these (see src/paths.py for
why) - copy them in manually for this test:

```
mkdir -p dist/nmrgraph_server/data/models
cp data/models/gnn_v1.pt dist/nmrgraph_server/data/models/
cp data/models/gnn_h1_v1.pt dist/nmrgraph_server/data/models/
cp data/models/gnn_h1_ch_v1.pt dist/nmrgraph_server/data/models/
```

## 4. Run the frozen binary standalone (no Electron yet)

```
cd dist/nmrgraph_server
./nmrgraph_server
```

You should see the same startup output as running `uvicorn` normally,
plus the `NMRGRAPH_SERVER_STARTING port=8000` line from
server_entrypoint.py. Leave it running, and from another terminal:

```
curl http://localhost:8000/health
curl -X POST http://localhost:8000/predict -H "Content-Type: application/json" -d '{"smiles": "CCO"}'
```

If both return the same output as your normal `uvicorn` dev setup,
the freeze worked. This is the point to stop and confirm before we
touch Electron at all - much easier to debug freezing issues in
isolation than after adding a second layer on top.

## Troubleshooting - things that commonly go wrong on a first freeze

**`ModuleNotFoundError` for something uvicorn-related at startup**:
add the missing module to `uvicorn_hidden_imports` in the .spec file
and rebuild. I pre-added the common ones, but uvicorn's exact set can
vary by version.

**RDKit errors about missing data files** (fragment definitions,
isotope tables, etc.) - usually a stack trace mentioning a path under
something like `rdkit/Data/` that doesn't exist. The spec attempts
`collect_data_files("rdkit")` automatically, but if that didn't catch
everything, try being more explicit - add this to the spec's `datas`
list:
```python
import rdkit, os
rdkit_dir = os.path.dirname(rdkit.__file__)
a.datas += [(os.path.join("rdkit", "Data", f), os.path.join(rdkit_dir, "Data", f), "DATA")
            for f in os.listdir(os.path.join(rdkit_dir, "Data"))]
```
(adjust based on what the actual error says is missing)

**Torch fails to import at runtime with a DLL/shared-library error**:
usually means a compiled `.so`/`.dll` that torch needs wasn't picked
up. Try adding `--collect-all torch` when running pyinstaller
directly (as a one-off test, outside the spec file) to see if that
resolves it - if so, add the equivalent to the spec's `datas`/
`binaries` collection.

**The executable is enormous (several GB)**: check whether your conda
env has GPU-enabled torch installed (`python -c "import torch;
print(torch.version.cuda)"` - if this prints an actual CUDA version
rather than None, that's it). This app's model is tiny and doesn't
need a GPU - reinstalling a CPU-only torch build in a clean env before
freezing will cut the size dramatically. The spec's `excludes` list
already tries to drop the biggest CUDA-related packages, but starting
from a CPU-only torch install to begin with is more reliable than
trying to exclude GPU libraries after the fact.

**It works when run from `dist/nmrgraph_server/` but not from
anywhere else**: this one would actually be a real bug in
src/paths.py's frozen-mode path resolution - if you hit this, send
me the exact error and I'll look at it.

## Next step

Once step 4 above works cleanly, tell me and we'll move on to having
Electron spawn this automatically instead of you running it by hand.
