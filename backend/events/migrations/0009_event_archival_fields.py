from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("events", "0008_event_end_date"),
    ]

    operations = [
        migrations.AddField(
            model_name="event",
            name="archive_checksum",
            field=models.CharField(blank=True, max_length=128),
        ),
        migrations.AddField(
            model_name="event",
            name="archive_error",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="event",
            name="archive_key",
            field=models.CharField(blank=True, max_length=512),
        ),
        migrations.AddField(
            model_name="event",
            name="archive_status",
            field=models.CharField(default="active", max_length=20),
        ),
        migrations.AddField(
            model_name="event",
            name="archive_storage",
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name="event",
            name="archived_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="event",
            name="archived_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="archived_events", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="event",
            name="archived_snapshot",
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AddIndex(
            model_name="event",
            index=models.Index(fields=["archived_at"], name="event_archived_idx"),
        ),
        migrations.AddIndex(
            model_name="event",
            index=models.Index(fields=["archive_status"], name="event_archive_status_idx"),
        ),
    ]
