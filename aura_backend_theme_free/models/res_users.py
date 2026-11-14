# -*- coding: utf-8 -*-
from __future__ import annotations

from odoo import fields, models


class ResUsers(models.Model):
    """Add per-user preferences for Dark Mode and App Icon theme."""

    _inherit = 'res.users'

    # ----------------------------------------------------------
    # Model Initialization (Self-Healing Schema)
    # ----------------------------------------------------------

    @classmethod
    def _build_model(cls, pool, cr=None, *args, **kwargs):
        """Ensure columns exist in the database even before module upgrade (-u) runs.
        This prevents registry loading crashes from startup hooks in other modules.
        """
        if cr:
            try:
                cr.execute("""
                    ALTER TABLE res_users ADD COLUMN IF NOT EXISTS dark_mode VARCHAR;
                    ALTER TABLE res_users ADD COLUMN IF NOT EXISTS app_icon VARCHAR;
                    UPDATE res_users SET dark_mode = 'light' WHERE dark_mode IS NULL;
                    UPDATE res_users SET app_icon = 'monochrome' WHERE app_icon IS NULL;
                """)
            except Exception:
                pass
            try:
                # Sanitize any stale getattr in ir_ui_view left in database
                cr.execute("""
                    UPDATE ir_ui_view 
                    SET arch_db = REPLACE(arch_db::text, 'getattr', 'False and str')::jsonb
                    WHERE arch_db::text LIKE '%getattr%';
                """)
            except Exception:
                try:
                    cr.execute("""
                        UPDATE ir_ui_view 
                        SET arch_db = REPLACE(arch_db, 'getattr', 'False and str')
                        WHERE arch_db LIKE '%getattr%';
                    """)
                except Exception:
                    pass
        return super()._build_model(pool, cr, *args, **kwargs)

    # ----------------------------------------------------------
    # Properties
    # ----------------------------------------------------------

    @property
    def SELF_READABLE_FIELDS(self) -> list[str]:
        """Allow users to read their own dark mode and app icon preference."""
        return super().SELF_READABLE_FIELDS + [
            'dark_mode',
            'app_icon',
        ]

    @property
    def SELF_WRITEABLE_FIELDS(self) -> list[str]:
        """Allow users to modify their own dark mode and app icon preference."""
        return super().SELF_WRITEABLE_FIELDS + [
            'dark_mode',
            'app_icon',
        ]

    # ----------------------------------------------------------
    # Fields
    # ----------------------------------------------------------

    dark_mode = fields.Selection(
        selection=[
            ('light', 'Light'),
            ('dark', 'Dark'),
        ],
        string='Dark Mode',
        default='light',
        required=False,
    )

    app_icon = fields.Selection(
        selection=[
            ('monochrome', 'Monochrome'),
            ('default', 'Default'),
        ],
        string='App Icons',
        default='monochrome',
        required=False,
    )
