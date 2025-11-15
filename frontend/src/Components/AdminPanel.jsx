import { useState, useEffect } from 'react';
import axios from '../api';

export default function AdminPanel({ role }) {
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({ username: '', fullName: '', password: '', role: 'user' });

  // Pobierz użytkowników
  const fetchUsers = async () => {
    const res = await axios.get('/admin/users', { headers: { role } });
    setUsers(res.data);
  };

  useEffect(() => { fetchUsers(); }, []);

  // Dodaj użytkownika
  const handleAddUser = async () => {
    await axios.post('/admin/add-user', newUser, { headers: { role } });
    setNewUser({ username: '', fullName: '', password: '', role: 'user' });
    fetchUsers();
  };

  // Usuń użytkownika
  const handleDeleteUser = async (id) => {
    await axios.delete(`/admin/delete-user/${id}`, { headers: { role } });
    fetchUsers();
  };

  // Blokuj/odblokuj użytkownika
  const toggleBlock = async (user) => {
    await axios.put(`/admin/update-user/${user.id}`, { ...user, blocked: user.blocked ? 0 : 1 }, { headers: { role } });
    fetchUsers();
  };

  return (
    <div>
      <h2>Panel Administratora</h2>

      <h3>Dodaj nowego użytkownika</h3>
      <input placeholder="Username" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} />
      <input placeholder="Full Name" value={newUser.fullName} onChange={e => setNewUser({...newUser, fullName: e.target.value})} />
      <input placeholder="Password" type="password" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
      <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})}>
        <option value="user">User</option>
        <option value="admin">Admin</option>
      </select>
      <button onClick={handleAddUser}>Dodaj użytkownika</button>

      <h3>Lista użytkowników</h3>
      <table border="1">
        <thead>
          <tr>
            <th>Username</th><th>Full Name</th><th>Role</th><th>Blocked</th><th>Akcje</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td>{u.username}</td>
              <td>{u.fullName}</td>
              <td>{u.role}</td>
              <td>{u.blocked ? "Tak" : "Nie"}</td>
              <td>
                <button onClick={() => toggleBlock(u)}>{u.blocked ? "Odblokuj" : "Zablokuj"}</button>
                <button onClick={() => handleDeleteUser(u.id)}>Usuń</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
