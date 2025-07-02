import os
import json
import logging
import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from datetime import datetime
import uuid
import groq
import pickle
from matcher_v2 import validate_medicine_names, validate_group_terms
from dotenv import load_dotenv
load_dotenv()

import warnings
warnings.filterwarnings("ignore", category=UserWarning)

# === Setup ===
load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
app = Flask(__name__)
CORS(app)

app.config["DEBUG"] = True

# === Load FAISS & SKU Cache ===
with open("faiss_cache/sku_list.pkl", "rb") as f:
    sku_list = pickle.load(f)

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
2. Follow-up advice (when the patient should return or retest, give medical test recommendation if relevant to diagnosis).
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

        appointment_id = generate_appointment_id()
        timestamp = datetime.now().isoformat()

        prompt = f"""Extract patient details, medicine information, and diagnostic tests, procedures from this prescription text:
{prescription_text}

Return the result as a valid JSON object only, without explanations, markdown formatting, or any additional text.
Use this exact format:
{{
  "patient": {{ "name": string, "age": number, "gender": string, "diagnosis": string }},
  "medicines": [
    {{ 
      "medicine_type": string,
      "medicine_name": string,
      "medicine_dosage": string,
      "medicine_frequency": string,
      "dosage_advice": string,
      "medicine_duration": string,
      "medicine_quantity": number
    }}
  ],
  "labtests": [
    {{
      "test_name": string,
      "test_type": string,
    }}
  ],
  "radiology": [
    {{
      "test_name": string,
      "test_type": string,
    }}
  ],
  "procedures": [
    {{
      "procedure_name": string,
      "procedure_type": string
    }}
  ],
  "precaution": {{ "medical": string, "non-medical": string }},
  "followup": {{ "next_followup": string }}
}}

Rules:
- If no info found, return empty string or 0.
- medicine_type can be "tablet", "capsule", "syrup", "injection", "ointment", etc.
- medicine_dosage should be in standard format like "5 mg", "10 ml", etc.
- Convert 'OD', 'BD', 'TDS', 'QID' frequency to '1-0-0' format
- Use '1-0-1' style for frequency. For once/twice/thrice daily, check if it's after/before lunch/dinner.
  - "once after dinner" → "0-0-1"
  - "twice daily (morning and night)" → "1-0-1"
  - "thrice daily" → "1-1-1"
- For medicine_duration: If not specified (like 5 days, 2 weeks, etc.), use the next follow-up period as duration (convert weeks/months to days).
- Estimate quantity: (morning + afternoon + evening) * medicine_duration.
- In dosage_advice, include 'after meal', 'before sleep', etc., if mentioned. Else, leave empty.
- For labtest, radiology and procedure classification, follow these rules:
  - “blood test”, “TSH”, “CBC”, “HbA1c” under `labtests`
  - “MRI brain”, “CT abdomen”, “X-ray chest” under `radiology`
  - “ECG”, “2D Echo”, “NCV”, “Endoscopy” under `procedures`
  - Ignore physiotherapy from including in procedures
  - Include only new lab test/procedure/radiology test recommended *after* the medicine list or in the advice section, not those that appear as prior reports.
- In precautions:
  - Food or lifestyle-related → `non-medical`
  - Treatment or medicine-specific → `medical`
- Recheck for missing medicines after every mention of frequency/duration.

Return **only the JSON** object — no markdown, text, or explanations.
"""
        print("[DEBUG] Prompt Sent to LLM:")
        print(prompt)

        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=3000
        )

        response = completion.choices[0].message.content.strip()

        print("[DEBUG] LLM Response:")
        print(response)

        json_start = response.find("{")
        json_end = response.rfind("}")
        json_content = response[json_start:json_end + 1]
        data = json.loads(json_content)

        data["medicines"] = validate_medicine_names(data.get("medicines", []))
        data["labtests"] = validate_group_terms(data.get("labtests", []), "lab")
        data["radiology"] = validate_group_terms(data.get("radiology", []), "radiology")
        data["procedures"] = validate_group_terms(data.get("procedures", []), "procedure")

        for item in data["labtests"]:
            item["test_name"] = item.pop("name", "")
            item["test_type"] = item.pop("type", "")

        for item in data["radiology"]:
            item["test_name"] = item.pop("name", "")
            item["test_type"] = item.pop("type", "")

        for item in data["procedures"]:
            item["procedure_name"] = item.pop("name", "")
            item["procedure_type"] = item.pop("type", "")

        row = {
            "appointment_id": appointment_id,
            "patient_name": data.get("patient", {}).get("name", ""),
            "age": data.get("patient", {}).get("age", ""),
            "gender": data.get("patient", {}).get("gender", ""),
            "prescription_json": json.dumps(data),
            "timestamp": timestamp,
            "raw_text": prescription_text
        }

        print("[DEBUG] Final data sent to frontend:")
        print(json.dumps(data, indent=2))


        if not os.path.isfile(DATA_FILE) or os.path.getsize(DATA_FILE) == 0:
            df = pd.DataFrame([row])
            df.to_csv(DATA_FILE, index=False)
        else:
            df = pd.read_csv(DATA_FILE)
            df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
            df.to_csv(DATA_FILE, index=False)

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
        with open("faiss_cache/sku_list.pkl", "rb") as f:
            sku_data = pickle.load(f)  # expects list of {"medicine_name": ..., "sku_code": ...}
        return jsonify(sku_data)
    except Exception as e:
        logger.error(f"SKU list error: {e}")
        return jsonify([]), 500

@app.route("/procedure-sku-list", methods=["GET"])
def get_procedure_sku_list():
    try:
        with open("faiss_cache_lab/procedure_sku_list.pkl", "rb") as f:
            sku_data = pickle.load(f)  # [{ "name": ..., "code": ... }, ...]
        return jsonify(sku_data)
    except Exception as e:
        logger.error(f"Procedure SKU list error: {e}")
        return jsonify([]), 500

@app.route("/update-prescription/<appointment_id>", methods=["POST"])
def update_prescription(appointment_id):
    data = request.json
    extracted = data.get("extracted", {})
    raw_text = data.get("raw_text", "")

    df = pd.read_csv(DATA_FILE)

    if appointment_id in df["appointment_id"].values:
        df.loc[df["appointment_id"] == appointment_id, "prescription_json"] = json.dumps(extracted)
        df.loc[df["appointment_id"] == appointment_id, "raw_text"] = raw_text
    else:
        new_row = {
            "appointment_id": appointment_id,
            "prescription_json": json.dumps(extracted),
            "raw_text": raw_text
        }
        df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)

    df.to_csv(DATA_FILE, index=False)
    return jsonify({"message": "Updated successfully"})

if __name__ == "__main__":
    print("✅ RxSage backend is running...")
    app.run(host="0.0.0.0", port=5000, debug=True)
