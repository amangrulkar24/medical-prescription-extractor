import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useUser } from '../context/UserContext';

export default function LoginPage() {
  const { role } = useParams();
  const [username, setUsername] = useState('');
  const [department, setDepartment] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { setUser } = useUser();

  const handleLogin = () => {
    if (!username.trim()) return setError('Please enter your name');
    if (!password.trim()) return setError('Please enter the password');
    if (password !== 'default') return setError('Incorrect password');

    setUser({ role, name: username.trim(), department: department.trim() });
    navigate(`/dashboard?role=${role}`);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleLogin();
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center font-mono">
      <form
        onSubmit={handleSubmit}
        className="bg-[#111] border border-green-700 rounded-2xl shadow-xl p-10 w-full max-w-md animate-fade-in"
      >
        <h2 className="text-2xl font-bold text-green-400 mb-6 text-center">
          Login as {role.charAt(0).toUpperCase() + role.slice(1)}
        </h2>

        <input
          type="text"
          placeholder="Enter your name"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setError('');
          }}
          className="w-full bg-black border border-green-600 text-green-300 placeholder-green-600 rounded-lg p-3 mb-4 focus:outline-none focus:ring-2 focus:ring-green-500"
        />

        <input
          type="text"
          placeholder="Enter department (optional)"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="w-full bg-black border border-green-600 text-green-300 placeholder-green-600 rounded-lg p-3 mb-4 focus:outline-none focus:ring-2 focus:ring-green-500"
        />

        <input
          type="password"
          placeholder="Enter password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError('');
          }}
          className="w-full bg-black border border-green-600 text-green-300 placeholder-green-600 rounded-lg p-3 mb-4 focus:outline-none focus:ring-2 focus:ring-green-500"
        />

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <button
          type="submit"
          className="w-full py-2 bg-green-600 hover:bg-green-500 text-black font-semibold rounded-lg transition duration-200"
        >
          Login
        </button>
      </form>
    </div>
  );
}
