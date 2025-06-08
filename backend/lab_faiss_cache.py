import pandas as pd
import faiss
import json
from sentence_transformers import SentenceTransformer
import os

# === CONFIG ===
CSV_PATH = "procedure_comb_sku.csv"
MODEL_NAME = "all-MiniLM-L6-v2"  # Light, fast, decent accuracy
GROUPS = ["Lab", "Radiology", "Procedure"]
OUTPUT_DIR = "sku_index"

# === Ensure Output Dir Exists ===
os.makedirs(OUTPUT_DIR, exist_ok=True)

# === Load Data ===
df = pd.read_csv(CSV_PATH)
assert {"code", "description", "group"}.issubset(df.columns), "CSV must have code, description, group columns"

# === Load Sentence Embedding Model ===
model = SentenceTransformer(MODEL_NAME)

# === Process Each Group ===
for group in GROUPS:
    group_df = df[df["group"] == group].reset_index(drop=True)
    print(f"Processing group: {group} with {len(group_df)} entries")
    
    descriptions = group_df["description"].tolist()
    embeddings = model.encode(descriptions, show_progress_bar=True)

    # === Build FAISS Index ===
    dim = embeddings.shape[1]
    index = faiss.IndexFlatL2(dim)
    index.add(embeddings)
    
    # === Save FAISS Index ===
    faiss.write_index(index, f"{OUTPUT_DIR}/{group}.faiss")
    
    # === Save Mapping JSON ===
    mapping = [{"id": i, "code": group_df.loc[i, "code"], "description": group_df.loc[i, "description"]} for i in range(len(group_df))]
    with open(f"{OUTPUT_DIR}/{group}_map.json", "w") as f:
        json.dump(mapping, f, indent=2)

print("✅ FAISS indexes and mapping caches saved to:", OUTPUT_DIR)