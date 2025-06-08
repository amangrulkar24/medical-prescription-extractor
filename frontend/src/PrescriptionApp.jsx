import React, { useState } from 'react';
import PrescriptionEditor from './components/PrescriptionEditor';
import { extractPrescription } from './api';
import ExtractResult from './components/ExtractResult';

export default function App() {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleExtract = async () => {
    setLoading(true);
    try {
      const res = await extractPrescription(text);
      setResult(res.data.result);
    } catch (err) {
      console.error("Extraction failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    setText("");
    setResult(null);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Sticky RxSage Navbar */}
      <div className="sticky top-0 z-50 bg-neutral-900 border-b border-gray-800 shadow-sm py-3 px-6">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-xl italic font-semibold text-rxsage-green">
            RxSage <span className="text-gray-400">| Simplifying Medical Notes, Powered by AI</span>
          </h1>
          <button
            onClick={handleRefresh}
            className="text-sm text-gray-300 border border-gray-500 rounded px-3 py-1 hover:bg-neutral-800 hover:text-white"
          >
            ⟳ Refresh
          </button>
        </div>
      </div>

      {/* App Content */}
      <div className="max-w-6xl mx-auto p-6">
        <PrescriptionEditor text={text} setText={setText} height="h-[300px]" />

        <div className="mt-6 text-center">
          <button
            onClick={handleExtract}
            className="bg-green-600 hover:bg-green-500 text-white font-semibold py-2 px-6 rounded transition duration-200 shadow-md disabled:opacity-50"
            disabled={loading || !text.trim()}
          >
            {loading ? '⏳ Extracting Information...' : '🔍 Extract Information'}
          </button>
        </div>

        <ExtractResult result={result} />
      </div>
    </div>
  );
}
