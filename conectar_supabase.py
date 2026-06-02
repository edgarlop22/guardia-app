from supabase import create_client
import os
from dotenv import load_dotenv

# Cargar variables del .env
load_dotenv()

# OPCIÓN 1: Si el .env funciona
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_ANON_KEY")

# OPCIÓN 2: Si no funciona, pega aquí directamente (temporal):
if not url:
    url = "https://xxxxx.supabase.co"  # Reemplaza con tu URL real
if not key:
    key = "eyJhbGciOi..."  # Reemplaza con tu ANON_KEY real

print(f"URL: {url}")
print(f"KEY: {key[:20]}...")

# Conectar
supabase = create_client(url, key)
print("✅ Conectado a Supabase")