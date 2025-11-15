import { useState } from 'react';
import Login from '../components/Login';
import AdminPanel from '../components/AdminPanel';
import UserPanel from '../components/UserPanel';

function App() {
  const [role, setRole] = useState(null);

  if (!role) return <Login setRole={setRole} />;

  if (role === 'admin') return <AdminPanel role={role} />;
  return <UserPanel role={role} />;
}

export default App;
