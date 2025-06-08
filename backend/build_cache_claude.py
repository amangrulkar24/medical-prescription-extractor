import os
import json
import logging
import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import re

# === Setup ===
load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
app = Flask(__name__)
CORS(app)

# === Constants ===
ABBREVIATION_MAP = {
    "syp": "syrup",
    "tab": "tablet",
    "cap": "capsule",
    "inj": "injection",
    "oint": "ointment",
    "drop": "drops"
}

# === Utility ===
def normalize_string(text):
    text = text.lower()
    for abbr, full in ABBREVIATION_MAP.items():
        text = re.sub(rf"\b{abbr}\b", full, text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return text.strip()

# === Load SKU Enriched Data ===
sku_df = pd.read_csv("medicine_sku_enriched_mapped.csv")
sku_df = sku_df.fillna("")
sku_df["normalized_name"] = sku_df["medicine_name"].apply(normalize_string)
sku_df["normalized_type"] = sku_df["medicine_type"].apply(normalize_string)
sku_df["normalized_dosage"] = sku_df["medicine_dosage"].apply(normalize_string)

# === Matching Function ===
def match_medicine(extracted_name, extracted_type, extracted_dosage):
    extracted_name = normalize_string(extracted_name)
    extracted_type = normalize_string(extracted_type)
    extracted_dosage = normalize_string(extracted_dosage)

    best_match = None
    max_score = -1

    for _, row in sku_df.iterrows():
        name_score = int(extracted_name in row["normalized_name"])
        type_score = int(extracted_type in row["normalized_type"])
        dosage_score = int(extracted_dosage in row["normalized_dosage"])
        total_score = name_score + type_score + dosage_score

        if total_score > max_score:
            max_score = total_score
            best_match = row["medicine_desc"]

    return best_match if best_match else ""

# === Flask Routes ===
@app.route("/match", methods=["POST"])
def match():
    data = request.get_json()
    name = data.get("medicine_name", "")
    mtype = data.get("medicine_type", "")
    dosage = data.get("medicine_dosage", "")

    matched = match_medicine(name, mtype, dosage)
    return jsonify({"match": matched})

# === Run ===
if __name__ == "__main__":
    app.run(debug=True)
