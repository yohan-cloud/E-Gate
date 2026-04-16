from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("events", "0006_entrylog"),
    ]

    operations = [
        migrations.AddField(
            model_name="entrylog",
            name="direction",
            field=models.CharField(
                choices=[("time_in", "Time In"), ("time_out", "Time Out")],
                default="time_in",
                max_length=10,
            ),
        ),
        migrations.AddIndex(
            model_name="entrylog",
            index=models.Index(fields=["direction"], name="entrylog_direction_idx"),
        ),
    ]
