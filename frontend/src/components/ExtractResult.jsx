import React, { useState } from 'react';

export default function ExtractResult({ result }) {
  const [smartAdvice, setSmartAdvice] = useState(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  

  if (!result) return null;

  const { patient, medicines, labtests, radiology, procedures, precaution, followup } = result;

  const fetchSmartAdvice = async () => {
    setLoadingAdvice(true);
    try {
      const BASE_URL = import.meta.env.VITE_BACKEND_URL;
      const res = await fetch(`${BASE_URL}/smart_advice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diagnosis: patient?.diagnosis || "",
          medicines: medicines || [],
        }),
      });
      const data = await res.json();
      if (data.advice) {
        setSmartAdvice(data.advice);
      }
    } catch (err) {
      console.error("Failed to fetch smart advice:", err);
    } finally {
      setLoadingAdvice(false);
    }
  };

  const renderMatchedTable = (title, data, label) => (
    <>
      <h2 className="text-2xl font-bold text-green-400 mt-6 mb-2">{title}</h2>
      {data.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm bg-neutral-900 rounded border border-green-800">
            <thead className="bg-green-800 text-white">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">SKU Code</th>
                <th className="px-3 py-2 text-left">Matched Name</th>
                <th className="px-3 py-2 text-left">Prescribed Name</th>
                <th className="px-3 py-2 text-left">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {data.map((entry, idx) => (
                <tr key={idx} className="border-t border-green-700 hover:bg-neutral-800">
                  <td className="px-3 py-2">{idx + 1}</td>
                  <td className="px-3 py-2">{entry.sku_code || "-"}</td>
                  <td className="px-3 py-2">{entry.matched || "-"}</td>
                  <td className="px-3 py-2">{entry.test_name || entry.procedure_name}</td>
                  <td className="px-3 py-2">
                    <span className={`font-semibold ${entry.match_confidence >= 0.9 ? 'text-green-300' : 'text-yellow-400'}`}>
                      {entry.match_confidence.toFixed(2)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-gray-400">No {label} found.</p>
      )}
    </>
  );

  const formatAdviceText = (advice) => {
    let formatted = advice
      // Convert section headings (###) to styled <h4>
      .replace(/###\s*(.*)/g, '<h4 class="text-green-400 font-semibold mt-4 mb-2 text-md">$1</h4>')
      // Convert bold markers (**) to strong tags with white text
      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
      // Ordered list items: numbered bullets
      .replace(/\n\d+\.\s*/g, '</p><li class="mb-1 ml-4 list-decimal list-inside text-white">')
      // Unordered list items: dash bullets
      .replace(/\n-\s*/g, '</p><li class="mb-1 ml-4 list-disc list-inside text-white">')
      // Double line breaks to close list items
      .replace(/\n{2,}/g, '</li><br/>')
      // Line breaks
      .replace(/\n/g, '<br/>');
  
    // Wrap everything in a styled container
    return `<div class="text-sm font-sans leading-relaxed space-y-2">${formatted}</div>`;
  };
  

  return (
    <div className="mt-10 border-t pt-6 text-white">
      {/* Patient Info */}
      <h2 className="text-2xl font-bold text-green-400 mb-2">🩺 Patient Details</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-green-100">
        <p><strong>Name:</strong> {patient.name}</p>
        <p><strong>Age:</strong> {patient.age}</p>
        <p><strong>Gender:</strong> {patient.gender}</p>
        <p><strong>Diagnosis:</strong> {patient.diagnosis}</p>
      </div>

      {/* Medicines */}
      <h2 className="text-2xl font-bold text-green-400 mt-6 mb-2">💊 Prescribed Medicines</h2>
      {medicines.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm bg-neutral-900 rounded border border-green-800">
            <thead className="bg-green-800 text-white">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">SKU Code</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Dosage</th>
                <th className="px-3 py-2 text-left">Frequency</th>
                <th className="px-3 py-2 text-left">Advice</th>
                <th className="px-3 py-2 text-left">Duration</th>
                <th className="px-3 py-2 text-left">Qty</th>
                <th className="px-3 py-2 text-left">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {medicines.map((med, idx) => (
                <tr key={idx} className="border-t border-green-700 hover:bg-neutral-800">
                  <td className="px-3 py-2">{idx + 1}</td>
                  <td className="px-3 py-2">{med.sku_code || "-"}</td>
                  <td className="px-3 py-2">{med.medicine_name}</td>
                  <td className="px-3 py-2">{med.medicine_type}</td>
                  <td className="px-3 py-2">{med.medicine_dosage}</td>
                  <td className="px-3 py-2">{med.medicine_frequency}</td>
                  <td className="px-3 py-2">{med.dosage_advice}</td>
                  <td className="px-3 py-2">{med.medicine_duration}</td>
                  <td className="px-3 py-2">{med.medicine_quantity}</td>
                  <td className="px-3 py-2">
                    <span className={`font-semibold ${med.match_confidence >= 0.9 ? 'text-green-300' : 'text-yellow-400'}`}>
                      {med.match_confidence.toFixed(2)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-gray-400">No medicines found.</p>
      )}

      {/* Lab, Radiology, Procedure Tables */}
      {renderMatchedTable("🧪 Lab Tests", labtests, "lab tests")}
      {renderMatchedTable("🩻 Radiology", radiology, "radiology")}
      {renderMatchedTable("🛠️ Procedures", procedures, "procedures")}

      {/* Precautions */}
      <h2 className="text-2xl font-bold text-green-400 mt-6 mb-2">⚠️ Precautions</h2>
      <div className="text-green-100 text-sm">
        <p><strong>Medical:</strong> {precaution.medical}</p>
        <p><strong>Non-Medical:</strong> {precaution["non-medical"]}</p>
      </div>

      {/* Follow-up */}
      <h2 className="text-2xl font-bold text-green-400 mt-6 mb-2">📅 Follow-up</h2>
      <p className="text-green-100 text-sm"><strong>Next Follow-up:</strong> {followup.next_followup}</p>

      {/* Smart Advice Button */}
      <div className="mt-8">
        <button
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-5 py-2 rounded-xl shadow"
          onClick={fetchSmartAdvice}
        >
          {loadingAdvice ? "Generating..." : "💡 Generate Smart Advice"}
        </button>
      </div>

      {/* Smart Advice Card */}
      {smartAdvice && (
          <div className="mt-6 p-6 rounded-2xl bg-neutral-900 shadow-lg border border-green-800">
          <h3 className="text-xl font-bold text-green-400 mb-4">
          🧠 AI-Based Precaution & Follow-Up Recommendation
          </h3>
      <div
      className="text-sm text-green-100 font-sans leading-relaxed space-y-2"
      dangerouslySetInnerHTML={{ __html: formatAdviceText(smartAdvice) }}
    />
  </div>
)}

    </div>
  );
}
