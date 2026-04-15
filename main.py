import uvicorn
import webbrowser
from threading import Timer

def open_browser():
    webbrowser.open_new("http://127.0.0.1:8000")

if __name__ == "__main__":
    # Wait 1.5 seconds then open the browser
    Timer(1.5, open_browser).start()
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
