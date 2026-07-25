import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const billingService = {
  async getPlans() {
    const response = await axios.get(`${API_BASE_URL}/billing/plans`, {
      headers: authHeaders(),
    });
    return response.data;
  },

  async startCheckout(planId, seats = 1) {
    const response = await axios.post(
      `${API_BASE_URL}/billing/checkout`,
      { mode: 'subscription', plan: planId, seats },
      { headers: authHeaders() },
    );
    return response.data;
  },

  async startTopUp() {
    const response = await axios.post(
      `${API_BASE_URL}/billing/checkout`,
      { mode: 'topup' },
      { headers: authHeaders() },
    );
    return response.data;
  },
};
