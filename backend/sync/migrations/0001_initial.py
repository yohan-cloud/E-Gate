from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="OutboxEvent",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("sent_at", models.DateTimeField(null=True, blank=True)),
                ("event_type", models.CharField(max_length=128)),
                ("aggregate", models.CharField(max_length=128)),
                ("aggregate_id", models.CharField(max_length=128)),
                ("payload", models.JSONField()),
                ("attempts", models.PositiveIntegerField(default=0)),
                ("last_error", models.TextField(null=True, blank=True)),
                ("source_node_id", models.CharField(max_length=64, default="unknown")),
                ("idempotency_key", models.CharField(max_length=256, unique=True)),
            ],
            options={
                "indexes": [
                    models.Index(fields=["created_at"], name="sync_outbox_created_idx"),
                    models.Index(fields=["sent_at"], name="sync_outbox_sent_idx"),
                    models.Index(fields=["event_type"], name="sync_outbox_event_idx"),
                    models.Index(fields=["aggregate"], name="sync_outbox_agg_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="SyncState",
            fields=[
                ("key", models.CharField(primary_key=True, serialize=False, default="default", max_length=32)),
                ("last_pull_cursor", models.DateTimeField(null=True, blank=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.CreateModel(
            name="ConflictLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("event_type", models.CharField(max_length=128)),
                ("aggregate", models.CharField(max_length=128)),
                ("aggregate_id", models.CharField(max_length=128)),
                ("incoming_updated_at", models.DateTimeField(null=True, blank=True)),
                ("local_updated_at", models.DateTimeField(null=True, blank=True)),
                ("details", models.JSONField(null=True, blank=True)),
            ],
            options={
                "indexes": [
                    models.Index(fields=["created_at"], name="sync_conflict_created_idx"),
                    models.Index(fields=["event_type"], name="sync_conflict_event_idx"),
                    models.Index(fields=["aggregate"], name="sync_conflict_agg_idx"),
                ],
            },
        ),
    ]
