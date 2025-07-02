import React, { useEffect, useState } from "react";
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';

export default function RadiologyPage() {
  const [appointments, setAppointments] = useState([]);
  const { user } = useUser();
  const navigate = useNavigate();
  const BASE_URL = import.meta.env.VITE_BACKEND_URL;

  useEffect(() => {
    const fetchAppointments = async () => {
      try {
        const res = await fetch(`${BASE_URL}/appointments`);
        const data = await res.json();

        const sorted = data.sort(
          (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
        );
        setAppointments(sorted);
      } catch (err) {
        console.error("Error loading appointments:", err);
      }
    };

    fetchAppointments();
  }, [BASE_URL]);

  const handleClick = (appointmentId) => {
    window.open(`/radiology-detail/${appointmentId}`, "_blank");
  };

  return (
    <div className="p-4 w-full">
      {/* Header Section */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl font-bold text-green-400">Welcome to Diagnostics Department</h1>
          <p className="text-sm text-gray-400">Please select an appointment ID to review lab/radiology details</p>
        </div>
        <button
          onClick={() => navigate('/')}
          className="text-sm bg-green-700 hover:bg-green-600 text-white px-4 py-1 rounded shadow"
        >
          ← Back to Home
        </button>
      </div>

      {/* Appointment Table */}
      <div className="border p-4 rounded-xl shadow w-full">
        <h2 className="text-xl font-semibold mb-4">Radiology & Lab Appointments</h2>
        {appointments.length > 0 && (
          <table className="w-full table-auto border-collapse">
            <thead className="bg-gray-800 text-gray-300 text-sm text-left">
              <tr>
                <th className="border px-3 py-2">Appointment ID</th>
                <th className="border px-3 py-2">Patient Name</th>
                <th className="border px-3 py-2">Age</th>
                <th className="border px-3 py-2">Gender</th>
                <th className="border px-3 py-2">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((appt) => (
                <tr
                  key={appt.appointment_id}
                  className="hover:bg-gray-700 cursor-pointer text-sm"
                  onClick={() => handleClick(appt.appointment_id)}
                >
                  <td className="border px-3 py-2 text-gray-300">{appt.appointment_id}</td>
                  <td className="border px-3 py-2 text-green-400">{appt.patient_name}</td>
                  <td className="border px-3 py-2 text-green-400">{appt.age}</td>
                  <td className="border px-3 py-2 text-green-400 capitalize">{appt.gender}</td>
                  <td className="border px-3 py-2 text-gray-400">
                    {new Date(appt.timestamp).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
