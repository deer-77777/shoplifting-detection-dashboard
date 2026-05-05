"""app_settings: add pre_roll_seconds + post_roll_seconds

Revision ID: 0004_roll_seconds
Revises: 0003_camera_soft_delete
Create Date: 2026-05-05
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0004_roll_seconds"
down_revision = "0003_camera_soft_delete"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "app_settings",
        sa.Column(
            "pre_roll_seconds",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("5"),
        ),
    )
    op.add_column(
        "app_settings",
        sa.Column(
            "post_roll_seconds",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("10"),
        ),
    )


def downgrade() -> None:
    op.drop_column("app_settings", "post_roll_seconds")
    op.drop_column("app_settings", "pre_roll_seconds")
