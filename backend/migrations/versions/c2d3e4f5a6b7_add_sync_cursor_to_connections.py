"""add sync_cursor to health_sync_connections

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-09-05 17:26:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'c2d3e4f5a6b7'
down_revision: Union[str, None] = 'b1c2d3e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('health_sync_connections', sa.Column('sync_cursor', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('health_sync_connections', 'sync_cursor')
