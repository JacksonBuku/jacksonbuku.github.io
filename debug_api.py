import urllib.request
import json
import sys

url = 'http://127.0.0.1:5000/api/chat'
headers = {'Content-Type': 'application/json'}
data = {
    'message': 'Hello, how are you?',
    'history': []
}

try:
    print(f"Sending request to {url}...")
    req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers=headers)
    with urllib.request.urlopen(req, timeout=10) as response:
        print(f"Status Code: {response.getcode()}")
        print("Response Body:")
        print(response.read().decode('utf-8'))
except Exception as e:
    print(f"Error: {e}")
