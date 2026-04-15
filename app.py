import os
import pdfplumber
import re
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from typing import List, Dict

app = FastAPI()

# Create uploads directory if not exists
UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/manifest.json")
async def get_manifest():
    from fastapi.responses import FileResponse
    return FileResponse('static/manifest.json')

@app.get("/sw.js")
async def get_sw():
    from fastapi.responses import FileResponse
    return FileResponse('static/sw.js')

def parse_schedule(pdf_path: str) -> List[Dict]:
    schedule = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if not text:
                continue
            
            # Simple heuristic parser for time patterns like "08:00 - 09:30" or "8am - 10am"
            # It looks for lines that contain time and then some text (subject)
            lines = text.split('\n')
            for line in lines:
                # Regex for common time formats
                time_match = re.search(r'(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})', line)
                if time_match:
                    start_time = time_match.group(1).replace('.', ':')
                    end_time = time_match.group(2).replace('.', ':')
                    # Subject is usually what's left after the time
                    subject = line.replace(time_match.group(0), "").strip()
                    
                    if subject:
                        schedule.append({
                            "start": start_time,
                            "end": end_time,
                            "subject": subject
                        })
            
            # If no simple patterns found, try extracting tables
            tables = page.extract_tables()
            for table in tables:
                for row in table:
                    # Filter out empty rows or headers
                    row = [cell for cell in row if cell]
                    if len(row) >= 2:
                        # Try to find time in any cell
                        for i, cell in enumerate(row):
                            time_match = re.search(r'(\d{1,2}[:.]\d{2})', str(cell))
                            if time_match:
                                # This is likely a time cell, neighbor could be subject
                                # Very basic heuristic: if next cell exists, it's the subject
                                if i + 1 < len(row):
                                    schedule.append({
                                        "time": cell.replace('.', ':'),
                                        "subject": row[i+1]
                                    })
                                break

    return schedule

@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Invalid file type. Only PDF allowed.")
    
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        buffer.write(await file.read())
    
    try:
        data = parse_schedule(file_path)
        return JSONResponse(content={"status": "success", "data": data})
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})

@app.get("/")
async def read_index():
    from fastapi.responses import FileResponse
    return FileResponse('static/index.html')

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
