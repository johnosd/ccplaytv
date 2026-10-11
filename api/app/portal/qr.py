"""QR local, sem serviço externo ou URL de credencial permanente."""

import base64
import io
from typing import Literal

import qrcode


def invite_qr(origin: str, token: str, purpose: Literal["invite", "recovery"] = "invite") -> str:
    image = qrcode.make(origin.rstrip("/") + "/#" + purpose + "=" + token, box_size=8, border=4)
    output = io.BytesIO()
    image.save(output, format="PNG")
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode("ascii")
