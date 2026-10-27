import requests
import json
import os
# Create a dummy pdf
os.makedirs("uploads/docs", exist_ok=True)
with open("uploads/docs/dummy.pdf", "wb") as f:
    f.write(b"%PDF-1.4 dummy pdf")
# First we need to login or register to get a token
try:
    print("Registering dummy user...")
    res = requests.post("http://localhost:8000/api/v1/auth/register", json={
        "email": "test@test.com", "password": "password", "full_name": "Test User"
    })
    
    print("Logging in...")
    res = requests.post("http://localhost:8000/api/v1/auth/login", json={
        "email": "test@test.com", "password": "password"
    })
    token = res.json()["access_token"]
    
    print("Uploading file...")
    with open("uploads/docs/dummy.pdf", "rb") as f:
        res = requests.post(
            "http://localhost:8000/api/v1/documents/upload",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("dummy.pdf", f, "application/pdf")}
        )
        print("Upload status:", res.status_code)
        print("Upload response:", res.text)
        
except Exception as e:
    print("Error connecting to API:", e)