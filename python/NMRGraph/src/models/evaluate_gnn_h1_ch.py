"""
Detailed error analysis for the C-H-only 1H GNN (gnn_h1_ch_v1.pt) on
its held-out test set. Same shape as evaluate_gnn.py / evaluate_gnn_h1.py.

Unlike evaluate_gnn_h1.py, there's no exchangeable-vs-C-H breakdown
here - by construction, every target in this dataset IS a C-H proton
(restrict_h1_to_carbon() filtered everything else out before this
model was ever trained), so that split would trivially show 100% C
with nothing to compare against. Instead this adds a breakdown by
whether the proton sits on a ring-fusion/branching carbon (degree 3+)
vs a simple chain carbon, since that's a distinction that only
matters for protons, not for the carbons themselves.

Produces:
  - console summary + breakdowns
  - data/models/gnn_h1_ch_test_predictions.csv
  - console: 20 worst predictions
"""

from pathlib import Path

import pandas as pd
import torch

from src.data.graph_dataset import (
    build_graphs,
    collate_graphs_h1,
    restrict_h1_to_carbon,
    split_graphs,
)
from src.models.gnn import NMRGNN
from src.models.predict import MODEL_PATH_H1_CH
from src.models.train_gnn_h1_ch import MAX_ATOMS


OUTPUT_CSV = Path("data/models/gnn_h1_ch_test_predictions.csv")

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def main():

    print(f"Device: {DEVICE}")
    print()

    print("Parsing SDF into graphs (1H, all)...")
    graphs = build_graphs(max_atoms=MAX_ATOMS, nucleus="h1")
    graphs = restrict_h1_to_carbon(graphs)
    print(f"Built {len(graphs):,} molecule graphs (C-H targets only)")
    print()

    _, _, test_graphs = split_graphs(graphs)
    print(f"Test molecules: {len(test_graphs):,}")
    print()

    model = NMRGNN().to(DEVICE)
    model.load_state_dict(torch.load(MODEL_PATH_H1_CH, map_location=DEVICE))
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
            is_aromatic = bool(node_feat[-2])
            is_in_ring = bool(node_feat[-1])
            total_hs = int(node_feat[-3])
            degree = int(node_feat[-5])

            rows.append(
                {
                    "db_id": graph.db_id,
                    "smiles": graph.smiles,
                    "atom_index": atom_index,
                    "true_shift_ppm": round(true_shift, 3),
                    "predicted_shift_ppm": round(pred_shift, 3),
                    "abs_error_ppm": round(abs(pred_shift - true_shift), 3),
                    "is_aromatic": is_aromatic,
                    "is_in_ring": is_in_ring,
                    "total_hs": total_hs,
                    "degree": degree,
                    "branching_carbon": degree >= 3,
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

    print("MAE by attached H count (CH vs CH2 vs CH3)")
    print("-----------------------------------------------")
    print(
        df.groupby("total_hs")["abs_error_ppm"]
        .agg(["mean", "count"])
        .rename(columns={"mean": "mae"})
    )
    print()

    print("MAE: branching/ring-fusion carbon (degree 3+) vs simple chain carbon")
    print("--------------------------------------------------------------------------")
    print(
        df.groupby("branching_carbon")["abs_error_ppm"]
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

    print("20 worst predictions")
    print("---------------------")
    worst = df.sort_values("abs_error_ppm", ascending=False).head(20)
    print(
        worst[
            [
                "smiles",
                "atom_index",
                "true_shift_ppm",
                "predicted_shift_ppm",
                "abs_error_ppm",
            ]
        ].to_string(index=False)
    )
    print()

    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUTPUT_CSV, index=False)

    print(f"Full per-atom predictions saved to: {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
