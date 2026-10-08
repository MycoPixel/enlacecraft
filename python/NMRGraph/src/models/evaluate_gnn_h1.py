"""
Detailed error analysis for the trained 1H GNN on its held-out test
set. Mirrors evaluate_gnn.py closely, with one addition specific to
protons: a breakdown separating exchangeable-type heavy atoms (O-H,
N-H - inherently noisier targets, since their real shift swings with
concentration/solvent/temperature even in the source data) from
ordinary C-H protons, so we can see whether error concentrates there
rather than being a general model weakness.

Produces:
  - console summary: overall metrics, error breakdown by chemical
    environment (ring membership, aromaticity, H count, exchangeable
    vs C-H, shift range)
  - data/models/gnn_h1_test_predictions.csv: every test-set atom with
    its true shift, predicted shift, and error
  - console: the 20 worst individual predictions
"""

from pathlib import Path

import pandas as pd
import torch

from src.data.graph_dataset import (
    _decode_element,
    build_graphs,
    collate_graphs_h1,
    split_graphs,
)
from src.models.gnn import NMRGNN
from src.models.predict import MODEL_PATH_H1
from src.models.train_gnn_h1 import MAX_ATOMS


OUTPUT_CSV = Path("data/models/gnn_h1_test_predictions.csv")

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Elements whose attached protons are exchangeable (concentration/
# solvent/temperature-dependent shift, even in the source database) -
# as opposed to ordinary C-H, which is not exchangeable.
EXCHANGEABLE_ELEMENTS = {"N", "O", "S"}


def main():

    print(f"Device: {DEVICE}")
    print()

    print("Parsing SDF into graphs (1H)...")
    graphs = build_graphs(max_atoms=MAX_ATOMS, nucleus="h1")
    print(f"Built {len(graphs):,} molecule graphs")
    print()

    _, _, test_graphs = split_graphs(graphs)
    print(f"Test molecules: {len(test_graphs):,}")
    print()

    model = NMRGNN().to(DEVICE)
    model.load_state_dict(torch.load(MODEL_PATH_H1, map_location=DEVICE))
    model.eval()

    rows = []

    for graph in test_graphs:

        node_features, adjacency, targets, target_mask, atom_mask = (
            collate_graphs_h1([graph])
        )

        node_features = node_features.to(DEVICE)
        adjacency = adjacency.to(DEVICE)
        atom_mask = atom_mask.to(DEVICE)

        with torch.no_grad():
            predictions = model(node_features, adjacency, atom_mask)

        predictions = predictions[0].cpu()
        targets = targets[0]
        target_mask = target_mask[0]

        for atom_index in target_mask.nonzero(as_tuple=True)[0].tolist():

            true_shift = targets[atom_index].item()
            pred_shift = predictions[atom_index].item()

            node_feat = graph.node_features[atom_index]
            # Layout from graph_dataset.py: one-hot element, one-hot
            # hybridization, then [degree, charge, total_hs, aromatic, ring]
            element = _decode_element(node_feat)
            is_aromatic = bool(node_feat[-2])
            is_in_ring = bool(node_feat[-1])
            total_hs = int(node_feat[-3])
            degree = int(node_feat[-5])
            is_exchangeable = element in EXCHANGEABLE_ELEMENTS

            rows.append(
                {
                    "db_id": graph.db_id,
                    "smiles": graph.smiles,
                    "atom_index": atom_index,
                    "element": element,
                    "true_shift_ppm": round(true_shift, 3),
                    "predicted_shift_ppm": round(pred_shift, 3),
                    "abs_error_ppm": round(abs(pred_shift - true_shift), 3),
                    "is_aromatic": is_aromatic,
                    "is_in_ring": is_in_ring,
                    "total_hs": total_hs,
                    "degree": degree,
                    "is_exchangeable": is_exchangeable,
                }
            )

    df = pd.DataFrame(rows)

    mae = df["abs_error_ppm"].mean()
    rmse = (df["abs_error_ppm"] ** 2).mean() ** 0.5

    print("Overall test performance")
    print("-------------------------")
    print(f"Atoms evaluated: {len(df):,}")
    print(f"MAE : {mae:.3f} ppm")
    print(f"RMSE: {rmse:.3f} ppm")
    print()

    # --------------------------------------------------
    # Error breakdown by chemical environment
    # --------------------------------------------------

    print("MAE: exchangeable (O-H/N-H/S-H) vs ordinary C-H")
    print("--------------------------------------------------")
    print(
        df.groupby("is_exchangeable")["abs_error_ppm"]
        .agg(["mean", "count"])
        .rename(columns={"mean": "mae"})
    )
    print()

    print("MAE by heavy-atom element bearing the proton(s)")
    print("---------------------------------------------------")
    print(
        df.groupby("element")["abs_error_ppm"]
        .agg(["mean", "count"])
        .rename(columns={"mean": "mae"})
        .sort_values("count", ascending=False)
    )
    print()

    print("MAE by ring membership")
    print("-----------------------")
    print(
        df.groupby("is_in_ring")["abs_error_ppm"]
        .agg(["mean", "count"])
        .rename(columns={"mean": "mae"})
    )
    print()

    print("MAE by aromaticity")
    print("--------------------")
    print(
        df.groupby("is_aromatic")["abs_error_ppm"]
        .agg(["mean", "count"])
        .rename(columns={"mean": "mae"})
    )
    print()

    print("MAE by attached H count")
    print("--------------------------")
    print(
        df.groupby("total_hs")["abs_error_ppm"]
        .agg(["mean", "count"])
        .rename(columns={"mean": "mae"})
    )
    print()

    print("MAE by true shift range (ppm)")
    print("----------------------------------")
    bins = [-2, 0, 1, 3, 5, 7, 9, 20]
    labels = ["<0", "0-1", "1-3", "3-5", "5-7", "7-9", "9+"]
    df["shift_bucket"] = pd.cut(
        df["true_shift_ppm"], bins=bins, labels=labels
    )
    print(
        df.groupby("shift_bucket", observed=True)["abs_error_ppm"]
        .agg(["mean", "count"])
        .rename(columns={"mean": "mae"})
    )
    print()

    # --------------------------------------------------
    # Worst individual predictions
    # --------------------------------------------------

    print("20 worst predictions")
    print("---------------------")
    worst = df.sort_values("abs_error_ppm", ascending=False).head(20)
    print(
        worst[
            [
                "smiles",
                "atom_index",
                "element",
                "is_exchangeable",
                "true_shift_ppm",
                "predicted_shift_ppm",
                "abs_error_ppm",
            ]
        ].to_string(index=False)
    )
    print()

    # --------------------------------------------------
    # Save full per-atom results
    # --------------------------------------------------

    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUTPUT_CSV, index=False)

    print(f"Full per-atom predictions saved to: {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
