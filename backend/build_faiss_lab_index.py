import os
import numpy as np
import pandas as pd
import faiss
import pickle
from sklearn.preprocessing import normalize
from sentence_transformers import SentenceTransformer

# === Config ===
CSV_PATH = "procedure_comb_sku.csv"
DESC_COL = "description"
CODE_COL = "code"
EMBED_MODEL_NAME = "all-MiniLM-L6-v2"
CACHE_DIR = "faiss_cache_lab"

# === Load Data ===
print("Loading lab/radiology/procedure data...")
df = pd.read_csv(CSV_PATH)
df[DESC_COL] = df[DESC_COL].astype(str)
df[CODE_COL] = df[CODE_COL].astype(str)

# Build metadata list
sku_metadata = df[[DESC_COL, CODE_COL]].rename(columns={
    DESC_COL: "name",
    CODE_COL: "code"
}).to_dict(orient="records")

# === Embedding ===
print("Encoding descriptions...")
model = SentenceTransformer(EMBED_MODEL_NAME)
embeddings = model.encode([row["name"] for row in sku_metadata], convert_to_numpy=True, show_progress_bar=True)

# === Normalize Embeddings ===
print("Normalizing...")
normalized_embeddings = normalize(embeddings, norm='l2')

# === Build FAISS Index ===
d = normalized_embeddings.shape[1]
index = faiss.IndexHNSWFlat(d, 32)
index.hnsw.efConstruction = 200
index.add(normalized_embeddings)

# === Save Files ===
os.makedirs(CACHE_DIR, exist_ok=True)
faiss.write_index(index, os.path.join(CACHE_DIR, "procedure_hnsw_index.faiss"))
np.save(os.path.join(CACHE_DIR, "procedure_vectors.npy"), normalized_embeddings)
with open(os.path.join(CACHE_DIR, "procedure_sku_list.pkl"), "wb") as f:
    pickle.dump(sku_metadata, f)

print("Saved FAISS index + metadata to", CACHE_DIR)
