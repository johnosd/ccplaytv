import urllib.request
import json

req = urllib.request.Request('http://127.0.0.1:3000/sources')
with urllib.request.urlopen(req) as response:
    data = json.loads(response.read().decode())
    for source in data.get('sources', []):
        sid = source['id']
        print(f"Deleting {sid}")
        del_req = urllib.request.Request(f'http://127.0.0.1:3000/sources/{sid}', method='DELETE')
        urllib.request.urlopen(del_req)
print("Done")

