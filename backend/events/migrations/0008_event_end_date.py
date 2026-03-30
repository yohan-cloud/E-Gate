from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("events", "0007_entrylog_direction"),
    ]

    operations = [
        migrations.AddField(
            model_name="event",
            name="end_date",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
