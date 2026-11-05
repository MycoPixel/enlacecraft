"""
Detailed error analysis for the trained GNN on the held-out test set
(same molecules train_gnn.py reports its final MAE/RMSE on, but here
broken down per-atom so we can see WHERE the error is concentrated,
not just the aggregate number).

Produces:
  - console summary: overall metrics, error breakdown by chemical
    environment (hybridization, element neighbors, ring membership)
  - data/models/gnn_test_predictions.csv: every test-set atom with
    its true shift, predicted shift, and error, for you to slice
    however you want (e.g. in pandas/Excel)
  - console: the 20 worst individual predictions, with SMILES +
    atom index, so you can look up what's structurally going on
"""

from pathlib import Path

import pandas as pd
import torch

from src.data.graph_dataset import build_graphs, collate_graphs, split_graphs
from src.models.gnn import NMRGNN
from src.models.train_gnn import MAX_ATOMS


MODEL_PATH = Path("data/models/gnn_v1.pt")
OUTPUT_CSV = Path("data/models/gnn_test_predictions.csv")

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def main():

    print(f"Device: {DEVICE}")
    print()

    print("Parsing SDF into graphs...")
    graphs = build_graphs(max_atoms=MAX_ATOMS)
    print(f"Built {len(graphs):,} molecule graphs")
    print()

    _, _, test_graphs = split_graphs(graphs)
    print(f"Test molecules: {len(test_graphs):,}")
    print()

    model = NMRGNN().to(DEVICE)
    model.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE))
    model.eval()

    rows = []

    # Batch size 1 here (not BATCH_SIZE) so we don't have to unpick
    # which padded positions belong to which molecule - simpler and
    # this script only runs once, not in a training loop.
    for graph in test_graphs:

        node_features, adjacency, targets, target_mask, atom_mask = (
            collate_graphs([graph])
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
                    "true_shift_ppm": round(true_shift, 2),
                    "predicted_shift_ppm": round(pred_shift, 2),
                    "abs_error_ppm": round(abs(pred_shift - true_shift), 2),
                    "is_aromatic": is_aromatic,
                    "is_in_ring": is_in_ring,
                    "total_hs": total_hs,
                    "degree": degree,
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

    print("MAE by attached H count (sp3 CH3/CH2/CH vs quaternary/aromatic)")
    print("------------------------------------------------------------------")
    print(
        df.groupby("total_hs")["abs_error_ppm"]
        .agg(["mean", "count"])
        .rename(columns={"mean": "mae"})
    )
    print()

    print("MAE by true shift range (ppm) - where do errors concentrate?")
    print("----------------------------------------------------------------")
    bins = [-10, 0, 30, 60, 100, 140, 180, 250]
    labels = [
        "<0", "0-30", "30-60", "60-100", "100-140", "140-180", "180+"
    ]
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
