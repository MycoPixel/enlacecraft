"""
A small relational graph convolutional network (R-GCN style),
implemented in plain PyTorch — no torch_geometric / dgl.

Each bond type (single/double/triple/aromatic) is treated as a
separate relation with its own learned weight matrix. A layer is:

    H' = activation( self_loop(H) + sum_r  norm_r * (A_r @ H) @ W_r )

where A_r is the (batch, max_atoms, max_atoms) adjacency for relation
r, and norm_r divides by each node's degree in that relation to keep
the scale of the aggregated messages stable regardless of how many
neighbors a node has.

After a few rounds of message passing, a per-atom MLP head predicts
the 13C chemical shift for every atom (only atoms with a known shift,
selected via target_mask, are scored during training/eval).
"""

import torch
import torch.nn as nn
import torch.nn.functional as F

from src.data.graph_dataset import NODE_FEATURE_DIM, NUM_RELATIONS


class RelationalGraphConv(nn.Module):

    def __init__(self, in_dim, out_dim, num_relations):
        super().__init__()

        self.self_loop = nn.Linear(in_dim, out_dim)
        self.relation_layers = nn.ModuleList(
            [nn.Linear(in_dim, out_dim) for _ in range(num_relations)]
        )

    def forward(self, h, adjacency):
        """
        h          : (batch, max_atoms, in_dim)
        adjacency  : (batch, num_relations, max_atoms, max_atoms)
        """

        out = self.self_loop(h)

        for r, layer in enumerate(self.relation_layers):

            a_r = adjacency[:, r]  # (batch, max_atoms, max_atoms)

            # Mean over neighbors in this relation (avoids atoms with
            # many bonds of one type dominating the message scale).
            degree = a_r.sum(dim=-1, keepdim=True).clamp(min=1.0)
            a_r_norm = a_r / degree

            messages = torch.bmm(a_r_norm, h)  # (batch, max_atoms, in_dim)
            out = out + layer(messages)

        return out


class NMRGNN(nn.Module):

    def __init__(
        self,
        node_feature_dim=NODE_FEATURE_DIM,
        num_relations=NUM_RELATIONS,
        hidden_dim=128,
        num_layers=4,
        dropout=0.1,
    ):
        super().__init__()

        self.input_proj = nn.Linear(node_feature_dim, hidden_dim)

        self.conv_layers = nn.ModuleList(
            [
                RelationalGraphConv(hidden_dim, hidden_dim, num_relations)
                for _ in range(num_layers)
            ]
        )
        self.norms = nn.ModuleList(
            [nn.LayerNorm(hidden_dim) for _ in range(num_layers)]
        )

        self.dropout = nn.Dropout(dropout)

        self.readout = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, 1),
        )

    def forward(self, node_features, adjacency, atom_mask):
        """
        node_features : (batch, max_atoms, node_feature_dim)
        adjacency     : (batch, num_relations, max_atoms, max_atoms)
        atom_mask     : (batch, max_atoms) bool, True for real atoms

        Returns
        -------
        predictions : (batch, max_atoms) predicted shift per atom
        """

        h = self.input_proj(node_features)

        for conv, norm in zip(self.conv_layers, self.norms):

            residual = h
            h = conv(h, adjacency)
            h = norm(h)
            h = F.relu(h)
            h = self.dropout(h)
            h = h + residual  # residual connection

            # Zero out padded atoms so they can't leak into later
            # layers' self-loop / normalization statistics.
            h = h * atom_mask.unsqueeze(-1)

        predictions = self.readout(h).squeeze(-1)

        return predictions
