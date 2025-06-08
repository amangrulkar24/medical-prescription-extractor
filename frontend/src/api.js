import axios from 'axios';

const BASE_URL = 'http://127.0.0.1:5000';

export const getSuggestions = (q) =>
  axios.get(`${BASE_URL}/autocomplete`, { params: { q } });

export const extractPrescription = (text) =>
  axios.post(`${BASE_URL}/extract`, { prescription: text });
