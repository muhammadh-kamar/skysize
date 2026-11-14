# -*- coding: utf-8 -*-
from __future__ import annotations

from odoo import models


class IrHttp(models.AbstractModel):
    """Expose dark mode and app icon preference in the web session info."""

    _inherit = 'ir.http'

    # ----------------------------------------------------------
    # Functions
    # ----------------------------------------------------------

    def session_info(self) -> dict:
        """Add the user theme preferences to session info."""
        result = super().session_info()
        user = self.env.user
        if 'dark_mode' in user._fields:
            result['dark_mode'] = user.dark_mode or 'light'
        if 'app_icon' in user._fields:
            result['app_icon'] = user.app_icon or 'monochrome'
        return result
