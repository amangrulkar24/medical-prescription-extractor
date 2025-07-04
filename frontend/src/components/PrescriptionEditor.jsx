import React, { useState, useEffect, useRef } from 'react';
import Fuse from 'fuse.js';

export default function PrescriptionEditor({ text, setText, height = 'h-52', dismissOnBlur = false }) {
  const [suggestions, setSuggestions] = useState([]);
  const [skuList, setSkuList] = useState([]);
  const [fuse, setFuse] = useState(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [hasNavigated, setHasNavigated] = useState(false);
  const textareaRef = useRef(null);
  const containerRef = useRef(null);
  const suggestionRefs = useRef([]);

  useEffect(() => {
    Promise.all([
      fetch('/medicine_sku_js.json').then(res => res.json()),
      fetch('/lab_jsn.json').then(res => res.json())
    ]).then(([medicinesRaw, proceduresRaw]) => {
      const medicines = medicinesRaw.map(m => ({
        ...m,
        type: 'medicine',
        label: m.medicine_desc
      }));

      const procedures = proceduresRaw
        .map(p => {
          const name = p.medicine_desc || '';
          return name.trim() ? { ...p, type: 'procedure', label: name } : null;
        })
        .filter(Boolean);

      const combined = [...medicines, ...procedures];

      setSkuList(combined);
      setFuse(new Fuse(combined, {
        keys: ['label'],
        threshold: 0.3,
        ignoreLocation: true,
      }));

      console.log('Loaded SKU list:', combined.map(e => e.label));
    });
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dismissOnBlur && containerRef.current && !containerRef.current.contains(event.target)) {
        setSuggestions([]);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dismissOnBlur]);

  useEffect(() => {
    if (highlightedIndex >= 0 && suggestionRefs.current[highlightedIndex]) {
      suggestionRefs.current[highlightedIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [highlightedIndex]);

  const handleChange = (e) => {
    const newText = e.target.value;
    setText(newText);

    const cursor = e.target.selectionStart;
    const prefix = newText.slice(0, cursor);
    const words = prefix.trim().split(/\s+/);
    const lastWord = words[words.length - 1];

    if (lastWord.length >= 3 && fuse) {
      const results = fuse.search(lastWord).slice(0, 10);
      setSuggestions(results.map(r => r.item));
      setHighlightedIndex(-1);
      setHasNavigated(false);
    } else {
      setSuggestions([]);
      setHighlightedIndex(-1);
    }
  };

  const insertSuggestion = (suggLabel) => {
    if (!textareaRef.current) return;
  
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
  
    const textBefore = text.substring(0, start);
    const textAfter = text.substring(end);
  
    // Match last token containing letters/numbers/dash/space (more flexible)
    const match = textBefore.match(/[\w\-]+$/);  // matches 'mri', 'paracet', etc.
    const lastWord = match ? match[0] : '';
    const lastWordStart = match ? start - lastWord.length : start;
  
    const newText = textBefore.slice(0, lastWordStart) + suggLabel + " " + textAfter;
  
    setText(newText);
    setSuggestions([]);
    setHighlightedIndex(-1);
  
    const newCursorPosition = lastWordStart + suggLabel.length + 1;
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = newCursorPosition;
    }, 10);
  };
  
  

  const handleKeyDown = (e) => {
    if (suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHasNavigated(true);
      setHighlightedIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHasNavigated(true);
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : suggestions.length - 1
      );
    } else if ((e.key === 'Enter' || e.key === 'Tab') && highlightedIndex >= 0 && hasNavigated) {
      e.preventDefault();
      insertSuggestion(suggestions[highlightedIndex].label);
    } else if (e.key === 'Escape') {
      setSuggestions([]);
      setHighlightedIndex(-1);
      setHasNavigated(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative bg-neutral-900 border border-neutral-700 p-4 rounded-md shadow-lg"
    >
      <label className="block text-lg font-semibold mb-2 text-green-200">
        📝 Prescription Text
      </label>

      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className={`w-full ${height} p-4 bg-neutral-800 text-white border border-neutral-600 rounded-md shadow-inner resize-none focus:outline-none focus:ring-2 focus:ring-green-500`}
        placeholder="Type or paste prescription here..."
      />

      {suggestions.length > 0 && (
        <div className="absolute z-50 mt-2 w-full bg-neutral-800 border border-green-600 rounded shadow-md max-h-40 overflow-y-auto">
          {suggestions.map((sugg, i) => (
            <div
              key={i}
              ref={(el) => (suggestionRefs.current[i] = el)}
              onClick={() => insertSuggestion(sugg.label)}
              className={`px-4 py-2 text-sm cursor-pointer border-b border-neutral-700 ${
                i === highlightedIndex
                  ? 'bg-green-700 text-white font-semibold'
                  : 'text-green-100 hover:bg-green-600 hover:text-white'
              }`}
            >
              {sugg.label}
              <span className="ml-2 text-xs italic text-neutral-400">({sugg.type})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
