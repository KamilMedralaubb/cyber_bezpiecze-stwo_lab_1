import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Lock, User, Settings, LogOut, ShieldAlert, Pencil, X, RefreshCw, Key, Trash2 } from 'lucide-react';

const api = axios.create({ baseURL: 'http://localhost:3001' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = token;
  return config;
});

const generateOTP = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
    let pass = "";
    for(let i=0; i<12; i++) pass += chars[Math.floor(Math.random()*chars.length)];
    return pass;
};

function Login({ setAuth }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [captchaImages, setCaptchaImages] = useState([]);
  const [captchaTask, setCaptchaTask] = useState('');
  const [selectedImages, setSelectedImages] = useState([]);
  const [captchaId, setCaptchaId] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => { fetchCaptcha(); }, []);

  const fetchCaptcha = async () => {
    try {
      const res = await api.get('/captcha');
      setCaptchaImages(res.data.images);
      setCaptchaTask(res.data.task);
      setCaptchaId(res.data.id);
      setSelectedImages([]);
    } catch (err) { console.error("Błąd captcha"); }
  };

  const toggleImage = (id) => {
      setSelectedImages(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/login', { username, password, captchaId, selectedImages, rememberMe });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('role', res.data.role);
      setAuth({ token: res.data.token, role: res.data.role });
      
      if (res.data.mustChange) navigate('/change-password');
      else navigate(res.data.role === 'admin' ? '/admin' : '/user');
    } catch (err) {
      setError(err.response?.data?.message || 'Błąd logowania');
      fetchCaptcha();
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded shadow-md w-96">
        <h2 className="text-2xl font-bold mb-6 text-center text-purple-700">System Bezpieczeństwa</h2>
        {error && <div className="bg-red-100 text-red-700 p-2 mb-4 rounded text-sm text-center">{error}</div>}
        <form onSubmit={handleLogin}>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2">Login</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full border rounded p-2" required />
          </div>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2">Hasło</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border rounded p-2" required />
          </div>
          <div className="mb-4 flex items-center gap-2">
            <input type="checkbox" id="rememberMe" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="w-4 h-4 text-purple-600"/>
            <label htmlFor="rememberMe" className="text-gray-700 text-sm cursor-pointer select-none">Zapamiętaj mnie</label>
          </div>
          <div className="mb-6 p-3 bg-gray-50 rounded border">
             <div className="flex justify-between items-center mb-2">
                 <span className="text-sm font-bold text-blue-700">{captchaTask}</span>
                 <button type="button" onClick={fetchCaptcha} className="text-gray-500 hover:text-blue-600"><RefreshCw size={16} /></button>
             </div>
             <div className="grid grid-cols-3 gap-2">
                 {captchaImages.map((img) => (
                     <div key={img.id} onClick={() => toggleImage(img.id)} className={`relative cursor-pointer rounded overflow-hidden border-2 transition-all ${selectedImages.includes(img.id) ? 'border-blue-600 opacity-100 scale-95 shadow-md' : 'border-transparent opacity-80 hover:opacity-100'}`}>
                         <img src={img.url} alt="captcha" className="w-full h-full object-cover" />
                         {selectedImages.includes(img.id) && (
                             <div className="absolute top-0 right-0 bg-blue-600 text-white p-0.5 rounded-bl">✓</div>
                         )}
                     </div>
                 ))}
             </div>
          </div>
          <button type="submit" className="w-full bg-purple-600 text-white py-2 rounded">Zaloguj</button>
        </form>
      </div>
    </div>
  );
}

function AdminPanel() {
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [settings, setSettings] = useState({});
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user' });
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ username: '', password: '', role: 'user' });
  const navigate = useNavigate();

  useEffect(() => { loadData(); }, [activeTab]);

  const loadData = async () => {
    try {
        if(activeTab === 'users') setUsers((await api.get('/users')).data);
        if(activeTab === 'settings') setSettings((await api.get('/settings')).data);
        if(activeTab === 'logs') setLogs((await api.get('/logs')).data);
    } catch(e) { console.log(e) }
  };

  const handleLogout = async () => { await api.post('/logout'); localStorage.clear(); navigate('/'); };
  const handleGenerateOTPNew = () => setNewUser({...newUser, password: generateOTP()});
  const handleGenerateOTPEdit = () => setEditForm({...editForm, password: generateOTP()});

  const addUser = async (e) => {
    e.preventDefault();
    try {
      await api.post('/users', newUser);
      setNewUser({ username: '', password: '', role: 'user' });
      alert("Dodano. Przekaż hasło OTP.");
      loadData();
    } catch (err) { alert(err.response?.data?.message || "Błąd"); }
  };

  const saveSettings = async () => {
      try { await api.put('/settings', settings); alert('Zapisano'); } catch (e) { alert("Błąd"); }
  };

  const startEdit = (user) => { setEditingUser(user); setEditForm({ username: user.username, role: user.role, password: '' }); };
  const saveEdit = async (e) => {
    e.preventDefault();
    try { await api.put(`/users/${editingUser.id}`, editForm); setEditingUser(null); loadData(); } catch (err) { alert(err.response?.data?.message || "Błąd"); }
  };
  const deleteUser = async (id) => { if(window.confirm('Usunąć?')) { await api.delete(`/users/${id}`); loadData(); }};
  const toggleBlock = async (id, status) => { await api.put(`/users/${id}`, { is_blocked: !status }); loadData(); };

  return (
    <div className="min-h-screen bg-gray-50">
        <nav className="bg-purple-800 text-white p-4 flex justify-between">
            <h1 className="font-bold flex gap-2"><Lock /> Admin Panel</h1>
            <button onClick={handleLogout} className="flex gap-1 hover:text-red-200"><LogOut size={18}/> Wyloguj</button>
        </nav>
        <div className="container mx-auto p-6">
            <div className="flex gap-4 mb-6 border-b">
                {['users', 'logs', 'settings'].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} className={`pb-2 px-4 capitalize ${activeTab === tab ? 'border-b-2 border-purple-600 font-bold' : ''}`}>{tab}</button>
                ))}
            </div>

            {activeTab === 'users' && (
                <div>
                    <div className="bg-white p-4 rounded shadow mb-6">
                        <h3 className="font-bold mb-3">Dodaj Użytkownika (OTP)</h3>
                        <form onSubmit={addUser} className="flex gap-2 flex-wrap items-end">
                            <input placeholder="Nazwa" value={newUser.username} onChange={e=>setNewUser({...newUser, username: e.target.value})} className="border p-2 rounded" required />
                            <select value={newUser.role} onChange={e=>setNewUser({...newUser, role: e.target.value})} className="border p-2 rounded"><option value="user">User</option><option value="admin">Admin</option></select>
                            <div className="flex gap-1">
                                <input type="text" placeholder="Hasło" value={newUser.password} onChange={e=>setNewUser({...newUser, password: e.target.value})} className="border p-2 rounded w-48" required />
                                <button type="button" onClick={handleGenerateOTPNew} className="bg-gray-200 p-2 rounded" title="Generuj OTP"><Key size={20}/></button>
                            </div>
                            <button className="bg-green-600 text-white px-4 py-2 rounded">Dodaj</button>
                        </form>
                    </div>
                    <table className="w-full bg-white shadow rounded">
                        <thead className="bg-gray-100 text-left"><tr><th className="p-3">User</th><th className="p-3">Rola</th><th className="p-3">Status</th><th className="p-3">Akcje</th></tr></thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.id} className="border-t">
                                    <td className="p-3">{u.username}</td>
                                    <td className="p-3">{u.role}</td>
                                    <td className="p-3">{u.is_blocked ? <span className="text-red-600">BLOKADA</span> : <span className="text-green-600">OK</span>}</td>
                                    <td className="p-3 flex gap-2">
                                        {u.username !== 'ADMIN' && (<><button onClick={()=>startEdit(u)} className="bg-blue-100 p-1 rounded"><Pencil size={16}/></button><button onClick={()=>toggleBlock(u.id, u.is_blocked)} className="bg-yellow-100 p-1 rounded"><ShieldAlert size={16}/></button><button onClick={()=>deleteUser(u.id)} className="bg-red-100 p-1 rounded"><Trash2 size={16}/></button></>)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {activeTab === 'logs' && (
                <div className="bg-white shadow rounded overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-800 text-white"><tr><th className="p-3">Czas</th><th className="p-3">Kto</th><th className="p-3">Akcja</th><th className="p-3">Status</th><th className="p-3">Info</th></tr></thead>
                        <tbody>{logs.map(l => <tr key={l.id} className="border-t"><td className="p-2">{new Date(l.timestamp).toLocaleString()}</td><td className="p-2 font-bold">{l.username}</td><td className="p-2">{l.action}</td><td className={`p-2 ${l.status==='ERROR'?'text-red-600':'text-green-600'}`}>{l.status}</td><td className="p-2 text-gray-600">{l.details}</td></tr>)}</tbody>
                    </table>
                </div>
            )}
            {activeTab === 'settings' && (
                <div className="bg-white p-6 rounded shadow max-w-2xl">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2 font-bold border-b pb-1">Polityka Haseł</div>
                        <label>Min. długość: <input type="number" value={settings.min_length||0} onChange={e=>setSettings({...settings, min_length: +e.target.value})} className="border p-1 w-full"/></label>
                        <label>Ważność (dni): <input type="number" value={settings.validity_days||0} onChange={e=>setSettings({...settings, validity_days: +e.target.value})} className="border p-1 w-full"/></label>
                        <div className="col-span-2 font-bold border-b pb-1 mt-4">Sesja i Blokady</div>
                        <label>Limit błędnych prób: <input type="number" value={settings.max_failed_attempts||3} onChange={e=>setSettings({...settings, max_failed_attempts: +e.target.value})} className="border p-1 w-full bg-yellow-50"/></label>
                        <label>Czas sesji (min): <input type="number" value={settings.session_timeout_minutes||15} onChange={e=>setSettings({...settings, session_timeout_minutes: +e.target.value})} className="border p-1 w-full bg-yellow-50"/></label>
                    </div>
                    <button onClick={saveSettings} className="bg-blue-600 text-white px-6 py-2 rounded mt-6 w-full">Zapisz</button>
                </div>
            )}
        </div>
        
        {editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="bg-white p-6 rounded shadow-lg w-96 relative">
                <button onClick={()=>setEditingUser(null)} className="absolute top-2 right-2"><X/></button>
                <h3 className="font-bold mb-4">Edytuj: {editingUser.username}</h3>
                <form onSubmit={saveEdit} className="flex flex-col gap-3">
                    <label>Nazwa: <input value={editForm.username} onChange={e=>setEditForm({...editForm, username: e.target.value})} className="border p-2 w-full"/></label>
                    <label>Rola: <select value={editForm.role} onChange={e=>setEditForm({...editForm, role: e.target.value})} className="border p-2 w-full"><option value="user">User</option><option value="admin">Admin</option></select></label>
                    <label>Nowe hasło: <div className="flex gap-1"><input value={editForm.password} onChange={e=>setEditForm({...editForm, password: e.target.value})} className="border p-2 w-full" placeholder="Zostaw puste by zachować"/><button type="button" onClick={handleGenerateOTPEdit} className="bg-gray-200 p-2 rounded"><Key/></button></div></label>
                    <button className="bg-blue-600 text-white p-2 rounded">Zapisz</button>
                </form>
            </div>
        </div>
        )}
    </div>
  );
}

function ChangePassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return setErr("Różne hasła");
    try {
      await api.post('/change-password', { newPassword: password });
      setMsg("Sukces! Wylogowywanie...");
      setTimeout(async () => { await api.post('/logout'); localStorage.clear(); navigate('/'); }, 2000);
    } catch (e) { setErr(e.response?.data?.message || 'Błąd'); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 w-96 rounded shadow">
        <h2 className="text-xl font-bold mb-4">Zmiana Hasła</h2>
        {err && <div className="text-red-600 bg-red-100 p-2 mb-2">{err}</div>}
        {msg && <div className="text-green-600 bg-green-100 p-2 mb-2">{msg}</div>}
        <form onSubmit={handleSubmit}>
          <input type="password" placeholder="Nowe hasło" value={password} onChange={e=>setPassword(e.target.value)} className="border p-2 w-full mb-2" required/>
          <input type="password" placeholder="Powtórz" value={confirm} onChange={e=>setConfirm(e.target.value)} className="border p-2 w-full mb-4" required/>
          <button className="bg-blue-600 text-white w-full py-2 rounded">Zmień</button>
        </form>
      </div>
    </div>
  );
}

function UserPanel() {
    const navigate = useNavigate();
    const [expiryTime, setExpiryTime] = useState('');
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            try { setExpiryTime(new Date(JSON.parse(atob(token.split('.')[1])).exp * 1000).toLocaleTimeString()); } catch (e) {}
        }
    }, []);
    const handleLogout = async () => { await api.post('/logout'); localStorage.clear(); navigate('/'); };
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center pt-20">
            <h1 className="text-2xl font-bold mb-4">Panel Użytkownika</h1>
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-3 rounded mb-6 text-sm">Sesja wygasa: <strong>{expiryTime}</strong></div>
            <div className="flex gap-4"><button onClick={()=>navigate('/change-password')} className="bg-blue-500 text-white px-4 py-2 rounded flex gap-2"><Settings/> Hasło</button><button onClick={handleLogout} className="bg-red-500 text-white px-4 py-2 rounded flex gap-2"><LogOut/> Wyloguj</button></div>
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
