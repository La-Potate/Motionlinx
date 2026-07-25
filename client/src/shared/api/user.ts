import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// User management service
export const userService = {
  // Get all users (admin only)
  async getAllUsers() {
    const token = localStorage.getItem('token');
    const response = await axios.get(`${API_BASE_URL}/admin/users`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Get user by ID
  async getUserById(userId) {
    const token = localStorage.getItem('token');
    const response = await axios.get(`${API_BASE_URL}/admin/users/${userId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Create new user (admin only)
  async createUser(userData) {
    const token = localStorage.getItem('token');
    const response = await axios.post(`${API_BASE_URL}/admin/users`, userData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Update user (admin only)
  async updateUser(userId, userData) {
    const token = localStorage.getItem('token');
    const response = await axios.put(`${API_BASE_URL}/admin/users/${userId}`, userData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Delete user (admin only)
  async deleteUser(userId) {
    const token = localStorage.getItem('token');
    const response = await axios.delete(`${API_BASE_URL}/admin/users/${userId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Ban user (admin only)
  async banUser(userId, reason) {
    const token = localStorage.getItem('token');
    const response = await axios.post(`${API_BASE_URL}/admin/users/${userId}/ban`, { reason }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Unban user (admin only)
  async unbanUser(userId) {
    const token = localStorage.getItem('token');
    const response = await axios.post(`${API_BASE_URL}/admin/users/${userId}/unban`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  async addCredits(userId, amount) {
    const token = localStorage.getItem('token');
    const response = await axios.post(`${API_BASE_URL}/admin/users/${userId}/credits`, { amount }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Ban IP address (admin only)
  async banIP(ipAddress, reason) {
    const token = localStorage.getItem('token');
    const response = await axios.post(`${API_BASE_URL}/admin/ban-ip`, { ipAddress, reason }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Get banned IPs (admin only)
  async getBannedIPs() {
    const token = localStorage.getItem('token');
    const response = await axios.get(`${API_BASE_URL}/admin/banned-ips`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Unban IP address (admin only)
  async unbanIP(ipAddress) {
    const token = localStorage.getItem('token');
    const response = await axios.delete(`${API_BASE_URL}/admin/banned-ips/${ipAddress}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Update own profile
  async updateProfile(userData) {
    const token = localStorage.getItem('token');
    const response = await axios.put(`${API_BASE_URL}/profile`, userData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Change password
  async changePassword(oldPassword, newPassword) {
    const token = localStorage.getItem('token');
    const response = await axios.post(`${API_BASE_URL}/change-password`, {
      oldPassword,
      newPassword
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Get user statistics (admin only)
  async getUserStats() {
    const token = localStorage.getItem('token');
    const response = await axios.get(`${API_BASE_URL}/admin/stats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  async getApiLogs(params = {}) {
    const token = localStorage.getItem('token');
    const searchParams = new URLSearchParams(params).toString();
    const response = await axios.get(`${API_BASE_URL}/admin/api-logs${searchParams ? `?${searchParams}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  }
};
