import os
import json
import logging
import pandas as pd
import numpy as np
import faiss
import pickle
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
import groq
import re
from difflib import get_close_matches
from sklearn.preprocessing import normalize

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
        text = re.sub(rf"\\b{abbr}\\b", full, text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return text.strip()

# === Load FAISS & SKU Cache ===
with open("faiss_cache/sku_list.pkl", "rb") as f:
    sku_list = pickle.load(f)

sku_vectors = np.load("faiss_cache/sku_vectors.npy")
faiss_index = faiss.read_index("faiss_cache/hnsw_index.faiss")

sku_df = pd.read_csv("medicine_sku_comp.csv")
sku_df["medicine_desc"] = sku_df["medicine_desc"].astype(str)

# === Build normalized concat field ===
sku_df["normalized"] = sku_df["medicine_desc"].apply(normalize_string)
sku_df["strength"] = sku_df["medicine_desc"].apply(lambda x: re.search(r"\b(\d{1,4})\s*(mg|mcg|ug|g|ml)\b", x.lower()).group(0) if re.search(r"\b(\d{1,4})\s*(mg|mcg|ug|g|ml)\b", x.lower()) else "")

embed_model = SentenceTransformer("all-MiniLM-L6-v2")

# === Groq LLM ===
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise ValueError("Missing GROQ_API_KEY")
groq_client = groq.Groq(api_key=GROQ_API_KEY)

# === Match Logic ===
def validate_medicine_names(extracted_meds):
    validated = []
    for med in extracted_meds:
        raw_name = med.get("medicine_name", "").strip()
        raw_type = med.get("medicine_type", "").strip()
        raw_dosage = med.get("medicine_dosage", "").strip()

        if not raw_name:
            validated.append(med)
            continue

        concat_input = f"{raw_name} {raw_type} {raw_dosage}".strip()
        norm_input = normalize_string(concat_input)
        norm_base_name = normalize_string(raw_name)
        strength_match = re.search(r"\b(\d{1,4})\s*(mg|mcg|ug|g|ml)\b", raw_dosage.lower())
        strength = strength_match.group(0) if strength_match else ""

        try:
            # Step 1: Exact match in normalized list
            if norm_input in sku_df["normalized"].values:
                exact_match = sku_df[sku_df["normalized"] == norm_input]["medicine_desc"].values[0]
                med["medicine_name"] = exact_match
                med["match_confidence"] = 1.0
                med["match_reason"] = "normalized-concat-exact"
                validated.append(med)
                continue

            # Step 2: Strength-based match
            strength_matches = sku_df[sku_df["strength"] == strength]
            strength_matches = strength_matches[strength_matches["normalized"].str.contains(norm_base_name)]
            if not strength_matches.empty:
                best = strength_matches.iloc[0]["medicine_desc"]
                med["medicine_name"] = best
                med["match_confidence"] = 0.95
                med["match_reason"] = "strength-based-name-match"
                validated.append(med)
                continue

            # Step 3: Strong prefix match
            starts_with_matches = sku_df[sku_df["normalized"].str.startswith(norm_base_name)]
            if not starts_with_matches.empty:
                best = starts_with_matches.iloc[0]["medicine_desc"]
                med["medicine_name"] = best
                med["match_confidence"] = 0.93
                med["match_reason"] = "name-prefix-match"
                validated.append(med)
                continue

            # Step 4: Fuzzy match (multi-stage with lower threshold)
            candidates = get_close_matches(norm_input, sku_df["normalized"].tolist(), n=5, cutoff=0.65)
            if candidates:
                for candidate in candidates:
                    row = sku_df[sku_df["normalized"] == candidate]
                    if not row.empty:
                        med["medicine_name"] = row.iloc[0]["medicine_desc"]
                        med["match_confidence"] = 0.85
                        med["match_reason"] = "normalized-multistage-fuzzy"
                        break
                validated.append(med)
                continue

            # Step 5: FAISS fallback
            query_vec = embed_model.encode([norm_input]).astype("float32")
            query_vec = normalize(query_vec, norm='l2')
            distances, indices = faiss_index.search(query_vec, 1)
            best_index = indices[0][0]
            best_distance = distances[0][0]
            closest_match = sku_list[best_index]
            confidence = round(1 / (1 + best_distance), 4)

            med["medicine_name"] = closest_match
            med["match_confidence"] = float(confidence)
            med["match_reason"] = "semantic-faiss"

        except Exception as e:
            logger.warning(f"[Validation Error] {raw_name} → {e}")

        validated.append(med)
    return validated


# === Routes ===
@app.route("/autocomplete", methods=["GET"])
@app.route("/autocomplete", methods=["GET"])
def autocomplete():
    try:
        query = request.args.get("q", "").strip().lower()
        if not query:
            return jsonify({"suggestions": []})

        suggestions_with_scores = {}

        # Step 1: Prefix matches (confidence = 1.0)
        for sku in sku_list:
            if sku.lower().startswith(query):
                suggestions_with_scores[sku] = 1.0

        # Step 2: Substring fuzzy matches (confidence = 0.9)
        for sku in sku_list:
            if query in sku.lower() and sku not in suggestions_with_scores:
                suggestions_with_scores[sku] = 0.9

        # Step 3: FAISS fallback (semantic match)
        if len(suggestions_with_scores) < 50:
            query_vec = embed_model.encode([query]).astype("float32")
            distances, indices = faiss_index.search(query_vec, 30)

            for i, dist in zip(indices[0], distances[0]):
                sku = sku_list[i]
                if sku not in suggestions_with_scores:
                    confidence = round(1 / (1 + dist), 4)
                    suggestions_with_scores[sku] = confidence

        # Sort by confidence descending
        sorted_suggestions = sorted(
            suggestions_with_scores.items(),
            key=lambda x: x[1],
            reverse=True
        )

        # Only return the strings (optionally add score for debug)
        suggestions = [sku for sku, score in sorted_suggestions][:50]

        return jsonify({"suggestions": suggestions})

    except Exception as e:
        logger.error(f"Autocomplete error: {e}")
        return jsonify({"error": "Autocomplete failed"}), 500

@app.route("/extract", methods=["POST"])
def extract_medicine():
    try:
        prescription_text = request.json.get("prescription", "")
        if not prescription_text:
            return jsonify({"error": "Prescription text is required"}), 400

        prompt = f"""Extract patient details and medicine information from this prescription text:
{prescription_text}

Return the result as a valid JSON object only, without explanations, markdown formatting, or any additional text.
Use this exact format:
{{
  "patient": {{ "name": string, "age": number, "gender": string, "diagnosis": string }},
  "medicines": [{{ "medicine_type": string, "medicine_name": string, "medicine_dosage": string, "medicine_frequency": string, "dosage_advice": string, "medicine_duration": string, "medicine_quantity": number }}],
  "labtest": [{{ "test_name": string, "test_type": string, "subgroup": string }}],
  "precaution": {{ "medical": string, "non-medical": string }},
  "followup": {{ "next_followup": string }}
}}

Rules:
- If no info found, return empty string or 0.
- Use '1-0-1' style for frequency. if once/twice/thrice daily then handle case by checking of it is after/before lunch/dinner.
- thrice daily = 1-1-1
- Estimate quantity: (morning+afternoon+evening)*days.
- For medicine_duration: If not specified like 5 days, 2 weeks, etc. Use next follow-up period as a duration. 
In dosage_adivce, include after or before meal/sleep/breakfast if mentioned. Otherwise, leave it empty.
- For labtest: Only include those which are recommended after the medicine. Dont include those test which seems to be historical report of the patient.
- For Precaution: Differentiate medical and non-medical advice. Food related would come in non-medical, treatment related would be in medical.
After every mention of frequency or duration, recheck if all medicines are being extracted or not. If not, include the missing one.
- Don't return markdown. Return only JSON.
"""

        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            max_tokens=3000
        )

        response = completion.choices[0].message.content.strip()
        json_start = response.find("{")
        json_end = response.rfind("}")
        json_content = response[json_start:json_end + 1]
        data = json.loads(json_content)

        # ✅ Validate
        data["medicines"] = validate_medicine_names(data.get("medicines", []))

        return jsonify({"result": data})

    except Exception as e:
        logger.error(f"Extraction error: {e}")
        return jsonify({"error": f"Extraction failed: {str(e)}"}), 500

# === Run ===
if __name__ == "__main__":
    app.run(debug=True)
