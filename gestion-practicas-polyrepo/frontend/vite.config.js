import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El frontend SOLO habla con el API Gateway (puerto 3000). El proxy evita problemas de CORS en desarrollo.
export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', globals: true, testTimeout: 8000 }, // pruebas de interfaz (npm test)
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
});
