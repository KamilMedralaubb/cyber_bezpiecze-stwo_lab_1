import { useState } from 'react';
import axios from '../api';

export default function Login({ setRole }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async () => {
    try {
      const res = await axios.post('/auth/login', { username, password });
      if (res.data.requireChange) {
        alert("Hasło wygasło, należy zmienić hasło");
      } else {
        setRole(res.data.role);
      }
    } catch (e) {
      setError(e.response.data.message);
    }
  };

  return (
    <div>
      <input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
      <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
      <button onClick={handleLogin}>Login</button>
      {error && <p>{error}</p>}
    </div>
  );
}
