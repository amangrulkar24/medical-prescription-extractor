import os
import json
import re
import faiss
import pickle
import numpy as np
import pandas as pd
from sklearn.preprocessing import normalize
# from sentence_transformers import SentenceTransformer
from difflib import get_close_matches
import logging
from rapidfuzz import fuzz
import groq
import requests
from huggingface_hub import InferenceClient
from dotenv import load_dotenv
load_dotenv()

# === Logger ===
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# === Groq Client for Reranking ===
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise ValueError("Missing GROQ_API_KEY")
groq_client = groq.Groq(api_key=GROQ_API_KEY)

# === Hugging Face Client for Embeddings ===
hf_client = InferenceClient()

def get_embedding(text):
    try:
        embedding = hf_client.feature_extraction(
            text,
            model="sentence-transformers/all-MiniLM-L6-v2"
        )
        return np.array(embedding, dtype="float32").reshape(1, -1)
    except Exception as e:
        logger.warning(f"[HF Embedding Error] {e}")
        raise


# === Abbreviation and Synonym Maps ===
ABBREVIATION_MAP = {
    "syp": "syrup",
    "tab": "tablet",
    "cap": "capsule",
    "inj": "injection",
    "oint": "ointment",
    "drop": "drops"
}

ABBREVIATION_EXPANSION = {
    "b/l": "bilateral",
    "ul": "upper limb",
    "ll": "lower limb",
    "r": "right",
    "l": "left",
    "ncv": "nerve conduction velocity",
    "kft": "kidney function test",
    "lft": "liver function test",
    "cbc": "complete blood count",
    "tft": "thyroid function test",
    "renal": "renal function test",
    "nct": "nerve conduction test",
    "ncs": "nerve conduction study",
    "nerve conduction": "nerve conduction study",
    "nerve conduction velocity": "nerve conduction study",  
    "emg": "electromyography",
    "mri": "magnetic resonance imaging",
    "ct": "computed tomography",
    "vit": "vitamin"
}

SYNONYM_MAP = {
    "both": "bilateral",
    "arms": "upper limb",
    "legs": "lower limb",
    "brain": "head",
    "abdomen": "stomach"
}

# === Normalize ===
def expand_abbreviations(text):
    text = text.lower()
    for abbr, full in ABBREVIATION_EXPANSION.items():
        text = re.sub(rf'\b{re.escape(abbr)}\b', full, text)
    for syn, full in SYNONYM_MAP.items():
        text = re.sub(rf'\b{re.escape(syn)}\b', full, text)
    return text

def normalize_string(text):
    text = expand_abbreviations(text)
    for abbr, full in ABBREVIATION_MAP.items():
        text = re.sub(rf"\b{abbr}\b", full, text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return text.strip()

# === Load Medicine SKU ===
sku_df = pd.read_csv("medicine_sku_comp.csv")
sku_df["medicine_desc"] = sku_df["medicine_desc"].astype(str)
sku_df["normalized"] = sku_df["medicine_desc"].apply(normalize_string)
sku_df["strength"] = sku_df["medicine_desc"].apply(
    lambda x: re.search(r"\b(\d{1,4})\s*(mg|mcg|ug|g|ml)\b", x.lower()).group(0)
    if re.search(r"\b(\d{1,4})\s*(mg|mcg|ug|g|ml)\b", x.lower()) else ""
)

sku_df["sku_code"] = sku_df["sku_code"].astype(str)

sku_code_lookup = dict(zip(sku_df["medicine_desc"], sku_df["sku_code"]))

with open("faiss_cache/sku_list.pkl", "rb") as f:
    sku_list = pickle.load(f)

sku_vectors = np.load("faiss_cache/sku_vectors.npy")
faiss_index = faiss.read_index("faiss_cache/hnsw_index.faiss")

# === Validate Medicine Names ===
def validate_medicine_names(extracted_meds):
    validated = []
    for med in extracted_meds:
        raw_name = med.get("medicine_name", "").strip()
        raw_type = med.get("medicine_type", "").strip()
        raw_dosage = med.get("medicine_dosage", "").strip()
        
         # Preserve original name
        med["raw_medicine_name"] = raw_name

        if not raw_name:
            validated.append(med)
            continue

        concat_input = f"{raw_name} {raw_type} {raw_dosage}".strip()
        norm_input = normalize_string(concat_input)
        norm_base_name = normalize_string(raw_name)
        strength_match = re.search(r"\b(\d{1,4})\s*(mg|mcg|ug|g|ml)\b", raw_dosage.lower())
        strength = strength_match.group(0) if strength_match else ""

        try:
            if norm_input in sku_df["normalized"].values:
                row = sku_df[sku_df["normalized"] == norm_input].iloc[0]
                med["medicine_name"] = row["medicine_desc"]
                med["match_confidence"] = 1.0
                med["match_reason"] = "normalized-concat-exact"
                med["sku_code"] = row["sku_code"]
                validated.append(med)
                continue

            strength_matches = sku_df[sku_df["strength"] == strength]
            strength_matches = strength_matches[strength_matches["normalized"].str.contains(norm_base_name)]
            if not strength_matches.empty:
                row = strength_matches.iloc[0]
                med["medicine_name"] = row["medicine_desc"]
                med["match_confidence"] = 0.95
                med["match_reason"] = "strength-based-name-match"
                med["sku_code"] = row["sku_code"]
                validated.append(med)
                continue

            starts_with_matches = sku_df[sku_df["normalized"].str.startswith(norm_base_name)]
            if not starts_with_matches.empty:
                row = starts_with_matches.iloc[0]
                med["medicine_name"] = row["medicine_desc"]
                med["match_confidence"] = 0.93
                med["match_reason"] = "name-prefix-match"
                med["sku_code"] = row["sku_code"]
                validated.append(med)
                continue

            candidates = get_close_matches(norm_input, sku_df["normalized"].tolist(), n=5, cutoff=0.65)
            if candidates:
                for candidate in candidates:
                    row = sku_df[sku_df["normalized"] == candidate]
                    if not row.empty:
                        row = row.iloc[0]
                        med["medicine_name"] = row["medicine_desc"]
                        med["match_confidence"] = 0.85
                        med["match_reason"] = "normalized-multistage-fuzzy"
                        med["sku_code"] = row["sku_code"]
                        break
                validated.append(med)
                continue

            query_vec = get_embedding(norm_input)
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
            med["sku_code"] = sku_code_lookup.get(best_match, "")

        except Exception as e:
            logger.warning(f"[Validation Error] {raw_name} → {e}")

        validated.append(med)
    return validated

# === Normalization ===
def expand_abbreviations(text):
    text = text.lower()
    for abbr, full in ABBREVIATION_EXPANSION.items():
        text = re.sub(rf'\b{re.escape(abbr)}\b', full, text)
    for syn, full in SYNONYM_MAP.items():
        text = re.sub(rf'\b{re.escape(syn)}\b', full, text)
    return text

def normalize_string(text):
    text = expand_abbreviations(text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return text.strip()

# === FAISS & Mappings ===
def load_faiss_and_mapping(group):
    index = faiss.read_index(f"sku_index/{group}.faiss")
    with open(f"sku_index/{group}_map.json", "r") as f:
        mapping = json.load(f)
    return index, mapping

# === LLM Reranker ===
def rerank_with_llm(query, candidates):
    options_text = "\n".join([f"{i+1}. {c['description']}" for i, c in enumerate(candidates)])
    prompt = f"""
Given the extracted test name: \"{query}\", and the following options:
{options_text}
Which of these best matches the test in a medical context? Reply with only the best option number.
"""
    try:
        completion = groq_client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=10
        )
        answer = completion.choices[0].message.content.strip()
        idx = int(answer.split(".")[0]) - 1
        return candidates[idx]
    except Exception as e:
        logger.warning(f"[LLM Rerank Error] {e}")
        return candidates[0] if candidates else None

# === Matching Logic for Lab / Radiology / Procedure ===
CORE_TERMS = {"ncv", "emg", "vitamin", "cbc", "ct", "mri", "thyroid", "renal"}

def match_single_entry(term, group):
    term_name = term.get("test_name") or term.get("procedure_name", "")
    norm_name = normalize_string(term_name)
    if not norm_name:
        return term

    def get_best_match(norm_term, group_name):
        index, mapping = load_faiss_and_mapping(group_name)
        tokens = set(norm_term.split())

        # Step 1: Exact Match
        for entry in mapping:
            desc = normalize_string(entry["description"])
            if norm_term == desc:
                return {
                    "name": term_name,
                    "type": term.get("test_type") or term.get("procedure_type", ""),
                    "matched": entry["description"],
                    "sku_code": entry["code"],
                    "match_confidence": 1.0,
                    "match_reason": f"normalized-exact-{group_name}"
                }

        # Step 2: Token + Fuzzy Score + Heuristic Boosts
        candidates = []
        for entry in mapping:
            desc = normalize_string(entry["description"])
            desc_tokens = set(desc.split())
            jaccard = len(tokens & desc_tokens) / len(tokens | desc_tokens) if tokens else 0
            fuzzy = fuzz.partial_ratio(norm_term, desc) / 100
            score = 0.5 * jaccard + 0.5 * fuzzy

            if desc_tokens.issubset(tokens):
                score += 0.15
            if any(core in desc for core in CORE_TERMS if core in norm_term):
                score += 0.1

            candidates.append((entry, score))

        candidates.sort(key=lambda x: (-x[1], len(x[0]["description"].split())))
        top_entry, top_score = candidates[0]

        # Step 3: FAISS + Rerank fallback only if no token subset match
        top_subset_match = next((c[0] for c in candidates[:5]
                                 if set(normalize_string(c[0]["description"]).split()).issubset(tokens)), None)

        if top_subset_match:
            return {
                "name": term_name,
                "type": term.get("test_type") or term.get("procedure_type", ""),
                "matched": top_subset_match["description"],
                "sku_code": top_subset_match["code"],
                "match_confidence": 0.88,
                "match_reason": f"token-subset-{group_name}"
            }

        try:
            query_vec = get_embedding(norm_term)
            query_vec = normalize(query_vec, norm='l2')
            distances, indices = index.search(query_vec, 5)
            faiss_candidates = [mapping[i] for i in indices[0]]
            selected = rerank_with_llm(norm_term, faiss_candidates)
            return {
                "name": term_name,
                "type": term.get("test_type") or term.get("procedure_type", ""),
                "matched": selected["description"],
                "sku_code": selected["code"],
                "match_confidence": round(top_score, 4),
                "match_reason": f"llm-reranked-{group_name}"
            }
        except Exception as e:
            logger.warning(f"[Groq Embedding Error] {e}")

        return {
            "name": term_name,
            "type": term.get("test_type") or term.get("procedure_type", ""),
            "matched": top_entry["description"],
            "sku_code": top_entry["code"],
            "match_confidence": round(top_score, 4),
            "match_reason": f"jaccard-fuzzy-{group_name}"
        }

    if group == "radiology":
        match = get_best_match(norm_name, "Radiology") or get_best_match(norm_name, "Procedure")
    else:
        match = get_best_match(norm_name, group.capitalize())

    return match or {
        "name": term_name,
        "type": term.get("test_type") or term.get("procedure_type", ""),
        "matched": "",
        "sku_code": "",
        "match_confidence": 0.0,
        "match_reason": "no-match"
    }

# === Batch Wrapper ===
def validate_group_terms(terms, group):
    return [match_single_entry(term, group) for term in terms if term.get("test_name") or term.get("procedure_name")]
