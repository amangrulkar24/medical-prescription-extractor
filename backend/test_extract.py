import requests
import json

url = "http://127.0.0.1:5000/extract"

sample_prescription = """
Patient Name: Arun, Age: 52, Gender: Male
Diagnosis: Hypertension and suspected cardiac issues

Rx:
Tab Amlodipine 5mg OD
Tab Ecosprin 75mg once after meal

Investigations:
CBC, ECG, 2D Echo, Chest X-ray PA view
"""

response = requests.post(url, json={"prescription": sample_prescription})

if response.status_code == 200:
    print("✅ Extraction Successful:\n")
    print(json.dumps(response.json(), indent=2))
else:
    print("❌ Failed:", response.status_code)
    print(response.text)
