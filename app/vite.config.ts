import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * De winkel draait straks op een eigen domein (base '/'), maar de demo staat
 * in een submap op GitHub Pages. Daarom komt de basis uit de omgeving en
 * gebruikt de app overal import.meta.env.BASE_URL in plaats van een vast pad.
 */
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
})
