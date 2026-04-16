from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("events", "0009_event_archival_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="event",
            name="audience_type",
            field=models.CharField(
                choices=[
                    ("all", "All Residents"),
                    ("kids_only", "Kids Only"),
                    ("senior_only", "Senior Citizens Only"),
                ],
                default="all",
                max_length=20,
            ),
        ),
    ]
