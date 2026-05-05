"""app_settings singleton table

Revision ID: 0002_app_settings
Revises: 0001_initial
Create Date: 2026-05-04
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002_app_settings"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("conf_threshold", sa.Float(), nullable=False),
        sa.Column("positive_required", sa.Integer(), nullable=False),
        sa.Column("positive_window", sa.Integer(), nullable=False),
        sa.Column("cooldown_seconds", sa.Integer(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint("id = 1", name="app_settings_singleton"),
    )


def downgrade() -> None:
    op.drop_table("app_settings")
