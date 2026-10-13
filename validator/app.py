"""Validador aislado: no persiste archivos ni registra su contenido."""
from hashlib import sha256
from fastapi import FastAPI, File, HTTPException, UploadFile

MAX_BYTES = 10 * 1024 * 1024
app = FastAPI(title="Firmador PDF validator", docs_url=None, redoc_url=None)

@app.post("/validate")
async def validate_pdf(document: UploadFile = File(...)):
    # La integración de producción debe usar pyHanko para validar ByteRange,
    # CMS y la preservación incremental contra la versión anterior. Nunca se
    # acepta una firma solo por su apariencia visual.
    content = await document.read(MAX_BYTES + 1)
    if len(content) > MAX_BYTES:
        raise HTTPException(413, "El PDF supera el límite de 10 MB")
    if not content.startswith(b"%PDF-"):
        raise HTTPException(415, "El archivo no es un PDF legible")
    # Fail closed: pyHanko debe configurarse con una política de confianza
    # antes de habilitar cargas reales. Este endpoint no declara validez legal.
    raise HTTPException(503, "Validador criptográfico pendiente de configurar")
