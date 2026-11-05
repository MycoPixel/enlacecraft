from pathlib import Path

import joblib
import pandas as pd

from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score,
)
from sklearn.model_selection import train_test_split


DATASET = Path("data/processed/ml_dataset.csv")
MODEL_OUTPUT = Path("data/models/random_forest_v1.joblib")


IGNORE_COLUMNS = [
    "nmrshiftdb_id",
    "smiles",
    "atom_index",
    "shift_ppm",
]


def main():

    print("Loading dataset...")

    df = pd.read_csv(DATASET)

    print(f"Dataset shape: {df.shape}")
    print()

    # --------------------------------------------------
    # Automatically detect all feature columns
    # --------------------------------------------------

    FEATURE_COLUMNS = [
        column
        for column in df.columns
        if column not in IGNORE_COLUMNS
    ]

    print(f"Using {len(FEATURE_COLUMNS)} features")
    print()

    # --------------------------------------------------
    # Split by molecule
    # --------------------------------------------------

    molecule_ids = df["nmrshiftdb_id"].unique()

    train_ids, test_ids = train_test_split(
        molecule_ids,
        test_size=0.20,
        random_state=42,
    )

    train_df = df[df["nmrshiftdb_id"].isin(train_ids)]
    test_df = df[df["nmrshiftdb_id"].isin(test_ids)]

    print(f"Training molecules: {len(train_ids):,}")
    print(f"Testing molecules : {len(test_ids):,}")
    print()

    print(f"Training atoms: {len(train_df):,}")
    print(f"Testing atoms : {len(test_df):,}")
    print()

    # --------------------------------------------------
    # Prepare matrices
    # --------------------------------------------------

    X_train = train_df[FEATURE_COLUMNS]
    y_train = train_df["shift_ppm"]

    X_test = test_df[FEATURE_COLUMNS]
    y_test = test_df["shift_ppm"]

    # --------------------------------------------------
    # Train model
    # --------------------------------------------------

    print("Training Random Forest...")

    model = RandomForestRegressor(
        n_estimators=500,
        random_state=42,
        n_jobs=-1,
    )

    model.fit(X_train, y_train)

    print("Training finished.")
    print()

    # --------------------------------------------------
    # Predictions
    # --------------------------------------------------

    predictions = model.predict(X_test)

    mae = mean_absolute_error(y_test, predictions)
    rmse = mean_squared_error(
        y_test,
        predictions,
    ) ** 0.5
    r2 = r2_score(
        y_test,
        predictions,
    )

    print("Model performance")
    print("-----------------")
    print(f"MAE : {mae:.3f} ppm")
    print(f"RMSE: {rmse:.3f} ppm")
    print(f"R²  : {r2:.3f}")
    print()

    # --------------------------------------------------
    # Feature importance
    # --------------------------------------------------

    importance = (
        pd.DataFrame(
            {
                "feature": FEATURE_COLUMNS,
                "importance": model.feature_importances_,
            }
        )
        .sort_values(
            "importance",
            ascending=False,
        )
        .reset_index(drop=True)
    )

    print("Top 30 features")
    print("-----------------")
    print(importance.head(30))
    print()

    # --------------------------------------------------
    # Save outputs
    # --------------------------------------------------

    MODEL_OUTPUT.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    joblib.dump(
        model,
        MODEL_OUTPUT,
    )

    importance.to_csv(
        "data/models/random_forest_feature_importance.csv",
        index=False,
    )

    print(f"Model saved to: {MODEL_OUTPUT}")
    print("Feature importance saved to:")
    print("data/models/random_forest_feature_importance.csv")


if __name__ == "__main__":
    main()
