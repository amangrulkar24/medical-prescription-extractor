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
from rapidfuzz import process, fuzz
from datetime import datetime
import uuid

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

# === Smart Precaution & Follow-up Route ===
@app.route("/smart_advice", methods=["POST"])
def smart_advice():
    try:
        data = request.json
        diagnosis = data.get("diagnosis", "")
        medicines = data.get("medicines", [])

        if not medicines:
            return jsonify({"precaution": "", "followup": ""})

        med_list = ", ".join([med.get("medicine_name", "") for med in medicines])
        prompt = f"""
You are a clinical assistant.
Given the diagnosis: {diagnosis} and the medicines: {med_list},
Suggest:
1. Precautions the patient should follow (separate into medical and non-medical).
2. Follow-up advice (when the patient should return or retest).
Respond in plain English.
"""

        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=1024
        )
        response = completion.choices[0].message.content.strip()

        return jsonify({"advice": response})

    except Exception as e:
        logger.error(f"Smart advice error: {e}")
        return jsonify({"error": "Failed to generate smart advice."}), 500

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

             # Step 5: FAISS fallback with reranking
            query_vec = embed_model.encode([norm_input]).astype("float32")
            query_vec = normalize(query_vec, norm='l2')
            distances, indices = faiss_index.search(query_vec, 5)

            candidates = []
            for i, dist in zip(indices[0], distances[0]):
                sku = sku_list[i]
                score = round(1 / (1 + dist), 4)

                if strength and strength in sku.lower():
                    score += 0.05
                if raw_name.lower() in sku.lower():
                    score += 0.05

                candidates.append((sku, score))

            candidates.sort(key=lambda x: x[1], reverse=True)
            best_match, final_score = candidates[0]

            med["medicine_name"] = best_match
            med["match_confidence"] = float(final_score)
            med["match_reason"] = "semantic-faiss-reranked"

        except Exception as e:
            logger.warning(f"[Validation Error] {raw_name} → {e}")

        validated.append(med)
    return validated

# === Routes ===
# @app.route("/autocomplete", methods=["GET"])
# def autocomplete():
#     try:
#         query = request.args.get("q", "").strip().lower()
#         if not query:
#             return jsonify({"suggestions": []})

#         top_matches = process.extract(
#             query,
#             sku_list,
#             scorer=fuzz.WRatio,
#             limit=50
#         )

#         suggestions = [match[0] for match in top_matches if match[1] > 60]

#         return jsonify({"suggestions": suggestions})

#     except Exception as e:
#         logger.error(f"Autocomplete error: {e}")
#         return jsonify({"error": "Autocomplete failed"}), 500

DATA_FILE = "prescriptions.csv"

def generate_appointment_id():
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    short_uuid = str(uuid.uuid4())[:6]
    return f"APT-{timestamp}-{short_uuid}"

@app.route("/extract", methods=["POST"])
def extract_medicine():
    try:
        prescription_text = request.json.get("prescription", "")
        if not prescription_text:
            return jsonify({"error": "Prescription text is required"}), 400

        # === Step 1: Generate Appointment ID ===
        appointment_id = generate_appointment_id()
        timestamp = datetime.now().isoformat()

        # === Step 2: Send Prompt to LLM ===
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
- For medicine_duration: If not specified like 5 days, 2 weeks, months etc. Use next follow-up period as a duration. If period is in weeks or months then convert it into days.
- Estimate quantity: (morning+afternoon+evening)*medicine_duration.
- In dosage_adivce, include after or before meal/sleep/breakfast if mentioned. Otherwise, leave it empty.
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

        # === Step 3: Validate Medicines ===
        data["medicines"] = validate_medicine_names(data.get("medicines", []))

        # === Step 4: Save to CSV ===
        row = {
    "appointment_id": appointment_id,
    "patient_name": data.get("patient", {}).get("name", ""),
    "age": data.get("patient", {}).get("age", ""),
    "gender": data.get("patient", {}).get("gender", ""),
    "prescription_json": json.dumps(data),
    "timestamp": timestamp,
    "raw_text": prescription_text  # store the original input text
}


        if not os.path.isfile(DATA_FILE) or os.path.getsize(DATA_FILE) == 0:
            df = pd.DataFrame([row])
            df.to_csv(DATA_FILE, index=False)
        else:
            df = pd.read_csv(DATA_FILE)
            df = df._append(row, ignore_index=True)
            df.to_csv(DATA_FILE, index=False)

        # === Step 5: Return Response ===
        return jsonify({
            "appointment_id": appointment_id,
            "result": data
        })

    except Exception as e:
        logger.error(f"Extraction error: {e}")
        return jsonify({"error": f"Extraction failed: {str(e)}"}), 500

# === Routes ===

# Your /extract route is here

@app.route("/appointments", methods=["GET"])
def get_all_appointments():
    try:
        if not os.path.isfile(DATA_FILE) or os.path.getsize(DATA_FILE) == 0:
            return jsonify([])

        df = pd.read_csv(DATA_FILE)

        # Replace missing values with "Unknown"
        df[["patient_name", "gender"]] = df[["patient_name", "gender"]].fillna("Unknown")
        df["age"] = df["age"].fillna(0)

        records = df[["appointment_id", "patient_name", "age", "gender", "timestamp"]].to_dict(orient="records")
        return jsonify(records)

    except Exception as e:
        logger.error(f"Error fetching appointments: {e}")
        return jsonify({"error": "Failed to fetch appointments"}), 500


@app.route("/prescription/<appointment_id>", methods=["GET"])
def get_prescription_by_id(appointment_id):
    try:
        df = pd.read_csv(DATA_FILE)
        row = df[df["appointment_id"] == appointment_id]

        if row.empty:
            return jsonify({"error": "Not found"}), 404

        prescription_json = json.loads(row.iloc[0]["prescription_json"])
        raw_text = row.iloc[0].get("raw_text", "")

        return jsonify({
            "extracted": prescription_json,
            "raw_text": raw_text
        })

    except Exception as e:
        logger.error(f"Error loading prescription: {e}")
        return jsonify({"error": "Failed to load"}), 500


@app.route("/sku-list", methods=["GET"])
def get_sku_list():
    try:
        return jsonify(sku_list)
    except Exception as e:
        logger.error(f"SKU list error: {e}")
        return jsonify([]), 500

@app.route("/update-prescription/<appointment_id>", methods=["POST"])
def update_prescription(appointment_id):
    try:
        updated = request.get_json()
        df = pd.read_csv(DATA_FILE)

        # Locate and update the row
        idx = df[df["appointment_id"] == appointment_id].index
        if not idx.empty:
            df.at[idx[0], "prescription_json"] = json.dumps(updated)
            df.to_csv(DATA_FILE, index=False)
            return jsonify({"message": "Updated successfully"})
        else:
            return jsonify({"error": "Appointment not found"}), 404

    except Exception as e:
        logger.error(f"Error updating prescription: {e}")
        return jsonify({"error": "Failed to update"}), 500

# === Run ===
if __name__ == "__main__":
    app.run(debug=True)
