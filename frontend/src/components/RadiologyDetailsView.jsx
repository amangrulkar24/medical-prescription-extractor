import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import Fuse from "fuse.js";

export default function RadiologyDetailView() {
  const { appointmentId } = useParams();
  const printRef = useRef();
  const [prescription, setPrescription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rawText, setRawText] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const [skuList, setSkuList] = useState([]);
  const [fuse, setFuse] = useState(null);
  const [suggestions, setSuggestions] = useState({});
  const inputRefs = useRef({});
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    fetch(`http://127.0.0.1:5000/prescription/${appointmentId}`)
      .then((res) => res.json())
      .then((data) => {
        setPrescription(data.extracted);
        setRawText(data.raw_text);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load data", err);
        setLoading(false);
      });

    fetch("http://127.0.0.1:5000/procedure-sku-list")
      .then((res) => res.json())
      .then((data) => {
        setSkuList(data);
        setFuse(new Fuse(data, {
          keys: ['name'],
          includeScore: true,
          threshold: 0.4
        }));
      });
  }, [appointmentId]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!Object.values(inputRefs.current).some(ref => ref && ref.contains(e.target))) {
        setSuggestions({});
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  const removeRow = (type, index) => {
    const updatedSection = [...prescription[type]];
    updatedSection.splice(index, 1);
    setPrescription({ ...prescription, [type]: updatedSection });
  };

  const addEmptyRow = (type, fields) => {
    const newRow = { sku_code: "", matched: "", match_confidence: 0 };
    fields.forEach(f => newRow[f.key] = "");
    const updatedSection = [...prescription[type], newRow];
    setPrescription({ ...prescription, [type]: updatedSection });
  };

  const updateField = (type, index, field, value) => {
    const updatedSection = [...prescription[type]];
    updatedSection[index][field] = value;

    if (field === "matched" && fuse) {
      const results = fuse.search(value).slice(0, 5).map(r => r.item);
      setSuggestions((prev) => ({ ...prev, [`${type}-${index}`]: results }));
    }

    setPrescription({ ...prescription, [type]: updatedSection });
  };

  const renderSection = (title, type, fields) => {
    if (!Array.isArray(prescription[type])) return null;
    return (
      <div className="mb-6">
        <h2 className="text-green-400 font-semibold mb-2">{title}</h2>
        <table className="w-full border border-collapse text-sm">
          <thead className="bg-green-700 text-white">
            <tr>
              <th className="border px-2 py-1">SKU</th>
              {fields.map((f, idx) => (
                <th key={idx} className="border px-2 py-1 text-left">{f.label}</th>
              ))}
              <th className="border px-2 py-1 text-left no-print">Confidence</th>
              <th className="border px-2 py-1 text-left no-print">Action</th>
            </tr>
          </thead>
          <tbody>
            {prescription[type].map((item, idx) => (
              <tr key={idx} className="hover:bg-green-900 relative">
                <td className="border px-2 py-1">{item.sku_code || "-"}</td>
                {fields.map((f, i) => (
                  <td key={i} className="border px-2 py-1">
                    <div
  ref={(el) => (inputRefs.current[`${type}-${idx}-${f.key}`] = el)}
  className="relative group"
>
  <input
    className="w-full px-1 py-0.5 rounded bg-gray-900 text-white border border-gray-500"
    value={item[f.key] || ''}
    onChange={(e) => updateField(type, idx, f.key, e.target.value)}
    onFocus={() => {
      setSuggestions({ [`${type}-${idx}`]: [] });
      updateField(type, idx, f.key, item[f.key] || '');
    }}
  />
  {f.key === "matched" && !isPrinting && (item.test_name || item.procedure_name) && (
  <div className="absolute top-0 left-full ml-2 z-30 bg-green-800 text-white text-xs rounded px-2 py-1 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 w-max max-w-xs whitespace-pre-wrap">
    Original: {item.test_name || item.procedure_name}
  </div>
)}

  {f.key === "matched" && suggestions[`${type}-${idx}`]?.length > 0 && (
    <ul className="absolute z-20 bg-gray-800 text-white border border-gray-600 mt-1 w-full max-h-36 overflow-y-auto text-xs">
      {suggestions[`${type}-${idx}`].map((s, j) => (
        <li
          key={j}
          onClick={() => {
            const updatedSection = [...prescription[type]];
            updatedSection[idx]["matched"] = s.name;
            updatedSection[idx]["sku_code"] = s.code;
            setPrescription({ ...prescription, [type]: updatedSection });
            setSuggestions((prev) => ({ ...prev, [`${type}-${idx}`]: [] }));
          }}
          className="px-2 py-1 cursor-pointer hover:bg-green-600"
        >
          {s.name}
        </li>
      ))}
    </ul>
  )}
</div>

                  </td>
                ))}
                <td className={`border px-2 py-1 no-print ${item.match_confidence >= 0.9 ? 'text-green-300' : item.match_confidence >= 0.8 ? 'text-yellow-400' : 'text-red-400'}`}>{item.match_confidence !== undefined ? `${(item.match_confidence * 100).toFixed(1)}%` : 'NA'}</td>
                <td className="border px-2 py-1 no-print text-center">
                  <button
                    onClick={() => removeRow(type, idx)}
                    className="text-red-500 font-bold text-lg hover:text-red-700"
                    title="Remove row"
                  >
                    &times;
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={fields.length + 3} className="border px-2 py-1 text-center no-print">
                <button
                  onClick={() => addEmptyRow(type, fields)}
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
    );
  };

  const handleSave = () => {
    fetch(`http://127.0.0.1:5000/update-prescription/${appointmentId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extracted: prescription, raw_text: rawText }),
    })
      .then((res) => res.ok ? res.json() : Promise.reject("Save failed"))
      .then(() => {
        setSaveMessage("Changes saved successfully.");
        setTimeout(() => setSaveMessage(""), 3000);
      })
      .catch(() => setSaveMessage("Failed to save changes."));
  };
  
  const handlePrint = () => {
    setIsPrinting(true);
  
    setTimeout(() => {
      const original = document.getElementById("print-section").cloneNode(true);
      const inputs = original.querySelectorAll("input");
      inputs.forEach((input) => {
        const span = document.createElement("span");
        span.innerText = input.value;
        input.parentNode.replaceChild(span, input);
      });
  
      original.querySelectorAll('th:last-child, td:last-child').forEach(el => el.remove());
      original.querySelectorAll('th:nth-last-child(2), td:nth-last-child(2)').forEach(el => el.remove());
  
      const tables = original.querySelectorAll("table");
      tables.forEach((table) => {
        const rows = table.querySelectorAll("tbody tr");
        if (rows.length === 1) {
          const sectionDiv = table.closest("div.mb-6");
          if (sectionDiv) sectionDiv.remove();
        }
      });
  
      const header = document.createElement("div");
      header.innerHTML = `<div style="text-align:center; margin-bottom:20px;">
          <img src="/manipal-hospitals.png" alt="Manipal Hospitals Logo" style="height: 70px; object-fit: contain;" />
        </div>`;
      original.prepend(header);
  
      const footer = document.createElement("div");
      footer.innerHTML = `<div style="text-align: center; margin-top: 30px;">
          <img src="/logo.png" alt="RxSage Logo" style="height: 50px; object-fit: contain; display: block; margin: auto;" />
          <div style="font-size: 13px; margin-top: 8px; color: #333; font-weight: 500;">Developed by RxSage</div>
        </div>`;
      original.appendChild(footer);
  
      const win = window.open("", "_blank");
      win.document.write(`
        <html>
          <head>
            <title>Diagnostic Report</title>
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
          setIsPrinting(false);
        } else {
          setTimeout(waitForImagesAndPrint, 200);
        }
      };
      waitForImagesAndPrint();
    }, 100);
  };  

  if (loading) return <p className="p-6 text-center text-white">Loading...</p>;
  if (!prescription) return <p className="p-6 text-center text-white">No data found.</p>;

  const { patient = {}, labtests = [], radiology = [], procedures = [] } = prescription;

  return (
    <div className="p-6 max-w-5xl mx-auto text-sm bg-black text-green-100 min-h-screen">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-green-400">Test | Radiology | Procedure Detail View</h1>
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

      <div id="print-section" ref={printRef}>
        <p className="mb-2"><strong>Appointment ID:</strong> {appointmentId}</p>
        <p className="mb-2"><strong>Name:</strong> {patient.name || 'NA'}</p>
        <p className="mb-2"><strong>Age:</strong> {patient.age || 'NA'} | <strong>Gender:</strong> {patient.gender || 'NA'}</p>

        {renderSection("Lab Tests", "labtests", [
          { key: "matched", label: "Test Name" },
          { key: "test_type", label: "Type" },
        ])}

        {renderSection("Radiology", "radiology", [
          { key: "matched", label: "Test Name" },
          { key: "test_type", label: "Type" },
        ])}

        {renderSection("Procedures", "procedures", [
          { key: "matched", label: "Procedure Name" },
          { key: "procedure_type", label: "Procedure Type" },
        ])}
      </div>

      <div className="mt-6 flex gap-4 items-center">
        <button
          onClick={handleSave}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
        >
          Save Changes
        </button>
        <button
          onClick={handlePrint}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
        >
          Print
        </button>
        {saveMessage && <span className="text-green-400 font-medium">{saveMessage}</span>}
      </div>
    </div>
  );
}
