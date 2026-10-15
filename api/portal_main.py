"""API de controle: executar separadamente do main.py/fallback."""

import uvicorn

from app.portal.application import create_app
from app.portal.settings import PortalSettings

settings = PortalSettings()
app = create_app(settings)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=settings.port, access_log=False)
