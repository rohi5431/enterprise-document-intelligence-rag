"""Enterprise RAG Platform — initial schema migration."""
from alembic import op
import sqlalchemy as sa

revision = "001_enterprise_upgrade"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_preferences",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), unique=True, nullable=False),
        sa.Column("llm_provider", sa.String(20), server_default="ollama"),
        sa.Column("llm_model", sa.String(100), nullable=True),
        sa.Column("query_expansion_enabled", sa.Boolean(), server_default="true"),
        sa.Column("show_retrieval_diagnostics", sa.Boolean(), server_default="false"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "evaluation_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("query", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("recall_at_k", sa.Float(), nullable=True),
        sa.Column("mrr", sa.Float(), nullable=True),
        sa.Column("faithfulness", sa.Float(), nullable=True),
        sa.Column("answer_relevancy", sa.Float(), nullable=True),
        sa.Column("context_precision", sa.Float(), nullable=True),
        sa.Column("metrics", sa.JSON(), server_default="{}"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "extracted_tables",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("document_id", sa.Integer(), sa.ForeignKey("documents.id"), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=True),
        sa.Column("table_index", sa.Integer(), server_default="0"),
        sa.Column("table_data", sa.JSON(), nullable=False),
        sa.Column("table_text", sa.Text(), nullable=True),
        sa.Column("extraction_method", sa.String(50), server_default="pdfplumber"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("extracted_tables")
    op.drop_table("evaluation_logs")
    op.drop_table("user_preferences")
