import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import RxSageLandingPage from './pages/RxSageLandingPage';
import RxSageUserPage from './pages/RxSageUserPage';
import PharmacyPage from './components/PharmacyPage';
import RadiologyPage from './components/RadiologyPage'; // ✅ Corrected
import LoginPage from './components/LoginPage';
import PrescriptionPrintView from './components/PrescriptionPrintView'; 
import RadiologyDetailView from './components/RadiologyDetailsView'; // ✅ Already correct

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<RxSageLandingPage />} />
        <Route path="/login/:role" element={<LoginPage />} />
        <Route path="/dashboard" element={<RxSageUserPage />} />
        <Route path="/doctor" element={<RxSageUserPage />} />
        <Route path="/pharmacy" element={<PharmacyPage />} />
        <Route path="/prescription/:appointmentId" element={<PrescriptionPrintView />} />
        <Route path="/radiology" element={<RadiologyPage />} />
        <Route path="/radiology-detail/:appointmentId" element={<RadiologyDetailView />} />
      </Routes>
    </Router>
  );
}

export default App;
