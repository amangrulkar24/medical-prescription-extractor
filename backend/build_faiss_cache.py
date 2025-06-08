import os
import numpy as np
import pandas as pd
import faiss
import pickle
from sklearn.preprocessing import normalize
from sentence_transformers import SentenceTransformer

# === Configuration ===
CSV_PATH = "medicine_sku_comp.csv"
DESC_COL = "medicine_desc"
CODE_COL = "sku_code"
EMBED_MODEL_NAME = "all-MiniLM-L6-v2"
CACHE_DIR = "faiss_cache"

# === Load Data ===
print("Loading SKU data from CSV...")
df = pd.read_csv(CSV_PATH)
df[DESC_COL] = df[DESC_COL].astype(str)
df[CODE_COL] = df[CODE_COL].astype(str)

# Create metadata list
sku_metadata = df[[DESC_COL, CODE_COL]].rename(columns={
    DESC_COL: "medicine_name",
    CODE_COL: "sku_code"
}).to_dict(orient="records")

# === Create Embeddings ===
print("Encoding SKU descriptions with model:", EMBED_MODEL_NAME)
model = SentenceTransformer(EMBED_MODEL_NAME)
embeddings = model.encode([row["medicine_name"] for row in sku_metadata], convert_to_numpy=True, show_progress_bar=True)

# === Normalize Embeddings ===
print("Normalizing embeddings...")
normalized_embeddings = normalize(embeddings, norm='l2')

# === Build FAISS Index (HNSW for speed) ===
d = normalized_embeddings.shape[1]
index = faiss.IndexHNSWFlat(d, 32)
index.hnsw.efConstruction = 200
index.add(normalized_embeddings)

# === Save Index and Metadata ===
os.makedirs(CACHE_DIR, exist_ok=True)
faiss.write_index(index, os.path.join(CACHE_DIR, "hnsw_index.faiss"))
np.save(os.path.join(CACHE_DIR, "sku_vectors.npy"), normalized_embeddings)
with open(os.path.join(CACHE_DIR, "sku_list.pkl"), "wb") as f:
    pickle.dump(sku_metadata, f)

print("FAISS index and SKU metadata saved in", CACHE_DIR)
