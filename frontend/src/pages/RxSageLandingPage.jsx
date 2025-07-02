import React, { useState, useEffect } from 'react';
import { 
  Moon, 
  Sun, 
  Stethoscope, 
  Radiation, 
  LogIn,
  ShoppingBag 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Typewriter = ({ text, className, trigger, onComplete }) => {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    if (!trigger) return;
    let i = 0;
    const interval = setInterval(() => {
      setDisplayedText((prev) => text.slice(0, i + 1));
      i++;
      if (i === text.length) {
        clearInterval(interval);
        if (onComplete) onComplete();
      }
    }, 20);
    return () => clearInterval(interval);
  }, [trigger]);

  return <p className={className}>{displayedText}</p>;
};

const RxSageLandingPage = () => {
  const [darkMode, setDarkMode] = useState(true);
  const [animate, setAnimate] = useState(false);
  const [secondParaTrigger, setSecondParaTrigger] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const timeout = setTimeout(() => setAnimate(true), 100);
    return () => clearTimeout(timeout);
  }, []);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  const features = [
    { 
      icon: <Stethoscope className={`w-12 h-12 mx-auto mb-4 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />, 
      title: 'Doctors OPD', 
      description: 'Write AI Powered Smart Prescriptions',
      onClick: () => navigate('/login/doctor')
    },
    { 
      icon: <ShoppingBag className={`w-12 h-12 mx-auto mb-4 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />, 
      title: 'Pharmacy', 
      description: 'Comprehensive Prescription Management',
      onClick: () => navigate('/dashboard?role=pharmacist')
    },
    { 
      icon: <Radiation className={`w-12 h-12 mx-auto mb-4 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />, 
      title: 'Diagnostics', 
      description: 'For Efficient Lab/Radiology Test and Procedure Tracking',
      onClick: () => navigate('/dashboard?role=radiology')
    }
  ];

  return (
    <div className={`h-screen flex flex-col overflow-hidden ${darkMode ? 'bg-black text-green-300' : 'bg-green-50 text-black'} transition-colors duration-300`}>
      <nav className={`p-4 flex justify-between items-center ${darkMode ? 'bg-gray-900 border-b border-green-800' : 'bg-green-100 border-b border-green-200'}`}>
        <div className="flex items-center space-x-2">
          <img 
            src="/logo.png" 
            alt="RxSage Logo" 
            className="w-16 h-16" 
          />
          <h1 className={`text-2xl font-bold italic ${darkMode ? 'text-green-300' : 'text-green-700'}`}>RxSage</h1>
        </div>
        <div className="flex items-center space-x-4">
          <button 
            onClick={toggleDarkMode} 
            className={`p-2 rounded-full ${darkMode 
              ? 'bg-gray-800 hover:bg-gray-700 text-green-300' 
              : 'bg-green-200 hover:bg-green-300 text-black'}`}
          >
            {darkMode ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
          </button>
        </div>
      </nav>

      <main className="flex-grow container mx-auto px-4 flex items-center justify-center">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-10 w-full">
          {/* Left Section: Tagline */}
          <div className={`text-center lg:text-left max-w-xl transition-opacity duration-1000 ${animate ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-5'}`}>
            <h2 className={`text-4xl font-bold italic mb-4 ${darkMode ? 'text-green-300' : 'text-green-700'}`}>
              Simplifying Clinical Workflows, Powered by AI
            </h2>
            <div className={`text-xl space-y-4 leading-relaxed ${darkMode ? 'text-gray-400' : 'text-green-700'}`}>
              {animate && (
                <Typewriter
                  text="RxSage is a modern-age, AI-powered health management system designed to redefine how healthcare professionals interact with prescriptions."
                  className="mb-2"
                  trigger={animate}
                  onComplete={() => setSecondParaTrigger(true)}
                />
              )}
              {secondParaTrigger && (
                <Typewriter
                  text="Leveraging the AI models and intelligent retrieval systems, it enables smarter, faster, and more precise medical documentation—seamlessly extracting diagnoses, validated medicines, lab tests, radiology procedures, and care instructions—empowering healthcare professionals to move from documentation to decision in seconds."
                  className="mb-2"
                  trigger={secondParaTrigger}
                />
              )}
              <p className="font-semibold text-green-400">Experience the future of clinical efficiency.</p>
            </div>
          </div>

          {/* Center Divider */}
          <div className="hidden lg:block h-[300px] w-px bg-green-600"></div>

          {/* Right Section: Feature Tiles */}
          <div className="flex flex-col gap-6 max-w-sm w-full">
            {features.map((feature, index) => (
              <div 
                key={index} 
                onClick={feature.onClick}
                className={`p-6 rounded-lg shadow-lg cursor-pointer ${
                  darkMode 
                    ? 'bg-gray-900 border border-green-800 hover:bg-gray-800' 
                    : 'bg-green-100 hover:bg-green-200'
                } transition-colors`}
              >
                {feature.icon}
                <h3 className={`text-xl font-semibold mb-2 text-center ${darkMode ? 'text-green-300' : 'text-green-700'}`}>
                  {feature.title}
                </h3>
                <p className={`text-center ${darkMode ? 'text-green-500' : 'text-green-600'}`}>
                  {feature.description}
                </p>
              </div>
            ))}

            <a 
              href="/dashboard?role=doctor"
              className={`inline-flex items-center justify-center px-6 py-3 rounded-lg text-lg font-medium mt-4 ${
                darkMode 
                  ? 'bg-green-700 text-black hover:bg-green-600' 
                  : 'bg-green-500 text-white hover:bg-green-600'
              }`}
            >
              <LogIn className="mr-2" /> Enter RxSage
            </a>
          </div>
        </div>
      </main>

      <footer className="text-center text-sm py-4 border-t border-gray-600 w-full">
        <p className="text-gray-400 italic">
          This project was undertaken for Manipal Hospitals, India, in collaboration with the Indian Institute of Management Bangalore (IIMB) as part of the BAI-15 cohort.
        </p>
      </footer>
    </div>
  );
};

export default RxSageLandingPage;
