import requests

try:
    response = requests.get("https://varzqeadiamaebptfvgl.supabase.co/rest/v1/entries?limit=1", 
        headers={"apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhcnpxZWFkaWFtYWVicHRmdmdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0ODExMDYsImV4cCI6MjA5NTA1NzEwNn0.ziIh2Bq5JaHobfVMldNHeZZbtgvIIQmyakaUtSv7SyM"}
    )
    print(f"✅ Red OK: {response.status_code}")
except Exception as e:
    print(f"❌ Error de red: {e}")