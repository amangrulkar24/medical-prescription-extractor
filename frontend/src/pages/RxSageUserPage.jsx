import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  LogOut, 
  Stethoscope,
  Radiation,
  ShoppingBag,
  Menu
} from 'lucide-react';

import PrescriptionEditor from '../components/PrescriptionEditor';
import ExtractResult from '../components/ExtractResult';
import PharmacyPage from '../components/PharmacyPage';
import RadiologyPage from '../components/RadiologyPage';
import { useUser } from '../context/UserContext';

const RxSageUserPage = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [userType, setUserType] = useState(null);
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const { user } = useUser();

  const navigate = useNavigate();
  const location = useLocation();
  const BASE_URL = import.meta.env.VITE_BACKEND_URL;

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const role = searchParams.get('role');
    if (role) {
      setUserType(role);
    } else {
      navigate('/dashboard?role=doctor', { replace: true });
    }
    setResult(null);
    setText('');
  }, [location.search]);

  const toggleSidebar = () => setCollapsed(!collapsed);

  const handleExtract = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prescription: text })
      });
      const data = await res.json();
      setResult(data.result);
    } catch (err) {
      console.error("Extraction failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    navigate('/');
  };

  return (
    <div className="min-h-screen flex bg-black text-green-300">
      {/* Sidebar */}
      <div className={`${collapsed ? 'w-20' : 'w-64'} p-4 bg-gray-900 border-r border-green-800 flex flex-col transition-all duration-300`}>
        <div className="mb-8 flex items-center justify-between">
          {!collapsed && (
            <div className="flex items-center space-x-2">
              <img src="/logo.png" alt="RxSage Logo" className="w-10 h-10" />
              <h1 className="text-xl font-bold italic text-green-300">RxSage</h1>
            </div>
          )}
          <button 
            onClick={toggleSidebar} 
            className="p-2 rounded-full bg-gray-800 hover:bg-gray-700 text-green-300"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>

        <nav className="space-y-2">
          {[ 
            { icon: <Stethoscope className="text-green-400" />, label: 'Doctors OPD', type: 'doctor' },
            { icon: <ShoppingBag className="text-green-400" />, label: 'Pharmacy', type: 'pharmacist' },
            { icon: <Radiation className="text-green-400" />, label: 'Diagnostics', type: 'radiology' }
          ].map((item) => (
            <button
              key={item.type}
              onClick={() => navigate(`/dashboard?role=${item.type}`)}
              className={`w-full flex items-center p-3 rounded-lg ${
                userType === item.type 
                  ? 'bg-green-800 text-black' 
                  : 'hover:bg-gray-800 text-green-400 hover:text-green-300'
              }`}
            >
              {item.icon}
              {!collapsed && <span className="ml-2">{item.label}</span>}
            </button>
          ))}
        </nav>

        <button 
          onClick={handleLogout}
          className="mt-auto flex items-center p-3 rounded-lg bg-red-900 hover:bg-red-800 text-green-300"
        >
          <LogOut />
          {!collapsed && <span className="ml-2">Logout</span>}
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6">
        {userType === 'doctor' ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="text-green-400">
                <h2 className="text-2xl font-semibold">
                  Welcome Dr. {user?.name || 'Anonymous'}
                </h2>
                {user?.department && (
                  <p className="text-sm text-green-300">
                    Department: <span className="font-semibold">{user.department}</span>
                  </p>
                )}
                <p className="text-sm text-gray-400 mt-1">You can start writing your prescription below.</p>
              </div>

              <button
                onClick={() => navigate('/')}
                className="text-sm bg-green-700 hover:bg-green-600 text-white px-4 py-1 rounded shadow"
              >
                ← Back to Home
              </button>
            </div>

            <div className="mb-4">
              <PrescriptionEditor
                text={text}
                setText={setText}
                height="h-[300px]"
                dismissOnBlur={true}
              />
            </div>
            <div className="text-center">
              <button
                onClick={handleExtract}
                className="bg-green-600 hover:bg-green-500 text-white font-semibold py-2 px-6 rounded transition duration-200 shadow-md disabled:opacity-50"
                disabled={loading || !text.trim()}
              >
                {loading ? '⏳ Extracting...' : '🔍 Extract Information'}
              </button>
            </div>
            <ExtractResult result={result} />
          </>
        ) : userType === 'pharmacist' ? (
          <PharmacyPage user={user} />
        ) : userType === 'radiology' ? (
          <RadiologyPage user={user} />
        ) : (
          <h2 className="text-xl text-center mt-10">🚧 Feature coming soon for {userType}</h2>
        )}
      </div>
    </div>
  );
};

export default RxSageUserPage;
