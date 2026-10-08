from pathlib import Path

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset

from src.data.graph_dataset import build_graphs, collate_graphs, split_graphs
from src.models.gnn import NMRGNN


MODEL_OUTPUT = Path("data/models/gnn_v1.pt")

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

BATCH_SIZE = 32
NUM_EPOCHS = 200
LEARNING_RATE = 1e-3
WEIGHT_DECAY = 1e-5
PATIENCE = 15  # epochs without val improvement before early stopping

# Guards against a handful of huge outlier molecules blowing up
# batch padding (dense adjacency is max_atoms^2 per batch item).
MAX_ATOMS = 150


class GraphListDataset(Dataset):

    def __init__(self, graphs):
        self.graphs = graphs

    def __len__(self):
        return len(self.graphs)

    def __getitem__(self, idx):
        return self.graphs[idx]


def run_epoch(model, loader, optimizer=None):
    """
    One pass over `loader`. If `optimizer` is given, trains; otherwise
    evaluates with grad disabled. Returns (mae, rmse) over all atoms
    with a known shift.
    """

    is_train = optimizer is not None
    model.train(is_train)

    total_abs_error = 0.0
    total_sq_error = 0.0
    total_count = 0

    context = torch.enable_grad() if is_train else torch.no_grad()

    with context:

        for node_features, adjacency, targets, target_mask, atom_mask in loader:

            node_features = node_features.to(DEVICE)
            adjacency = adjacency.to(DEVICE)
            targets = targets.to(DEVICE)
            target_mask = target_mask.to(DEVICE)
            atom_mask = atom_mask.to(DEVICE)

            predictions = model(node_features, adjacency, atom_mask)

            diff = (predictions - targets)[target_mask]

            loss = (diff ** 2).mean()

            if is_train:
                optimizer.zero_grad()
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), 5.0)
                optimizer.step()

            total_abs_error += diff.abs().sum().item()
            total_sq_error += (diff ** 2).sum().item()
            total_count += diff.numel()

    mae = total_abs_error / total_count
    rmse = (total_sq_error / total_count) ** 0.5

    return mae, rmse


def main():

    print(f"Device: {DEVICE}")
    print()

    print("Parsing SDF into graphs...")
    graphs = build_graphs(max_atoms=MAX_ATOMS, use_geometry=True)
    print(f"Built {len(graphs):,} molecule graphs")
    print()

    # --------------------------------------------------
    # Same split strategy (molecule-level, random_state=42,
    # test_size=0.20) as the RF / XGBoost baselines, so results
    # are comparable. Order of first appearance here comes from
    # iterating the same SDF file the same way, so this should
    # match the tabular split closely (not guaranteed bit-identical
    # if any molecules were filtered differently upstream).
    # --------------------------------------------------

    train_graphs, val_graphs, test_graphs = split_graphs(graphs)

    print(f"Training molecules  : {len(train_graphs):,}")
    print(f"Validation molecules: {len(val_graphs):,}")
    print(f"Testing molecules   : {len(test_graphs):,}")
    print()

    train_loader = DataLoader(
        GraphListDataset(train_graphs),
        batch_size=BATCH_SIZE,
        shuffle=True,
        collate_fn=collate_graphs,
    )
    val_loader = DataLoader(
        GraphListDataset(val_graphs),
        batch_size=BATCH_SIZE,
        shuffle=False,
        collate_fn=collate_graphs,
    )
    test_loader = DataLoader(
        GraphListDataset(test_graphs),
        batch_size=BATCH_SIZE,
        shuffle=False,
        collate_fn=collate_graphs,
    )

    model = NMRGNN().to(DEVICE)

    num_params = sum(p.numel() for p in model.parameters())
    print(f"Model parameters: {num_params:,}")
    print()

    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=LEARNING_RATE,
        weight_decay=WEIGHT_DECAY,
    )
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer,
        mode="min",
        factor=0.5,
        patience=3,
    )

    best_val_mae = float("inf")
    epochs_without_improvement = 0

    MODEL_OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    print("Training...")
    print()

    for epoch in range(1, NUM_EPOCHS + 1):

        train_mae, train_rmse = run_epoch(model, train_loader, optimizer)
        val_mae, val_rmse = run_epoch(model, val_loader)

        scheduler.step(val_mae)

        improved = val_mae < best_val_mae

        print(
            f"Epoch {epoch:3d} | "
            f"train MAE {train_mae:6.3f} RMSE {train_rmse:6.3f} | "
            f"val MAE {val_mae:6.3f} RMSE {val_rmse:6.3f}"
            + ("  <- best" if improved else "")
        )

        if improved:
            best_val_mae = val_mae
            epochs_without_improvement = 0
            torch.save(model.state_dict(), MODEL_OUTPUT)
        else:
            epochs_without_improvement += 1

            if epochs_without_improvement >= PATIENCE:
                print()
                print(f"Early stopping (no improvement for {PATIENCE} epochs)")
                break

    print()
    print(f"Best validation MAE: {best_val_mae:.3f} ppm")
    print()

    # --------------------------------------------------
    # Final evaluation on the held-out test set, using the
    # best checkpoint saved above.
    # --------------------------------------------------

    model.load_state_dict(torch.load(MODEL_OUTPUT, map_location=DEVICE))

    test_mae, test_rmse = run_epoch(model, test_loader)

    print("Test set performance")
    print("---------------------")
    print(f"MAE : {test_mae:.3f} ppm")
    print(f"RMSE: {test_rmse:.3f} ppm")
    print()
    print(f"Model saved to: {MODEL_OUTPUT}")


if __name__ == "__main__":
    main()
