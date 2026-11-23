import http.server
import socketserver
import webbrowser
import os

PORT = 3000
os.chdir(os.path.dirname(os.path.abspath(__file__)))

Handler = http.server.SimpleHTTPRequestHandler
print("=================================================")
print(f"CLOUD 3D Audio Visualizer запущен на порту {PORT}")
print(f"Ссылка: http://localhost:{PORT}")
print("=================================================")

webbrowser.open(f"http://localhost:{PORT}")

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nСервер остановлен.")
