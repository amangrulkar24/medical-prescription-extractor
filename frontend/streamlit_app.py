import streamlit as st
import requests
import pandas as pd

st.set_page_config(page_title="RxSage", layout="wide")

# Branding
st.markdown("""
    <h1 style='text-align: center; color: #4CAF50;'>RxSage</h1>
    <h4 style='text-align: center;'>AI-powered Medical Prescription Understanding</h4>
    <hr>
""", unsafe_allow_html=True)

# Auto-complete setup
st.subheader("📝 Enter Prescription")
if "suggestions" not in st.session_state:
    st.session_state.suggestions = []
if "typed_text" not in st.session_state:
    st.session_state.typed_text = ""

def fetch_autocomplete_suggestions(query):
    try:
        response = requests.get("http://127.0.0.1:5000/autocomplete", params={"q": query})
        response.raise_for_status()
        return response.json().get("suggestions", [])
    except:
        return []

def insert_autocomplete(selected_text):
    words = st.session_state.typed_text.split()
    if words:
        words[-1] = selected_text
    else:
        words = [selected_text]
    st.session_state.typed_text = " ".join(words)

# Text input
st.session_state.typed_text = st.text_area(
    "Prescription Text", 
    value=st.session_state.typed_text, 
    height=200, 
    key="prescription_input"
)

# Auto-complete suggestions
last_word = st.session_state.typed_text.strip().split(" ")[-1] if st.session_state.typed_text else ""
if last_word and len(last_word) >= 3:
    st.session_state.suggestions = fetch_autocomplete_suggestions(last_word)

    if st.session_state.suggestions:
        st.markdown("#### 💡 Suggestions:")
        cols = st.columns(len(st.session_state.suggestions))
        for i, suggestion in enumerate(st.session_state.suggestions):
            if cols[i].button(suggestion):
                insert_autocomplete(suggestion)
                st.experimental_rerun()

# Extract Button
if st.button("🔍 Extract Information"):
    if not st.session_state.typed_text.strip():
        st.warning("Please enter a prescription.")
    else:
        with st.spinner("Extracting..."):
            try:
                response = requests.post("http://127.0.0.1:5000/extract", json={"prescription": st.session_state.typed_text})
                response.raise_for_status()
                result = response.json()["result"]

                # Display Patient Details
                st.subheader("🩺 Patient Details")
                st.markdown(f"**Name:** {result['patient']['name']}  ")
                st.markdown(f"**Age:** {result['patient']['age']}  ")
                st.markdown(f"**Gender:** {result['patient']['gender']}  ")
                st.markdown(f"**Diagnosis:** {result['patient']['diagnosis']}  ")

                # Display Medicines
                st.subheader("💊 Prescribed Medicines")
                med_df = pd.DataFrame(result["medicines"])
                if not med_df.empty:
                    med_df.insert(0, "#", range(1, len(med_df) + 1))
                    med_df.rename(columns={
                        "medicine_type": "Medicine Type",
                        "medicine_name": "Medicine Name",
                        "medicine_dosage": "Dosage",
                        "medicine_frequency": "Frequency",
                        "medicine_duration": "Duration",
                        "medicine_quantity": "Total Quantity",
                        "match_confidence": "Match Confidence"
                    }, inplace=True)
                    med_df = med_df[[
                        "#", "Medicine Type", "Medicine Name", "Dosage",
                        "Frequency", "Duration", "Total Quantity", "Match Confidence"
                    ]]
                    st.table(med_df)
                else:
                    st.info("No medicines found.")

                # Display Lab Tests
                st.subheader("🧪 Recommended Lab Tests")
                lab_df = pd.DataFrame(result["labtest"])
                if not lab_df.empty:
                    lab_df.insert(0, "#", range(1, len(lab_df) + 1))
                    lab_df.rename(columns={
                        "test_name": "Test Name",
                        "test_type": "Test Type",
                        "subgroup": "Subgroup"
                    }, inplace=True)
                    st.table(lab_df)
                else:
                    st.info("No lab tests found.")

                # Display Precautions
                st.subheader("⚠️ Precautions")
                st.markdown(f"**Medical:** {result['precaution']['medical']}  ")
                st.markdown(f"**Non-Medical:** {result['precaution']['non-medical']}  ")

                # Display Follow-up
                st.subheader("🗕️ Follow-up")
                st.markdown(f"**Next Follow-up Date:** {result['followup']['next_followup']}  ")

            except Exception as e:
                st.error(f"Extraction failed: {e}")