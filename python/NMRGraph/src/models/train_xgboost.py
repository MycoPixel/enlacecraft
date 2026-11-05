from pathlib import Path

import joblib
import pandas as pd

from xgboost import XGBRegressor
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score,
)
from sklearn.model_selection import train_test_split


DATASET = Path("data/processed/ml_dataset.csv")
MODEL_OUTPUT = Path("data/models/xgboost_v1.joblib")


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
    # Split by molecule (same split logic as the RF baseline,
    # so the two models are comparable on the same held-out set)
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

    print("Training XGBoost...")

    model = XGBRegressor(
        n_estimators=800,
        max_depth=8,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=3,
        random_state=42,
        n_jobs=-1,
        tree_method="hist",
        early_stopping_rounds=30,
        eval_metric="mae",
    )

    # Carve a small validation slice out of the training molecules
    # so early stopping has something to watch (kept separate from
    # the held-out test set used for the final numbers below).
    val_molecule_ids = pd.Series(train_ids).sample(
        frac=0.1, random_state=42
    )
    val_mask = train_df["nmrshiftdb_id"].isin(val_molecule_ids)

    model.fit(
        X_train[~val_mask],
        y_train[~val_mask],
        eval_set=[(X_train[val_mask], y_train[val_mask])],
        verbose=False,
    )

    print(f"Training finished (best iteration: {model.best_iteration}).")
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
        "data/models/xgboost_feature_importance.csv",
        index=False,
    )

    print(f"Model saved to: {MODEL_OUTPUT}")
    print("Feature importance saved to:")
    print("data/models/xgboost_feature_importance.csv")


if __name__ == "__main__":
    main()
