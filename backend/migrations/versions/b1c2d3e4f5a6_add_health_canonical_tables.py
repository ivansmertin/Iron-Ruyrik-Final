"""add health canonical tables and migrate existing measurements

Revision ID: b1c2d3e4f5a6
Revises: a9b0f154a532
Create Date: 2026-09-05 17:00:00.000000
"""
from typing import Sequence, Union
import uuid
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table, column
import app.db_types


revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, None] = 'a9b0f154a532'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'health_measurements',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('metric_type', sa.String(length=40), nullable=False),
        sa.Column('value', sa.Float(), nullable=False),
        sa.Column('unit', sa.String(length=20), nullable=False),
        sa.Column('measured_at', app.db_types.UTCDateTime(), nullable=False),
        sa.Column('source_provider', sa.String(length=40), nullable=False),
        sa.Column('source_device', sa.String(length=120), nullable=True),
        sa.Column('source_record_id', sa.String(length=255), nullable=True),
        sa.Column('source_app', sa.String(length=120), nullable=True),
        sa.Column('import_method', sa.String(length=40), nullable=False),
        sa.Column('metadata_json', sa.Text(), nullable=True),
        sa.Column('created_at', app.db_types.UTCDateTime(), nullable=False),
        sa.Column('updated_at', app.db_types.UTCDateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_health_measurements_user_metric_time', 'health_measurements', ['user_id', 'metric_type', 'measured_at'], unique=False)
    op.create_index('ix_health_measurements_dedup', 'health_measurements', ['user_id', 'source_provider', 'source_record_id'], unique=False)

    op.create_table(
        'health_sync_connections',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('provider', sa.String(length=40), nullable=False),
        sa.Column('status', sa.String(length=40), nullable=False),
        sa.Column('last_synced_at', app.db_types.UTCDateTime(), nullable=True),
        sa.Column('error_code', sa.String(length=80), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', app.db_types.UTCDateTime(), nullable=False),
        sa.Column('updated_at', app.db_types.UTCDateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'provider', name='uq_health_sync_connection_user_provider')
    )

    # Migrate existing data from legacy measurements table
    conn = op.get_bind()
    legacy_measurements = table(
        'measurements',
        column('id', sa.String),
        column('user_id', sa.String),
        column('measured_at', app.db_types.UTCDateTime),
        column('weight', sa.Float),
        column('body_fat', sa.Float),
        column('muscle_mass', sa.Float),
        column('created_at', app.db_types.UTCDateTime),
    )

    canonical_measurements = table(
        'health_measurements',
        column('id', sa.String),
        column('user_id', sa.String),
        column('metric_type', sa.String),
        column('value', sa.Float),
        column('unit', sa.String),
        column('measured_at', app.db_types.UTCDateTime),
        column('source_provider', sa.String),
        column('source_device', sa.String),
        column('source_record_id', sa.String),
        column('source_app', sa.String),
        column('import_method', sa.String),
        column('metadata_json', sa.Text),
        column('created_at', app.db_types.UTCDateTime),
        column('updated_at', app.db_types.UTCDateTime),
    )

    rows = conn.execute(sa.select(legacy_measurements)).fetchall()
    inserts = []
    for row in rows:
        r_id, r_user, r_measured_at, r_weight, r_body_fat, r_muscle, r_created_at = (
            row.id, row.user_id, row.measured_at, row.weight, row.body_fat, row.muscle_mass, row.created_at
        )
        if r_weight is not None:
            inserts.append({
                'id': str(uuid.uuid4()),
                'user_id': r_user,
                'metric_type': 'weight',
                'value': float(r_weight),
                'unit': 'kg',
                'measured_at': r_measured_at,
                'source_provider': 'manual',
                'source_device': None,
                'source_record_id': f"legacy-weight-{r_id}",
                'source_app': None,
                'import_method': 'manual',
                'metadata_json': None,
                'created_at': r_created_at,
                'updated_at': r_created_at,
            })
        if r_body_fat is not None:
            inserts.append({
                'id': str(uuid.uuid4()),
                'user_id': r_user,
                'metric_type': 'body_fat_percentage',
                'value': float(r_body_fat),
                'unit': 'percent',
                'measured_at': r_measured_at,
                'source_provider': 'manual',
                'source_device': None,
                'source_record_id': f"legacy-fat-{r_id}",
                'source_app': None,
                'import_method': 'manual',
                'metadata_json': None,
                'created_at': r_created_at,
                'updated_at': r_created_at,
            })
        if r_muscle is not None:
            inserts.append({
                'id': str(uuid.uuid4()),
                'user_id': r_user,
                'metric_type': 'muscle_mass',
                'value': float(r_muscle),
                'unit': 'kg',
                'measured_at': r_measured_at,
                'source_provider': 'manual',
                'source_device': None,
                'source_record_id': f"legacy-muscle-{r_id}",
                'source_app': None,
                'import_method': 'manual',
                'metadata_json': None,
                'created_at': r_created_at,
                'updated_at': r_created_at,
            })

    if inserts:
        conn.execute(canonical_measurements.insert(), inserts)


def downgrade() -> None:
    op.drop_table('health_sync_connections')
    op.drop_index('ix_health_measurements_dedup', table_name='health_measurements')
    op.drop_index('ix_health_measurements_user_metric_time', table_name='health_measurements')
    op.drop_table('health_measurements')
