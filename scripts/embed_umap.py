#!/usr/bin/env python3
"""
scripts/embed_umap.py — offline 3D projection of the constellation.

Reads data/corpus.json (written by `npm run embed:corpus`), embeds each
primary item with BAAI/bge-base-en-v1.5 via the Hugging Face inference
API, and projects the 768-dim embeddings to 3D with UMAP. Writes
data/constellation-vectors.json with one {id, x, y, z} per item.

scripts/embed.mjs then reads this file and uses the coords as the base
3D positions for the cluster-aware layout, skipping its own t-SNE step.
This makes the on-page claim "projected to 3D with UMAP" literally true.

Re-run any time with `python3 scripts/embed_umap.py`.
"""

import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import umap

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CORPUS_PATH = DATA / "corpus.json"
OUT_PATH = DATA / "constellation-vectors.json"

HF_MODEL = "BAAI/bge-base-en-v1.5"
BATCH = 24
TARGET_DIM = 3


def main():
    if not CORPUS_PATH.exists():
        print(f"missing {CORPUS_PATH} — run `npm run embed:corpus` first", file=sys.stderr)
        sys.exit(1)

    # Importing sentence_transformers is heavy; do it after the
    # existence check so the error is friendlier.
    from sentence_transformers import SentenceTransformer

    corpus = json.loads(CORPUS_PATH.read_text())
    print(f"loaded {len(corpus)} primary items from {CORPUS_PATH.name}")

    print(f"loading {HF_MODEL} (local cache or first-time download)...")
    model = SentenceTransformer(HF_MODEL)
    texts = [it["text"] for it in corpus]
    arr = model.encode(
        texts,
        batch_size=BATCH,
        show_progress_bar=True,
        normalize_embeddings=True,
        convert_to_numpy=True,
    ).astype(np.float32)
    print(f"embeddings: {arr.shape} (model: {HF_MODEL})")

    # UMAP to 3D. Tuned for ~200 primary items: more neighbours than the
    # default 15 to keep small clusters tight, lower min_dist so the
    # cluster-aware layout (in Node) has a compact local ordering to
    # work with.
    print("running UMAP → 3D ...")
    reducer = umap.UMAP(
        n_components=TARGET_DIM,
        n_neighbors=15,
        min_dist=0.1,
        metric="cosine",
        random_state=42,
    )
    coords3d = reducer.fit_transform(arr)
    print(f"coords3d: {coords3d.shape}")

    # Normalise to roughly [-1, 1] using 1st-99th percentile per axis, so
    # the Node cluster-aware layout gets a sensible scale.
    for axis in range(TARGET_DIM):
        col = coords3d[:, axis]
        lo = np.percentile(col, 1)
        hi = np.percentile(col, 99)
        rng = hi - lo or 1.0
        coords3d[:, axis] = np.clip((col - lo) / rng * 2 - 1, -1.2, 1.2)

    out = []
    for i, it in enumerate(corpus):
        x, y, z = coords3d[i].tolist()
        out.append({"id": it["id"], "x": float(x), "y": float(y), "z": float(z)})

    OUT_PATH.write_text(
        json.dumps(
            {
                "source": f"{HF_MODEL}+umap",
                "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "dim": TARGET_DIM,
                "items": out,
            },
            indent=2,
        )
    )
    print(f"wrote {len(out)} vectors to {OUT_PATH}")


if __name__ == "__main__":
    main()
