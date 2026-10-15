import { loadEnv } from 'vite'
import { validateCommercialConfig } from './commercialConfig.mjs'
try { validateCommercialConfig(loadEnv('commercial', process.cwd(), 'VITE_')) }
catch {
  console.error('Build comercial exige VITE_PORTAL_ORIGIN HTTPS e VITE_LICENSE_PUBLIC_KEYS públicas ES256 válidas.')
  process.exitCode = 1
}
