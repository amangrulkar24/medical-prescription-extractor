import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import Fuse from 'fuse.js';

const PrescriptionPrintView = () => {
  const { appointmentId } = useParams();
  const printRef = useRef();
  const [prescription, setPrescription] = useState({ medicines: [] });
  const [rawText, setRawText] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const [loading, setLoading] = useState(true);
  const [skuList, setSkuList] = useState([]);
  const [fuse, setFuse] = useState(null);
  const [editing, setEditing] = useState({});
  const [saveMessage, setSaveMessage] = useState("");
  const [suggestions, setSuggestions] = useState({});
  const inputRefs = useRef({});
  const BASE_URL = import.meta.env.VITE_BACKEND_URL;

  useEffect(() => {
    fetch(`${BASE_URL}/prescription/${appointmentId}`)
      .then((res) => res.json())
      .then((data) => {
        let extracted = data.extracted;
        try {
          if (typeof extracted === "string") {
            extracted = JSON.parse(extracted);
          }
        } catch (e) {
          console.error("Parsing failed:", e);
        }
        setPrescription(extracted);
        setRawText(data.raw_text);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load prescription:', err);
        setLoading(false);
      });

     fetch(`${BASE_URL}/sku-list')
      .then((res) => res.json())
      .then((list) => {
        setSkuList(list);
        setFuse(new Fuse(list, {
          keys: ['medicine_name'],
          includeScore: true,
          threshold: 0.4
        }));
      });
  }, [appointmentId]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest("td")) {
        setSuggestions({});
        setEditing({});
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const updateField = (index, field, value) => {
    const updated = [...prescription.medicines];
    updated[index][field] = value;

    if (field === "medicine_name" && fuse) {
      const results = fuse.search(value).slice(0, 5).map((r) => r.item);
      setSuggestions((prev) => ({ ...prev, [index]: results }));

      if (results.length > 0) {
        updated[index]["sku_code"] = results[0].sku_code;
      } else {
        updated[index]["sku_code"] = "";
      }
    }

    setPrescription({ ...prescription, medicines: updated });
  };

  const addEmptyRow = () => {
    const newRow = {
      medicine_name: "",
      medicine_type: "",
      medicine_dosage: "",
      medicine_frequency: "",
      medicine_duration: "",
      medicine_quantity: "",
      dosage_advice: "",
      sku_code: "",
      match_confidence: 0
    };
    setPrescription((prev) => ({ ...prev, medicines: [...prev.medicines, newRow] }));
  };

  const removeRow = (index) => {
    const updated = [...prescription.medicines];
    updated.splice(index, 1);
    setPrescription({ ...prescription, medicines: updated });
  };

  const handleSaveChanges = () => {
    fetch(`${BASE_URL}/update-prescription/${appointmentId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extracted: prescription, raw_text: rawText }),
    })
      .then((res) => res.ok ? res.json() : Promise.reject("Save failed"))
      .then(() => {
        setSaveMessage("Changes saved successfully.");
        setTimeout(() => setSaveMessage(""), 3000);
      })
      .catch((err) => {
        console.error('Failed to save changes:', err);
        setSaveMessage("Failed to save changes.");
      });
  };

  const handleBrowserPrint = () => {
    const original = document.getElementById("print-section").cloneNode(true);
    const inputs = original.querySelectorAll("input");
    inputs.forEach((input) => {
      const span = document.createElement("span");
      span.innerText = input.value;
      input.parentNode.replaceChild(span, input);
    });

    const header = document.createElement("div");
    header.innerHTML = `
      <div style="text-align:center; margin-bottom:20px;">
        <img src="/manipal-hospitals.png" alt="Manipal Hospitals Logo" style="height: 70px; object-fit: contain;" />
      </div>`;
    original.prepend(header);

    const footer = document.createElement("div");
    footer.innerHTML = `
      <div style="text-align: center; margin-top: 30px;">
        <img src="/logo.png" alt="RxSage Logo" style="height: 50px; object-fit: contain; display: block; margin: auto;" />
        <div style="font-size: 13px; margin-top: 8px; color: #333; font-weight: 500;">Developed by RxSage</div>
      </div>`;
    original.appendChild(footer);

    const win = window.open("", "_blank");
    win.document.write(`
      <html>
        <head>
          <title>Prescription</title>
          <style>
            body { font-family: sans-serif; padding: 20px; background-color: #111; color: #eee; }
            table { width: 100%; border-collapse: collapse; }
            th, td {
              border: 1px solid #333;
              padding: 6px;
              text-align: left;
              word-wrap: break-word;
              white-space: pre-wrap;
              vertical-align: top;
            }
            th { background-color: #065f46; color: white; }
            .no-print { display: none !important; }
          </style>
        </head>
        <body>${original.outerHTML}</body>
      </html>`);
    win.document.close();
    const waitForImagesAndPrint = () => {
      const images = win.document.images;
      if ([...images].every((img) => img.complete)) {
        win.focus();
        win.print();
        win.close();
      } else {
        setTimeout(waitForImagesAndPrint, 200);
      }
    };
    waitForImagesAndPrint();
  };

  if (loading) return <p className="p-6 text-center text-white">Loading...</p>;
  if (!prescription) return <p className="p-6 text-center text-white">No prescription found.</p>;

  const { patient = {}, medicines = [], labtest = [], precaution = {}, followup = {} } = prescription;

  return (
    <div className="p-8 max-w-7xl mx-auto text-sm bg-black text-green-100 min-h-screen">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-green-400">Medicine Detail View</h1>
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="no-print text-sm px-3 py-1 rounded border border-green-500 text-green-300 hover:bg-green-600 hover:text-white"
        >
          {showRaw ? "Hide Prescription" : "Show Prescription"}
        </button>
      </div>

      {showRaw && (
        <div className="bg-gray-900 p-4 rounded text-xs whitespace-pre-wrap mb-4 border border-green-800">
          <strong className="text-green-400">Original Prescription:</strong>
          <br />{rawText || 'No original text available.'}
        </div>
      )}

      <div id="print-section" ref={printRef} className="p-4 border border-green-700 rounded shadow">
        <div className="mb-6">
          <p className="mb-2"><strong>Appointment ID:</strong> {appointmentId}</p>
          <p><strong>Patient Name:</strong> {patient.name || 'Unknown'}</p>
          <p><strong>Age:</strong> {patient.age || 'NA'} | <strong>Gender:</strong> {patient.gender || 'NA'}</p>
          <p><strong>Diagnosis:</strong> {patient.diagnosis || 'NA'}</p>
        </div>
        <div className="mb-6">
          <h2 className="font-semibold mb-2 text-green-400">Medicines</h2>
          <table className="w-full border border-collapse">
            <thead className="bg-green-700 text-white">
              <tr>
                <th className="border px-2 py-1">SKU</th>
                <th className="border px-2 py-1">Name</th>
                <th className="border px-2 py-1">Type</th>
                <th className="border px-2 py-1">Dosage</th>
                <th className="border px-2 py-1">Frequency</th>
                <th className="border px-2 py-1">Duration</th>
                <th className="border px-2 py-1">Qty</th>
                <th className="border px-2 py-1">Advice</th>
                <th className="border px-2 py-1 no-print">Confidence</th>
                <th className="border px-2 py-1 no-print">Actions</th>
              </tr>
            </thead>
            <tbody>
              {medicines.map((med, idx) => (
                <tr key={idx} className="hover:bg-green-900 relative">
                  <td className="border px-2 py-1">{med.sku_code || '-'}</td>
                  <td className="border px-2 py-1 relative group">
  <div className="relative">
    <input
      className="w-full px-1 py-0.5 rounded bg-gray-900 text-white border border-gray-500"
      value={med.medicine_name}
      onChange={(e) => updateField(idx, "medicine_name", e.target.value)}
      onFocus={(e) => updateField(idx, "medicine_name", e.target.value)}
    />
    {suggestions[idx]?.length > 0 && (
      <ul className="absolute z-20 bg-gray-800 text-white border border-gray-600 mt-1 w-full max-h-36 overflow-y-auto text-xs">
        {suggestions[idx].map((s, i) => (
          <li
            key={i}
            onClick={() => {
              updateField(idx, "medicine_name", s.medicine_name);
              const updated = [...prescription.medicines];
              updated[idx]["sku_code"] = s.sku_code;
              setPrescription({ ...prescription, medicines: updated });
              setSuggestions((prev) => ({ ...prev, [idx]: [] }));
            }}
            className="px-2 py-1 cursor-pointer hover:bg-green-600"
          >
            {s.medicine_name}
          </li>
        ))}
      </ul>
    )}

    {/* Tooltip */}
    {med.raw_medicine_name && (
  <div className="absolute right-full top-1/2 transform -translate-y-1/2 mr-2 w-max max-w-xs px-2 py-1 text-xs bg-gray-800 text-green-300 border border-green-700 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-30 no-print">
    Original: {(med.medicine_type || '') + ' ' + (med.raw_medicine_name || '') + ' ' + (med.medicine_dosage || '')}
  </div>
)}

  </div>
</td>

                  {["medicine_type", "medicine_dosage", "medicine_frequency", "medicine_duration", "medicine_quantity", "dosage_advice"].map((field) => (
                    <td key={field} className="border px-2 py-1">
                      <input
                        className="w-full px-1 py-0.5 rounded bg-gray-900 text-white border border-gray-500"
                        value={med[field]}
                        onChange={(e) => updateField(idx, field, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className={`border px-2 py-1 text-center no-print ${med.match_confidence < 0.8 ? 'text-red-500' : med.match_confidence < 0.9 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {med.match_confidence !== undefined ? `${(med.match_confidence * 100).toFixed(1)}%` : 'NA'}
                  </td>
                  <td className="no-print text-center align-top">
                    <button
                      onClick={() => removeRow(idx)}
                      className="text-red-500 font-bold text-lg hover:text-red-700"
                      title="Remove row"
                    >
                      &times;
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={10} className="border px-2 py-1 text-center no-print">
                  <button
                    onClick={addEmptyRow}
                    className="text-green-400 text-xl hover:text-green-600"
                    title="Add new row"
                  >
                    +
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mb-4">
          <h2 className="font-semibold text-green-400">Precautions</h2>
          <p><strong>Medical:</strong> {precaution.medical || 'None'}</p>
          <p><strong>Non-Medical:</strong> {precaution["non-medical"] || 'None'}</p>
        </div>
        <div className="mb-6">
          <p><strong>Follow-up:</strong> {followup.next_followup || 'Not specified'}</p>
        </div>
      </div>

      <div className="no-print sticky bottom-0 bg-black py-4 flex items-center gap-4">
        <button
          onClick={handleSaveChanges}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Save Changes
        </button>
        {saveMessage && <span className="text-green-400 font-medium ml-2">{saveMessage}</span>}
        <button
          onClick={handleBrowserPrint}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          Print Prescription
        </button>
      </div>
    </div>
  );
};

export default PrescriptionPrintView;
