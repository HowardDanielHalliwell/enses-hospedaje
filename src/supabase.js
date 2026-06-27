import { createClient } from '@supabase/supabase-js'
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Crea un cliente con el header x-parroquia-codigo para que las políticas
// RLS de Supabase puedan filtrar filas por parroquia en cada request.
export const supabaseConCodigo = (codigo) =>
  createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: { 'x-parroquia-codigo': codigo } },
  })
