FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini .
COPY alembic ./alembic
COPY app ./app

EXPOSE 8000

# Migra, siembra si la base está vacía y levanta la API.
CMD ["sh", "-c", "alembic upgrade head && python -c \"from app.database.session import SessionLocal; from app.models import Organization; db=SessionLocal(); empty=db.query(Organization).first() is None; db.close(); import subprocess,sys; sys.exit(subprocess.call([sys.executable,'-m','app.seed']) if empty else 0)\" && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
