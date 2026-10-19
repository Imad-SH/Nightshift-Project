# BlueSec Nightshift API (FastAPI + Socket.IO + AI pipeline).
# Production image: no source mounts, no auto-reload, non-root user.
# The development compose file overrides the command to add --reload.

FROM python:3.11-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app

FROM base AS deps
COPY requirements.txt .
RUN pip install --prefix=/install -r requirements.txt

# MITRE ATT&CK Enterprise bundle, pinned and baked in so the matrix works on offline installs
FROM base AS mitre
ARG MITRE_ATTACK_VERSION=ATT%26CK-v20.0
ADD https://raw.githubusercontent.com/mitre/cti/${MITRE_ATTACK_VERSION}/enterprise-attack/enterprise-attack.json /mitre/enterprise-attack.json

FROM base
COPY --from=deps /install /usr/local
RUN useradd --system --uid 10001 --home-dir /app --shell /usr/sbin/nologin nightshift
COPY --chown=nightshift:nightshift . .
COPY --from=mitre --chown=nightshift:nightshift /mitre/enterprise-attack.json data/mitre/enterprise-attack.json
RUN mkdir -p downloads && chown nightshift:nightshift downloads
USER nightshift

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD python -c "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"

# One worker: scan tasks, the Socket.IO sessions and the intake burst filter live in process memory
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
