"""cameras: soft-delete + partial unique index on name

Revision ID: 0003_camera_soft_delete
Revises: 0002_app_settings
Create Date: 2026-05-04
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003_camera_soft_delete"
down_revision = "0002_app_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "cameras",
        sa.Column(
            "is_deleted",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "cameras",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Active-only uniqueness on name: a deleted camera frees its name for
    # reuse, but two live cameras can never share one.
    op.create_index(
        "ix_cameras_name_active_uniq",
        "cameras",
        ["name"],
        unique=True,
        postgresql_where=sa.text("is_deleted = false"),
    )


def downgrade() -> None:
    op.drop_index("ix_cameras_name_active_uniq", table_name="cameras")
    op.drop_column("cameras", "deleted_at")
    op.drop_column("cameras", "is_deleted")
