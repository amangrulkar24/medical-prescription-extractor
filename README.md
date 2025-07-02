# RxSage: AI-Powered Medical Prescription Structuring System

RxSage is an end-to-end AI-powered application built to extract, validate, and structure handwritten or typed medical prescriptions. It uses the latest Generative AI (LLMs), FAISS-based semantic search, and a fully integrated front-end/backend system to minimize hospital queue time, reduce medical errors, and streamline patient experience.

> 💡 Developed as a real-world solution for Hospitals with clinical impact, RxSage reduces pharmacy queue times from 7–10 minutes to 1–2 minutes per patient and improves billing accuracy by 78%.

---

## 🧠 Core Features

- **AI-based Entity Extraction:** Structured extraction of diagnosis, medicines, dosage, lab tests, radiology, procedures, follow-up, and precautions using LLaMA-3.3-70B via Groq API.
- **Validation with RAG:** Medicine/lab names are validated against SKU lists using a five-step fallback logic with FAISS + SentenceTransformer + fuzzy matching + LLM reranking.
- **Smart Advisory System:** Generates contextual follow-up recommendations, precaution guidelines, and alerts for allergy risks.
- **Role-Based Interface:** Seamless views for Doctor, Pharmacy, and Radiology roles with editable and printable structured views.
- **Appointment-based Tracking:** Unique appointment ID assigned to every prescription, enabling traceable, session-based data capture.
- **Auto-Complete for Medicines:** Frontend auto-suggestion for medicine names using Fuse.js and SKU integration.
- **Firebase Backend:** Scalable cloud backend for secure storage of structured prescription data.

---

## 🚀 Project Architecture

React + Tailwind
│
Frontend UI
│
Flask API (Python) ──→ Groq LLaMA-3 (Prompt Extraction)
│
RAG Matcher (FAISS + Fuzzy + LLM Reranker)
│
Structured JSON Output
│
Firebase Storage (per appointment_id)


---

## 🔧 Tech Stack

- **Frontend:** React.js, TailwindCSS, Fuse.js, Vite
- **Backend:** Python Flask, FAISS, SentenceTransformer, Groq API (LLaMA)
- **LLM Models:** `llama-3.3-70b-versatile` (info extraction & advice), `llama-3.1-8b-instant` (matcher reranking)
- **Database:** Firebase (NoSQL or SQL variant)
- **PDF Tools:** html2pdf.js for structured prescription printouts

---


---

## 🧪 How to Run

### 1. Clone the Repo
```bash
git clone https://github.com/yourusername/rxsage.git
cd rxsage
```
#### 2. Setup Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app_med_proc_v5.py
```
#### 3. Setup Frontend
```bash
cd frontend
npm install
npm run dev
```




