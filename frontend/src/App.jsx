import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Lock, User, Settings, LogOut, Users, ShieldAlert, Pencil, X } from 'lucide-react';

const api = axios.create({ baseURL: 'http://localhost:3001' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = token;
  return config;
});

function Login({ setAuth }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/login', { username, password });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('role', res.data.role);
      setAuth({ token: res.data.token, role: res.data.role });
      
      if (res.data.mustChange) {
        navigate('/change-password');
      } else {
        navigate(res.data.role === 'admin' ? '/admin' : '/user');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Błąd logowania');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded shadow-md w-96">
        <h2 className="text-2xl font-bold mb-6 text-center text-purple-700">System Bezpieczeństwa</h2>
        {error && <div className="bg-red-100 text-red-700 p-2 mb-4 rounded text-sm text-center">{error}</div>}
        <form onSubmit={handleLogin}>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2">Identyfikator</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border rounded px-3 py-2 focus:outline-purple-500"
              required 
            />
          </div>
          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-bold mb-2">Hasło</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded px-3 py-2 focus:outline-purple-500"
              required 
            />
          </div>
          <button type="submit" className="w-full bg-purple-600 text-white py-2 rounded hover:bg-purple-700">
            Zaloguj
          </button>
        </form>
      </div>
    </div>
  );
}

function ChangePassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const role = localStorage.getItem('role');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) return setError("Hasła nie są identyczne");
    
    try {
      await api.post('/change-password', { newPassword: password });
      setMsg("Hasło zmienione pomyślnie. Przekierowanie...");
      setTimeout(() => navigate(role === 'admin' ? '/admin' : '/user'), 2000);
    } catch (err) {
      setError(err.response?.data?.message || 'Błąd zmiany hasła');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded shadow-md w-96">
        <h2 className="text-xl font-bold mb-4 text-center">Zmiana Hasła</h2>
        <p className="text-sm text-gray-600 mb-4 text-center">Wymagana jest zmiana hasła na nowe.</p>
        {error && <div className="bg-red-100 text-red-700 p-2 mb-2 rounded text-sm">{error}</div>}
        {msg && <div className="bg-green-100 text-green-700 p-2 mb-2 rounded text-sm">{msg}</div>}
        <form onSubmit={handleSubmit}>
          <input 
            type="password" 
            placeholder="Nowe hasło" 
            value={password} 
            onChange={e => setPassword(e.target.value)}
            className="w-full border rounded px-3 py-2 mb-3" 
            required
          />
          <input 
            type="password" 
            placeholder="Powtórz hasło" 
            value={confirmPassword} 
            onChange={e => setConfirmPassword(e.target.value)}
            className="w-full border rounded px-3 py-2 mb-4" 
            required
          />
          <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded">Zmień hasło</button>
        </form>
      </div>
    </div>
  );
}

function AdminPanel() {
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [settings, setSettings] = useState({});
  const [newUser, setNewUser] = useState({ username: '', password: '' });
  
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ username: '', password: '' });

  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const u = await api.get('/users');
    const s = await api.get('/settings');
    setUsers(u.data);
    setSettings(s.data);
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
  };

  const addUser = async (e) => {
    e.preventDefault();
    try {
      await api.post('/users', { ...newUser, role: 'user' });
      setNewUser({ username: '', password: '' });
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || "Błąd");
    }
  };

  const deleteUser = async (id) => {
    if(window.confirm('Usunąć użytkownika?')) {
      await api.delete(`/users/${id}`);
      loadData();
    }
  };

  const toggleBlock = async (id, currentStatus) => {
    await api.put(`/users/${id}`, { is_blocked: !currentStatus });
    loadData();
  };

  const saveSettings = async () => {
    await api.put('/settings', settings);
    alert('Zapisano ustawienia');
  };

  const startEdit = (user) => {
    setEditingUser(user);
    setEditForm({ username: user.username, password: '' });
  };

  const cancelEdit = () => {
    setEditingUser(null);
    setEditForm({ username: '', password: '' });
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/users/${editingUser.id}`, {
        username: editForm.username,
        password: editForm.password || undefined 
      });
      setEditingUser(null);
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || "Błąd edycji");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 relative">
      <nav className="bg-purple-800 text-white p-4 flex justify-between items-center">
        <h1 className="font-bold text-lg flex items-center gap-2"><Lock size={18} /> Panel Administratora (ADMIN)</h1>
        <div className="flex gap-4">
          <button onClick={() => navigate('/change-password')} className="hover:underline text-sm">Zmień swoje hasło</button>
          <button onClick={handleLogout} className="flex items-center gap-1 hover:text-red-300"><LogOut size={16} /> Wyloguj</button>
        </div>
      </nav>

      <div className="container mx-auto p-6">
        <div className="flex gap-4 mb-6 border-b">
          <button onClick={() => setActiveTab('users')} className={`pb-2 px-4 ${activeTab === 'users' ? 'border-b-2 border-purple-600 font-bold' : ''}`}>Użytkownicy</button>
          <button onClick={() => setActiveTab('settings')} className={`pb-2 px-4 ${activeTab === 'settings' ? 'border-b-2 border-purple-600 font-bold' : ''}`}>Ustawienia Bezpieczeństwa</button>
        </div>

        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="bg-white p-4 rounded shadow">
              <h3 className="font-bold mb-3">Dodaj Użytkownika</h3>
              <form onSubmit={addUser} className="flex gap-2">
                <input placeholder="Nazwa" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} className="border p-2 rounded" required />
                <input type="password" placeholder="Hasło" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} className="border p-2 rounded" required />
                <button className="bg-green-600 text-white px-4 py-2 rounded">Dodaj</button>
              </form>
            </div>
            
            <div className="bg-white rounded shadow overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-3">ID</th>
                    <th className="p-3">Użytkownik</th>
                    <th className="p-3">Rola</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-t hover:bg-gray-50">
                      <td className="p-3">{u.id}</td>
                      <td className="p-3 font-medium">{u.username}</td>
                      <td className="p-3">{u.role}</td>
                      <td className="p-3">
                        {u.is_blocked ? <span className="text-red-600 font-bold">Zablokowany</span> : <span className="text-green-600">Aktywny</span>}
                      </td>
                      <td className="p-3 flex gap-2">
                        {u.username !== 'ADMIN' && (
                          <>
                            <button onClick={() => startEdit(u)} className="bg-blue-500 text-white p-1.5 rounded hover:bg-blue-600" title="Edytuj">
                              <Pencil size={16} />
                            </button>
                            <button onClick={() => toggleBlock(u.id, u.is_blocked)} className={`text-white px-2 py-1 rounded text-sm ${u.is_blocked ? 'bg-yellow-500' : 'bg-gray-500'}`}>
                              {u.is_blocked ? 'Odblokuj' : 'Zablokuj'}
                            </button>
                            <button onClick={() => deleteUser(u.id)} className="bg-red-600 text-white px-2 py-1 rounded text-sm">Usuń</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="bg-white p-6 rounded shadow max-w-2xl">
             <div className="border-b pb-2 mb-4 flex items-center gap-2 text-purple-800">
               <ShieldAlert size={20} /> <h2 className="font-bold">Konfiguracja Polityki Haseł</h2>
             </div>
             
             <div className="space-y-4">
               <div>
                 <label className="block font-medium mb-1">Minimalna długość hasła</label>
                 <input 
                   type="number" 
                   value={settings.min_length || 0} 
                   onChange={e => setSettings({...settings, min_length: parseInt(e.target.value)})}
                   className="border p-2 rounded w-20"
                 />
               </div>

               <div className="space-y-3 border p-4 rounded bg-gray-50">
                  <h3 className="font-semibold text-sm text-gray-700">Wymagana złożoność:</h3>
                  
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={!!settings.require_digit} 
                      onChange={e => setSettings({...settings, require_digit: e.target.checked})}
                      className="w-4 h-4 text-purple-600"
                    />
                    Wymagaj cyfr (0-9)
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={!!settings.require_special_char} 
                      onChange={e => setSettings({...settings, require_special_char: e.target.checked})}
                      className="w-4 h-4 text-purple-600"
                    />
                    Wymagaj znaków specjalnych (!@#$...)
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={!!settings.require_mixed_case} 
                      onChange={e => setSettings({...settings, require_mixed_case: e.target.checked})}
                      className="w-4 h-4 text-purple-600"
                    />
                    Wymagaj małych i wielkich liter
                  </label>
               </div>

               <div>
                 <label className="block font-medium mb-1">Ważność hasła (dni)</label>
                 <input 
                   type="number" 
                   value={settings.validity_days || 30} 
                   onChange={e => setSettings({...settings, validity_days: parseInt(e.target.value)})}
                   className="border p-2 rounded w-20"
                 />
               </div>

               <div className="pt-4">
                 <button onClick={saveSettings} className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition">Zapisz Ustawienia</button>
               </div>
             </div>
          </div>
        )}
      </div>

      {editingUser && (
        <div className="fixed inset-0 bg-white bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl w-96 relative">
            <button onClick={cancelEdit} className="absolute top-4 right-4 text-gray-500 hover:text-gray-800">
              <X size={20} />
            </button>
            <h3 className="text-xl font-bold mb-4">Edytuj Użytkownika</h3>
            <form onSubmit={saveEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nazwa użytkownika</label>
                <input 
                  type="text" 
                  value={editForm.username} 
                  onChange={e => setEditForm({...editForm, username: e.target.value})}
                  className="w-full border rounded p-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nowe hasło (opcjonalnie)</label>
                <input 
                  type="text" 
                  placeholder="Zostaw puste aby nie zmieniać"
                  value={editForm.password} 
                  onChange={e => setEditForm({...editForm, password: e.target.value})}
                  className="w-full border rounded p-2"
                />
                <p className="text-xs text-gray-500 mt-1">Zmiana hasła wymusi jego zmianę przy logowaniu.</p>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700">Zapisz</button>
                <button type="button" onClick={cancelEdit} className="flex-1 bg-gray-200 text-gray-800 py-2 rounded hover:bg-gray-300">Anuluj</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function UserPanel() {
  const navigate = useNavigate();
  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-blue-600 text-white p-4 flex justify-between items-center">
        <h1 className="font-bold flex items-center gap-2"><User size={18} /> Panel Użytkownika</h1>
        <button onClick={handleLogout} className="flex items-center gap-1 hover:text-blue-200"><LogOut size={16} /> Wyloguj</button>
      </nav>
      <div className="container mx-auto p-10 flex flex-col items-center">
        <div className="bg-white p-8 rounded shadow text-center w-96">
          <p className="mb-6 text-gray-700">Witaj w systemie. Masz ograniczone uprawnienia.</p>
          <button 
            onClick={() => navigate('/change-password')}
            className="w-full bg-blue-500 text-white py-3 rounded flex items-center justify-center gap-2 hover:bg-blue-600"
          >
            <Settings size={18} /> Zmień swoje hasło
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [auth, setAuth] = useState({ token: localStorage.getItem('token'), role: localStorage.getItem('role') });

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login setAuth={setAuth} />} />
        <Route path="/admin" element={auth.token && auth.role === 'admin' ? <AdminPanel /> : <Navigate to="/" />} />
        <Route path="/user" element={auth.token ? <UserPanel /> : <Navigate to="/" />} />
        <Route path="/change-password" element={auth.token ? <ChangePassword /> : <Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;