"""Validador aislado: no persiste archivos ni registra su contenido.

El contrato ya separa la versión anterior de la versión candidata. La
implementación criptográfica sigue bloqueada hasta que se configure una
política de confianza explícita para pyHanko.
"""
from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel

MAX_BYTES = 10 * 1024 * 1024
app = FastAPI(title="Firmador PDF validator", docs_url=None, redoc_url=None)


class ValidationResult(BaseModel):
    is_pdf: bool
    byte_size: int
    sha256: str
    derives_from_current: bool
    previous_signatures_intact: bool
    new_signature_ids: list[str]
    validation_profile: str


@app.get("/health", include_in_schema=False)
async def health():
    return {"status": "blocked", "reason": "trust policy not configured"}

@app.post("/validate", response_model=ValidationResult)
async def validate_pdf(
    candidate: UploadFile = File(...),
    previous: UploadFile = File(...),
):
    # La integración de producción debe usar pyHanko para validar ByteRange,
    # CMS y la preservación incremental contra la versión anterior. Nunca se
    # acepta una firma solo por su apariencia visual.
    candidate_content = await candidate.read(MAX_BYTES + 1)
    previous_content = await previous.read(MAX_BYTES + 1)
    for content in (candidate_content, previous_content):
        if len(content) > MAX_BYTES:
            raise HTTPException(413, "El PDF supera el límite de 10 MB")
        if not content.startswith(b"%PDF-"):
            raise HTTPException(415, "El archivo no es un PDF legible")
    # Fail closed: pyHanko debe configurarse con una política de confianza
    # antes de habilitar cargas reales. Este endpoint no declara validez legal.
    raise HTTPException(503, "Validador criptográfico pendiente de configurar")
