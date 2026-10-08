"""
Compare the Random Forest and XGBoost baselines on the same held-out
molecules, to decide which one becomes "the" classical baseline that
the GNN needs to beat.

Run this after train_random_forest.py and train_xgboost.py have both
produced a saved model in data/models/.
"""

from pathlib import Path

import joblib
import pandas as pd

from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score,
)
from sklearn.model_selection import train_test_split


DATASET = Path("data/processed/ml_dataset.csv")

MODELS = {
    "random_forest": Path("data/models/random_forest_v1.joblib"),
    "xgboost": Path("data/models/xgboost_v1.joblib"),
}

IGNORE_COLUMNS = [
    "nmrshiftdb_id",
    "smiles",
    "atom_index",
    "shift_ppm",
]


def main():

    df = pd.read_csv(DATASET)

    FEATURE_COLUMNS = [
        column
        for column in df.columns
        if column not in IGNORE_COLUMNS
    ]

    # Same split (same random_state) as both training scripts, so
    # every model is scored on identical held-out molecules.
    molecule_ids = df["nmrshiftdb_id"].unique()

    _, test_ids = train_test_split(
        molecule_ids,
        test_size=0.20,
        random_state=42,
    )

    test_df = df[df["nmrshiftdb_id"].isin(test_ids)]

    X_test = test_df[FEATURE_COLUMNS]
    y_test = test_df["shift_ppm"]

    results = []

    for name, path in MODELS.items():

        if not path.exists():
            print(f"Skipping {name}: no saved model at {path}")
            continue

        model = joblib.load(path)
        predictions = model.predict(X_test)

        mae = mean_absolute_error(y_test, predictions)
        rmse = mean_squared_error(y_test, predictions) ** 0.5
        r2 = r2_score(y_test, predictions)

        # Worst 1% of predictions - useful for spotting molecule
        # types the model handles badly (e.g. carbonyls, halides).
        abs_error = (predictions - y_test).abs()
        p99_error = abs_error.quantile(0.99)

        results.append(
            {
                "model": name,
                "mae_ppm": round(mae, 3),
                "rmse_ppm": round(rmse, 3),
                "r2": round(r2, 3),
                "p99_abs_error_ppm": round(p99_error, 3),
            }
        )

    if not results:
        print("No trained models found in data/models/. Train them first.")
        return

    summary = pd.DataFrame(results).sort_values("mae_ppm")

    print("Baseline comparison (held-out molecules)")
    print("-----------------------------------------")
    print(summary.to_string(index=False))
    print()

    best = summary.iloc[0]["model"]
    print(f"Best classical baseline: {best}")
    print("This is the number the GNN needs to beat.")


if __name__ == "__main__":
    main()
