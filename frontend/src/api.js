import axios from 'axios';

const BASE_URL = import.meta.env.VITE_BACKEND_URL;

export const getSuggestions = (q) =>
  axios.get(`${BASE_URL}/autocomplete`, { params: { q } });

export const extractPrescription = (text) =>
  axios.post(`${BASE_URL}/extract`, { prescription: text });
