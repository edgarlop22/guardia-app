from conectar_supabase import supabase

try:
    response = supabase.table("entries").select("*").execute()
    print(f"✅ Lectura OK: {len(response.data)} registros")
except Exception as e:
    print(f"❌ Error de lectura: {e}")