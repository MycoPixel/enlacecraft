# Model checkpoint provenance

These three files are the trained weights the NMR prediction backend loads
(`python/NMRGraph/src/paths.py`). They are checked into git on purpose: the
desktop release bundles them, and without them every prediction fails at
startup.

| File | Predicts | Size | SHA-256 |
| --- | --- | --- | --- |
| `gnn_v1.pt` | ¹³C shifts | 1,718,877 B | `a09ac7487032a0293f66be5e2f09640b1ed0fdbe13ef0f2df70294173b72e8dd` |
| `gnn_h1_ch_v1.pt` | ¹H shifts, carbon-attached protons | 1,723,329 B | `8e8380590ff9e7bcf11c2d0d1339b00d0599878e1deda7eaae373f4ca6799418` |
| `gnn_h1_v1.pt` | ¹H shifts, all protons | 1,723,119 B | `244a6ab4aa3c7509653de3723ef5d10f54ef9a786fc25b72cb8916b95c1d6421` |

## Where they come from

- All three were trained by EnlaceCraft's author with this repository's own
  scripts (`python -m src.models.train_gnn`, `train_gnn_h1_ch` and
  `train_gnn_h1`, see the [README](README.md)'s training section).
  They are not third-party pre-trained models, and no checkpoint was copied
  from another project.
- The training data is **nmrshiftdb2** (`nmrshiftdb2withsignals.sd`,
  parsed by `src/data/nmrshiftdb.py`). The source SD file is gitignored and
  is **not** redistributed in this repository or in a release; only the
  trained weights are.
- nmrshiftdb2 publishes its data under the **nmrshiftdb2 Database License**,
  an ODbL 1.0 derivative with an added §4.5. That license asks for
  attribution and share-alike on adapted *databases*; the app therefore
  credits nmrshiftdb2 beside every prediction and
  [`THIRD-PARTY-NOTICES.md`](../../THIRD-PARTY-NOTICES.md) carries the
  full note. Keep that credit when reusing the weights.

## Reproducing them

1. Obtain `nmrshiftdb2withsignals.sd` from <https://nmrshiftdb.nmr.uni-koeln.de>
   and place it in `data/raw/`.
2. Follow the README's dataset and training steps (micromamba environment,
   `src/data/build_dataset.py`, then `python -m src.models.train_gnn`,
   `train_gnn_h1_ch` or `train_gnn_h1`).
3. Record the new files' SHA-256 here, and update the sizes if they change.

A checkpoint that does not match the table above is not the one this
release was tested with; predictions may differ or fail to load.
