import requests
from datetime import datetime

URL = "https://varzqeadiamaebptfvgl.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhcnpxZWFkaWFtYWVicHRmdmdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0ODExMDYsImV4cCI6MjA5NTA1NzEwNn0.ziIh2Bq5JaHobfVMldNHeZZbtgvIIQmyakaUtSv7SyM"  # Tu ANON_KEY

headers = {
    "apikey": KEY,
    "Content-Type": "application/json"
}

def crear_entrada_simple(conjunto_id):
    """Crear una entrada básica"""
    
    data = {
        "conjunto_id": conjunto_id,
        "entered_at": datetime.now().isoformat(),
        "notified_resident": False
    }
    
    try:
        response = requests.post(
            f"{URL}/rest/v1/entries",
            json=data,
            headers=headers
        )
        
        if response.status_code == 201:
            print(f"✅ Entrada creada!")
            return response.json()
        else:
            print(f"❌ Error {response.status_code}: {response.text}")
    except Exception as e:
        print(f"❌ Error: {e}")

# USO:
crear_entrada_simple(conjunto_id="00000000-0000-0000-0000-000000000001")