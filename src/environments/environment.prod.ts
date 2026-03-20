const apiHost = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';

export const environment = {
  production: true,
  apiBaseUrl: `http://${apiHost}:8000`,
};

